#!/usr/bin/env python3
"""Footix V10 — cache des XI officiels (étape 1 Rennes–Marseille).
Big Balls = XI / banc / formation. TheSportsDB = portraits des 22 titulaires.
La clé Big Balls reste exclusivement dans BIGBALLS_API_KEY (GitHub Secret).
"""
from __future__ import annotations
import datetime, json, os, random, re, sys, time, unicodedata
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "lineups-v10.json"
PORTRAIT_CACHE = ROOT / "portraits-v10-cache.json"
BB_BASE = "https://api.bigballsdata.com/v1"
TSDB = "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php"
TARGET = {"day":4,"date":"2026-09-11","home":"STADE RENNAIS FC","away":"OLYMPIQUE DE MARSEILLE"}
TSDB_MIN_INTERVAL = 2.2  # Free: 30 req/min. On reste volontairement sous la limite.
_last_tsdb_call = 0.0

FULL_NAMES = {
 "home": {30:"Brice Samba",95:"Przemyslaw Frankowski",4:"Charlie Cresswell",24:"Anthony Rouault",18:"Mahamadou Nagida",45:"Mahdi Camara",21:"Valentin Rongier",28:"Adrien Thomasson",10:"Ludovic Blas",9:"Esteban Lepaul",90:"Issa Soumare"},
 "away": {1:"Jeffrey de Lange",22:"Timothy Weah",4:"CJ Egan-Riley",21:"Nayef Aguerd",33:"Emerson Palmieri",8:"Himad Abdelli",23:"Pierre-Emile Hojbjerg",77:"Amine Harit",7:"Angel Gomes",14:"Igor Paixao",9:"Amine Gouiri"},
}

def norm(s):
    s=unicodedata.normalize("NFD",str(s or "")); s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]","",s.lower())

