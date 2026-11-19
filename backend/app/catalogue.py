"""Verified partner catalogue: private drafts and explicitly published records only."""
from datetime import date, datetime, timezone
from typing import Literal
from uuid import uuid4
import os
import secrets
import threading

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl, model_validator, field_validator
from .db import connection, execute, fetchall, fetchone, is_sqlite

router = APIRouter(prefix="/api", tags=["Catalogue"])

# Transporteurs fournis par l’administrateur : choix disponibles, sans validation ni publication automatique.
TRANSPORTEURS_PROPOSES = [
        "Air Congo",
        "Air Kasaï",
        "Air Katanga",
        "Airfast Congo",
        "Aviatrade Congo",
        "Busy bee Congo",
        "Bluesky Airlines",
        "CAA",
        "Congo Airways",
        "Dakota Aviation",
        "Gomair",
        "Goma Express",
        "Itab - Interntional Trans",
        "Katanga Wings",
        "KinAvia",
        "Malu Aviation",
        "Mont Gabaon Airlines",
        "Mwant Jet",
        "Naweza Airways",
        "Serve Air Congo",
        "Swala Aviation",
        "Tracep Aviation",
        "Trans Air Congo Service",
        "XL Trading",
        "Maf"
]

def admin_auth(authorization: str | None):
    """Authorize the logged-in administrator using the shared account session."""
    from .accounts import current_user, is_admin_email, init_tables
    if not os.getenv("ADMIN_LOGIN_EMAIL", "").strip():
        raise HTTPException(status_code=503, detail="Compte administrateur non configuré.")
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        if not is_admin_email(user["email"]):
            raise HTTPException(status_code=403, detail="Accès réservé à l’administrateur.")


_catalogue_ready = False
_catalogue_lock = threading.Lock()


def init_catalogue(conn):
    global _catalogue_ready
    if _catalogue_ready and not is_sqlite():
        return
    with _catalogue_lock:
        if _catalogue_ready and not is_sqlite():
            return
        if not is_sqlite():
            execute(conn, "SELECT pg_advisory_xact_lock(726315902)")
        _init_catalogue(conn)
        _catalogue_ready = True


def _init_catalogue(conn):
    execute(conn, """CREATE TABLE IF NOT EXISTS catalogue_partenaires (
        id VARCHAR(40) PRIMARY KEY,
        categorie VARCHAR(20) NOT NULL,
        nom VARCHAR(180) NOT NULL,
        ville_id VARCHAR(120),
        adresse VARCHAR(300),
        telephone VARCHAR(40),
        email VARCHAR(254),
        notification_active INTEGER NOT NULL DEFAULT 0,
        site_web TEXT,
        description TEXT,
        photo_url TEXT,
        tarif DOUBLE PRECISION,
        devise VARCHAR(3) NOT NULL DEFAULT 'USD',
        source_verification VARCHAR(500),
        date_verification VARCHAR(20),
        publie INTEGER NOT NULL DEFAULT 0,
        cree_le VARCHAR(40) NOT NULL,
        modifie_le VARCHAR(40) NOT NULL
    )""")
    if not is_sqlite():
        execute(conn,"ALTER TABLE catalogue_partenaires ADD COLUMN IF NOT EXISTS notification_active INTEGER NOT NULL DEFAULT 0")
    elif "notification_active" not in {r["name"] for r in fetchall(conn,"PRAGMA table_info(catalogue_partenaires)")}:
        execute(conn,"ALTER TABLE catalogue_partenaires ADD COLUMN notification_active INTEGER NOT NULL DEFAULT 0")
    execute(conn, "CREATE INDEX IF NOT EXISTS idx_catalogue_public ON catalogue_partenaires(publie,categorie,ville_id)")


