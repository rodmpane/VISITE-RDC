"""Voyageur accounts and saved itinerary plans. No booking or payment processing."""
import hashlib
import base64
import binascii
import json
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
    # One-time administrator provisioning from a salted password hash stored only in Render.
    admin_email = os.getenv("ADMIN_LOGIN_EMAIL", "").strip().lower()
    admin_hash = os.getenv("ADMIN_INITIAL_PASSWORD_HASH", "").strip()
    if admin_email and admin_hash and re.fullmatch(r"[0-9a-f]{32}:[0-9a-f]{64}", admin_hash):
        existing_admin = fetchone(conn, "SELECT id FROM voyageurs WHERE email=?", (admin_email,))
        if not existing_admin:
            execute(conn, """INSERT INTO voyageurs (id,nom,email,password_hash,created_at)
                VALUES (?,?,?,?,?)""",
                (str(uuid4()), "Administrateur Voyage RDC", admin_email, admin_hash,
                 datetime.now(timezone.utc).isoformat()))
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

    fields = {"postnom":"VARCHAR(120)","prenom":"VARCHAR(120)","lieu_naissance":"VARCHAR(150)","date_naissance":"VARCHAR(20)","telephone":"VARCHAR(35)","pays":"VARCHAR(100)","pays_origine":"VARCHAR(100)","ville":"VARCHAR(120)","adresse":"VARCHAR(300)"}
    existing = {r["name"] for r in fetchall(conn, "PRAGMA table_info(voyageurs)")} if is_sqlite() else set()
    for name, kind in fields.items():
        if not is_sqlite() or name not in existing:
            execute(conn, f"ALTER TABLE voyageurs ADD COLUMN {'IF NOT EXISTS ' if not is_sqlite() else ''}{name} {kind}")
    execute(conn, """CREATE TABLE IF NOT EXISTS pieces_identite_voyageurs (
        user_id VARCHAR(40) PRIMARY KEY, filename VARCHAR(160) NOT NULL,
        content_type VARCHAR(60) NOT NULL, encrypted_data TEXT NOT NULL,
        updated_at VARCHAR(40) NOT NULL)""")
    # Account suspension is additive and preserves existing profiles.
    if is_sqlite():
        user_columns = {r["name"] for r in fetchall(conn, "PRAGMA table_info(voyageurs)")}
        if "bloque" not in user_columns:
            execute(conn, "ALTER TABLE voyageurs ADD COLUMN bloque INTEGER NOT NULL DEFAULT 0")
    else:
        execute(conn, "ALTER TABLE voyageurs ADD COLUMN IF NOT EXISTS bloque INTEGER NOT NULL DEFAULT 0")
    if is_sqlite():
        payment_columns = {r["name"] for r in fetchall(conn, "PRAGMA table_info(demandes_reservation)")}
        if "paiement_reference" not in payment_columns:
            execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN paiement_reference VARCHAR(200)")
    else:
        execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN IF NOT EXISTS paiement_reference VARCHAR(200)")
    booking_cols = {r["name"] for r in fetchall(conn, "PRAGMA table_info(demandes_reservation)")} if is_sqlite() else set()
    if not is_sqlite() or "voyageur_infos" not in booking_cols:
        execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN " + ("IF NOT EXISTS " if not is_sqlite() else "") + "voyageur_infos TEXT")
    if not is_sqlite() or "reservation_infos" not in booking_cols:
        execute(conn, "ALTER TABLE demandes_reservation ADD COLUMN " + ("IF NOT EXISTS " if not is_sqlite() else "") + "reservation_infos TEXT")



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


def is_admin_email(email):
    configured = os.getenv("ADMIN_LOGIN_EMAIL", "").strip().lower()
    return bool(configured) and email.strip().lower() == configured


