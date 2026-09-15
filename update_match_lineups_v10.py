#!/usr/bin/env python3
"""Footix V10 — cache des XI officiels.

Étape 1 volontairement limitée à Rennes–Marseille (J4, 11/09/2026).
- Big Balls = autorité pour XI / banc / formation.
- TheSportsDB = portraits uniquement.
- BIGBALLS_API_KEY reste côté GitHub Actions.
- Le navigateur ne reçoit jamais la clé.
"""
from __future__ import annotations
import json, os, re, sys, unicodedata, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "lineups-v10.json"
BB_BASE = "https://api.bigballsdata.com/v1"
TSDB = "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php"
TARGET = {"day": 4, "date": "2026-09-11", "home": "STADE RENNAIS FC", "away": "OLYMPIQUE DE MARSEILLE"}

# Pour ce premier test seulement : Big Balls abrège certains noms. Le numéro de maillot
# permet de demander le nom complet à TheSportsDB sans ambiguïté. On supprimera cette
# table lorsque la généralisation des effectifs sera branchée.
FULL_NAMES = {
    "home": {30:"Brice Samba",95:"Przemyslaw Frankowski",4:"Charlie Cresswell",24:"Anthony Rouault",18:"Mahamadou Nagida",45:"Mahdi Camara",21:"Valentin Rongier",28:"Adrien Thomasson",10:"Ludovic Blas",9:"Esteban Lepaul",90:"Issa Soumare"},
    "away": {1:"Jeffrey de Lange",22:"Timothy Weah",4:"CJ Egan-Riley",21:"Nayef Aguerd",33:"Emerson Palmieri",8:"Himad Abdelli",23:"Pierre-Emile Hojbjerg",77:"Amine Harit",7:"Angel Gomes",14:"Igor Paixao",9:"Amine Gouiri"},
}

def norm(s):
    s=unicodedata.normalize("NFD", str(s or "")); s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())

def get_json(url, headers=None):
    req=urllib.request.Request(url, headers=headers or {"User-Agent":"FootixProno/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

def bb(path, key): return get_json(BB_BASE+path, {"Authorization":f"Bearer {key}","Accept":"application/json","User-Agent":"FootixProno/1.0"})

def find_match(key):
    data=bb("/stored/matches?date="+TARGET["date"], key).get("data") or []
    for m in data:
        if m.get("sport")!="football": continue
        h=norm((m.get("home") or {}).get("name")); a=norm((m.get("away") or {}).get("name"))
        if ("rennais" in h or "rennes" in h) and "marseille" in a: return m
    raise RuntimeError("Rennes–Marseille introuvable chez Big Balls pour le 11/09/2026")

def tsdb_portrait(full_name):
    url=TSDB+"?"+urllib.parse.urlencode({"p":full_name})
    rows=get_json(url).get("player") or []
    rows=[p for p in rows if p.get("strSport")=="Soccer"] or rows
    if not rows: return {"id":None,"cutout":None,"thumb":None}
    p=rows[0]
    return {"id":p.get("idPlayer"),"cutout":p.get("strCutout"),"thumb":p.get("strThumb")}

def build_team(rows, side, formation):
    starters=[p for p in rows if p.get("starter") is True]
    bench=[p for p in rows if p.get("starter") is False]
    def enrich(p):
        num=p.get("jersey_number"); full=FULL_NAMES[side].get(num) or p.get("name")
        pic=tsdb_portrait(full)
        return {"bigballs_player_id":p.get("player_id"),"name":full,"source_name":p.get("name"),"number":num,"position":p.get("position"),"portrait":pic.get("cutout") or pic.get("thumb"),"cutout":pic.get("cutout"),"thumb":pic.get("thumb"),"thesportsdb_player_id":pic.get("id")}
    return {"formation":formation,"players":[enrich(p) for p in starters],"bench":[enrich(p) for p in bench]}

def main():
    key=os.getenv("BIGBALLS_API_KEY","").strip()
    if not key:
        print("ERREUR: secret BIGBALLS_API_KEY absent."); return 1
    match=find_match(key); match_id=match["id"]
    payload=bb(f"/stored/matches/{match_id}/lineups", key)
    data=payload.get("data") or {}; meta=payload.get("meta") or {}; form=meta.get("formation") or {}
    if len([p for p in data.get("home",[]) if p.get("starter")])!=11 or len([p for p in data.get("away",[]) if p.get("starter")])!=11:
        raise RuntimeError("Big Balls n'a pas retourné 11 titulaires de chaque côté; cache inchangé.")
    key_out=f'{TARGET["day"]}|||{norm(TARGET["home"])}|||{norm(TARGET["away"])}'
    out={"generated_at":__import__('datetime').datetime.now(__import__('datetime').timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),"source":"Big Balls + TheSportsDB","matches":{key_out:{"status":"official","bigballs_match_id":match_id,"home":build_team(data["home"],"home",form.get("home") or "4-3-3"),"away":build_team(data["away"],"away",form.get("away") or "4-2-3-1")}}}
    OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    hp=sum(bool(p.get("portrait")) for p in out["matches"][key_out]["home"]["players"]); ap=sum(bool(p.get("portrait")) for p in out["matches"][key_out]["away"]["players"])
    print(f"OK: Rennes–Marseille {form.get('home')} / {form.get('away')} — portraits titulaires {hp+ap}/22")
    print(f"Cache écrit: {OUT.name}")
    return 0
if __name__=="__main__":
    try: sys.exit(main())
    except Exception as e: print(f"ERREUR: {e}"); sys.exit(1)