class Partner(BaseModel):
    categorie: Literal["transporteur", "hotel"]
    nom: str = Field(min_length=2, max_length=180)
    ville_id: str = Field(default="", max_length=120)
    adresse: str = Field(default="", max_length=300)
    telephone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    notification_active: bool = False
    site_web: HttpUrl | None = None
    description: str = Field(default="", max_length=2000)
    photo_url: HttpUrl | None = None
    tarif: float | None = Field(default=None, ge=0, le=100000000)
    devise: Literal["USD", "CDF"] = "USD"
    source_verification: str = Field(default="", max_length=500)
    date_verification: date | None = None
    publie: bool = False

    @field_validator("photo_url", "site_web")
    @classmethod
    def require_https(cls, value):
        if value is not None and value.scheme != "https":
            raise ValueError("Utilisez une URL HTTPS sécurisée.")
        return value

    @model_validator(mode="after")
    def verify_publication(self):
        if self.date_verification and self.date_verification > date.today():
            raise ValueError("La vérification ne peut pas être datée dans le futur.")
        if self.notification_active and (not self.publie or not self.email.strip()):
            raise ValueError("Publiez la fiche et renseignez une adresse e-mail partenaire vérifiée avant d’activer les notifications.")
        if self.publie and (not self.source_verification.strip() or not self.date_verification):
            raise ValueError("Une source et une date de vérification sont obligatoires pour publier.")
        if self.publie and self.categorie == "hotel" and (not self.ville_id.strip() or not self.adresse.strip()):
            raise ValueError("La ville et l'adresse de l'hôtel sont obligatoires pour publier.")
        return self

def public_row(row):
    return {key: row[key] for key in ("id","categorie","nom","ville_id","adresse","telephone","email","site_web","description","photo_url","tarif","devise","date_verification")}

@router.get("/catalogue")
def catalogue(categorie: Literal["transporteur", "hotel"] | None = None, ville_id: str = Query(default="", max_length=120)):
    with connection() as conn:
        init_catalogue(conn)
        sql = "SELECT * FROM catalogue_partenaires WHERE publie=1"
        params = []
        if categorie:
            sql += " AND categorie=?"
            params.append(categorie)
        if ville_id:
            sql += " AND ville_id=?"
            params.append(ville_id)
        return [public_row(r) for r in fetchall(conn, sql + " ORDER BY nom LIMIT 300", params)]

@router.get("/admin/catalogue")
def admin_catalogue(authorization: str | None = Header(default=None)):
    admin_auth(authorization)
    with connection() as conn:
        init_catalogue(conn)
        return fetchall(conn, "SELECT * FROM catalogue_partenaires ORDER BY modifie_le DESC LIMIT 500")


@router.get("/admin/transporteurs")
def admin_transporteurs(authorization: str | None = Header(default=None)):
    """All registered carriers, including unpublished catalogue partners and legacy operators."""
    admin_auth(authorization)
    with connection() as conn:
        init_catalogue(conn)
        rows = fetchall(conn, "SELECT nom FROM catalogue_partenaires WHERE categorie=? UNION SELECT nom FROM operateurs ORDER BY nom", ("transporteur",))
        return sorted(set(TRANSPORTEURS_PROPOSES + [row["nom"] for row in rows if row["nom"]]), key=str.casefold)

@router.post("/admin/catalogue", status_code=201)
def create_partner(body: Partner, authorization: str | None = Header(default=None)):
    admin_auth(authorization)
    now = datetime.now(timezone.utc).isoformat()
    data = body.model_dump(mode="json")
    data.update(id=str(uuid4()), cree_le=now, modifie_le=now, publie=int(body.publie))
    with connection() as conn:
        init_catalogue(conn)
        keys = list(data)
        execute(conn, f"INSERT INTO catalogue_partenaires ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})", [data[k] for k in keys])
        return fetchone(conn, "SELECT * FROM catalogue_partenaires WHERE id=?", (data["id"],))

@router.put("/admin/catalogue/{partner_id}")
def update_partner(partner_id: str, body: Partner, authorization: str | None = Header(default=None)):
    admin_auth(authorization)
    data = body.model_dump(mode="json")
    data.update(modifie_le=datetime.now(timezone.utc).isoformat(), publie=int(body.publie))
    with connection() as conn:
        init_catalogue(conn)
        if not fetchone(conn, "SELECT id FROM catalogue_partenaires WHERE id=?", (partner_id,)):
            raise HTTPException(status_code=404, detail="Partenaire introuvable")
        keys = list(data)
        execute(conn, f"UPDATE catalogue_partenaires SET {','.join(k+'=?' for k in keys)} WHERE id=?", [data[k] for k in keys]+[partner_id])
        return fetchone(conn, "SELECT * FROM catalogue_partenaires WHERE id=?", (partner_id,))

@router.delete("/admin/catalogue/{partner_id}")
def delete_partner(partner_id: str, authorization: str | None = Header(default=None)):
    admin_auth(authorization)
    with connection() as conn:
        init_catalogue(conn)
        result = execute(conn, "DELETE FROM catalogue_partenaires WHERE id=?", (partner_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Partenaire introuvable")
    return {"deleted": True}