def current_user(conn, authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Connectez-vous pour accéder à votre espace.")
    token = authorization[7:]
    if len(token) > 200:
        raise HTTPException(status_code=401, detail="Session invalide.")
    session = fetchone(conn, """SELECT v.id,v.nom,v.email FROM sessions_voyageurs s
        JOIN voyageurs v ON v.id=s.user_id
        WHERE s.token_hash=? AND s.expires_at>? AND v.bloque=0""",
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
    if is_admin_email(email):
        raise HTTPException(status_code=403, detail="Ce compte est réservé à l’administration. Connectez-vous avec votre compte existant.")
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
        return {"token": new_session(conn, uid), "user": {"id": uid, "nom": body.nom.strip(), "email": email, "role": "client"}}


@router.post("/connexion")
def login(body: Login):
    with connection() as conn:
        init_tables(conn)
        user = fetchone(conn, "SELECT * FROM voyageurs WHERE email=?", (str(body.email).lower(),))
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Adresse e-mail ou mot de passe incorrect.")
        if user["bloque"]:
            raise HTTPException(status_code=403, detail="Ce compte est suspendu. Contactez l'administration.")
        return {"token": new_session(conn, user["id"]), "user": {"id": user["id"], "nom": user["nom"], "email": user["email"], "role": "admin" if is_admin_email(user["email"]) else "client"}}



PROFILE_FIELDS = ("nom","postnom","prenom","lieu_naissance","date_naissance","telephone","pays_origine","pays","ville","adresse")

class ProfileUpdate(BaseModel):
    nom: str = Field(min_length=2,max_length=120)
    postnom: str = Field(default="",max_length=120)
    prenom: str = Field(default="",max_length=120)
    lieu_naissance: str = Field(default="",max_length=150)
    date_naissance: date | None = None
    telephone: str = Field(default="",max_length=35)
    pays: str = Field(default="",max_length=100)
    pays_origine: str = Field(default="",max_length=100)
    ville: str = Field(default="",max_length=120)
    adresse: str = Field(default="",max_length=300)

def profile(conn, uid):
    data = fetchone(conn, "SELECT id,email," + ",".join(PROFILE_FIELDS) + " FROM voyageurs WHERE id=?", (uid,))
    doc = fetchone(conn,"SELECT filename FROM pieces_identite_voyageurs WHERE user_id=?",(uid,))
    data["piece_identite"] = doc["filename"] if doc else None
    return data

@router.patch("/moi")
def update_profile(body: ProfileUpdate, authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn,authorization)
        values = [getattr(body,k) for k in PROFILE_FIELDS]
        values = [v.isoformat() if isinstance(v,date) else v.strip() if isinstance(v,str) else v for v in values]
        if body.date_naissance and (body.date_naissance > date.today() or body.date_naissance.year < 1900):
            raise HTTPException(status_code=422,detail="Date de naissance invalide.")
        execute(conn,"UPDATE voyageurs SET "+",".join(k+"=?" for k in PROFILE_FIELDS)+" WHERE id=?",tuple(values+[user["id"]]))
        return profile(conn,user["id"])

class IdentityUpload(BaseModel):
    filename: str = Field(min_length=1,max_length=160)
    content_type: str
    data: str = Field(max_length=4500000)

def identity_cipher():
    key = os.getenv("IDENTITY_DOCUMENT_KEY","")
    if not key:
        raise HTTPException(status_code=503,detail="Stockage sécurisé des pièces d'identité non configuré.")
    from cryptography.fernet import Fernet
    try:
        return Fernet(key.encode())
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=503,detail="Clé de chiffrement invalide.")

@router.post("/moi/piece-identite")
def upload_identity(body: IdentityUpload,authorization: str | None = Header(default=None)):
    allowed = {"application/pdf":b"%PDF-","image/jpeg":bytes([255,216,255]),"image/png":bytes([137,80,78,71,13,10,26,10])}
    if body.content_type not in allowed:
        raise HTTPException(status_code=422,detail="Formats acceptés : PDF, JPG, PNG.")
    try:
        raw = base64.b64decode(body.data,validate=True)
    except (ValueError,binascii.Error):
        raise HTTPException(status_code=422,detail="Fichier invalide.")
    if not raw or len(raw)>3*1024*1024:
        raise HTTPException(status_code=413,detail="Taille maximale : 3 Mo.")
    if not raw.startswith(allowed[body.content_type]):
        raise HTTPException(status_code=422,detail="Format de fichier invalide.")
    cipher = identity_cipher()
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn,authorization)
        filename = os.path.basename(body.filename).replace(chr(92),"_")
        execute(conn,"""INSERT INTO pieces_identite_voyageurs (user_id,filename,content_type,encrypted_data,updated_at)
            VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET filename=excluded.filename,
            content_type=excluded.content_type,encrypted_data=excluded.encrypted_data,updated_at=excluded.updated_at""",
            (user["id"],filename,body.content_type,cipher.encrypt(raw).decode(),datetime.now(timezone.utc).isoformat()))
        return {"filename":filename,"message":"Pièce d'identité enregistrée de manière chiffrée."}

