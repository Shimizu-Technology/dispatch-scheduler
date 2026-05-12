import os
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

    def tearDown(self):
        importer.ARTIFACT_DIR = self.original_artifact_dir

    def test_find_required_file_rejects_ambiguous_matches(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            artifact_dir = Path(tmpdir)
            importer.ARTIFACT_DIR = artifact_dir
            (artifact_dir / "PM SCHEDULE-ARPIL2026.xlsx").touch()
            (artifact_dir / "PM SCHEDULE-MAY2026.xlsx").touch()

            with self.assertRaisesRegex(ValueError, "Multiple files match"):
                importer.find_required_file(["PM SCHEDULE-*2026.xlsx"], env_var="JOHN_PM_SCHEDULE_FILE")

    def test_find_required_file_honors_env_override(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            artifact_dir = Path(tmpdir)
            importer.ARTIFACT_DIR = artifact_dir
            selected = artifact_dir / "PM SCHEDULE-MAY2026.xlsx"
            selected.touch()
            os.environ["JOHN_PM_SCHEDULE_FILE"] = selected.name
            try:
                self.assertEqual(selected, importer.find_required_file(["PM SCHEDULE-*2026.xlsx"], env_var="JOHN_PM_SCHEDULE_FILE"))
            finally:
                os.environ.pop("JOHN_PM_SCHEDULE_FILE", None)

    def test_sheet_lookup_tolerates_trailing_spaces(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Typhoon "

        self.assertIs(ws, importer.optional_sheet(wb, "Typhoon"))

    def test_pm_schedule_requires_station_header_rows(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws.append(["only one row"])

        with self.assertRaisesRegex(ValueError, "expected station headers"):
            importer.parse_pm_schedule(wb, "bad-pm.xlsx")


if __name__ == "__main__":
    unittest.main()
