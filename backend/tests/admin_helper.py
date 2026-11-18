"""Shared test-only administrator account session fixture."""
import os
from app.accounts import init_tables, hash_password, new_session
from app.db import connection, execute

def admin_headers():
    os.environ["ADMIN_LOGIN_EMAIL"] = "admin-test@example.invalid"
    with connection() as conn:
        init_tables(conn)
        execute(conn, """INSERT INTO voyageurs (id,nom,email,password_hash,created_at)
          VALUES (?,?,?,?,?) ON CONFLICT (id) DO NOTHING""",
          ("admin-test-id","Administrateur test","admin-test@example.invalid",hash_password("test-only-password"),"2026-01-01"))
        token = new_session(conn,"admin-test-id")
    return {"Authorization":"Bearer "+token}