@router.delete("/moi/piece-identite")
def remove_identity(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn,authorization)
        execute(conn,"DELETE FROM pieces_identite_voyageurs WHERE user_id=?",(user["id"],))
        return {"ok":True}

@router.get("/moi")
def me(authorization: str | None = Header(default=None)):
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        data = profile(conn,user["id"])
    data["role"] = "admin" if is_admin_email(user["email"]) else "client"
    return data


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
    source_apk: bool = False
    nom: str = Field(default="", max_length=120)
    postnom: str = Field(default="", max_length=120)
    prenom: str = Field(default="", max_length=120)
    lieu_naissance: str = Field(default="", max_length=150)
    date_naissance: date | None = None
    telephone: str = Field(default="", max_length=35)
    email: str = Field(default="", max_length=254)
    numero_identite: str = Field(default="", max_length=100)
    itineraire: str = Field(default="", max_length=250)
    prix_unitaire: float | None = Field(default=None, ge=0, le=1000000000)
    devise: str = Field(default="USD", pattern="^(USD|CDF)$")
    modalite: str = Field(default="", max_length=120)


class PublicBookingRequest(BookingRequest):
    paiement_methode: str = Field(pattern="^(sur_place|mpesa|airtel_money|orange_money|carte)$")


@router.post("/reservations/invite", status_code=201)
def public_booking(body: PublicBookingRequest, authorization: str | None = Header(default=None)):
    """Guest and signed-in booking requests; no payment collection or automatic confirmation."""
    if not all((body.nom.strip(), body.postnom.strip(), body.prenom.strip(),
                body.lieu_naissance.strip(), body.date_naissance, body.telephone.strip(),
                body.itineraire.strip(), body.prestataire.strip())):
        raise HTTPException(status_code=422, detail="Complétez nom, postnom, prénom, naissance, téléphone, itinéraire et prestataire.")
    if body.date_naissance > date.today():
        raise HTTPException(status_code=422, detail="Date de naissance invalide.")
    if body.date_debut < date.today() or (body.type == "hebergement" and
            (not body.date_fin or body.date_fin <= body.date_debut)):
        raise HTTPException(status_code=422, detail="Vérifiez les dates du voyage ou du séjour.")
    with connection() as conn:
        init_tables(conn)
        user_id = str(uuid4())  # Guest ID fits VARCHAR(40); no voyageurs row for guests.
        if authorization:
            user_id = current_user(conn, authorization)["id"]
        now = datetime.now(timezone.utc)
        booking_id = str(uuid4())
        reference = booking_reference(conn, body.prestataire, now)
        info = {k:getattr(body,k) for k in ("nom","postnom","prenom","lieu_naissance",
            "telephone","email","numero_identite","itineraire","prix_unitaire","devise","modalite")}
        info["date_naissance"] = body.date_naissance.isoformat()
        info["nuits"] = (body.date_fin-body.date_debut).days if body.type == "hebergement" else None
        info["total_estime"] = round(body.prix_unitaire * (info["nuits"] if body.type == "hebergement" else body.voyageurs),2) if body.prix_unitaire is not None else None
        status = ("Paiement sur place envisagé — sous réserve de validation"
                  if body.paiement_methode == "sur_place" else
                  "Moyen souhaité — aucun paiement initié")
        execute(conn, """INSERT INTO demandes_reservation
            (id,user_id,type,prestataire,ville,date_debut,date_fin,voyageurs,details,
             statut,paiement_statut,paiement_methode,created_at,reference,voyageur_infos,reservation_infos)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (booking_id,user_id,body.type,body.prestataire.strip(),body.ville.strip(),
             body.date_debut.isoformat(),body.date_fin.isoformat() if body.date_fin else None,
             body.voyageurs,body.details.strip(),"Demande enregistrée — non confirmée",
             status,body.paiement_methode,now.isoformat(),reference,
             json.dumps(info,ensure_ascii=False),json.dumps(info,ensure_ascii=False)))
        return {"id":booking_id,"reference":reference,"type":body.type,
                "prestataire":body.prestataire,"ville":body.ville,
                "date_debut":body.date_debut.isoformat(),
                "date_fin":body.date_fin.isoformat() if body.date_fin else None,
                "voyageurs":body.voyageurs,"details":body.details,
                "statut":"Demande enregistrée — non confirmée",
                "paiement_statut":status,"paiement_methode":body.paiement_methode,
                "created_at":now.isoformat(),"reservation_infos":info,
                "message":"Demande reçue. Validation par le prestataire en attente ; aucun paiement encaissé.",
                "email_envoye":False}


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
    if body.source_apk and body.type == "transport" and not all([body.nom.strip(),body.postnom.strip(),body.prenom.strip(),body.lieu_naissance.strip(),body.date_naissance,body.telephone.strip(),body.itineraire.strip()]):
        raise HTTPException(status_code=422,detail="Transport : nom, postnom, prénom, lieu et date de naissance, téléphone et itinéraire obligatoires.")
    if body.type == "hebergement" and body.date_fin and body.date_fin <= body.date_debut:
        raise HTTPException(status_code=422,detail="La date de départ de l’hôtel doit être après l’arrivée.")
    with connection() as conn:
        init_tables(conn)
        user = current_user(conn, authorization)
        booking_id = str(uuid4())
        created_at = datetime.now(timezone.utc)
        reference = booking_reference(conn, body.prestataire, created_at)
        traveler_snapshot = json.dumps({k:profile(conn,user["id"]).get(k) for k in PROFILE_FIELDS},ensure_ascii=False)
        info = {key:getattr(body,key) for key in ("nom","postnom","prenom","lieu_naissance","telephone","email","numero_identite","itineraire","prix_unitaire","devise","modalite")}
        info["date_naissance"] = body.date_naissance.isoformat() if body.date_naissance else None
        info["nuits"] = (body.date_fin - body.date_debut).days if body.type == "hebergement" and body.date_fin else None
        info["total_estime"] = round(body.prix_unitaire * (info["nuits"] if body.type == "hebergement" else body.voyageurs),2) if body.prix_unitaire is not None else None
        execute(conn, """INSERT INTO demandes_reservation
            (id,user_id,type,prestataire,ville,date_debut,date_fin,voyageurs,details,
             statut,paiement_statut,paiement_methode,created_at,reference,voyageur_infos,reservation_infos)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (booking_id,user["id"],body.type,body.prestataire.strip(),body.ville.strip(),
             body.date_debut.isoformat(),body.date_fin.isoformat() if body.date_fin else None,
             body.voyageurs,body.details.strip(),"Demande enregistrée — non confirmée",
             "Aucun paiement",None,created_at.isoformat(),reference,traveler_snapshot))
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
    from .catalogue import admin_auth
    admin_auth(authorization)


