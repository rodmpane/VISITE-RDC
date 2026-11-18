"""Private account administration: directory, suspension and session revocation.

Never return password hashes, authentication tokens or identity document bytes.
"""
import secrets
import os
from .accounts import hash_password
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from .accounts import init_tables, is_admin_email
from .catalogue import admin_auth
from .db import connection, execute, fetchall, fetchone

def require_admin(authorization: str | None = Header(default=None)):
    admin_auth(authorization)

router = APIRouter(prefix="/api/admin/comptes", dependencies=[Depends(require_admin)], tags=["Administration comptes"])

class AccountStatus(BaseModel):
    bloque: bool

@router.get("")
def accounts(search: str = Query(default="", max_length=120), limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    with connection() as conn:
        init_tables(conn)
        where = "WHERE LOWER(v.email) <> ? AND (LOWER(v.nom) LIKE ? OR LOWER(v.email) LIKE ?)"
        admin_email = os.getenv("ADMIN_LOGIN_EMAIL", "").strip().lower()
        pattern = "%" + search.strip().lower() + "%"
        total = fetchone(conn, "SELECT COUNT(*) AS count FROM voyageurs v " + where, (admin_email,pattern,pattern))["count"]
        items = fetchall(conn, """SELECT v.id,v.nom,v.email,v.created_at,v.bloque,
          (SELECT COUNT(*) FROM voyages_enregistres t WHERE t.user_id=v.id) AS voyages,
          (SELECT COUNT(*) FROM demandes_reservation r WHERE r.user_id=v.id) AS reservations
          FROM voyageurs v """+where+" ORDER BY v.created_at DESC LIMIT ? OFFSET ?",(admin_email,pattern,pattern,limit,offset))
        return {"total":total,"items":items}

@router.get("/{user_id}")
def account_details(user_id: str):
    with connection() as conn:
        init_tables(conn)
        user=fetchone(conn,"""SELECT id,nom,postnom,prenom,email,telephone,pays,ville,created_at,bloque
          FROM voyageurs WHERE id=?""",(user_id,))
        if not user or is_admin_email(user["email"]):
            raise HTTPException(status_code=404,detail="Compte client introuvable")
        user["voyages"]=fetchall(conn,"SELECT id,depart,arrivee,statut,created_at FROM voyages_enregistres WHERE user_id=? ORDER BY created_at DESC LIMIT 50",(user_id,))
        user["reservations"]=fetchall(conn,"SELECT id,reference,type,prestataire,statut,created_at FROM demandes_reservation WHERE user_id=? ORDER BY created_at DESC LIMIT 50",(user_id,))
        return user

@router.patch("/{user_id}")
def set_status(user_id: str,body:AccountStatus):
    with connection() as conn:
        init_tables(conn)
        target=fetchone(conn,"SELECT id,email FROM voyageurs WHERE id=?",(user_id,))
        if not target or is_admin_email(target["email"]):
            raise HTTPException(status_code=404,detail="Compte introuvable")
        execute(conn,"UPDATE voyageurs SET bloque=? WHERE id=?",(int(body.bloque),user_id))
        if body.bloque:
            execute(conn,"DELETE FROM sessions_voyageurs WHERE user_id=?",(user_id,))
        return {"id":user_id,"bloque":body.bloque}

@router.post("/{user_id}/deconnecter")
def revoke_sessions(user_id: str):
    with connection() as conn:
        init_tables(conn)
        if not fetchone(conn,"SELECT id FROM voyageurs WHERE id=?",(user_id,)):
            raise HTTPException(status_code=404,detail="Compte introuvable")
        execute(conn,"DELETE FROM sessions_voyageurs WHERE user_id=?",(user_id,))
        return {"ok":True}

@router.post("/{user_id}/reinitialiser-mot-de-passe")
def reset_password(user_id: str):
    """Generate a strong temporary password, returned exactly once to the administrator."""
    with connection() as conn:
        init_tables(conn)
        if not fetchone(conn,"SELECT id FROM voyageurs WHERE id=?",(user_id,)):
            raise HTTPException(status_code=404,detail="Compte introuvable")
        temporary=secrets.token_urlsafe(20)
        execute(conn,"UPDATE voyageurs SET password_hash=? WHERE id=?",(hash_password(temporary),user_id))
        execute(conn,"DELETE FROM sessions_voyageurs WHERE user_id=?",(user_id,))
        return {"mot_de_passe_temporaire":temporary,"message":"Mot de passe réinitialisé. Transmettez-le au voyageur par un canal sécurisé. Les anciennes sessions sont déconnectées."}

@router.delete("/{user_id}")
def delete_account(user_id: str):
    """Delete account and associated private records; reservation history is permanently removed."""
    with connection() as conn:
        init_tables(conn)
        if not fetchone(conn,"SELECT id FROM voyageurs WHERE id=?",(user_id,)):
            raise HTTPException(status_code=404,detail="Compte introuvable")
        for table in ("sessions_voyageurs","pieces_identite_voyageurs","voyages_enregistres","demandes_reservation"):
            execute(conn,f"DELETE FROM {table} WHERE user_id=?",(user_id,))
        execute(conn,"DELETE FROM voyageurs WHERE id=?",(user_id,))
        return {"deleted":True}
