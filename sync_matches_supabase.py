#!/usr/bin/env python3
"""
Footix Prono — BSD -> Supabase community matches sync.
Secrets required in environment:
  BSD_API_KEY
  SUPABASE_SERVICE_ROLE_KEY

SUPABASE_URL is optional; defaults to Footix Prono public project URL.
No secret is written to disk.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BSD_BASE = "https://sports.bzzoiro.com/api/v2"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://brjwujgtkyxzyytkwftw.supabase.co").rstrip("/")
BSD_API_KEY = os.getenv("BSD_API_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

LEAGUES = {
    6: "L1",
    7: "UCL",
}

def die(msg: str) -> None:
    print(f"ERREUR: {msg}", file=sys.stderr)
    raise SystemExit(1)

def request_json(url: str, headers: dict[str,str] | None = None, method="GET", data=None):
    payload = None
    if data is not None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method=method)
    for k,v in (headers or {}).items():
        req.add_header(k,v)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        die(f"HTTP {e.code} pour {url}: {body[:800]}")
    except Exception as e:
        die(f"Requête impossible pour {url}: {e}")

def season_window():
    now = datetime.now(timezone.utc)
    # Saison européenne : juillet -> juin.
    start_year = now.year if now.month >= 7 else now.year - 1
    return f"{start_year}-07-01", f"{start_year+1}-06-30"

def fetch_all_events(league_id: int):
    date_from, date_to = season_window()
    headers={"Authorization": f"Token {BSD_API_KEY}", "Accept": "application/json"}
    offset=0
    all_rows=[]
    while True:
        params=urllib.parse.urlencode({
            "league_id": league_id,
            "date_from": date_from,
            "date_to": date_to,
            "limit": 200,
            "offset": offset,
        })
        data=request_json(f"{BSD_BASE}/events/?{params}", headers=headers)
        if isinstance(data, dict):
            rows=data.get("results") or data.get("events") or []
            count=data.get("count")
            next_url=data.get("next")
        elif isinstance(data, list):
            rows=data
            count=len(data)
            next_url=None
        else:
            rows=[]
            count=0
            next_url=None

        all_rows.extend(rows)
        if not rows:
            break
        offset += len(rows)
        if next_url:
            continue
        if isinstance(count, int) and offset < count:
            continue
        if len(rows) >= 200:
            continue
        break
    return all_rows

def first(obj, *keys):
    if not isinstance(obj, dict):
        return None
    for k in keys:
        v=obj.get(k)
        if v is not None and v != "":
            return v
    return None

def team_name(event, side):
    # BSD v2 can expose a team object or flattened names depending on endpoint/cache shape.
    candidates = [
        event.get(f"{side}_team"),
        event.get(side),
        event.get(f"{side}Team"),
    ]
    for v in candidates:
        if isinstance(v, dict):
            name=first(v,"name","short_name","display_name","team_name")
            if name:
                return str(name).strip()
        elif isinstance(v, str) and v.strip():
            return v.strip()
    v=first(event, f"{side}_team_name", f"{side}_name", f"{side}Name")
    return str(v).strip() if v else None

def score_value(event, side):
    v=first(event, f"{side}_score", f"{side}Score")
    if v is None:
        score=event.get("score")
        if isinstance(score, dict):
            v=first(score, side, f"{side}_score")
            if isinstance(v, dict):
                v=first(v,"current","display","value","score")
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None

def kickoff_value(event):
    v=first(
        event,
        "start_time","kickoff","kickoff_time","scheduled_at","start_at",
        "date","datetime","start_date"
    )
    if isinstance(v, dict):
        v=first(v,"date","datetime","start_time","utc")
    return str(v) if v else None

def matchday_value(event):
    v=first(event,"round_number","matchday","round_no","week")
    if v is None:
        rnd=event.get("round")
        if isinstance(rnd, dict):
            v=first(rnd,"number","round_number","matchday")
        else:
            v=rnd
    if isinstance(v, str):
        nums=re.findall(r"\d+",v)
        v=nums[0] if nums else None
    try:
        return int(v) if v is not None else None
    except (TypeError,ValueError):
        return None

def status_value(event):
    raw=str(first(event,"status","state","match_status") or "upcoming").strip().lower()
    mapping={
        "upcoming":"scheduled",
        "notstarted":"scheduled",
        "not_started":"scheduled",
        "scheduled":"scheduled",
        "live":"live",
        "inprogress":"live",
        "in_progress":"live",
        "finished":"finished",
        "completed":"finished",
        "ft":"finished",
        "postponed":"postponed",
        "cancelled":"cancelled",
        "canceled":"cancelled",
    }
    return mapping.get(raw, "scheduled")

def event_id(event):
    v=first(event,"id","event_id","eventId")
    return str(v) if v is not None else None

def normalize(event, competition):
    ext=event_id(event)
    home=team_name(event,"home")
    away=team_name(event,"away")
    kickoff=kickoff_value(event)
    if not ext or not home or not away or not kickoff:
        return None

    status=status_value(event)
    hs=score_value(event,"home")
    aw=score_value(event,"away")
    result=None
    if status=="finished" and hs is not None and aw is not None:
        result="1" if hs>aw else "2" if aw>hs else "N"

    return {
        "external_id": f"bsd:{ext}",
        "competition": competition,
        "matchday": matchday_value(event),
        "home_team": home,
        "away_team": away,
        "kickoff": kickoff,
        "status": status,
        "home_score": hs,
        "away_score": aw,
        "result_pick": result,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

def supabase_upsert(rows):
    if not rows:
        return
    headers={
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    # Keep requests small and predictable.
    for i in range(0,len(rows),100):
        batch=rows[i:i+100]
        url=f"{SUPABASE_URL}/rest/v1/matches?on_conflict=external_id"
        request_json(url,headers=headers,method="POST",data=batch)

def main():
    if not BSD_API_KEY:
        die("BSD_API_KEY absent.")
    if not SUPABASE_SERVICE_ROLE_KEY:
        die("SUPABASE_SERVICE_ROLE_KEY absent.")

    total=0
    for league_id,competition in LEAGUES.items():
        events=fetch_all_events(league_id)
        rows=[]
        skipped=0
        for e in events:
            row=normalize(e,competition)
            if row:
                rows.append(row)
            else:
                skipped += 1
        supabase_upsert(rows)
        total += len(rows)
        print(f"{competition}: {len(rows)} match(s) synchronisé(s), {skipped} ignoré(s).")

    print(f"OK — {total} match(s) envoyés vers Supabase.")

if __name__ == "__main__":
    main()