@router.get("/admin/reservations")
def admin_bookings(authorization: str | None = Header(default=None)):
    require_booking_admin(authorization)
    with connection() as conn:
        init_tables(conn)
        return fetchall(conn, """SELECT r.*, COALESCE(v.nom, 'Voyageur invité') AS voyageur_nom, v.email AS voyageur_email
            FROM demandes_reservation r LEFT JOIN voyageurs v ON v.id=r.user_id
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

class PaymentValidation(BaseModel):
    reference: str = Field(min_length=4,max_length=200)
    encaisse: bool

@router.patch("/admin/reservations/{booking_id}/paiement-valide")
def validate_payment(booking_id: str, body: PaymentValidation, authorization: str | None = Header(default=None)):
    require_booking_admin(authorization)
    with connection() as conn:
        init_tables(conn)
        booking=fetchone(conn,"SELECT id,statut FROM demandes_reservation WHERE id=?",(booking_id,))
        if not booking:
            raise HTTPException(status_code=404,detail="Réservation introuvable")
        if booking["statut"] != "Réservation confirmée":
            raise HTTPException(status_code=422,detail="Confirmez d'abord la réservation auprès du prestataire")
        status="Paiement encaissé — confirmé par l'administration" if body.encaisse else "Paiement non encaissé — vérification requise"
        execute(conn,"UPDATE demandes_reservation SET paiement_statut=?,paiement_reference=? WHERE id=?",(status,body.reference.strip(),booking_id))
        return {"id":booking_id,"paiement_statut":status,"paiement_reference":body.reference.strip()}
