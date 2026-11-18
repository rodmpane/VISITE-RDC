"""Voyage RDC V1 — public itinerary search and restricted data curation."""
from datetime import date
import os
from pathlib import Path
import secrets
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import connection, execute, fetchall, fetchone
from .accounts import router as accounts_router
from .catalogue import router as catalogue_router, init_catalogue
from .liaison_admin import router as liaison_admin_router
from .account_admin import router as account_admin_router
from .routing import MODES, itineraries

app = FastAPI(title="Voyage RDC", version="1.1.0", description="Recherche d'itinéraires informatifs, sans vente de billets")
app.include_router(accounts_router)
app.include_router(catalogue_router)
app.include_router(liaison_admin_router)
app.include_router(account_admin_router)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


def require_admin(authorization: str | None = Header(default=None)):
    configured = os.getenv("ADMIN_API_TOKEN", "")
    if not configured:
        raise HTTPException(status_code=503, detail="Administration non configurée")
    supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
    if not secrets.compare_digest(configured, supplied):
        raise HTTPException(status_code=401, detail="Accès refusé")


@app.get("/api/health")
def health():
    try:
        with connection() as conn:
            execute(conn, "SELECT 1")
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=503, detail="Base indisponible")


@app.get("/api/lieux")
def lieux(recherche: str = Query(default="", max_length=100)):
    with connection() as conn:
        return fetchall(conn,
            "SELECT id,nom,province_id,type,latitude,longitude FROM lieux WHERE LOWER(nom) LIKE ? ORDER BY nom LIMIT 300",
            (f"%{recherche.lower()}%",))


@app.get("/api/points")
def points(lieu_id: str = Query(min_length=1, max_length=100)):
    # A verified point is still only a source claim until an admin validates it.
    with connection() as conn:
        return fetchall(conn, "SELECT id,lieu_id,type,nom,code,latitude,longitude,verifie FROM points WHERE lieu_id=? ORDER BY nom", (lieu_id,))


@app.get("/api/operateurs")
def operateurs():
    with connection() as conn:
        base = fetchall(conn, "SELECT id,nom,type,note FROM operateurs ORDER BY nom")
        init_catalogue(conn)
        verified = fetchall(conn, "SELECT id,nom,description AS note FROM catalogue_partenaires WHERE categorie=? AND publie=1 ORDER BY nom", ("transporteur",))
        return base + [{**item, "type": "Partenaire vérifié"} for item in verified]


EDGES_SQL = """
SELECT l.id,l.mode,l.depart_id,l.arrivee_id,l.distance_km,l.duree_h,
 l.prix_min_usd,l.prix_max_usd,l.etat_route,l.operateur,l.frequence,l.note,
 l.verifie_le,l.source_info,
 CASE WHEN l.publie=1 THEN 'verifie' WHEN l.statut='a_verifier' THEN 'a_verifier' ELSE 'indicatif' END AS niveau_publication,
 d.nom AS depart_nom, a.nom AS arrivee_nom
FROM liaisons l JOIN lieux d ON d.id=l.depart_id JOIN lieux a ON a.id=l.arrivee_id
WHERE l.statut!='suspendu' AND (
    (l.statut='a_verifier' AND l.source_hash IS NOT NULL)
    OR (l.statut='ok' AND (
    l.publie=1
    OR (
        -- Showcase initial estimates separately from verified publications.
        -- This is NOT a verification or a change to the admin publication flag.
        l.publie=0 AND l.source_hash IS NOT NULL AND l.verifie_le IS NULL
        AND COALESCE(TRIM(l.source_info),'')=''
        -- Double percent signs for psycopg's SQL placeholder parser.
        AND LOWER(COALESCE(l.note,'')) NOT LIKE '%%vérifier%%'
        AND LOWER(COALESCE(l.note,'')) NOT LIKE '%%insécurité%%'
        AND LOWER(COALESCE(l.note,'')) NOT LIKE '%%conflit%%'
    ))
)
)
ORDER BY l.id
"""


@app.get("/api/itineraire")
def chercher_itineraire(
    depart_id: str = Query(min_length=1, max_length=100),
    arrivee_id: str = Query(min_length=1, max_length=100),
    modes: str = Query(default=",".join(MODES), max_length=150),
):
    if depart_id == arrivee_id:
        raise HTTPException(status_code=422, detail="Départ et arrivée identiques")
    allowed = {m.strip() for m in modes.split(",") if m.strip()}
    if not allowed or not allowed.issubset(MODES):
        raise HTTPException(status_code=422, detail="Modes invalides")
    with connection() as conn:
        edges = fetchall(conn, EDGES_SQL)
    # Combine recorded connections and clearly labeled reverse hypotheses.
    # Try the network with clearly labeled reverse-direction hypotheses.
    # Do not infer new roads, ferries, flights or prices from geography.
    pairs = {(e["depart_id"], e["arrivee_id"], e["mode"]) for e in edges}
    reverse = []
    for e in edges:
        if (e["arrivee_id"], e["depart_id"], e["mode"]) in pairs:
            continue
        copy = dict(e)
        copy["depart_id"], copy["arrivee_id"] = e["arrivee_id"], e["depart_id"]
        copy["depart_nom"], copy["arrivee_nom"] = e["arrivee_nom"], e["depart_nom"]
        copy["id"] = f"hypothese-retour-{e['id']}"
        copy["niveau_publication"] = "hypothese_retour"
        copy["source_info"] = "Sens retour non enregistré : trajet théorique à confirmer"
        # Reverse direction may have a different fare and duration.
        copy["prix_min_usd"] = None
        copy["prix_max_usd"] = None
        copy["duree_h"] = None
        reverse.append(copy)
    # Search by geographical link count when reverse prices/durations
    # are unknown; never silently reuse an outbound fare.
    routes = itineraries(edges + reverse, depart_id, arrivee_id, allowed)
    return {
        "itinéraires": routes,
        "avertissement": "Les liaisons en attente de vérification sont des PROPOSITIONS NON CONFIRMÉES. Les trajets initiaux restent des estimations NON VÉRIFIÉES. Aucun horaire, tarif, état de route ou départ n'est garanti. Vérifiez toujours la sécurité, l'existence du trajet, les prix et la disponibilité directement auprès du transporteur avant tout déplacement.",
        "tarifs_valides_par_gestionnaire": True,
        "temps_reel": False,
    }


