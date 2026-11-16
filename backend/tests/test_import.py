import csv
import io
import unittest
import zipfile

from scripts.import_csv import FIELDS, from_archive, parse_csv, validate
from tests.test_api import fixture


class ImportTests(unittest.TestCase):
    def test_csv_header_validation(self):
        with self.assertRaises(ValueError):
            parse_csv("id,name\na,A\n", "lieux", ("id", "nom"))

    def test_missing_destination(self):
        data = fixture()
        data["liaisons"][0]["arrivee_id"] = "inconnue"
        with self.assertRaises(ValueError):
            validate(data)

    def test_negative_price(self):
        data = fixture()
        data["liaisons"][0]["prix_min_usd"] = "-1"
        with self.assertRaises(ValueError):
            validate(data)

    def test_real_archive_layout_can_be_read(self):
        rows = fixture()
        memory = io.BytesIO()
        with zipfile.ZipFile(memory, mode="w") as archive:
            for table, fields in FIELDS.items():
                content = io.StringIO()
                writer = csv.DictWriter(content, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows[table])
                archive.writestr(f"voyage-rdc/donnees/{table}.csv", content.getvalue())
        memory.seek(0)
        result = from_archive(memory)
        self.assertEqual(len(result["liaisons"]), 4)
        validate(result)


if __name__ == "__main__":
    unittest.main()
