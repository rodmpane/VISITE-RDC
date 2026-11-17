import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import connection, execute, fetchone
from app.main import app
from app.schema import init_schema
from scripts.import_csv import import_rows, from_directory
from pathlib import Path


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

    def test_import_is_preview_only_and_idempotent(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(len(self.client.get("/api/lieux").json()), 3)
        estimate = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()
        self.assertTrue(estimate["itinéraires"])
        self.assertTrue(all(segment["niveau_publication"] == "indicatif"
                            for route in estimate["itinéraires"] for segment in route["segments"]))
        self.assertIn("NON VÉRIFIÉES", estimate["avertissement"])
        import_rows(self.data)
        with connection() as conn:
            self.assertEqual(fetchone(conn, "SELECT COUNT(*) AS n FROM liaisons")["n"], 4)
            self.assertEqual(fetchone(conn, "SELECT SUM(publie) AS n FROM liaisons")["n"], 0)

    def test_previews_exclude_uncertain_and_admin_unpublished_routes(self):
        with connection() as conn:
            execute(conn, "UPDATE liaisons SET note=? WHERE id=2", ("Itinéraire à vérifier",))
            execute(conn, "UPDATE liaisons SET statut=? WHERE id=3", ("a_verifier",))
        data = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()
        ids = {seg["id"] for path in data["itinéraires"] for seg in path["segments"]}
        self.assertNotIn(2, ids)
        self.assertIn(3, ids)
        self.assertTrue(any(seg["niveau_publication"] == "a_verifier" for path in data["itinéraires"] for seg in path["segments"]))
        self.publish(start=1, end=2)
        with connection() as conn:
            execute(conn, "UPDATE liaisons SET publie=0 WHERE id=1")
        data = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()
        ids = {seg["id"] for path in data["itinéraires"] for seg in path["segments"]}
        self.assertNotIn(1, ids)

    def test_admin_requires_token_and_provenance(self):
        self.assertEqual(self.client.get("/api/admin/liaisons").status_code, 401)
        self.assertEqual(self.client.get("/api/admin/liaisons", headers={"Authorization": "Bearer wrong"}).status_code, 401)
        response = self.client.patch("/api/admin/liaisons/1", json={"publie": True}, headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.publish(start=1, end=2)
        self.assertEqual(self.client.get("/api/admin/statistiques", headers=self.headers).json()["publiees"], 1)
        result = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c&modes=bus").json()["itinéraires"]
        self.assertTrue(result)
        self.assertTrue(any(s["niveau_publication"] == "verifie" for p in result for s in p["segments"]))
        response = self.client.patch("/api/admin/liaisons/1", json={"statut": "suspendu"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["publie"], 0)
        result = self.client.get("/api/itineraire?depart_id=a&arrivee_id=c").json()["itinéraires"]
        self.assertNotIn(1, {s["id"] for p in result for s in p["segments"]})

    def test_real_seed_multimodal_and_eastern_alerts(self):
        data_dir = Path(__file__).resolve().parents[1] / "seed"
        import_rows(from_directory(data_dir))
        for start, end in [("boma", "kikwit"), ("boma", "bunia"), ("mahagi", "kinshasa"), ("aru", "kinshasa"), ("isiro", "kinshasa")]:
            response = self.client.get("/api/itineraire", params={"depart_id": start, "arrivee_id": end})
            self.assertEqual(response.status_code, 200, response.text)
            routes = response.json()["itinéraires"]
            self.assertTrue(routes, (start, end))
            self.assertTrue(all(path["segments"][0]["depart_id"] == start and path["segments"][-1]["arrivee_id"] == end for path in routes))
        mahagi = self.client.get("/api/itineraire?depart_id=mahagi&arrivee_id=kinshasa").json()["itinéraires"]
        self.assertTrue(any(any(s["mode"] == "avion" for s in r["segments"]) for r in mahagi))
        self.assertTrue(any(any(s["niveau_publication"] in ("a_verifier", "hypothese_retour") for s in r["segments"]) for r in mahagi))

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
