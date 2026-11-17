import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import connection, fetchone
from app.main import app
from scripts.import_csv import from_directory, import_rows


SEED_DIR = Path(__file__).resolve().parents[1] / "seed"


class RealSeedTests(unittest.TestCase):
    def test_included_csv_import_and_counts(self):
        rows = from_directory(SEED_DIR)
        self.assertEqual({name: len(data) for name, data in rows.items()}, {
            "provinces": 26, "lieux": 52, "points": 100, "operateurs": 8, "liaisons": 186,
        })
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {"DATABASE_URL": f"sqlite:///{temp}/seed-test.db"}):
            import_rows(rows)
            import_rows(rows)
            with connection() as conn:
                self.assertEqual(fetchone(conn, "SELECT COUNT(*) AS n FROM liaisons")["n"], 186)
                self.assertEqual(fetchone(conn, "SELECT COUNT(*) AS n FROM liaisons WHERE publie=1")["n"], 0)
                self.assertEqual(fetchone(conn, "SELECT COUNT(*) AS n FROM liaisons WHERE statut='a_verifier'")["n"], 112)

    def test_publishing_verified_seed_route_makes_it_searchable(self):
        rows = from_directory(SEED_DIR)
        env = {"ADMIN_API_TOKEN": "test-token-with-sufficient-length", "DATABASE_URL": ""}
        with tempfile.TemporaryDirectory() as temp:
            env["DATABASE_URL"] = f"sqlite:///{temp}/seed-test.db"
            with patch.dict(os.environ, env):
                import_rows(rows)
                with connection() as conn:
                    one = fetchone(conn, "SELECT id,depart_id,arrivee_id,mode FROM liaisons WHERE statut='ok' LIMIT 1")
                self.assertIsNotNone(one)
                with TestClient(app) as client:
                    response = client.patch(f"/api/admin/liaisons/{one['id']}", headers={"Authorization": "Bearer test-token-with-sufficient-length"}, json={
                        "publie": True, "verifie_le": "2026-11-01", "source_info": "Vérification fictive de test seulement"
                    })
                    self.assertEqual(response.status_code, 200)
                    query = f"/api/itineraire?depart_id={one['depart_id']}&arrivee_id={one['arrivee_id']}&modes={one['mode']}"
                    routes = client.get(query).json()["itinéraires"]
                    self.assertTrue(routes)
                    self.assertEqual(routes[0]["segments"][0]["id"], one["id"])


if __name__ == "__main__":
    unittest.main()
