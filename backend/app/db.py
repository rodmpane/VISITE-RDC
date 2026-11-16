"""Minimal DB-API adapter (PostgreSQL in production, SQLite for local tests)."""
from contextlib import contextmanager
import os
import sqlite3


def database_url():
    return os.getenv("DATABASE_URL", "sqlite:///./voyage_rdc.db")


def is_sqlite():
    return database_url().startswith("sqlite:///")


def query(sql):
    return sql if is_sqlite() else sql.replace("?", "%s")


@contextmanager
def connection():
    if is_sqlite():
        path = database_url().removeprefix("sqlite:///")
        conn = sqlite3.connect(path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
    else:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError("Installez psycopg pour PostgreSQL") from exc
        conn = psycopg.connect(database_url(), row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute(conn, sql, params=()):
    return conn.execute(query(sql), params)


def fetchall(conn, sql, params=()):
    return [dict(row) for row in execute(conn, sql, params).fetchall()]


def fetchone(conn, sql, params=()):
    row = execute(conn, sql, params).fetchone()
    return dict(row) if row is not None else None
