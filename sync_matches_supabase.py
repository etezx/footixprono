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

def season_start_year():
    now = datetime.now(timezone.utc)
    return now.year if now.month >= 7 else now.year - 1

def ucl_main_phase_cutoff():
    # Footix Prono : phase principale uniquement.
    # Les tours de qualification/barrages de juillet-août sont exclus.
    return datetime(season_start_year(), 9, 1, tzinfo=timezone.utc)

def parse_event_datetime(value):
    if not value:
        return None
    text=str(value).strip()
    try:
        if text.endswith("Z"):
            text=text[:-1] + "+00:00"
        dt=datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

def keep_for_community(event, competition):
    if competition != "UCL":
        return True
    kickoff=parse_event_datetime(kickoff_value(event))
    return bool(kickoff and kickoff >= ucl_main_phase_cutoff())

def supabase_cleanup_ucl_qualifiers():
    cutoff=ucl_main_phase_cutoff().isoformat()
    headers={
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Prefer": "return=minimal",
    }
    params=urllib.parse.urlencode({
        "competition": "eq.UCL",
        "kickoff": f"lt.{cutoff}",
    })
    request_json(f"{SUPABASE_URL}/rest/v1/matches?{params}", headers=headers, method="DELETE")
    print(f"UCL: qualifications avant {cutoff[:10]} supprimées de Supabase.")

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
    candidates = [
        event.get(f"{side}_team"),
        event.get(side),
        event.get(f"{side}Team"),
        event.get(f"{side}_competitor"),
    ]
    for v in candidates:
        if isinstance(v, dict):
            name=first(v,"name","short_name","display_name","team_name","title")
            if name:
                return str(name).strip()
        elif isinstance(v, str) and v.strip():
            return v.strip()

    v=first(
        event,
        f"{side}_team_name",
        f"{side}_name",
        f"{side}Name",
        f"{side}_competitor_name"
    )
    return str(v).strip() if v else None

def team_id(event, side):
    v=first(event, f"{side}_team_id", f"{side}TeamId", f"{side}_id")
    if v is None:
        obj=event.get(f"{side}_team") or event.get(side)
        if isinstance(obj, dict):
            v=first(obj, "id", "team_id")
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None

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
    # Shapes seen/documented across BSD list/live/detail payloads.
    direct=first(
        event,
        "start_time","kickoff","kickoff_time","kickoff_at","scheduled_at",
        "start_at","event_date","date","datetime","start_date","start_datetime",
        "start_time_utc","utc_start_time"
    )
    if isinstance(direct, dict):
        direct=first(direct,"date","datetime","start_time","utc","kickoff_at")
    if direct:
        return str(direct)

    for block_name in ("time","start","schedule","fixture"):
        block=event.get(block_name)
        if isinstance(block, dict):
            v=first(
                block,
                "kickoff_at","start_time","datetime","date","utc",
                "scheduled_at","start_at"
            )
            if v:
                return str(v)

    # Some APIs expose UNIX seconds.
    ts=first(event,"start_timestamp","kickoff_timestamp","timestamp","uts")
    try:
        if ts is not None:
            ts=float(ts)
            if ts > 10_000_000_000:  # ms
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except (TypeError,ValueError,OSError):
        pass
    return None

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
    raw=first(event,"status","state","match_status")
    if raw is None and isinstance(event.get("time"),dict):
        raw=first(event["time"],"status","state")
    raw=str(raw or "upcoming").strip().lower()
    mapping={
        "upcoming":"scheduled",
        "notstarted":"scheduled",
        "not_started":"scheduled",
        "scheduled":"scheduled",
        "unresolved":"scheduled",
        "live":"live",
        "inprogress":"live",
        "in_progress":"live",
        "started":"live",
        "finished":"finished",
        "completed":"finished",
        "complete":"finished",
        "ft":"finished",
        "postponed":"postponed",
        "cancelled":"cancelled",
        "canceled":"cancelled",
    }
    return mapping.get(raw, "scheduled")

def event_id(event):
    v=first(event,"id","event_id","eventId","fixture_id","match_id")
    return str(v) if v is not None else None

def diagnostic(event):
    """Return a compact, secret-free look at one BSD event shape."""
    if not isinstance(event,dict):
        return {"type": type(event).__name__}
    out={"keys": sorted(event.keys())}
    for key in ("time","home","away","home_team","away_team","score","round"):
        value=event.get(key)
        if isinstance(value,dict):
            out[f"{key}_keys"]=sorted(value.keys())
        elif value is not None:
            out[key]=str(value)[:100]
    return out

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
        "home_team_id": team_id(event,"home"),
        "away_team_id": team_id(event,"away"),
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

    supabase_cleanup_ucl_qualifiers()

    total=0
    for league_id,competition in LEAGUES.items():
        events=fetch_all_events(league_id)
        rows=[]
        skipped=0
        excluded_qualifiers=0
        first_skipped=None
        for e in events:
            if not keep_for_community(e, competition):
                excluded_qualifiers += 1
                continue
            row=normalize(e,competition)
            if row:
                rows.append(row)
            else:
                skipped += 1
                if first_skipped is None:
                    first_skipped=diagnostic(e)
        supabase_upsert(rows)
        total += len(rows)
        extra=f", {excluded_qualifiers} qualification(s) exclue(s)" if competition=="UCL" else ""
        print(f"{competition}: {len(rows)} match(s) synchronisé(s), {skipped} ignoré(s){extra}.")
        if first_skipped is not None:
            print(f"{competition} diagnostic premier ignoré: {json.dumps(first_skipped, ensure_ascii=False)}")

    print(f"OK — {total} match(s) envoyés vers Supabase.")

if __name__ == "__main__":
    main()
