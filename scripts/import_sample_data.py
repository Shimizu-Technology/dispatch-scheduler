#!/usr/bin/env python3
"""Create sanitized seed data from John's workflow artifacts.

This script intentionally writes normalized demo data only. It does not copy raw files,
credentials, or confidential account details into the repo.
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.environ.get("JOHN_ARTIFACT_DIR", "/Users/jerry/.openclaw/workspaces/prime/john-ilao-artifacts"))
OUT = ROOT / "data" / "seeds" / "sample_data.json"

NORTH = {"YIGO PA", "YIGO NORTH", "YSENGSONG", "LIGUAN", "FATIMA", "DEDEDO"}
CENTRAL = {"AIRPORT", "TAMUNING", "UPPER TUMON", "EAST AGANA", "AGANA", "AGANA HEIGHTS ES", "MAITE", "BARRIGADA", "BARRIGADA HEIGHTS", "MANGILAO", "ADELUP", "ANIGUA", "SINAJANA"}
SOUTH = {"AGAT", "APRA", "APRA HEIGHTS", "YONA", "IPAN", "INARAJAN", "UMATAC", "MERIZO"}
DRIVERS = {"REY", "EFREN", "ERWIN", "RONALD", "ARIEL", "NILO", "RENE", "BERNIE", "MANNY", "ROBERT", "NELSON V."}

SKILL_ALIASES = {
    "HVAC": "HVAC",
    "ELECTRICAL": "Electrical",
    "PLUMBING": "Plumbing",
    "CARPENTRY": "Carpentry",
    "CARPENTER": "Carpentry",
    "MASON": "Masonry",
    "LANDSCAPING": "Landscaping",
    "PAINTING": "Painting",
    "GENERAL": "General",
    "HELPER": "Helper",
}


def clean(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text or None


def region_for(location: str | None) -> str:
    if not location:
        return "Unknown"
    loc = location.upper().strip()
    # Multi-location rows use slash-separated routes; pick broad region if all known area leans one way.
    parts = [p.strip() for p in re.split(r"/|,", loc) if p.strip()]
    if any(p in SOUTH for p in parts) and not any(p in NORTH for p in parts):
        return "South"
    if any(p in NORTH for p in parts) and not any(p in SOUTH for p in parts):
        return "North"
    if any(p in CENTRAL for p in parts):
        return "Central"
    return "Islandwide"


def normalize_status(status: str | None, wo_number=None) -> str:
    if wo_number == "PM":
        return "pm"
    s = (status or "").upper()
    if "WAITING" in s and "PART" in s:
        return "waiting_for_parts"
    if "SCHEDULE" in s:
        return "scheduled"
    if "APPROV" in s:
        return "approved"
    if "ASSESS" in s:
        return "needs_assessment"
    if s.strip() == "PM":
        return "pm"
    if s.strip() == "CM":
        return "approved"
    return "new"


def priority_from_status(status: str | None) -> str:
    s = (status or "").upper()
    for p in ("P1", "P2", "P3", "P4"):
        if p in s:
            return p
    return "P4"


def infer_trade(description: str | None) -> str:
    d = (description or "").lower()
    if any(w in d for w in ["faucet", "sink", "toilet", "drain", "p-trap", "water"]):
        return "Plumbing"
    if any(w in d for w in ["ac", "airconditioning", "freezer", "cooler", "refrigeration", "ice machine"]):
        return "HVAC"
    if any(w in d for w in ["electrical", "outlet", "wiring", "light", "generator", "smoke detector", "panel"]):
        return "Electrical"
    if any(w in d for w in ["paint", "rust"]):
        return "Painting"
    if any(w in d for w in ["door", "cabinet", "counter", "tile", "fabricate", "plexiglass", "shutter"]):
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
    ws = wb["Team"]
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


def parse_mobil_schedule(wb):
    ws = wb["May2026"]
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
        location = rec.get("LOCATION") or "Unknown"
        wo_number = rec.get("WO#")
        description = rec.get("DESCRIPTION")
        status = rec.get("STATUS")
        team = rec.get("TECH ASSIGNED")
        if not description:
            continue
        work_orders.append({
            "client": "Mobil",
            "location": location,
            "region": region_for(location),
            "external_id": str(wo_number) if wo_number else None,
            "source": "mobil_schedule_import",
            "source_reference": "MOBIL SCHEDULE - MAY2026.xlsx / May2026",
            "title": title_from_description(description),
            "description": description,
            "priority": priority_from_status(status),
            "normalized_priority": priority_from_status(status),
            "status": normalize_status(status, wo_number),
            "original_status_text": status,
            "trade_category": infer_trade(description),
            "scheduled_date": current_date,
            "team_name": team,
            "notes": "Sanitized from John's sample Mobil schedule workbook.",
        })
    # Keep a useful slice: enough to demo, not a giant data dump.
    return work_orders[:70]


def parse_pm_schedule(wb):
    ws = wb["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    location_row = [clean(v) for v in rows[2]]
    tasks = []
    for row in rows[4:13]:
        task = clean(row[1])
        if not task:
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
                    "source_file": "PM SCHEDULE-APRIL2026.xlsx",
                })
    return tasks[:80]


def team_names_from_orders(orders):
    counts = Counter(o.get("team_name") for o in orders if o.get("team_name"))
    teams = []
    for name, _count in counts.most_common(12):
        members = [m.strip() for m in re.split(r"/", name) if m.strip()]
        teams.append({"name": name, "members": members, "region_preference": None})
    return teams


def main():
    mobil_path = ARTIFACT_DIR / "MOBIL SCHEDULE - MAY2026.xlsx"
    pm_path = ARTIFACT_DIR / "PM SCHEDULE-APRIL2026.xlsx"
    mobil_wb = load_workbook(mobil_path, data_only=True)
    pm_wb = load_workbook(pm_path, data_only=True)

    technicians = parse_technicians(mobil_wb)
    work_orders = parse_mobil_schedule(mobil_wb)
    pm_tasks = parse_pm_schedule(pm_wb)
    teams = team_names_from_orders(work_orders)

    # Add Sodexo sample from the WhatsApp image OCR.
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

    data = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "notes": "Sanitized demo data generated from John's sample workflow artifacts. Raw files and credentials are intentionally excluded.",
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
