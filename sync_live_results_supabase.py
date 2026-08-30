#!/usr/bin/env python3
"""Footix Prono — reporte le même live-results.json dans Supabase.

But : la page éditoriale Ligue 1/LDC et "Vos pronos" utilisent exactement
le même état de match, score final et résultat 1/N/2.

Secrets requis uniquement côté GitHub Actions :
  SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations
import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

SUPABASE_URL=os.getenv(
    "SUPABASE_URL",
    "https://brjwujgtkyxzyytkwftw.supabase.co"
).rstrip("/")
SERVICE_KEY=os.getenv("SUPABASE_SERVICE_ROLE_KEY","").strip()

def die(msg):
    print(f"ERREUR: {msg}", file=sys.stderr)
    raise SystemExit(1)

def patch_match(external_id, payload):
    query=urllib.parse.urlencode({"external_id": f"eq.{external_id}"})
    url=f"{SUPABASE_URL}/rest/v1/matches?{query}"
    body=json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(url, data=body, method="PATCH")
    req.add_header("apikey", SERVICE_KEY)
    req.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw=r.read().decode("utf-8")
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        detail=e.read().decode("utf-8", errors="replace")
        die(f"Supabase HTTP {e.code} pour {external_id}: {detail[:700]}")

def status_for(event):
    raw=str(event.get("status") or "").strip().lower()
    if event.get("completed") is True or raw in {"finished","completed","complete","ft"}:
        return "finished"
    if event.get("live") is True or raw in {"live","inprogress","in_progress","started"}:
        return "live"
    if raw in {"postponed"}:
        return "postponed"
    if raw in {"cancelled","canceled"}:
        return "cancelled"
    return "scheduled"

def as_int(value):
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def main():
    if not SERVICE_KEY:
        die("SUPABASE_SERVICE_ROLE_KEY absent.")
    path=Path("live-results.json")
    if not path.exists():
        die("live-results.json introuvable.")

    data=json.loads(path.read_text(encoding="utf-8"))
    events=data.get("events") or []
    if not isinstance(events,list):
        die("Format live-results.json invalide.")

    updated=0
    missing=0
    for event in events:
        if not isinstance(event,dict):
            continue
        event_id=event.get("eventId")
        league_id=event.get("leagueId")
        if event_id is None or league_id not in (6,7):
            continue

        status=status_for(event)
        hs=as_int(event.get("homeScore"))
        aw=as_int(event.get("awayScore"))
        result=None
        if status=="finished" and hs is not None and aw is not None:
            result="1" if hs>aw else "2" if aw>hs else "N"

        payload={
            "status": status,
            "home_score": hs,
            "away_score": aw,
            "result_pick": result,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        rows=patch_match(f"bsd:{event_id}", payload)
        if rows:
            updated += 1
            print(
                f"OK bsd:{event_id} | {event.get('home')} - {event.get('away')} "
                f"| {status} | {hs}-{aw} | résultat={result}"
            )
        else:
            missing += 1
            print(f"ATTENTION bsd:{event_id}: match absent de Supabase.")

    print(f"Supabase Vos pronos synchronisé : {updated} match(s), {missing} absent(s).")

if __name__=="__main__":
    main()
