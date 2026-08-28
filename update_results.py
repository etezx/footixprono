#!/usr/bin/env python3
"""Met à jour rapidement les résultats Ligue 1 dans schedule.json.

Pensé pour tourner fréquemment pendant la saison : il ne parcourt pas toute la
saison et interroge seulement une petite fenêtre autour d'aujourd'hui.
Source : scoreboard public ESPN Ligue 1 (fra.1).
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

LEAGUE = "fra.1"
ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "schedule.json"
PARIS = ZoneInfo("Europe/Paris")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FootixProno/1.2-results)",
    "Accept": "application/json,text/plain,*/*",
}

ALIASES = {
    "paris saint germain":"paris saint germain","psg":"paris saint germain",
    "paris fc":"paris fc","olympique de marseille":"olympique de marseille",
    "marseille":"olympique de marseille","om":"olympique de marseille",
    "olympique lyonnais":"olympique lyonnais","lyon":"olympique lyonnais",
    "as monaco":"as monaco","monaco":"as monaco","losc":"losc","lille":"losc",
    "lille osc":"losc","rc lens":"rc lens","lens":"rc lens",
    "stade rennais fc":"stade rennais fc","rennes":"stade rennais fc",
    "rc strasbourg alsace":"rc strasbourg alsace","strasbourg":"rc strasbourg alsace",
    "toulouse fc":"toulouse fc","toulouse":"toulouse fc","ogc nice":"ogc nice",
    "nice":"ogc nice","fc lorient":"fc lorient","lorient":"fc lorient",
    "stade brestois 29":"stade brestois 29","brest":"stade brestois 29",
    "le havre":"le havre","le havre ac":"le havre","angers sco":"angers sco",
    "angers":"angers sco","aj auxerre":"aj auxerre","auxerre":"aj auxerre",
    "estac troyes":"estac troyes","troyes":"estac troyes",
    "le mans fc":"le mans fc","le mans":"le mans fc",
}

def norm(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return ALIASES.get(value, value)

def get_json(url: str, retries: int = 3) -> dict:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as response:
                return json.load(response)
        except Exception as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(2)
    raise RuntimeError(f"Impossible de récupérer ESPN: {last}")

def collect_events() -> dict[tuple[str,str], dict]:
    now = datetime.now(PARIS)
    start = (now - timedelta(days=2)).strftime("%Y%m%d")
    end = (now + timedelta(days=2)).strftime("%Y%m%d")
    params = urllib.parse.urlencode({"dates": f"{start}-{end}", "limit": 100})
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}/scoreboard?{params}"
    data = get_json(url)
    out = {}
    for event in data.get("events", []) or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        competitors = comps[0].get("competitors") or []
        if len(competitors) < 2:
            continue
        home = next((c for c in competitors if c.get("homeAway")=="home"), competitors[0])
        away = next((c for c in competitors if c.get("homeAway")=="away"), competitors[1])
        hn = (home.get("team") or {}).get("displayName") or ""
        an = (away.get("team") or {}).get("displayName") or ""
        if hn and an:
            out[(norm(hn), norm(an))] = event
    return out

def extract_name(obj):
    if not isinstance(obj, dict):
        return None
    athlete = obj.get("athlete")
    if isinstance(athlete, dict):
        return athlete.get("displayName") or athlete.get("fullName")
    return obj.get("displayName") if ("athlete" in str(obj.get("uid","")).lower()) else None

def extract_scorers(summary: dict) -> list[str]:
    """Best-effort extraction of goal scorers from ESPN summary JSON."""
    found = []
    seen = set()

    def add(name):
        if not name: return
        name = str(name).strip()
        key = norm(name)
        if key and key not in seen:
            seen.add(key); found.append(name)

    def walk(node, scoring_context=False):
        if isinstance(node, list):
            for item in node: walk(item, scoring_context)
            return
        if not isinstance(node, dict):
            return

        text = " ".join(str(node.get(k,"")) for k in ("text","type","description","shortText","headline"))
        is_goal = scoring_context or bool(node.get("scoringPlay")) or ("goal" in text.lower() and "goal kick" not in text.lower())

        if is_goal:
            for key in ("athletes","participants"):
                vals=node.get(key)
                if isinstance(vals,list):
                    for item in vals:
                        if isinstance(item,dict):
                            ath=item.get("athlete") if isinstance(item.get("athlete"),dict) else item
                            add(ath.get("displayName") or ath.get("fullName") or ath.get("name"))
            athlete=node.get("athlete")
            if isinstance(athlete,dict):
                add(athlete.get("displayName") or athlete.get("fullName") or athlete.get("name"))

        for key,val in node.items():
            if key in {"athletes","participants","athlete"} and is_goal:
                continue
            if isinstance(val,(dict,list)):
                walk(val, is_goal and key in {"details","plays","keyEvents","events"})

    # Prefer event-like sections to avoid picking season goal leaders.
    for key in ("details","plays","keyEvents","events","commentary"):
        if key in summary:
            walk(summary[key], False)
    return found

def get_actual_scorers(event_id: str) -> list[str]:
    if not event_id:
        return []
    url=f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}/summary?event={event_id}"
    try:
        return extract_scorers(get_json(url))
    except Exception as exc:
        print(f"[WARN] Buteurs ESPN {event_id}: {exc}")
        return []

def result_info(event: dict) -> dict:
    comps = event.get("competitions") or []
    if not comps:
        return {}
    competitors = comps[0].get("competitors") or []
    if len(competitors) < 2:
        return {}
    home = next((c for c in competitors if c.get("homeAway")=="home"), competitors[0])
    away = next((c for c in competitors if c.get("homeAway")=="away"), competitors[1])
    status = (event.get("status") or {}).get("type") or {}
    completed = bool(status.get("completed"))
    result = {"completed": completed, "eventId": str(event.get("id") or "")}
    if completed:
        try:
            result["homeScore"] = int(float(home.get("score")))
            result["awayScore"] = int(float(away.get("score")))
        except (TypeError, ValueError):
            pass
        result["actualScorers"] = get_actual_scorers(result["eventId"])
    return result

def main():
    if not OUTPUT.exists():
        raise RuntimeError("schedule.json introuvable")
    schedule = json.loads(OUTPUT.read_text(encoding="utf-8"))
    events = collect_events()
    if not events:
        print("[OK] Aucun match Ligue 1 dans la fenêtre actuelle.")
        return

    changes = 0
    for day in schedule:
        for match in day.get("matches", []):
            if not isinstance(match, list) or len(match) < 2:
                continue
            event = events.get((norm(match[0]), norm(match[1])))
            if not event:
                continue
            fixture = match[2] if len(match)>2 and isinstance(match[2], dict) else {}
            before = (fixture.get("completed"), fixture.get("homeScore"), fixture.get("awayScore"), tuple(fixture.get("actualScorers") or []))
            info = result_info(event)
            fixture["completed"] = bool(info.get("completed"))
            if info.get("eventId"):
                fixture["eventId"] = info["eventId"]
            if fixture["completed"] and "homeScore" in info and "awayScore" in info:
                fixture["homeScore"] = info["homeScore"]
                fixture["awayScore"] = info["awayScore"]
                fixture["actualScorers"] = info.get("actualScorers") or fixture.get("actualScorers") or []
            after = (fixture.get("completed"), fixture.get("homeScore"), fixture.get("awayScore"), tuple(fixture.get("actualScorers") or []))
            if len(match)>2:
                match[2] = fixture
            else:
                match.append(fixture)
            if before != after:
                changes += 1
                print(f"[UPDATE] {match[0]} - {match[1]}: {after}")

    if not changes:
        print("[OK] Aucun nouveau résultat.")
        return

    OUTPUT.write_text(json.dumps(schedule, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] {changes} résultat(s) mis à jour.")

if __name__ == "__main__":
    main()
