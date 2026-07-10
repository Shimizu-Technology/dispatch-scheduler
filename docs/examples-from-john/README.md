# Local JMI Source Artifacts

Real customer workbooks, screenshots, and work-order PDFs must not be committed
to this public repository. Keep them in this ignored directory or another
private local directory and point the importer at that directory:

```bash
JOHN_ARTIFACT_DIR=/absolute/path/to/private-jmi-artifacts ./scripts/import_sample_data.py
```

The importer expects the primary schedule workbook and PM schedule workbook.
The exact files can be selected when a directory contains multiple candidates.
Use local filenames; do not add them to this README:

```bash
JOHN_MOBIL_SCHEDULE_FILE="primary-schedule.xlsx" \
JOHN_PM_SCHEDULE_FILE="monthly-pm-schedule.xlsx" \
JOHN_ARTIFACT_DIR=/absolute/path/to/private-jmi-artifacts \
JMI_IMPORT_CONFIG_FILE=/absolute/path/to/private-import-config.json \
./scripts/import_sample_data.py
```

The optional private config supplies customer-specific facts that must not live
in source control:

```json
{
  "driver_names": ["Technician name from the private roster"],
  "location_regions": {"PRIVATE SITE NAME": "North"}
}
```

Only `data/seeds/sample_data.json` is committed. The importer pseudonymizes
people, crews, sites, work-order identifiers, descriptions, notes, and source
references before writing that public demo file.
