"""Voyageur accounts and saved itinerary plans. No booking or payment processing."""
import hashlib
import hmac
import os
import secrets
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .db import connection, execute, fetchall, fetchone, is_sqlite

router = APIRouter(prefix="/api/compte", tags=["Compte voyageur"])


def init_tables(conn):
    execute(conn, """CREATE TABLE IF NOT EXISTS voyageurs (
        id VARCHAR(40) PRIMARY KEY, nom VARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL)""")
    execute(conn, """CREATE TABLE IF NOT EXISTS sessions_voyageurs (
        token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(40) NOT NULL,
        expires_at VARCHAR(40) NOT NULL)""")
    execute(conn, """CREATE TABLE IF NOT EXISTS voyages_enregistres (
        id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40) NOT NULL,
        depart VARCHAR(120) NOT NULL, arrivee VARCHAR(120) NOT NULL,
        modes VARCHAR(150) NOT NULL, statut VARCHAR(40) NOT NULL,
        hebergement VARCHAR(240), paiement VARCHAR(60) NOT NULL,
        created_at VARCHAR(40) NOT NULL)""")

    execute(conn, """CREATE TABLE IF NOT EXISTS demandes_reservation (
        id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40) NOT NULL,
        type VARCHAR(20) NOT NULL, prestataire VARCHAR(180) NOT NULL,
        ville VARCHAR(120) NOT NULL, date_debut VARCHAR(20) NOT NULL,
        date_fin VARCHAR(20), voyageurs INTEGER NOT NULL,
        details VARCHAR(500), statut VARCHAR(60) NOT NULL,
        paiement_statut VARCHAR(60) NOT NULL,
        paiement_methode VARCHAR(40),
        created_at VARCHAR(40) NOT NULL)""")
    execute(conn, """CREATE TABLE IF NOT EXISTS compteurs_prestataires (
        prestataire_cle VARCHAR(180) PRIMARY KEY, nombre INTEGER NOT NULL)""")
    # Existing installations retain their reservations and UUID primary keys.
    if is_sqlite():
        columns = [row["name"] for row in fetchall(conn, "PRAGMA table_info(demandes_reservation)")]
        if "reference" not in columns:
            execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN reference VARCHAR(255)")
    else:
        execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN IF NOT EXISTS reference VARCHAR(255)")
    execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_demandes_reference ON demandes_reservation(reference)")


def provider_key(name):
    normalized = unicodedata.normalize("NFKD", name.strip())
    ascii_name = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^A-Z0-9]+", "-", ascii_name.upper()).strip("-") or "PRESTATAIRE"


def booking_reference(conn, provider, created_at):
    key = provider_key(provider)
    row = fetchone(conn, """INSERT INTO compteurs_prestataires (prestataire_cle,nombre)
        VALUES (?,1) ON CONFLICT (prestataire_cle) DO UPDATE SET nombre=compteurs_prestataires.nombre+1
        RETURNING nombre""", (key,))
    return f"VRDC-{key}/{row['nombre']:04d}/{created_at.month:02d}/{created_at.year}"


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 260000).hex()
    return salt + ":" + digest


def verify_password(password, stored):
    try:
        salt, digest = stored.split(":", 1)
        return hmac.compare_digest(hash_password(password, salt), stored)
    except (ValueError, TypeError):
        return False


