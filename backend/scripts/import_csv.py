"""Import the user's original voyage-rdc.zip or an extracted voyage-rdc folder.

All imported routes remain unpublished pending human verification.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

from app.db import connection, execute
from app.routing import MODES
from app.schema import init_schema

FIELDS = {
    "provinces": ("id", "nom", "chef_lieu"),
    "lieux": ("id", "nom", "province_id", "type", "latitude", "longitude"),
    "points": ("id", "lieu_id", "type", "nom", "code", "latitude", "longitude", "verifie"),
    "operateurs": ("id", "nom", "type", "note"),
    "liaisons": ("mode", "depart_id", "arrivee_id", "distance_km", "duree_h", "prix_min_usd", "prix_max_usd", "etat_route", "operateur", "frequence", "note", "statut"),
}


def from_archive(path):
    rows = {}
    with zipfile.ZipFile(path) as archive:
        for table, fields in FIELDS.items():
            found = [n for n in archive.namelist() if n.endswith(f"/donnees/{table}.csv") and not n.startswith("__MACOSX/")]
            if len(found) != 1:
                raise ValueError(f"Fichier donnees/{table}.csv absent ou ambigu")
            info = archive.getinfo(found[0])
            if info.file_size > 10_000_000:
                raise ValueError(f"CSV trop volumineux : {table}")
            with archive.open(info) as handle:
                content = handle.read().decode("utf-8-sig")
            rows[table] = parse_csv(content, table, fields)
    return rows


def from_directory(path):
    data_path = Path(path)
    if not (data_path / "donnees").is_dir():
        data_path = data_path / "voyage-rdc"
    return {table: parse_csv((data_path / "donnees" / f"{table}.csv").read_text(encoding="utf-8-sig"), table, fields)
            for table, fields in FIELDS.items()}


def parse_csv(content, table, fields):
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None or not set(fields).issubset(reader.fieldnames):
        raise ValueError(f"Colonnes manquantes dans {table}")
    result = []
    for i, row in enumerate(reader, start=2):
        if None in row:
            raise ValueError(f"Colonnes supplémentaires dans {table}, ligne {i}")
        parsed = {f: row[f].strip() if row[f] is not None else "" for f in fields}
        result.append(parsed)
    return result


def validate(rows):
    keys = {}
    for table in ("provinces", "lieux", "points", "operateurs"):
        ids = [r["id"] for r in rows[table]]
        if "" in ids or len(ids) != len(set(ids)):
            raise ValueError(f"Identifiants manquants ou doublons dans {table}")
        keys[table] = set(ids)
    for row in rows["lieux"]:
        if row["province_id"] and row["province_id"] not in keys["provinces"]:
            raise ValueError(f"Province inconnue : {row['province_id']}")
        if row["type"] not in ("ville", "frontiere", "international"):
            raise ValueError("Type de lieu invalide")
    for row in rows["points"]:
        if row["lieu_id"] not in keys["lieux"]:
            raise ValueError(f"Lieu inconnu : {row['lieu_id']}")
        if row["verifie"] not in ("0", "1"):
            raise ValueError("Valeur de vérification de point invalide")
        if row["type"] not in ("aeroport", "aerodrome", "port", "gare_train", "gare_routiere", "arret"):
            raise ValueError("Type de point invalide")
    for row in rows["liaisons"]:
        if row["depart_id"] not in keys["lieux"] or row["arrivee_id"] not in keys["lieux"]:
            raise ValueError("Liaison avec ville inconnue")
        if row["depart_id"] == row["arrivee_id"]:
            raise ValueError("Départ identique à l'arrivée")
        if row["mode"] not in MODES or row["statut"] not in ("ok", "a_verifier", "suspendu"):
            raise ValueError("Mode ou statut de liaison invalide")
    for table, columns in {
        "lieux": ("latitude", "longitude"),
        "points": ("latitude", "longitude"),
        "liaisons": ("distance_km", "duree_h", "prix_min_usd", "prix_max_usd"),
    }.items():
        for row in rows[table]:
            for column in columns:
                if row[column]:
                    try:
                        value = float(row[column])
                        if not -1e8 < value < 1e8:
                            raise ValueError()
                    except ValueError:
                        raise ValueError(f"Valeur numérique invalide : {table}.{column}") from None
            if table in ("lieux", "points"):
                if row["latitude"] and not -90 <= float(row["latitude"]) <= 90:
                    raise ValueError("Latitude hors limites")
                if row["longitude"] and not -180 <= float(row["longitude"]) <= 180:
                    raise ValueError("Longitude hors limites")
            if table == "liaisons":
                for field in ("distance_km", "duree_h", "prix_min_usd", "prix_max_usd"):
                    if row[field] and float(row[field]) < 0:
                        raise ValueError("Valeur de trajet négative")
                if row["duree_h"] and float(row["duree_h"]) <= 0:
                    raise ValueError("Durée de trajet nulle")
                if row["prix_min_usd"] and row["prix_max_usd"] and float(row["prix_max_usd"]) < float(row["prix_min_usd"]):
                    raise ValueError("Prix incohérents")


def import_rows(rows):
    validate(rows)
    init_schema()
    with connection() as conn:
        for table in ("provinces", "lieux", "points", "operateurs"):
            fields = FIELDS[table]
            updates = ",".join(f"{f}=excluded.{f}" for f in fields if f != "id")
            sql = f"INSERT INTO {table} ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)}) ON CONFLICT(id) DO UPDATE SET {updates}"
            for row in rows[table]:
                execute(conn, sql, tuple(row[f] or None for f in fields))
        fields = FIELDS["liaisons"]
        query = f"INSERT INTO liaisons ({','.join(fields)},source_hash,publie) VALUES ({','.join('?' for _ in fields)},?,0) ON CONFLICT(source_hash) DO NOTHING"
        for row in rows["liaisons"]:
            source_hash = hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
            execute(conn, query, tuple(row[f] or None for f in fields) + (source_hash,))
    return {table: len(data) for table, data in rows.items()}


def main():
    parser = argparse.ArgumentParser(description="Importer les CSV d'origine, sans publier de liaisons")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--archive", help="Chemin vers voyage-rdc.zip")
    group.add_argument("--directory", help="Dossier contenant donnees/*.csv")
    opts = parser.parse_args()
    rows = from_archive(opts.archive) if opts.archive else from_directory(opts.directory)
    print("Import effectué (liaisons non publiées) :", import_rows(rows))


if __name__ == "__main__":
    main()
