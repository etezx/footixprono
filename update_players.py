#!/usr/bin/env python3
"""Met à jour players.json avec les effectifs Ligue 1 depuis ESPN.

Le fichier reste volontairement simple : {club: [joueurs]}.
On conserve les noms déjà ajoutés manuellement et on fusionne les effectifs ESPN.
"""
from __future__ import annotations
import json, re, time, unicodedata, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "players.json"
TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams"
ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/{id}/roster"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FootixProno/1.3-players)",
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

def norm(s):
    s=unicodedata.normalize("NFD",str(s or ""))
    s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()

def get_json(url, retries=3):
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers=HEADERS)
            with urllib.request.urlopen(req,timeout=25) as r:
                return json.load(r)
        except Exception as exc:
            last=exc
            if i+1<retries: time.sleep(2)
    raise RuntimeError(last)

def extract_teams(data):
    # ESPN site API usually nests sports -> leagues -> teams.
    teams=[]
    for sport in data.get("sports",[]) or []:
        for league in sport.get("leagues",[]) or []:
            for item in league.get("teams",[]) or []:
                team=item.get("team") or item
                if team.get("id"): teams.append(team)
    return teams

def extract_players(data):
    out=[]
    groups=data.get("athletes") or []
    # Some responses group by position; others return flat athlete dicts.
    for group in groups:
        if isinstance(group,dict) and isinstance(group.get("items"),list):
            candidates=group["items"]
        else:
            candidates=[group]
        for athlete in candidates:
            if not isinstance(athlete,dict): continue
            name=athlete.get("displayName") or athlete.get("fullName") or athlete.get("name")
            pos=((athlete.get("position") or {}).get("abbreviation") or "").upper()
            # Goalkeepers are not useful for a normal scorer picker.
            if name and pos not in {"G","GK"}:
                out.append(name.strip())
    return out

def main():
    current={"updated_at":None,"source":"Footix Prono + ESPN roster updater","clubs":{}}
    if OUTPUT.exists():
        try: current=json.loads(OUTPUT.read_text(encoding="utf-8"))
        except Exception: pass
    clubs=current.setdefault("clubs",{})

    data=get_json(TEAMS_URL)
    teams=extract_teams(data)
    updated=0
    for team in teams:
        project=ALIASES.get(norm(team.get("displayName") or team.get("name")))
        if not project: continue
        try:
            roster=get_json(ROSTER_URL.format(id=team["id"]))
            names=extract_players(roster)
        except Exception as exc:
            print(f"[WARN] {project}: {exc}")
            continue
        existing=clubs.get(project,[])
        merged=[]
        seen=set()
        for name in [*existing,*names]:
            k=norm(name)
            if k and k not in seen:
                seen.add(k); merged.append(name)
        merged.sort(key=lambda x: norm(x))
        clubs[project]=merged
        updated += 1
        time.sleep(.12)

    current["updated_at"]=datetime.now(timezone.utc).isoformat()
    OUTPUT.write_text(json.dumps(current,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"[OK] Effectifs mis à jour pour {updated} clubs.")

if __name__=="__main__":
    main()