def get_json(url, headers=None, label="API", retries=4):
    for attempt in range(retries+1):
        req=urllib.request.Request(url,headers=headers or {"User-Agent":"FootixProno/1.0"})
        try:
            with urllib.request.urlopen(req,timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt >= retries:
                raise RuntimeError(f"{label}: HTTP {e.code} sur {url.split('?')[0]}") from e
            retry_after=e.headers.get("Retry-After")
            try: wait=max(float(retry_after),5.0) if retry_after else min(60.0,8.0*(2**attempt))
            except ValueError: wait=min(60.0,8.0*(2**attempt))
            wait += random.uniform(0.5,1.5)
            print(f"ATTENTE: {label} limite 429 — nouvel essai dans {wait:.1f}s ({attempt+1}/{retries})")
            time.sleep(wait)
        except urllib.error.URLError as e:
            if attempt >= retries: raise RuntimeError(f"{label}: erreur réseau {e.reason}") from e
            wait=min(20.0,2.0*(2**attempt))+random.uniform(0.2,0.8)
            print(f"ATTENTE: {label} erreur réseau — nouvel essai dans {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError(f"{label}: échec après plusieurs essais")

def bb(path,key):
    return get_json(BB_BASE+path,{"Authorization":f"Bearer {key}","Accept":"application/json","User-Agent":"FootixProno/1.0"},"Big Balls")

def find_match(key):
    data=bb("/stored/matches?date="+TARGET["date"],key).get("data") or []
    for m in data:
        if m.get("sport")!="football": continue
        h=norm((m.get("home") or {}).get("name")); a=norm((m.get("away") or {}).get("name"))
        if ("rennais" in h or "rennes" in h) and "marseille" in a: return m
    raise RuntimeError("Rennes–Marseille introuvable chez Big Balls pour le 11/09/2026")

def load_portrait_cache():
    try:
        raw=json.loads(PORTRAIT_CACHE.read_text(encoding="utf-8"))
        return raw if isinstance(raw,dict) else {}
    except (FileNotFoundError,json.JSONDecodeError): return {}

def tsdb_portrait(full_name, cache):
    global _last_tsdb_call
    ck=norm(full_name)
    if ck in cache:
        print(f"CACHE portrait: {full_name}")
        return cache[ck]
    elapsed=time.monotonic()-_last_tsdb_call
    if elapsed < TSDB_MIN_INTERVAL: time.sleep(TSDB_MIN_INTERVAL-elapsed)
    url=TSDB+"?"+urllib.parse.urlencode({"p":full_name})
    try:
        rows=get_json(url,label="TheSportsDB").get("player") or []
    finally:
        _last_tsdb_call=time.monotonic()
    rows=[p for p in rows if p.get("strSport")=="Soccer"] or rows
    if not rows: pic={"id":None,"cutout":None,"thumb":None}
    else:
        p=rows[0]; pic={"id":p.get("idPlayer"),"cutout":p.get("strCutout"),"thumb":p.get("strThumb")}
    cache[ck]=pic
    print(f"Portrait: {full_name} — {'OK' if pic.get('cutout') or pic.get('thumb') else 'absent'}")
    return pic

def build_team(rows,side,formation,cache):
    starters=[p for p in rows if p.get("starter") is True]
    bench=[p for p in rows if p.get("starter") is False]
    def enrich(p, portrait=True):
        num=p.get("jersey_number"); full=FULL_NAMES[side].get(num) or p.get("name")
        pic=tsdb_portrait(full,cache) if portrait else {"id":None,"cutout":None,"thumb":None}
        return {"bigballs_player_id":p.get("player_id"),"name":full,"source_name":p.get("name"),"number":num,"position":p.get("position"),"portrait":pic.get("cutout") or pic.get("thumb"),"cutout":pic.get("cutout"),"thumb":pic.get("thumb"),"thesportsdb_player_id":pic.get("id")}
    # Les portraits ne servent actuellement qu'au double terrain: 22 appels max au premier run.
    # Le banc est conservé avec ses données Big Balls, sans appels portrait inutiles.
    return {"formation":formation,"players":[enrich(p,True) for p in starters],"bench":[enrich(p,False) for p in bench]}

def main():
    key=os.getenv("BIGBALLS_API_KEY","").strip()
    if not key: print("ERREUR: secret BIGBALLS_API_KEY absent."); return 1
    print("V10: recherche du match chez Big Balls…")
    match=find_match(key); match_id=match["id"]
    print(f"Big Balls: match trouvé {match_id}")
    payload=bb(f"/stored/matches/{match_id}/lineups",key)
    data=payload.get("data") or {}; meta=payload.get("meta") or {}; form=meta.get("formation") or {}
    if len([p for p in data.get("home",[]) if p.get("starter")])!=11 or len([p for p in data.get("away",[]) if p.get("starter")])!=11:
        raise RuntimeError("Big Balls n'a pas retourné 11 titulaires de chaque côté; cache inchangé.")
    cache=load_portrait_cache()
    key_out=f'{TARGET["day"]}|||{norm(TARGET["home"])}|||{norm(TARGET["away"])}'
    home=build_team(data["home"],"home",form.get("home") or "4-3-3",cache)
    away=build_team(data["away"],"away",form.get("away") or "4-2-3-1",cache)
    out={"generated_at":datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),"source":"Big Balls + TheSportsDB","matches":{key_out:{"status":"official","bigballs_match_id":match_id,"home":home,"away":away}}}
    OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    PORTRAIT_CACHE.write_text(json.dumps(cache,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    hp=sum(bool(p.get("portrait")) for p in home["players"]); ap=sum(bool(p.get("portrait")) for p in away["players"])
    print(f"OK: Rennes–Marseille {home['formation']} / {away['formation']} — portraits titulaires {hp+ap}/22")
    print(f"Cache écrit: {OUT.name} ; portraits mémorisés: {len(cache)}")
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except Exception as e: print(f"ERREUR: {e}"); sys.exit(1)
