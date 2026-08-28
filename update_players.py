#!/usr/bin/env python3
"""Met à jour players.json avec les effectifs Ligue 1 depuis ESPN.

V8.4.6 : récupération plus robuste des effectifs.
- accepte plusieurs structures de réponse ESPN pour les rosters ;
- conserve les joueurs ajoutés manuellement ;
- exclut uniquement les gardiens ;
- refuse d'écraser players.json si ESPN renvoie un résultat manifestement incomplet.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "players.json"
TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams"
ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/{id}/roster"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FootixProno/1.4-players)",
    "Accept": "application/json,text/plain,*/*",
}

ALIASES = {
    "paris saint germain":"PARIS SAINT-GERMAIN","psg":"PARIS SAINT-GERMAIN",
    "paris fc":"PARIS FC","marseille":"OLYMPIQUE DE MARSEILLE","olympique de marseille":"OLYMPIQUE DE MARSEILLE",
    "lyon":"OLYMPIQUE LYONNAIS","olympique lyonnais":"OLYMPIQUE LYONNAIS",
    "monaco":"AS MONACO","as monaco":"AS MONACO","lille":"LOSC","lille osc":"LOSC","losc":"LOSC",
    "lens":"RC LENS","rc lens":"RC LENS","rennes":"STADE RENNAIS FC","stade rennais":"STADE RENNAIS FC",
    "stade rennais fc":"STADE RENNAIS FC","strasbourg":"RC STRASBOURG ALSACE",
    "rc strasbourg alsace":"RC STRASBOURG ALSACE","toulouse":"TOULOUSE FC","toulouse fc":"TOULOUSE FC",
    "nice":"OGC NICE","ogc nice":"OGC NICE","lorient":"FC LORIENT","fc lorient":"FC LORIENT",
    "brest":"STADE BRESTOIS 29","stade brestois":"STADE BRESTOIS 29","stade brestois 29":"STADE BRESTOIS 29",
    "le havre":"LE HAVRE","le havre ac":"LE HAVRE","angers":"ANGERS SCO","angers sco":"ANGERS SCO",
    "auxerre":"AJ AUXERRE","aj auxerre":"AJ AUXERRE","troyes":"ESTAC TROYES","estac troyes":"ESTAC TROYES",
    "le mans":"LE MANS FC","le mans fc":"LE MANS FC"
}

GOALKEEPER_CODES = {"G", "GK", "GKP", "GOALKEEPER", "GARDIEN"}


def norm(s):
    s=unicodedata.normalize("NFD",str(s or ""))
    s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()


def get_json(url, retries=4):
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers=HEADERS)
            with urllib.request.urlopen(req,timeout=30) as r:
                return json.load(r)
        except Exception as exc:
            last=exc
            if i+1<retries:
                time.sleep(2+i)
    raise RuntimeError(last)


def extract_teams(data):
    """Supporte la structure Site API classique et quelques variantes."""
    found=[]
    seen=set()

    def add(team):
        if not isinstance(team,dict):
            return
        tid=team.get("id")
        name=team.get("displayName") or team.get("name") or team.get("shortDisplayName")
        if tid and name and str(tid) not in seen:
            seen.add(str(tid)); found.append(team)

    for sport in data.get("sports",[]) or []:
        for league in sport.get("leagues",[]) or []:
            for item in league.get("teams",[]) or []:
                add(item.get("team") if isinstance(item,dict) else item)

    for item in data.get("teams",[]) or []:
        if isinstance(item,dict):
            add(item.get("team") or item)

    return found


def position_code(obj, inherited=""):
    if not isinstance(obj,dict):
        return inherited
    pos=obj.get("position")
    vals=[]
    if isinstance(pos,dict):
        vals += [pos.get("abbreviation"),pos.get("name"),pos.get("displayName")]
    elif pos:
        vals.append(pos)
    vals += [obj.get("positionAbbreviation"), obj.get("positionName")]
    return next((str(v).strip() for v in vals if v), inherited)


def is_goalkeeper(code):
    n=norm(code).upper().replace(" ","")
    return n in GOALKEEPER_CODES or "GOALKEEPER" in n or "GARDIEN" in n


def athlete_name(obj):
    if not isinstance(obj,dict):
        return ""
    return str(obj.get("displayName") or obj.get("fullName") or obj.get("name") or "").strip()


def extract_players(data):
    """Parcourt récursivement la réponse roster pour supporter les variantes ESPN.

    Un joueur est retenu si un nom d'athlète est trouvé. Le poste peut être porté
    par le joueur lui-même ou par son groupe parent (ex. Forwards/Midfielders).
    """
    out=[]
    seen=set()

    def add(name, pos=""):
        name=str(name or "").strip()
        if not name or is_goalkeeper(pos):
            return
        k=norm(name)
        if k and k not in seen:
            seen.add(k); out.append(name)

    def walk(node, inherited_pos=""):
        if isinstance(node,list):
            for x in node:
                walk(x,inherited_pos)
            return
        if not isinstance(node,dict):
            return

        here_pos=position_code(node,inherited_pos)

        # Un objet athlete explicite.
        ath=node.get("athlete")
        if isinstance(ath,dict):
            add(athlete_name(ath), position_code(ath,here_pos))

        # Un objet joueur direct (évite les objets d'équipe grâce aux clés typiques).
        name=athlete_name(node)
        athleteish = any(k in node for k in ("jersey","position","positionAbbreviation","uid","guid","age","dateOfBirth"))
        if name and athleteish:
            add(name,here_pos)

        # Les groupes ESPN utilisent souvent items/athletes.
        for key,value in node.items():
            if key in {"team","teams","coach","coaches"}:
                continue
            if isinstance(value,(dict,list)):
                walk(value,here_pos)

    walk(data)
    return out


def merge_names(existing, fetched):
    merged=[]; seen=set()
    for name in [*(existing or []),*(fetched or [])]:
        k=norm(name)
        if k and k not in seen:
            seen.add(k); merged.append(str(name).strip())
    merged.sort(key=norm)
    return merged


def main():
    current={"updated_at":None,"source":"Footix Prono + ESPN roster updater","clubs":{}}
    if OUTPUT.exists():
        try:
            current=json.loads(OUTPUT.read_text(encoding="utf-8"))
        except Exception:
            pass
    current.setdefault("clubs",{})

    data=get_json(TEAMS_URL)
    teams=extract_teams(data)
    if len(teams)<10:
        raise RuntimeError(f"ESPN n'a renvoyé que {len(teams)} équipes : players.json conservé.")

    staged={k:list(v or []) for k,v in current["clubs"].items()}
    updated=0
    fetched_total=0
    diagnostics=[]

    for team in teams:
        espn_name=team.get("displayName") or team.get("name") or team.get("shortDisplayName")
        project=ALIASES.get(norm(espn_name))
        if not project:
            continue
        try:
            roster=get_json(ROSTER_URL.format(id=urllib.parse.quote(str(team["id"]))))
            names=extract_players(roster)
        except Exception as exc:
            print(f"[WARN] {project}: {exc}")
            diagnostics.append(f"{project}: erreur")
            continue

        staged[project]=merge_names(staged.get(project,[]),names)
        updated += 1
        fetched_total += len(names)
        diagnostics.append(f"{project}: {len(names)} joueurs ESPN / {len(staged[project])} total")
        time.sleep(.12)

    # Protection contre une réponse ESPN vide/partielle qui effacerait ou validerait
    # à tort un fichier incomplet. Un effectif complet de L1 doit largement dépasser ça.
    if updated < 10 or fetched_total < 80:
        print("\n".join("[INFO] "+x for x in diagnostics))
        raise RuntimeError(
            f"Récupération incomplète ({updated} clubs, {fetched_total} joueurs ESPN). "
            "players.json n'est pas remplacé."
        )

    current["clubs"]=staged
    current["updated_at"]=datetime.now(timezone.utc).isoformat()
    current["source"]="ESPN rosters + ajouts manuels Footix Prono"
    current["clubs_updated"]=updated
    current["players_fetched"]=fetched_total
    OUTPUT.write_text(json.dumps(current,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

    print("\n".join("[INFO] "+x for x in diagnostics))
    print(f"[OK] Effectifs mis à jour : {updated} clubs, {fetched_total} joueurs récupérés.")


if __name__=="__main__":
    main()
