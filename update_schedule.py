#!/usr/bin/env python3
"""Met à jour automatiquement les dates/heures de schedule.json.

Source principale : scoreboard public ESPN Ligue 1 (fra.1).
Le script interroge la saison mois par mois afin de récupérer les programmations
futures. Si la source externe ne renvoie rien, le fichier existant est conservé
et le workflow se termine proprement sans erreur.

Aucun pronostic, buteur ou analyse n'est modifié.
"""
from __future__ import annotations

import calendar
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LEAGUE = "fra.1"
ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "schedule.json"
PARIS = ZoneInfo("Europe/Paris")

# Saison Ligue 1 2026/27 : fenêtre large pour inclure toute la compétition.
START_YEAR, START_MONTH = 2026, 8
END_YEAR, END_MONTH = 2027, 5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FootixProno/1.1)",
    "Accept": "application/json,text/plain,*/*",
}

ALIASES = {
    "paris saint germain": "paris saint germain",
    "psg": "paris saint germain",
    "paris fc": "paris fc",
    "olympique de marseille": "olympique de marseille",
    "marseille": "olympique de marseille",
    "om": "olympique de marseille",
    "olympique lyonnais": "olympique lyonnais",
    "lyon": "olympique lyonnais",
    "as monaco": "as monaco",
    "monaco": "as monaco",
    "losc": "losc",
    "lille": "losc",
    "lille osc": "losc",
    "rc lens": "rc lens",
    "lens": "rc lens",
    "stade rennais fc": "stade rennais fc",
    "rennes": "stade rennais fc",
    "rc strasbourg alsace": "rc strasbourg alsace",
    "strasbourg": "rc strasbourg alsace",
    "toulouse fc": "toulouse fc",
    "toulouse": "toulouse fc",
    "ogc nice": "ogc nice",
    "nice": "ogc nice",
    "fc lorient": "fc lorient",
    "lorient": "fc lorient",
    "stade brestois 29": "stade brestois 29",
    "brest": "stade brestois 29",
    "le havre": "le havre",
    "le havre ac": "le havre",
    "angers sco": "angers sco",
    "angers": "angers sco",
    "aj auxerre": "aj auxerre",
    "auxerre": "aj auxerre",
    "estac troyes": "estac troyes",
    "troyes": "estac troyes",
    "le mans fc": "le mans fc",
    "le mans": "le mans fc",
}


def get_json(url: str, retries: int = 3) -> dict:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except Exception as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
    raise RuntimeError(f"Impossible de récupérer {url}: {last}")


def norm(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return ALIASES.get(value, value)


def month_ranges():
    year, month = START_YEAR, START_MONTH
    while (year, month) <= (END_YEAR, END_MONTH):
        last_day = calendar.monthrange(year, month)[1]
        yield f"{year:04d}{month:02d}01-{year:04d}{month:02d}{last_day:02d}"
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1


def collect_events() -> dict[tuple[str, str], dict]:
    """Récupère les rencontres Ligue 1 via scoreboard mois par mois."""
    events_by_id: dict[str, dict] = {}

    for dates in month_ranges():
        params = urllib.parse.urlencode({
            "dates": dates,
            "limit": 1000,
        })
        url = (
            f"https://site.api.espn.com/apis/site/v2/sports/soccer/"
            f"{LEAGUE}/scoreboard?{params}"
        )
        try:
            data = get_json(url, retries=2)
        except Exception as exc:
            print(f"[WARN] Scoreboard indisponible pour {dates}: {exc}")
            continue

        for event in data.get("events", []) or []:
            eid = str(event.get("id") or "")
            if eid:
                events_by_id[eid] = event

        print(f"{dates}: {len(data.get('events', []) or [])} rencontre(s)")
        time.sleep(0.10)

    by_pair: dict[tuple[str, str], dict] = {}

    for event in events_by_id.values():
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competitors = competitions[0].get("competitors") or []
        if len(competitors) < 2:
            continue

        home = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
        away = next((c for c in competitors if c.get("homeAway") == "away"), competitors[1])

        home_team = home.get("team") or {}
        away_team = away.get("team") or {}

        home_name = (
            home_team.get("displayName")
            or home_team.get("shortDisplayName")
            or home_team.get("name")
            or ""
        )
        away_name = (
            away_team.get("displayName")
            or away_team.get("shortDisplayName")
            or away_team.get("name")
            or ""
        )

        if home_name and away_name:
            by_pair[(norm(home_name), norm(away_name))] = event

    return by_pair


def kickoff(event: dict) -> tuple[str, str] | None:
    raw = event.get("date")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(PARIS)
    except Exception:
        return None
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def main() -> None:
    if not OUTPUT.exists():
        raise RuntimeError("schedule.json introuvable à la racine du dépôt")

    schedule = json.loads(OUTPUT.read_text(encoding="utf-8"))
    events = collect_events()

    # Important : une source externe vide ne doit pas casser ton site.
    if not events:
        print("[WARN] ESPN n'a fourni aucune rencontre pour le moment.")
        print("[OK] schedule.json existant conservé sans modification.")
        return

    matched = 0
    updated = 0

    for day in schedule:
        for match in day.get("matches", []):
            if not isinstance(match, list) or len(match) < 2:
                continue

            home, away = match[0], match[1]
            event = events.get((norm(home), norm(away)))
            if not event:
                continue

            matched += 1
            ko = kickoff(event)
            if not ko:
                continue

            date_value, time_value = ko
            fixture = match[2] if len(match) > 2 and isinstance(match[2], dict) else {}

            old_date = fixture.get("date")
            old_time = fixture.get("time")

            fixture["date"] = date_value
            fixture["time"] = time_value
            fixture["official"] = True
            fixture["source"] = "ESPN public scoreboard"

            if len(match) > 2:
                match[2] = fixture
            else:
                match.append(fixture)

            if (old_date, old_time) != (date_value, time_value):
                updated += 1

    print(f"{matched} rencontre(s) Footix reconnue(s), {updated} horaire(s) modifié(s).")

    # Si ESPN n'a qu'un morceau du calendrier, on met simplement à jour ce qu'il connaît.
    if updated == 0:
        print("[OK] Aucun nouvel horaire à enregistrer.")
        return

    OUTPUT.write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[OK] {OUTPUT.name} mis à jour.")


if __name__ == "__main__":
    main()
