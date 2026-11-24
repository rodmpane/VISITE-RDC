"""Administrative provider configuration; no live dispatch or payment validation."""
import os
import uuid
from typing import Literal
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from .db import connection, execute, fetchall, fetchone
from .catalogue import admin_auth

def require_admin(authorization: str | None = Header(default=None)):
    admin_auth(authorization)

router = APIRouter(prefix="/api/admin/prestataires", dependencies=[Depends(require_admin)])

class Provider(BaseModel):
    nom: str = Field(min_length=2, max_length=180)
    mode: Literal["avion","bus","voiture","moto","fleuve","lac","bac","train","hebergement"]
    api_url: HttpUrl | None = None
    identifiant: str = Field(default="", max_length=500)
    cle_api: str = Field(default="", max_length=4000)
    email: str = Field(default="", max_length=254)
    telephone: str = Field(default="", max_length=35)
    transmission: bool = False
    confirmation_paiement: bool = False
    confirmation_reservation: bool = False

def init(conn):
    execute(conn, """CREATE TABLE IF NOT EXISTS provider_integrations (
        id TEXT PRIMARY KEY, nom TEXT NOT NULL, mode TEXT NOT NULL,
        api_url TEXT, credentials TEXT, email TEXT, telephone TEXT,
        transmission INTEGER NOT NULL DEFAULT 0,
        confirmation_paiement INTEGER NOT NULL DEFAULT 0,
        confirmation_reservation INTEGER NOT NULL DEFAULT 0,
        actif INTEGER NOT NULL DEFAULT 0)""")

def encrypt(value):
    key = os.getenv("PROVIDER_ENCRYPTION_KEY")
    if not key:
        raise HTTPException(503, "Clé de chiffrement serveur non configurée")
    try:
        return Fernet(key.encode()).encrypt(value.encode()).decode()
    except (ValueError, TypeError):
        raise HTTPException(503, "Configuration de chiffrement invalide")

PUBLIC = "id,nom,mode,api_url,email,telephone,transmission,confirmation_paiement,confirmation_reservation,actif,CASE WHEN credentials IS NULL THEN 0 ELSE 1 END AS identifiants_configures"

@router.get("")
def list_providers():
    with connection() as conn:
        init(conn)
        return fetchall(conn, f"SELECT {PUBLIC} FROM provider_integrations ORDER BY nom")

@router.post("", status_code=201)
def create_provider(data: Provider):
    import json
    if data.api_url and (data.api_url.scheme != "https" or data.api_url.username or data.api_url.password or data.api_url.query):
        raise HTTPException(422, "URL HTTPS sans identifiants ni paramètres requise")
    credentials = encrypt(json.dumps({"identifiant":data.identifiant,"cle_api":data.cle_api})) if data.identifiant or data.cle_api else None
    provider_id = str(uuid.uuid4())
    with connection() as conn:
        init(conn)
        execute(conn, """INSERT INTO provider_integrations
            (id,nom,mode,api_url,credentials,email,telephone,transmission,confirmation_paiement,confirmation_reservation)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (provider_id,data.nom.strip(),data.mode,str(data.api_url) if data.api_url else None,credentials,data.email,data.telephone,int(data.transmission),int(data.confirmation_paiement),int(data.confirmation_reservation)))
        return fetchone(conn, f"SELECT {PUBLIC} FROM provider_integrations WHERE id=?", (provider_id,))

@router.patch("/{provider_id}")
def update_provider(provider_id: str, data: Provider):
    import json
    if data.api_url and (data.api_url.scheme != "https" or data.api_url.username or data.api_url.password or data.api_url.query):
        raise HTTPException(422, "URL HTTPS sans identifiants ni paramètres requise")
    with connection() as conn:
        init(conn)
        existing = fetchone(conn, "SELECT credentials FROM provider_integrations WHERE id=?", (provider_id,))
        if not existing:
            raise HTTPException(404, "Prestataire inconnu")
        credentials = existing["credentials"]
        if data.identifiant or data.cle_api:
            credentials = encrypt(json.dumps({"identifiant":data.identifiant,"cle_api":data.cle_api}))
        execute(conn, """UPDATE provider_integrations SET nom=?,mode=?,api_url=?,credentials=?,email=?,telephone=?,transmission=?,confirmation_paiement=?,confirmation_reservation=?,actif=0 WHERE id=?""",
            (data.nom.strip(),data.mode,str(data.api_url) if data.api_url else None,credentials,data.email,data.telephone,int(data.transmission),int(data.confirmation_paiement),int(data.confirmation_reservation),provider_id))
        return fetchone(conn, f"SELECT {PUBLIC} FROM provider_integrations WHERE id=?", (provider_id,))
