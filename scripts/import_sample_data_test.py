import os
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_sample_data as importer  # noqa: E402


class ImportSampleDataTest(unittest.TestCase):
    def setUp(self):
        self.original_artifact_dir = importer.ARTIFACT_DIR
        self.original_import_config = importer.IMPORT_CONFIG

    def tearDown(self):
        importer.ARTIFACT_DIR = self.original_artifact_dir
        importer.IMPORT_CONFIG = self.original_import_config

    def test_find_required_file_rejects_ambiguous_matches(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            artifact_dir = Path(tmpdir)
            importer.ARTIFACT_DIR = artifact_dir
            (artifact_dir / "PM SCHEDULE-FIRST.xlsx").touch()
            (artifact_dir / "PM SCHEDULE-SECOND.xlsx").touch()

            with self.assertRaisesRegex(ValueError, "Multiple files match"):
                importer.find_required_file(["PM SCHEDULE-*.xlsx"], env_var="JOHN_PM_SCHEDULE_FILE")

    def test_find_required_file_honors_env_override(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            artifact_dir = Path(tmpdir)
            importer.ARTIFACT_DIR = artifact_dir
            selected = artifact_dir / "PM SCHEDULE-SELECTED.xlsx"
            selected.touch()
            os.environ["JOHN_PM_SCHEDULE_FILE"] = selected.name
            try:
                self.assertEqual(selected, importer.find_required_file(["PM SCHEDULE-*.xlsx"], env_var="JOHN_PM_SCHEDULE_FILE"))
            finally:
                os.environ.pop("JOHN_PM_SCHEDULE_FILE", None)

    def test_sheet_lookup_tolerates_trailing_spaces(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Typhoon "

        self.assertIs(ws, importer.optional_sheet(wb, "Typhoon"))

    def test_customer_specific_driver_and_region_data_comes_from_private_config(self):
        importer.IMPORT_CONFIG = {
            "driver_names": ["TECH ONE"],
            "location_regions": {"SITE ALPHA": "North"},
        }

        self.assertEqual("North", importer.region_for("Site Alpha"))
        self.assertEqual("Islandwide", importer.region_for("Unmapped Site"))

    def test_pm_schedule_requires_station_header_rows(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws.append(["only one row"])

        with self.assertRaisesRegex(ValueError, "expected station headers"):
            importer.parse_pm_schedule(wb, "bad-pm.xlsx")

    def test_public_safe_data_removes_people_sites_identifiers_and_descriptions(self):
        source = {
            "generated_at": "2026-01-01T00:00:00+00:00",
            "notes": "private",
            "source_files": ["customer-workbook.xlsx"],
            "technicians": [{"name": "REAL PERSON", "primary_trade": "Plumbing", "skills": ["Plumbing"], "is_driver": True, "active": True, "division": "Mobil"}],
            "teams": [{"name": "REAL PERSON / HELPER", "members": ["REAL PERSON"], "region_preference": None}],
            "work_orders": [{"client": "Mobil", "location": "REAL SITE", "region": "North", "external_id": "SECRET-123", "source": "test", "source_reference": "customer-workbook.xlsx", "title": "Real problem", "description": "Sensitive operational detail", "priority": "P2", "normalized_priority": "P2", "status": "approved", "original_status_text": "APPROVED", "trade_category": "Plumbing", "scheduled_date": "2026-01-02", "team_name": "REAL PERSON / HELPER", "notes": "private"}],
            "pm_tasks": [{"client": "Mobil", "location": "REAL SITE", "region": "North", "task_name": "Electrical Inspection", "trade_category": "Electrical", "frequency": "monthly", "scheduled_date": "2026-01-31", "source_file": "customer-workbook.xlsx"}],
            "typhoon_routes": [{"team": "REAL PERSON", "locations": ["REAL SITE"]}],
        }

        public = importer.public_safe_data(source)
        serialized = str(public)

        self.assertNotIn("REAL PERSON", serialized)
        self.assertNotIn("REAL SITE", serialized)
        self.assertNotIn("SECRET-123", serialized)
        self.assertNotIn("Sensitive operational detail", serialized)
        self.assertEqual([], public["source_files"])
        self.assertEqual(importer.PUBLIC_SANITIZATION_VERSION, public["sanitization_version"])
        self.assertEqual("P2", public["work_orders"][0]["priority"])
        self.assertEqual("Plumbing", public["work_orders"][0]["trade_category"])
        self.assertEqual("demo_import", public["work_orders"][0]["source"])
        self.assertEqual("Approved", public["work_orders"][0]["original_status_text"])
        self.assertEqual("Demo Electrical preventive maintenance", public["pm_tasks"][0]["task_name"])

    def test_committed_seed_is_public_safe(self):
        data = json.loads(importer.OUT.read_text())

        self.assertEqual(importer.PUBLIC_SANITIZATION_VERSION, data["sanitization_version"])
        self.assertEqual([], data["source_files"])
        self.assertTrue(all(re.fullmatch(r"Technician \d{2}", row["name"]) for row in data["technicians"]))
        self.assertTrue(all(re.fullmatch(r"Crew \d{2}", row["name"]) for row in data["teams"]))
        self.assertTrue(all(re.fullmatch(r"DEMO-WO-\d{4}", row["external_id"]) for row in data["work_orders"]))
        self.assertTrue(all("Demo Site" in row["location"] for row in data["work_orders"] + data["pm_tasks"]))
        self.assertTrue(all(row["source"] == "demo_import" for row in data["work_orders"]))
        self.assertTrue(all(row["task_name"].startswith("Demo ") for row in data["pm_tasks"]))

    def test_private_source_artifacts_are_not_tracked(self):
        tracked = subprocess.run(
            ["git", "ls-files", "docs/examples-from-john"],
            cwd=importer.ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()

        unexpected = [path for path in tracked if path != "docs/examples-from-john/README.md"]
        self.assertEqual([], unexpected)


if __name__ == "__main__":
    unittest.main()