@app.get("/api/admin/statistiques", dependencies=[Depends(require_admin)])
def statistiques():
    with connection() as conn:
        totals = fetchone(conn, "SELECT COUNT(*) AS total, SUM(CASE WHEN publie=1 THEN 1 ELSE 0 END) AS publiees, SUM(CASE WHEN statut='a_verifier' THEN 1 ELSE 0 END) AS a_verifier FROM liaisons")
    return {k: (v or 0) for k, v in totals.items()}


@app.get("/api/admin/liaisons", dependencies=[Depends(require_admin)])
def admin_liaisons(limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0)):
    with connection() as conn:
        return fetchall(conn, """
            SELECT l.*, d.nom AS depart_nom, a.nom AS arrivee_nom
            FROM liaisons l JOIN lieux d ON d.id=l.depart_id JOIN lieux a ON a.id=l.arrivee_id
            ORDER BY l.id LIMIT ? OFFSET ?
        """, (limit, offset))


class LiaisonUpdate(BaseModel):
    statut: Literal["ok", "a_verifier", "suspendu"] | None = None
    publie: bool | None = None
    verifie_le: date | None = None
    source_info: str | None = Field(default=None, max_length=500)
    duree_h: float | None = Field(default=None, gt=0)
    prix_min_usd: float | None = Field(default=None, ge=0)
    prix_max_usd: float | None = Field(default=None, ge=0)
    frequence: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=1000)


@app.patch("/api/admin/liaisons/{liaison_id}", dependencies=[Depends(require_admin)])
def modifier_liaison(liaison_id: int, update: LiaisonUpdate):
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="Aucune modification")
    if "publie" in fields and fields["publie"] is None:
        raise HTTPException(status_code=422, detail="Publication doit être vraie ou fausse")
    if "verifie_le" in fields and fields["verifie_le"] is not None:
        if fields["verifie_le"] > date.today():
            raise HTTPException(status_code=422, detail="La date de vérification ne peut pas être future")
        fields["verifie_le"] = fields["verifie_le"].isoformat()
    if "publie" in fields and fields["publie"] is not None:
        fields["publie"] = int(fields["publie"])
    with connection() as conn:
        existing = fetchone(conn, "SELECT * FROM liaisons WHERE id=?", (liaison_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Liaison inconnue")
        merged = {**existing, **fields}
        if merged["statut"] != "ok":
            if fields.get("publie"):
                raise HTTPException(status_code=422, detail="Une liaison à vérifier ou suspendue ne peut pas être publiée")
            fields["publie"] = 0
            merged["publie"] = 0
        if merged["publie"]:
            if merged["statut"] != "ok" or not merged["verifie_le"] or not (merged["source_info"] or "").strip():
                raise HTTPException(status_code=422, detail="Publication : statut ok, date et source de vérification obligatoires")
        low, high = merged["prix_min_usd"], merged["prix_max_usd"]
        if low is not None and high is not None and high < low:
            raise HTTPException(status_code=422, detail="Prix maximum inférieur au minimum")
        columns = list(fields)
        execute(conn, f"UPDATE liaisons SET {','.join(c + '=?' for c in columns)} WHERE id=?", [fields[k] for k in columns] + [liaison_id])
        return fetchone(conn, "SELECT * FROM liaisons WHERE id=?", (liaison_id,))


# Serve the compiled React interface from the same origin as /api on Render.
# No service worker is installed, and all itinerary searches still require a
# live request to the server (online-only application).
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
if STATIC_DIR.is_dir():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/admin/comptes", include_in_schema=False)
    @app.get("/admin/catalogue", include_in_schema=False)
    @app.get("/admin/reservations", include_in_schema=False)
    @app.get("/admin", include_in_schema=False)
    def serve_frontend():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/a-propos", include_in_schema=False)
    @app.get("/contact", include_in_schema=False)
    def serve_information_pages():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/compte", include_in_schema=False)
    @app.get("/mes-voyages", include_in_schema=False)
    def serve_accounts():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/confidentialite", include_in_schema=False)
    def serve_privacy():
        # Direct visits and browser refreshes must load the React application.
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/voyage-rdc-logo.svg", include_in_schema=False)
    def serve_brand_logo():
        return FileResponse(STATIC_DIR / "voyage-rdc-logo.svg", media_type="image/svg+xml")

    @app.get("/favicon.svg", include_in_schema=False)
    def serve_favicon():
        return FileResponse(STATIC_DIR / "favicon.svg")
