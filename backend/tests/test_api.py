import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import connection, execute, fetchone
from app.main import app
from app.schema import init_schema
from scripts.import_csv import import_rows


def fixture():
    def route(mode, start, end, hours, min_price, max_price, distance):
        return dict(mode=mode, depart_id=start, arrivee_id=end, distance_km=str(distance),
                    duree_h=str(hours), prix_min_usd=str(min_price), prix_max_usd=str(max_price),
                    etat_route="", operateur="", frequence="", note="Estimation", statut="ok")
    return {
        "provinces": [{"id": "k", "nom": "Province test", "chef_lieu": "A"}],
        "lieux": [dict(id=id, nom=id, province_id="k", type="ville", latitude="", longitude="") for id in ("a", "b", "c")],
        "points": [],
        "operateurs": [],
        "liaisons": [route("bus", "a", "c", 5, 20, 25, 100),
                     route("moto", "a", "b", 1, 12, 13, 40),
                     route("moto", "b", "c", 1, 12, 13, 40),
                     route("voiture", "a", "c", 7, 5, 8, 120)]
    }


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            "DATABASE_URL": f"sqlite:///{self.temp.name}/test.db",
            "ADMIN_API_TOKEN": "this-is-a-test-only-token-do-not-reuse",
        })
        self.env.start()
        init_schema()
        self.data = fixture()
        import_rows(self.data)
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer this-is-a-test-only-token-do-not-reuse"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def publish(self, start=1, end=5):
        for route_id in range(start, end):
            response = self.client.patch(f"/api/admin/liaisons/{route_id}", json={
                "publie": True, "statut": "ok", "verifie_le": "2026-11-01", "source_info": "Contact partenaire, test interne"
            }, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)

    def test_import_is_unpublished_and_idempotent(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(len(self.client.get("/api/lieux").json()), 3)
        self.assertEqual(self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()["itinéraires"], [])
        import_rows(self.data)
        with connection() as conn:
            self.assertEqual(fetchone(conn, "SELECT COUNT(*) AS n FROM liaisons")["n"], 4)

    def test_admin_requires_token_and_provenance(self):
        self.assertEqual(self.client.get("/api/admin/liaisons").status_code, 401)
        self.assertEqual(self.client.get("/api/admin/liaisons", headers={"Authorization": "Bearer wrong"}).status_code, 401)
        response = self.client.patch("/api/admin/liaisons/1", json={"publie": True}, headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.publish(start=1, end=2)
        self.assertEqual(self.client.get("/api/admin/statistiques", headers=self.headers).json()["publiees"], 1)
        self.assertTrue(self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()["itinéraires"])
        response = self.client.patch("/api/admin/liaisons/1", json={"statut": "suspendu"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["publie"], 0)
        self.assertEqual(self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()["itinéraires"], [])

    def test_multimodal_search_and_inputs(self):
        self.publish()
        data = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()
        routes = {p["critere"]: p for p in data["itinéraires"]}
        self.assertEqual([r["arrivee_id"] for r in routes["rapide"]["segments"]], ["b", "c"])
        self.assertEqual(routes["rapide"]["duree_h"], 2)
        self.assertEqual(routes["economique"]["prix_min_usd"], 5)
        self.assertFalse(data["temps_reel"])
        only_bus = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c&modes=bus").json()
        self.assertTrue(all(segment["mode"] == "bus" for p in only_bus["itinéraires"] for segment in p["segments"]))
        self.assertEqual(self.client.get("/api/itineraire?depart_id=a&arrivee_id=a").status_code, 422)
        self.assertEqual(self.client.get("/api/itineraire?depart_id=a&arrivee_id=c&modes=helico").status_code, 422)


if __name__ == "__main__":
    unittest.main()
