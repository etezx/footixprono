#!/usr/bin/env python3
"""Footix Prono — résultats LIVE via BSD (Bzzoiro Sports Data).

- Ligue 1 (BSD league_id=6)
- UEFA Champions League (BSD league_id=7)
- score live + minute + résultat final
- buteurs depuis l'endpoint /incidents/ uniquement (pas de déduction heuristique)
- classement officiel BSD mis en cache dans bsd-standings.json
- protection anti-régression : une donnée finale existante n'est jamais effacée

Le secret BSD_API_KEY doit être fourni par GitHub Actions.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SCHEDULE = ROOT / "schedule.json"
LIVE_OUTPUT = ROOT / "live-results.json"
STANDINGS_OUTPUT = ROOT / "bsd-standings.json"
BASE = "https://sports.bzzoiro.com/api/v2"

LEAGUES = {
    6: "Ligue 1",
    7: "Champions League",
}

ALIASES = {
    "paris saint germain": "paris saint germain", "psg": "paris saint germain",
    "paris fc": "paris fc", "olympique de marseille": "olympique de marseille",
    "marseille": "olympique de marseille", "om": "olympique de marseille",
    "olympique lyonnais": "olympique lyonnais", "lyon": "olympique lyonnais",
    "as monaco": "as monaco", "monaco": "as monaco", "losc": "losc",
    "lille": "losc", "lille osc": "losc", "rc lens": "rc lens", "lens": "rc lens",
    "stade rennais fc": "stade rennais fc", "rennes": "stade rennais fc",
    "rc strasbourg alsace": "rc strasbourg alsace", "strasbourg": "rc strasbourg alsace",
    "toulouse fc": "toulouse fc", "toulouse": "toulouse fc", "ogc nice": "ogc nice",
    "nice": "ogc nice", "fc lorient": "fc lorient", "lorient": "fc lorient",
    "stade brestois 29": "stade brestois 29", "brest": "stade brestois 29",
    "le havre": "le havre", "le havre ac": "le havre", "angers sco": "angers sco",
    "angers": "angers sco", "aj auxerre": "aj auxerre", "auxerre": "aj auxerre",
    "estac troyes": "estac troyes", "troyes": "estac troyes",
    "le mans fc": "le mans fc", "le mans": "le mans fc",
}


def norm(value: Any) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return ALIASES.get(value, value)


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


class BSDClient:
    def __init__(self, token: str):
        self.token = token
        self.calls = 0

    def get(self, path: str, params: dict[str, Any] | None = None, retries: int = 3) -> Any:
        url = BASE + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            url += "?" + urllib.parse.urlencode(clean)
        last: Exception | None = None
        for attempt in range(retries):
            req = urllib.request.Request(url, headers={
                "Authorization": f"Token {self.token}",
                "Accept": "application/json",
                "User-Agent": "FootixProno/8.6-live",
            })
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    self.calls += 1
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                self.calls += 1
                body = exc.read().decode("utf-8", "replace")[:700]
                last = RuntimeError(f"BSD HTTP {exc.code}: {body}")
                if exc.code in (401, 403, 404):
                    break
            except Exception as exc:  # réseau / timeout
                last = exc
            if attempt + 1 < retries:
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"Impossible de récupérer {url}: {last}")


def list_items(payload: Any, keys=("results", "events", "incidents")) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


def nested_name(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("name") or value.get("team_name") or value.get("display_name") or "").strip()
    return ""


def event_team(event: dict[str, Any], side: str) -> str:
    for key in (f"{side}_team", f"{side}_team_name", side):
        name = nested_name(event.get(key))
        if name:
            return name
    teams = event.get("teams")
    if isinstance(teams, dict):
        name = nested_name(teams.get(side))
        if name:
            return name
    return ""


def int_or_none(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def pair_score(value: Any) -> tuple[int, int] | None:
    if isinstance(value, dict):
        h = int_or_none(value.get("home") if "home" in value else value.get("home_score"))
        a = int_or_none(value.get("away") if "away" in value else value.get("away_score"))
        if h is not None and a is not None:
            return h, a
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        h, a = int_or_none(value[0]), int_or_none(value[1])
        if h is not None and a is not None:
            return h, a
    return None


def event_score(event: dict[str, Any]) -> tuple[int | None, int | None]:
    home = int_or_none(event.get("home_score"))
    away = int_or_none(event.get("away_score"))
    if home is None or away is None:
        score = event.get("score")
        if isinstance(score, dict):
            home = int_or_none(score.get("home"))
            away = int_or_none(score.get("away"))

    # BSD documente home_score/away_score comme score du temps réglementaire ;
    # en prolongation, extra_time_score contient les buts supplémentaires.
    et = pair_score(event.get("extra_time_score"))
    if et and home is not None and away is not None:
        home += et[0]
        away += et[1]
    return home, away


def event_status(event: dict[str, Any]) -> str:
    raw = event.get("status")
    if isinstance(raw, dict):
        raw = raw.get("code") or raw.get("name") or raw.get("status")
    status = str(raw or "").strip().lower().replace(" ", "_")
    aliases = {
        "inprogress": "live", "in_progress": "live", "playing": "live",
        "finished": "finished", "ft": "finished", "full_time": "finished",
        "scheduled": "upcoming", "not_started": "upcoming",
    }
    return aliases.get(status, status or "unresolved")


def event_league_id(event: dict[str, Any], fallback: int | None = None) -> int | None:
    value = event.get("league_id")
    if value is None and isinstance(event.get("league"), dict):
        value = event["league"].get("id")
    return int_or_none(value) or fallback


def event_datetime(event: dict[str, Any]) -> str:
    for key in ("event_date", "kickoff", "date", "start_time", "start_at"):
        value = event.get(key)
        if value:
            return str(value)
    return ""


def season_for(client: BSDClient, league_id: int) -> dict[str, Any]:
    payload = client.get(f"/leagues/{league_id}/season/")
    if isinstance(payload, dict) and isinstance(payload.get("season"), dict):
        return payload["season"]
    if isinstance(payload, dict):
        return payload
    return {}


def player_name_from_incident(inc: dict[str, Any]) -> str:
    # Intentionnellement strict : uniquement le joueur/scorer explicitement nommé.
    for key in ("player", "scorer", "athlete"):
        name = nested_name(inc.get(key))
        if name:
            return name
    for key in ("player_name", "scorer_name", "athlete_name"):
        value = inc.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def incident_kind(inc: dict[str, Any]) -> str:
    for key in ("incident_type", "type", "event_type", "incident_class", "kind"):
        value = inc.get(key)
        if isinstance(value, dict):
            value = value.get("name") or value.get("type") or value.get("code")
        if value:
            return re.sub(r"[^a-z0-9]+", "_", norm(value)).strip("_")
    return ""


def is_goal_incident(inc: dict[str, Any]) -> bool:
    kind = incident_kind(inc)
    if not kind:
        return False
    if "shootout" in kind or "penalty_shootout" in kind:
        return False
    # Accepte les variantes documentaires usuelles, mais jamais un simple texte/commentaire.
    return kind == "goal" or kind.endswith("_goal") or kind in {
        "penalty", "penalty_goal", "own_goal"
    }


def is_own_goal(inc: dict[str, Any]) -> bool:
    kind = incident_kind(inc)
    return bool(inc.get("own_goal") or inc.get("is_own_goal") or "own_goal" in kind)


def fetch_scorers(client: BSDClient, event_id: int, expected_goals: int | None) -> tuple[list[str], bool, int]:
    payload = client.get(f"/events/{event_id}/incidents/")
    incidents = list_items(payload, ("incidents", "results", "events"))
    goal_incidents = [x for x in incidents if is_goal_incident(x)]

    names: list[str] = []
    seen: set[str] = set()
    for inc in goal_incidents:
        if is_own_goal(inc):
            continue  # un CSC ne crédite pas le joueur comme buteur Footix
        name = player_name_from_incident(inc)
        key = norm(name)
        if name and key and key not in seen:
            seen.add(key)
            names.append(name)

    # On ne transforme jamais une absence de données en "n'a pas marqué".
    # Vérifié seulement si la timeline couvre au moins le nombre de buts du score.
    verified = expected_goals == 0 or (
        expected_goals is not None and len(goal_incidents) >= expected_goals
    )
    return names, verified, len(goal_incidents)


def normalize_event(event: dict[str, Any], league_id: int) -> dict[str, Any] | None:
    event_id = int_or_none(event.get("id") or event.get("event_id"))
    home, away = event_team(event, "home"), event_team(event, "away")
    if not event_id or not home or not away:
        return None
    hs, aas = event_score(event)
    status = event_status(event)
    minute = int_or_none(event.get("current_minute") or event.get("minute") or event.get("elapsed"))
    period = event.get("period")
    if isinstance(period, dict):
        period = period.get("name") or period.get("code")
    out = {
        "eventId": event_id,
        "leagueId": event_league_id(event, league_id) or league_id,
        "home": home,
        "away": away,
        "kickoff": event_datetime(event),
        "status": status,
        "live": status == "live",
        "completed": status == "finished",
        "minute": minute,
        "period": period or "",
        "homeScore": hs,
        "awayScore": aas,
    }
    return out


def match_key(home: str, away: str) -> tuple[str, str]:
    return norm(home), norm(away)


def merge_event(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    old = dict(old or {})
    # Si un ancien enregistrement était final, ne jamais le faire régresser vers live/upcoming.
    if old.get("completed") and not new.get("completed"):
        keep = dict(old)
        # Conserve seulement les métadonnées non dangereuses éventuellement plus récentes.
        if new.get("kickoff") and not keep.get("kickoff"):
            keep["kickoff"] = new["kickoff"]
        return keep
    merged = {**old, **{k: v for k, v in new.items() if v is not None}}
    if new.get("completed"):
        merged["live"] = False
        merged["minute"] = None
    return merged


def row_value(row: dict[str, Any], *keys: str, default=0):
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default


def standings_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    rows = payload.get("standings")
    if isinstance(rows, list):
        return [x for x in rows if isinstance(x, dict)]
    groups = payload.get("groups")
    out: list[dict[str, Any]] = []
    if isinstance(groups, list):
        for group in groups:
            if not isinstance(group, dict):
                continue
            group_name = str(group.get("name") or group.get("group") or "")
            group_rows = group.get("standings") or group.get("rows") or []
            if isinstance(group_rows, list):
                for row in group_rows:
                    if isinstance(row, dict):
                        item = dict(row)
                        if group_name:
                            item["group"] = group_name
                        out.append(item)
    return out


def normalize_standings(payload: Any, league_id: int, season: dict[str, Any]) -> dict[str, Any]:
    teams = []
    for row in standings_rows(payload):
        club = str(row_value(row, "team_name", "club", "name", default="")).strip()
        if not club and isinstance(row.get("team"), dict):
            club = nested_name(row.get("team"))
        if not club:
            continue
        teams.append({
            "position": int_or_none(row_value(row, "position", "rank", default=None)),
            "club": club,
            "p": int_or_none(row_value(row, "played", "p", "matches_played", default=0)) or 0,
            "w": int_or_none(row_value(row, "won", "wins", "w", default=0)) or 0,
            "d": int_or_none(row_value(row, "drawn", "draws", "d", default=0)) or 0,
            "l": int_or_none(row_value(row, "lost", "losses", "l", default=0)) or 0,
            "gf": int_or_none(row_value(row, "goals_for", "gf", default=0)) or 0,
            "ga": int_or_none(row_value(row, "goals_against", "ga", default=0)) or 0,
            "pts": int_or_none(row_value(row, "pts", "points", default=0)) or 0,
            "group": row.get("group") or "",
            "zone": row.get("zone"),
        })
    return {
        "leagueId": league_id,
        "season": season,
        "teams": teams,
    }


def update_ligue1_schedule(schedule: list[Any], events: list[dict[str, Any]]) -> int:
    by_pair = {match_key(e["home"], e["away"]): e for e in events if e.get("leagueId") == 6}
    changes = 0
    for day in schedule:
        if not isinstance(day, dict):
            continue
        for match in day.get("matches", []) or []:
            if not isinstance(match, list) or len(match) < 2:
                continue
            event = by_pair.get(match_key(match[0], match[1]))
            if not event:
                continue
            fixture = dict(match[2]) if len(match) > 2 and isinstance(match[2], dict) else {}
            before = json.dumps(fixture, sort_keys=True, ensure_ascii=False)

            # Anti-régression d'un match déjà final.
            if fixture.get("completed") and not event.get("completed"):
                continue

            fixture["source"] = "bsd"
            fixture["eventId"] = event.get("eventId")
            fixture["status"] = event.get("status") or fixture.get("status") or ""
            fixture["live"] = bool(event.get("live"))
            fixture["completed"] = bool(event.get("completed"))
            if event.get("minute") is not None:
                fixture["minute"] = event.get("minute")
            elif fixture.get("completed"):
                fixture.pop("minute", None)
            if event.get("period"):
                fixture["period"] = event.get("period")
            if event.get("homeScore") is not None and event.get("awayScore") is not None:
                fixture["homeScore"] = event["homeScore"]
                fixture["awayScore"] = event["awayScore"]
            if "actualScorers" in event:
                # N'efface pas une liste finale validée par une réponse incomplète.
                if event.get("scorersVerified") or not fixture.get("scorersVerified"):
                    fixture["actualScorers"] = event.get("actualScorers") or []
                fixture["scorersVerified"] = bool(event.get("scorersVerified"))
            fixture["lastLiveUpdate"] = event.get("updatedAt")

            if len(match) > 2:
                match[2] = fixture
            else:
                match.append(fixture)
            after = json.dumps(fixture, sort_keys=True, ensure_ascii=False)
            if before != after:
                changes += 1
                print(f"[L1] {match[0]} - {match[1]}: {fixture.get('status')} {fixture.get('homeScore')}-{fixture.get('awayScore')}")
    return changes


def main() -> int:
    token = os.environ.get("BSD_API_KEY", "").strip()
    if not token:
        print("ERREUR : secret BSD_API_KEY absent.")
        return 1

    client = BSDClient(token)
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=2)).date().isoformat()
    date_to = (now + timedelta(days=2)).date().isoformat()
    generated = now.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    previous_live = load_json(LIVE_OUTPUT, {"events": []})
    old_events = {
        int_or_none(e.get("eventId")): e
        for e in (previous_live.get("events", []) if isinstance(previous_live, dict) else [])
        if isinstance(e, dict) and int_or_none(e.get("eventId"))
    }
    previous_standings = load_json(STANDINGS_OUTPUT, {"leagues": {}})
    standings_out = dict(previous_standings) if isinstance(previous_standings, dict) else {"leagues": {}}
    standings_out.setdefault("leagues", {})
    standings_out["generatedAt"] = generated
    standings_out["source"] = "BSD"

    touched_ids: set[int] = set()
    failed_leagues: list[int] = []

    for league_id, league_name in LEAGUES.items():
        print(f"\n=== {league_name} / BSD {league_id} ===")
        try:
            season = season_for(client, league_id)
            season_id = int_or_none(season.get("id"))
            if not season_id:
                raise RuntimeError(f"Saison courante introuvable pour league_id={league_id}")

            fixtures_payload = client.get("/events/", {
                "league_id": league_id,
                "season_id": season_id,
                "date_from": date_from,
                "date_to": date_to,
                "limit": 200,
            })
            base_events = list_items(fixtures_payload, ("results", "events"))

            # Le endpoint live est la source de vérité pour minute + score en cours.
            live_payload = client.get("/events/live/", {
                "league_id": league_id,
                "season_id": season_id,
            })
            live_events = list_items(live_payload, ("results", "events"))
            live_by_id = {
                int_or_none(x.get("id") or x.get("event_id")): x
                for x in live_events
                if int_or_none(x.get("id") or x.get("event_id"))
            }

            normalized: list[dict[str, Any]] = []
            for raw in base_events:
                eid = int_or_none(raw.get("id") or raw.get("event_id"))
                if eid in live_by_id:
                    raw = {**raw, **live_by_id[eid]}
                item = normalize_event(raw, league_id)
                if item:
                    normalized.append(item)

            # Un live très récent peut manquer de la fenêtre listée : on l'ajoute.
            known = {x["eventId"] for x in normalized}
            for raw in live_events:
                item = normalize_event(raw, league_id)
                if item and item["eventId"] not in known:
                    normalized.append(item)

            for item in normalized:
                eid = int(item["eventId"])
                old = old_events.get(eid)
                item["updatedAt"] = generated

                hs, aas = item.get("homeScore"), item.get("awayScore")
                expected_goals = hs + aas if isinstance(hs, int) and isinstance(aas, int) else None
                old_total = None
                if isinstance(old, dict):
                    oh, oa = old.get("homeScore"), old.get("awayScore")
                    if isinstance(oh, int) and isinstance(oa, int):
                        old_total = oh + oa

                should_refresh_scorers = bool(item.get("completed")) or (
                    item.get("live") and expected_goals is not None and expected_goals != old_total
                )
                if should_refresh_scorers:
                    try:
                        scorers, verified, goal_count = fetch_scorers(client, eid, expected_goals)
                        item["actualScorers"] = scorers
                        item["scorersVerified"] = verified
                        item["goalIncidents"] = goal_count
                    except Exception as exc:
                        print(f"[WARN] Incidents {eid}: {exc}")
                        if isinstance(old, dict):
                            for key in ("actualScorers", "scorersVerified", "goalIncidents"):
                                if key in old:
                                    item[key] = old[key]
                        item.setdefault("scorersVerified", False)
                elif isinstance(old, dict):
                    for key in ("actualScorers", "scorersVerified", "goalIncidents"):
                        if key in old:
                            item[key] = old[key]

                old_events[eid] = merge_event(old, item)
                touched_ids.add(eid)

            # Classement officiel BSD. En cas de souci, l'ancien fichier reste intact pour cette ligue.
            try:
                table_payload = client.get(f"/leagues/{league_id}/standings/", {"season_id": season_id})
                table = normalize_standings(table_payload, league_id, season)
                if table["teams"]:
                    standings_out["leagues"][str(league_id)] = table
                    print(f"[OK] Classement: {len(table['teams'])} équipes")
                else:
                    print("[WARN] Classement vide : ancienne version conservée")
            except Exception as exc:
                print(f"[WARN] Classement {league_name}: {exc}")

            print(f"[OK] {len(normalized)} match(s) dans la fenêtre, {len(live_events)} live")
        except Exception as exc:
            failed_leagues.append(league_id)
            print(f"[ERREUR] {league_name}: {exc}")

    if len(failed_leagues) == len(LEAGUES):
        print("ERREUR : aucune compétition BSD n'a pu être actualisée. Aucun fichier modifié.")
        return 1

    # Historique compact : on conserve tous les matchs rencontrés, utile pour les anciennes journées UCL.
    merged_events = sorted(
        [e for e in old_events.values() if isinstance(e, dict)],
        key=lambda e: (str(e.get("kickoff") or ""), int_or_none(e.get("eventId")) or 0),
    )
    live_out = {
        "source": "BSD",
        "generatedAt": generated,
        "events": merged_events,
    }

    # Met à jour schedule.json pour garder les résultats L1 compatibles avec le bilan/statistiques existants.
    schedule_changes = 0
    if SCHEDULE.exists():
        schedule = load_json(SCHEDULE, [])
        if isinstance(schedule, list):
            schedule_changes = update_ligue1_schedule(schedule, merged_events)
            if schedule_changes:
                write_json(SCHEDULE, schedule)
    else:
        print("[WARN] schedule.json absent : live-results.json sera tout de même généré.")

    write_json(LIVE_OUTPUT, live_out)
    write_json(STANDINGS_OUTPUT, standings_out)
    print(f"\n[OK] live-results.json: {len(merged_events)} événements conservés")
    print(f"[OK] schedule.json: {schedule_changes} match(s) modifié(s)")
    print(f"[OK] Appels BSD effectués: {client.calls}")
    if failed_leagues:
        print(f"[WARN] Compétitions non actualisées: {failed_leagues}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