def new_session(conn, user_id):
    token = secrets.token_urlsafe(40)
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    execute(conn, "INSERT INTO sessions_voyageurs (token_hash,user_id,expires_at) VALUES (?,?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), user_id, expiry))
    return token


def current_user(conn, authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Connectez-vous pour accéder à votre espace.")
    token = authorization[7:]
    if len(token) > 200:
        raise HTTPException(status_code=401, detail="Session invalide.")
    session = fetchone(conn, """SELECT v.id,v.nom,v.email FROM sessions_voyageurs s
        JOIN voyageurs v ON v.id=s.user_id
        WHERE s.token_hash=? AND s.expires_at>?""",
        (hashlib.sha256(token.encode()).hexdigest(), datetime.now(timezone.utc).isoformat()))
    if not session:
        raise HTTPException(status_code=401, detail="Session expirée. Reconnectez-vous.")
    return session


class Register(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=10, max_length=128)


class Login(BaseModel):
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str


class SavedTrip(BaseModel):
    depart: str = Field(min_length=1, max_length=120)
    arrivee: str = Field(min_length=1, max_length=120)
    modes: str = Field(min_length=1, max_length=150)


@router.post("/inscription", status_code=201)
def register(body: Register):
    email = str(body.email).strip().lower()
    with connection() as conn:
        init_tables(conn)
        if fetchone(conn, "SELECT id FROM voyageurs WHERE email=?", (email,)):
            raise HTTPException(status_code=409, detail="Cette adresse e-mail est déjà utilisée.")
        uid = str(uuid4())
        try:
            execute(conn, "INSERT INTO voyageurs (id,nom,email,password_hash,created_at) VALUES (?,?,?,?,?)",
                    (uid, body.nom.strip(), email, hash_password(body.password), datetime.now(timezone.utc).isoformat()))
        except Exception:
            raise HTTPException(status_code=409, detail="Impossible de créer ce compte. Vérifiez votre adresse.")
        return {"token": new_session(conn, uid), "user": {"id": uid, "nom": body.nom.strip(), "email": email}}


@router.post("/connexion")
def login(body: Login):
    with connection() as conn:
        init_tables(conn)
        user = fetchone(conn, "SELECT * FROM voyageurs WHERE email=?", (str(body.email).lower(),))
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Adresse e-mail ou mot de passe incorrect.")
        return {"token": new_session(conn, user["id"]), "user": {"id": user["id"], "nom": user["nom"], "email": user["email"]}}


@router.get("/moi")
def me(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        return current_user(conn, authorization)


@router.post("/deconnexion")
def logout(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        current_user(conn, authorization)
        execute(conn, "DELETE FROM sessions_voyageurs WHERE token_hash=?",
                (hashlib.sha256(authorization[7:].encode()).hexdigest(),))
    return {"ok": True}


@router.get("/voyages")
def trips(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        return fetchall(conn, """SELECT id,depart,arrivee,modes,statut,hebergement,paiement,created_at
            FROM voyages_enregistres WHERE user_id=? ORDER BY created_at DESC LIMIT 100""", (user["id"],))


@router.post("/voyages", status_code=201)
def save_trip(body: SavedTrip, authorization: str | None = Header(default=None)):
    if body.depart == body.arrivee:
        raise HTTPException(status_code=422, detail="Choisissez deux villes différentes.")
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        trip_id = str(uuid4())
        execute(conn, """INSERT INTO voyages_enregistres
            (id,user_id,depart,arrivee,modes,statut,hebergement,paiement,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (trip_id, user["id"], body.depart, body.arrivee, body.modes,
             "Projet de voyage — non réservé", None, "Aucun paiement", datetime.now(timezone.utc).isoformat()))
        return {"id": trip_id, "message": "Projet de voyage enregistré. Aucune réservation effectuée."}


@router.delete("/voyages/{trip_id}")
def delete_trip(trip_id: str, authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        execute(conn, "DELETE FROM voyages_enregistres WHERE id=? AND user_id=?", (trip_id, user["id"]))
        return {"ok": True}


class BookingRequest(BaseModel):
    type: str = Field(pattern="^(hebergement|transport)$")
    prestataire: str = Field(min_length=2, max_length=180)
    ville: str = Field(min_length=2, max_length=120)
    date_debut: date
    date_fin: date | None = None
    voyageurs: int = Field(ge=1, le=20)
    details: str = Field(default="", max_length=500)


class PaymentChoice(BaseModel):
    methode: str = Field(pattern="^(mpesa|airtel_money|orange_money|carte|sur_place)$")


@router.get("/reservations")
def bookings(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        return fetchall(conn, """SELECT id,reference,type,prestataire,ville,date_debut,date_fin,voyageurs,
            details,statut,paiement_statut,paiement_methode,created_at
            FROM demandes_reservation WHERE user_id=? ORDER BY created_at DESC LIMIT 100""", (user["id"],))


@router.post("/reservations", status_code=201)
def request_booking(body: BookingRequest, authorization: str | None = Header(default=None)):
    if body.date_debut < date.today() or (body.date_fin and body.date_fin < body.date_debut):
        raise HTTPException(status_code=422, detail="Vérifiez les dates de votre demande.")
    if body.type == "hebergement" and not body.date_fin:
        raise HTTPException(status_code=422, detail="Indiquez la date de départ de l'hébergement.")
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        booking_id = str(uuid4())
        created_at = datetime.now(timezone.utc)
        reference = booking_reference(conn, body.prestataire, created_at)
        execute(conn, """INSERT INTO demandes_reservation
            (id,user_id,type,prestataire,ville,date_debut,date_fin,voyageurs,details,
             statut,paiement_statut,paiement_methode,created_at,reference)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (booking_id,user["id"],body.type,body.prestataire.strip(),body.ville.strip(),
             body.date_debut.isoformat(),body.date_fin.isoformat() if body.date_fin else None,
             body.voyageurs,body.details.strip(),"Demande enregistrée — non confirmée",
             "Aucun paiement",None,created_at.isoformat(),reference))
        return {"id":booking_id,"reference":reference,"message":"Demande enregistrée, sans réservation confirmée ni paiement."}


@router.patch("/reservations/{booking_id}/paiement")
def choose_payment(booking_id: str, body: PaymentChoice, authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        booking = fetchone(conn,"SELECT id FROM demandes_reservation WHERE id=? AND user_id=?",
                           (booking_id,user["id"]))
        if not booking:
            raise HTTPException(status_code=404,detail="Demande introuvable.")
        execute(conn, """UPDATE demandes_reservation SET paiement_methode=?,
            paiement_statut=CASE WHEN ?='sur_place' THEN 'Paiement sur place envisagé — sous réserve de validation' ELSE 'En attente de configuration — aucun débit' END
            WHERE id=? AND user_id=?""",(body.methode,body.methode,booking_id,user["id"]))
        return {"message":"Préférence enregistrée. Aucun paiement initié ni débité."}


@router.delete("/reservations/{booking_id}")
def cancel_booking(booking_id: str, authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        execute(conn,"DELETE FROM demandes_reservation WHERE id=? AND user_id=?",
                (booking_id,user["id"]))
        return {"ok":True}


class BookingValidation(BaseModel):
    statut: str = Field(pattern="^(confirmee|refusee)$")
    paiement_sur_place: bool = False


def require_booking_admin(authorization):
    configured = os.getenv("ADMIN_API_TOKEN", "")
    supplied = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not configured:
        raise HTTPException(status_code=503, detail="Administration non configurée.")
    if not secrets.compare_digest(configured, supplied):
        raise HTTPException(status_code=401, detail="Accès administrateur refusé.")


@router.get("/admin/reservations")
def admin_bookings(authorization: str | None = Header(default=None)):
    require_booking_admin(authorization)
    with connection() as conn:
        init_tables(conn)
        return fetchall(conn, """SELECT r.*, v.nom AS voyageur_nom, v.email AS voyageur_email
            FROM demandes_reservation r JOIN voyageurs v ON v.id=r.user_id
            ORDER BY r.created_at DESC LIMIT 200""")


@router.patch("/admin/reservations/{booking_id}/validation")
def validate_booking(booking_id: str, body: BookingValidation,
                     authorization: str | None = Header(default=None)):
    require_booking_admin(authorization)
    with connection() as conn:
        init_tables(conn)
        existing = fetchone(conn, "SELECT id,paiement_methode FROM demandes_reservation WHERE id=?", (booking_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Demande introuvable.")
        status = "Réservation confirmée" if body.statut == "confirmee" else "Demande refusée"
        payment_status = ("À régler sur place — non payé" if body.statut == "confirmee" and body.paiement_sur_place
                          else "Aucun paiement")
        method = "sur_place" if body.statut == "confirmee" and body.paiement_sur_place else existing["paiement_methode"]
        execute(conn, """UPDATE demandes_reservation SET statut=?, paiement_statut=?, paiement_methode=?
            WHERE id=?""", (status, payment_status, method, booking_id))
        return {"id": booking_id, "statut": status, "paiement_statut": payment_status}
