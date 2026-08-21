#!/usr/bin/env python3
"""Met à jour les dates/heures de schedule.json depuis le flux public ESPN Ligue 1.

Le script ne touche jamais aux pronostics. Il conserve les 34 journées et
l'ordre des affiches déjà présents dans schedule.json, puis complète uniquement
les métadonnées de coup d'envoi lorsqu'une rencontre correspondante est trouvée.

Source : flux public ESPN soccer, championnat fra.1, saison 2026/2027.
"""
from __future__ import annotations

import json
import time
import urllib.request
import unicodedata
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LEAGUE = "fra.1"
SEASON = 2026
ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "schedule.json"
PARIS = ZoneInfo("Europe/Paris")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FootixProno/1.0; +https://etezx.github.io/footixprono/)",
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
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
    raise RuntimeError(f"Impossible de récupérer {url}: {last}")


def norm(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return ALIASES.get(value, value)


def load_team_ids() -> list[str]:
    data = get_json(
        f"https://site.api.espn.com/apis/v2/sports/soccer/{LEAGUE}/standings?season={SEASON}"
    )
    ids: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            team = node.get("team")
            if isinstance(team, dict) and team.get("id"):
                ids.append(str(team["id"]))
            for value in node.values():
                if isinstance(value, (dict, list)):
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(data)
    return list(dict.fromkeys(ids))


def collect_events() -> dict[tuple[str, str], dict]:
    """Agrège le calendrier des 18 équipes et déduplique les rencontres."""
    events: dict[str, dict] = {}
    for team_id in load_team_ids():
        url = (
            f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}/teams/"
            f"{team_id}/schedule?season={SEASON}"
        )
        try:
            data = get_json(url, retries=2)
        except Exception as exc:  # noqa: BLE001
            print(f"Calendrier indisponible pour équipe {team_id}: {exc}")
            continue
        for event in data.get("events", []):
            eid = str(event.get("id") or "")
            if eid:
                events[eid] = event
        time.sleep(0.08)

    by_pair: dict[tuple[str, str], dict] = {}
    for event in events.values():
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competitors = competitions[0].get("competitors") or []
        if len(competitors) < 2:
            continue

        home = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
        away = next((c for c in competitors if c.get("homeAway") == "away"), competitors[1])

        home_name = (
            home.get("team", {}).get("displayName")
            or home.get("team", {}).get("shortDisplayName")
            or home.get("team", {}).get("name")
            or ""
        )
        away_name = (
            away.get("team", {}).get("displayName")
            or away.get("team", {}).get("shortDisplayName")
            or away.get("team", {}).get("name")
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
    except ValueError:
        return None
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def main() -> None:
    if not OUTPUT.exists():
        raise RuntimeError("schedule.json introuvable à la racine du dépôt")

    schedule = json.loads(OUTPUT.read_text(encoding="utf-8"))
    events = collect_events()
    if len(events) < 100:
        raise RuntimeError(
            f"Flux calendrier ESPN trop incomplet ({len(events)} rencontres), fichier non remplacé"
        )

    updated = 0
    matched = 0

    for day in schedule:
        for match in day.get("matches", []):
            if len(match) < 2:
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
            old = (fixture.get("date"), fixture.get("time"))

            fixture["date"] = date_value
            fixture["time"] = time_value
            # "official" signifie ici : horaire exact fourni par le flux de calendrier.
            fixture["official"] = True
            fixture["source"] = "ESPN public soccer feed"

            if len(match) > 2:
                match[2] = fixture
            else:
                match.append(fixture)

            if old != (date_value, time_value):
                updated += 1

    if matched < 100:
        raise RuntimeError(
            f"Trop peu de rencontres reconnues ({matched}), schedule.json conservé par sécurité"
        )

    OUTPUT.write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Calendrier vérifié: {matched} rencontres reconnues, {updated} horaires modifiés")


if __name__ == "__main__":
    main()
