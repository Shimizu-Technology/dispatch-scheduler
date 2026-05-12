#!/usr/bin/env python3
"""Create sanitized seed data from John's workflow artifacts.

This script writes normalized demo data only. It does not copy external system
credentials or confidential account details into the seed output.
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT_DIR = ROOT / "docs" / "examples-from-john"
ARTIFACT_DIR = Path(os.environ.get("JOHN_ARTIFACT_DIR", DEFAULT_ARTIFACT_DIR))
OUT = ROOT / "data" / "seeds" / "sample_data.json"

NORTH = {"YIGO PA", "YIGO P.A.", "YIGO NORTH", "YSENGSONG", "YSS", "LIGUAN", "FATIMA", "DEDEDO"}
CENTRAL = {
    "AIRPORT",
    "TAMUNING",
    "UPPER TUMON",
    "EAST AGANA",
    "EAHO",
    "AGANA",
    "AGANA HEIGHTS ES",
    "MAITE",
    "BARRIGADA",
    "BARRIGADA HEIGHTS",
    "BARRIGADA HTS",
    "MANGILAO",
    "ADELUP",
    "ANIGUA",
    "SINAJANA",
}
SOUTH = {"AGAT", "APRA", "APRA HEIGHTS", "YONA", "IPAN", "INARAJAN", "UMATAC", "MERIZO"}
DRIVERS = {"REY", "EFREN", "ERWIN", "RONALD", "ARIEL", "NILO", "RENE", "BERNIE", "MANNY", "ROBERT", "NELSON V."}

APPROVED_WORK_ORDER_COLUMNS = {
    "client": 0,
    "location": 1,
    "wo_number": 2,
    "description": 3,
    "team_name": 4,
    "approval_status": 6,
    "dispatch_status": 7,
}

SKILL_ALIASES = {
    "HVAC": "HVAC",
    "ELECTRICAL": "Electrical",
    "PLUMBING": "Plumbing",
    "CARPENTRY": "Carpentry",
    "CARPENTER": "Carpentry",
    "MASON": "Masonry",
    "MASONRY": "Masonry",
    "LANDSCAPING": "Landscaping",
    "PAINTING": "Painting",
    "GENERAL": "General",
    "HELPER": "Helper",
}

STATUS_FIXES = {
    "APPRVOED": "APPROVED",
    "ASSESSMNET": "ASSESSMENT",
    "ASSESSMET": "ASSESSMENT",
    "ASSESMENT": "ASSESSMENT",
}


def clean(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text or None


def canonical(text: str | None) -> str:
    value = (text or "").upper().strip()
    for typo, fixed in STATUS_FIXES.items():
        value = value.replace(typo, fixed)
    return value


def find_required_file(patterns: list[str], env_var: str | None = None) -> Path:
    if env_var and os.environ.get(env_var):
        selected = Path(os.environ[env_var])
        return selected if selected.is_absolute() else ARTIFACT_DIR / selected

    matches = []
    for pattern in patterns:
        matches.extend(ARTIFACT_DIR.glob(pattern))
    matches = sorted(set(matches))
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = ", ".join(path.name for path in matches)
        hint = f" Set {env_var} to choose one." if env_var else ""
        raise FileExistsError(f"Multiple files match {', '.join(patterns)} in {ARTIFACT_DIR}: {names}.{hint}")

    expected = ", ".join(patterns)
    raise FileNotFoundError(f"Could not find {expected} in {ARTIFACT_DIR}")


def sheet_by_name(wb, name: str):
    expected = name.strip().lower()
    for sheet_name in wb.sheetnames:
        if sheet_name.strip().lower() == expected:
            return wb[sheet_name]
    return None


def required_sheet(wb, name: str):
    sheet = sheet_by_name(wb, name)
    if sheet is None:
        raise KeyError(f"Required sheet '{name}' not found. Available sheets: {', '.join(wb.sheetnames)}")
    return sheet


def optional_sheet(wb, name: str):
    return sheet_by_name(wb, name)


def value_at(values, index):
    return values[index] if index < len(values) else None


def mapped_value(values, columns, key):
    return value_at(values, columns[key])


def region_for(location: str | None) -> str:
    if not location:
        return "Unknown"
    loc = location.upper().strip()
    parts = [p.strip() for p in re.split(r"/|,|-", loc) if p.strip()]
    if any(p in SOUTH for p in parts) and not any(p in NORTH for p in parts):
        return "South"
    if any(p in NORTH for p in parts) and not any(p in SOUTH for p in parts):
        return "North"
    if any(p in CENTRAL for p in parts):
        return "Central"
    return "Islandwide"


def normalize_status(status: str | None, wo_number=None) -> str:
    if str(wo_number).strip().upper() == "PM":
        return "pm"
    s = canonical(status)
    if "WAITING" in s and "PART" in s:
        return "waiting_for_parts"
    if "SCHEDULE" in s:
        return "scheduled"
    if "APPROV" in s:
        return "approved"
    if "ASSESS" in s:
        return "needs_assessment"
    if s == "PM":
        return "pm"
    if s == "CM":
        return "approved"
    if "FABRICAT" in s:
        return "waiting_for_parts"
    return "new"


def priority_from_status(status: str | None) -> str:
    s = canonical(status)
    for priority in ("P1", "P2", "P3", "P4"):
        if priority in s:
            return priority
    if "LEVEL 1" in s:
        return "P1"
    return "P4"


def infer_trade(description: str | None) -> str:
    d = (description or "").lower()
    if any(w in d for w in ["faucet", "sink", "toilet", "drain", "p-trap", "water", "leak"]):
        return "Plumbing"
    if any(w in d for w in ["ac", "airconditioning", "freezer", "cooler", "refrigeration", "ice machine", "condense"]):
        return "HVAC"
    if any(w in d for w in ["electrical", "outlet", "wiring", "light", "generator", "smoke detector", "panel", "led"]):
        return "Electrical"
    if any(w in d for w in ["paint", "painting", "rust"]):
        return "Painting"
    if any(w in d for w in ["door", "cabinet", "counter", "tile", "fabricate", "plexiglass", "shutter", "wall"]):
        return "Carpentry"
    if "landscap" in d:
        return "Landscaping"
    if "pest" in d:
        return "General"
    return "General"


def title_from_description(description: str | None) -> str:
    if not description:
        return "Work order"
    return description[:72] + ("..." if len(description) > 72 else "")


def parse_technicians(wb):
    ws = required_sheet(wb, "Team")
    techs = []
    section = "Mobil"
    for row in ws.iter_rows(values_only=True):
        name = clean(row[0] if len(row) > 0 else None)
        trade = clean(row[1] if len(row) > 1 else None)
        if not name:
            continue
        upper = name.upper()
        if upper in {"TECHNICIAN", "MOBIL", "HOTEL/ KITCHEN / RESTAURANT (HKR)"}:
            if "HOTEL" in upper:
                section = "HKR"
            continue
        if not trade:
            continue
        skills = []
        for raw in re.split(r"/|,", trade.upper()):
            raw = raw.strip()
            if raw in SKILL_ALIASES:
                skills.append(SKILL_ALIASES[raw])
        if not skills:
            skills = [trade.title()]
        techs.append({
            "name": name,
            "primary_trade": skills[0],
            "skills": sorted(set(skills)),
            "is_driver": upper in DRIVERS,
            "active": True,
            "division": section,
        })
    return techs


def work_order_record(client, location, wo_number, description, status, source, source_reference, scheduled_date=None, team_name=None, notes=None):
    original_status = clean(status) or ""
    priority = priority_from_status(original_status)
    return {
        "client": client,
        "location": clean(location) or "Unknown",
        "region": region_for(location),
        "external_id": str(wo_number).strip() if wo_number else None,
        "source": source,
        "source_reference": source_reference,
        "title": title_from_description(clean(description)),
        "description": clean(description),
        "priority": priority,
        "normalized_priority": priority,
        "status": normalize_status(original_status, wo_number),
        "original_status_text": original_status,
        "trade_category": infer_trade(description),
        "scheduled_date": scheduled_date,
        "team_name": clean(team_name),
        "notes": notes,
    }


def parse_mobil_schedule(wb):
    ws = required_sheet(wb, "May2026")
    work_orders = []
    current_date = None
    headers = None
    for row in ws.iter_rows(values_only=True):
        values = [clean(v) for v in row]
        if isinstance(row[0], datetime):
            current_date = row[0].date().isoformat()
        if values[0] == "PROJECT":
            headers = values
            continue
        if not headers or not values[0] or not values[0].upper().startswith("MOBIL"):
            continue
        rec = {h: values[i] if i < len(values) else None for i, h in enumerate(headers) if h}
        description = rec.get("DESCRIPTION")
        if not description or str(rec.get("WO#") or "").strip().upper() == "PM":
            continue
        work_orders.append(work_order_record(
            client="Mobil",
            location=rec.get("LOCATION"),
            wo_number=rec.get("WO#"),
            description=description,
            status=rec.get("STATUS"),
            source="mobil_schedule_import",
            source_reference="MOBIL SCHEDULE - MAY2026.xlsx / May2026",
            scheduled_date=current_date,
            team_name=rec.get("TECH ASSIGNED"),
            notes="Sanitized from John's sample Mobil schedule workbook.",
        ))
    return work_orders


def parse_approved_work_orders(wb):
    ws = optional_sheet(wb, "Approved Work Orders")
    if ws is None:
        return []

    work_orders = []
    for row in ws.iter_rows(values_only=True):
        values = [clean(v) for v in row]
        client = mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "client")
        if not client or not client.upper().startswith("MOBIL"):
            continue
        description = mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "description")
        if not description:
            continue
        status = (
            mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "dispatch_status")
            or mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "approval_status")
            or "APPROVED"
        )
        work_orders.append(work_order_record(
            client=client.title(),
            location=mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "location"),
            wo_number=mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "wo_number"),
            description=description,
            status=status,
            source="approved_work_orders_import",
            source_reference="MOBIL SCHEDULE - MAY2026.xlsx / Approved Work Orders",
            team_name=mapped_value(values, APPROVED_WORK_ORDER_COLUMNS, "team_name"),
            notes="Approved/material-prep sample from John's workbook.",
        ))
    return work_orders


def parse_pm_schedule(wb, source_file):
    ws = required_sheet(wb, "Sheet1")
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 6:
        raise ValueError(f"Sheet1 in {source_file} has only {len(rows)} row(s); expected station headers at row 4 and PM data from row 6.")
    location_row = [clean(v) for v in rows[3]]
    if len(location_row) < 3 or not any(location_row[2:]):
        raise ValueError(f"Sheet1 in {source_file} is missing station headers on row 4.")
    tasks = []
    for row in rows[5:]:
        item = clean(row[0])
        task = clean(row[1])
        if not item or not task:
            continue
        for idx, cell in enumerate(row[2:], start=2):
            if isinstance(cell, datetime) and idx < len(location_row):
                location = location_row[idx]
                if not location:
                    continue
                tasks.append({
                    "client": "Mobil",
                    "location": location,
                    "region": region_for(location),
                    "task_name": task,
                    "trade_category": infer_trade(task),
                    "frequency": "monthly",
                    "scheduled_date": cell.date().isoformat(),
                    "source_file": source_file,
                })
    return tasks


def parse_mobil_embedded_pms(wb):
    ws = optional_sheet(wb, "May2026")
    if ws is None:
        return []

    pms = []
    current_date = None
    headers = None
    for row in ws.iter_rows(values_only=True):
        values = [clean(v) for v in row]
        if isinstance(row[0], datetime):
            current_date = row[0].date().isoformat()
        if values[0] == "PROJECT":
            headers = values
            continue
        if not headers or not values[0] or not values[0].upper().startswith("MOBIL"):
            continue
        rec = {h: values[i] if i < len(values) else None for i, h in enumerate(headers) if h}
        if str(rec.get("WO#") or "").strip().upper() != "PM":
            continue
        pms.append({
            "client": "Mobil",
            "location": rec.get("LOCATION") or "Unknown",
            "region": region_for(rec.get("LOCATION")),
            "task_name": rec.get("DESCRIPTION") or "Preventive maintenance",
            "trade_category": infer_trade(rec.get("DESCRIPTION")),
            "frequency": "monthly",
            "scheduled_date": current_date,
            "source_file": "MOBIL SCHEDULE - MAY2026.xlsx / May2026",
        })
    return pms


def parse_typhoon_routes(wb):
    ws = optional_sheet(wb, "Typhoon")
    if ws is None:
        return []
    routes = []
    for col in range(2, ws.max_column + 1, 2):
        team = clean(ws.cell(row=2, column=col).value)
        if not team:
            continue
        locations = []
        for row in range(3, ws.max_row + 1):
            location = clean(ws.cell(row=row, column=col).value)
            if location:
                locations.append(location)
        if locations:
            routes.append({"team": team, "locations": locations})
    return routes


def add_known_samples(work_orders):
    work_orders.append({
        "client": "Sodexo / Schools",
        "location": "Agana Heights ES",
        "region": "Central",
        "external_id": "SODEXO-SAMPLE-001",
        "source": "whatsapp_sample",
        "source_reference": "Sodexo-sample.png",
        "title": "Staff restroom faucet will not turn off",
        "description": "Level 1 - Faucet in staff restroom does not want to turn off. Please send a team to Agana Heights ES.",
        "priority": "Level 1",
        "normalized_priority": "P1",
        "status": "new",
        "original_status_text": "Level 1 WhatsApp request",
        "trade_category": "Plumbing",
        "scheduled_date": None,
        "team_name": None,
        "notes": "Sanitized from sample WhatsApp/Sodexo request.",
    })
    work_orders.append({
        "client": "Mobil",
        "location": "Yigo McDonalds Mobil Service Station",
        "region": "North",
        "external_id": "40787",
        "source": "cbre_pdf_sample",
        "source_reference": "WORK ORDER 40787.pdf",
        "title": "External walls request for painting",
        "description": "To paint over former location of Subway sign (CH). Service type: external walls request for painting.",
        "priority": "P4",
        "normalized_priority": "P4",
        "status": "approved",
        "original_status_text": "Approved",
        "trade_category": "Painting",
        "scheduled_date": "2026-05-12",
        "team_name": None,
        "notes": "CBRE sample: target start 2026-05-12 16:04, target finish 2026-05-19 16:04, asset EXR_GU31777 - WALL.",
    })


def team_names_from_orders(orders):
    counts = Counter(o.get("team_name") for o in orders if o.get("team_name"))
    teams = []
    for name, _count in counts.most_common(16):
        members = [m.strip() for m in re.split(r"/", name) if m.strip()]
        teams.append({"name": name, "members": members, "region_preference": None})
    return teams


def main():
    mobil_path = find_required_file(["MOBIL SCHEDULE - MAY2026.xlsx"], env_var="JOHN_MOBIL_SCHEDULE_FILE")
    pm_path = find_required_file(["PM SCHEDULE-*2026.xlsx", "PM SCHEDULE-*.xlsx"], env_var="JOHN_PM_SCHEDULE_FILE")
    mobil_wb = load_workbook(mobil_path, data_only=True)
    pm_wb = load_workbook(pm_path, data_only=True)

    technicians = parse_technicians(mobil_wb)
    work_orders = parse_mobil_schedule(mobil_wb) + parse_approved_work_orders(mobil_wb)
    pm_tasks = parse_pm_schedule(pm_wb, pm_path.name) + parse_mobil_embedded_pms(mobil_wb)
    add_known_samples(work_orders)
    teams = team_names_from_orders(work_orders)

    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "notes": "Sanitized demo data generated from John's sample workflow artifacts in docs/examples-from-john.",
        "source_files": sorted(p.name for p in ARTIFACT_DIR.iterdir() if p.is_file()),
        "typhoon_routes": parse_typhoon_routes(pm_wb),
        "technicians": technicians,
        "teams": teams,
        "work_orders": work_orders,
        "pm_tasks": pm_tasks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2))
    print(f"Wrote {OUT}")
    print(f"technicians={len(technicians)} teams={len(teams)} work_orders={len(work_orders)} pm_tasks={len(pm_tasks)}")


if __name__ == "__main__":
    main()
