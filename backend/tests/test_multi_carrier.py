"""Multiple transporters on one route retain distinct fares."""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.schema import init_schema
from scripts.import_csv import import_rows
from tests.test_api import fixture
from tests.admin_helper import admin_headers

class MultiCarrierTests(unittest.TestCase):
    def test_multiple_companies_and_prices(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ,{"DATABASE_URL":f"sqlite:///{folder}/test.db"}):
            init_schema()
            import_rows(fixture())
            with TestClient(app) as client:
                headers=admin_headers()
                places=client.get("/api/lieux").json()
                self.assertGreaterEqual(len(places),2)
                names=[r["nom"] for r in client.get("/api/operateurs").json()]
                self.assertGreaterEqual(len(names),2)
                body={"liaison":{"mode":"avion","depart_id":places[0]["id"],"arrivee_id":places[1]["id"],
                    "statut":"a_verifier","publie":False},"compagnies":[
                    {"operateur":names[0],"prix_min_usd":100,"prix_max_usd":180},
                    {"operateur":names[1],"prix_min_usd":200,"prix_max_usd":270}]}
                response=client.post("/api/admin/liaisons/multiples",json=body,headers=headers)
                self.assertEqual(response.status_code,201,response.text)
                self.assertEqual(response.json()["count"],2)
                records=response.json()["created"]
                self.assertEqual([r["prix_min_usd"] for r in records],[100,200])
                self.assertEqual([r["prix_max_usd"] for r in records],[180,270])
                self.assertEqual(records[0]["depart_id"],records[1]["depart_id"])
                self.assertEqual(records[0]["arrivee_id"],records[1]["arrivee_id"])
                body["compagnies"][1]["operateur"]=names[0]
                self.assertEqual(client.post("/api/admin/liaisons/multiples",json=body,headers=headers).status_code,422)
