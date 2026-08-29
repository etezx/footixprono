#!/usr/bin/env python3
"""Met à jour standings.json depuis les flux publics ESPN Ligue 1.

Aucune clé API n'est nécessaire. En cas d'indisponibilité de la source, le
fichier existant est conservé afin de ne jamais casser le site.
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LEAGUE = "fra.1"
SEASON = 2026  # saison ESPN 2026 = exercice 2026/2027
ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "standings.json"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Referer": "https://www.espn.com/",
    "Origin": "https://www.espn.com",
}


def get_json(url: str, retries: int = 3) -> dict:
    """Récupère ESPN avec repli automatique sur le domaine web."""
    urls_to_try = [url]
    if "site.api.espn.com" in url:
        fallback = url.replace("site.api.espn.com", "site.web.api.espn.com", 1)
        if fallback not in urls_to_try:
            urls_to_try.append(fallback)

    errors = []
    for candidate in urls_to_try:
        last_error = None
        for attempt in range(retries):
            try:
                req = urllib.request.Request(candidate, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=25) as response:
                    return json.load(response)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt + 1 < retries:
                    time.sleep(2 + attempt * 2)
        errors.append(f"{candidate}: {last_error}")
        print(f"Source ESPN indisponible : {candidate} -> {last_error}")

    raise RuntimeError("Impossible de récupérer les données ESPN : " + " | ".join(errors))


def stat_map(entry: dict) -> dict:
    out = {}
    for stat in entry.get("stats", []):
        name = stat.get("name")
        if name:
            out[name] = stat.get("value", stat.get("displayValue", 0))
    return out


def n(stats: dict, key: str) -> int:
    try:
        return int(float(stats.get(key, 0) or 0))
    except (TypeError, ValueError):
        return 0


def extract_entries(payload: dict) -> list[dict]:
    entries = []

    def walk(node):
        if isinstance(node, dict):
            standings = node.get("standings")
            if isinstance(standings, dict) and isinstance(standings.get("entries"), list):
                entries.extend(standings["entries"])
            for value in node.values():
                if isinstance(value, (dict, list)):
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload.get("children", payload))
    # Déduplique par ID équipe au cas où l'API expose plusieurs niveaux de groupe.
    dedup = {}
    for entry in entries:
        team = entry.get("team", {})
        key = str(team.get("id") or team.get("displayName") or team.get("name") or "")
        if key:
            dedup[key] = entry
    return list(dedup.values())


def last_five(team_id: str) -> list[str]:
    """Calcule les 5 derniers résultats via le calendrier ESPN de l'équipe."""
    url = (
        f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}/teams/"
        f"{team_id}/schedule?season={SEASON}"
    )
    try:
        data = get_json(url, retries=2)
    except Exception as exc:  # noqa: BLE001
        print(f"Forme indisponible pour équipe {team_id}: {exc}")
        return []

    played = []
    for event in data.get("events", []):
        status = event.get("status", {}).get("type", {})
        completed = status.get("completed") is True or status.get("name") == "STATUS_FINAL"
        if not completed:
            continue
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competitors = competitions[0].get("competitors") or []
        mine = next((c for c in competitors if str(c.get("team", {}).get("id")) == str(team_id)), None)
        other = next((c for c in competitors if c is not mine), None)
        if not mine or not other:
            continue
        try:
            my_score = int(float(mine.get("score", 0) or 0))
            other_score = int(float(other.get("score", 0) or 0))
        except (TypeError, ValueError):
            continue
        result = "V" if my_score > other_score else "D" if my_score < other_score else "N"
        played.append((event.get("date", ""), result))

    played.sort(key=lambda x: x[0])
    return [result for _, result in played[-5:]]


def main() -> None:
    url = f"https://site.api.espn.com/apis/v2/sports/soccer/{LEAGUE}/standings?season={SEASON}"
    data = get_json(url)
    entries = extract_entries(data)
    if not entries:
        raise RuntimeError("Aucune équipe trouvée dans le flux de classement ESPN")

    teams = []
    for entry in entries:
        team = entry.get("team", {})
        team_id = str(team.get("id") or "")
        stats = stat_map(entry)
        club = team.get("displayName") or team.get("shortDisplayName") or team.get("name")
        if not club:
            continue
        logo = ""
        logos = team.get("logos") or []
        if logos and isinstance(logos[0], dict):
            logo = logos[0].get("href") or ""
        teams.append({
            "club": club,
            "logo": logo,
            "p": n(stats, "gamesPlayed"),
            "w": n(stats, "wins"),
            "d": n(stats, "ties"),
            "l": n(stats, "losses"),
            "gf": n(stats, "pointsFor"),
            "ga": n(stats, "pointsAgainst"),
            "pts": n(stats, "points"),
            "last5": last_five(team_id) if team_id else [],
        })
        time.sleep(0.08)

    if len(teams) < 10:
        raise RuntimeError(f"Classement incomplet ({len(teams)} équipes), fichier non remplacé")

    # Protection anti-régression : ESPN peut parfois renvoyer temporairement un
    # classement complet mais avec toutes les statistiques à zéro. Une fois la
    # saison commencée, on refuse de remplacer un classement plus avancé par un
    # état plus ancien ou vide.
    previous_teams = []
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
            previous_teams = previous.get("teams", []) if isinstance(previous, dict) else []
        except Exception:
            previous_teams = []

    previous_played = sum(int(t.get("p", 0) or 0) for t in previous_teams if isinstance(t, dict))
    new_played = sum(int(t.get("p", 0) or 0) for t in teams if isinstance(t, dict))
    if previous_played > 0 and new_played < previous_played:
        raise RuntimeError(
            f"Classement ESPN en régression ({new_played} matchs-équipe contre {previous_played} auparavant) : fichier conservé"
        )

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "ESPN public soccer feed",
        "teams": teams,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Classement mis à jour: {len(teams)} équipes")


if __name__ == "__main__":
    main()
