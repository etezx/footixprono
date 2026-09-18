#!/usr/bin/env python3
"""Footix Prono V10 — cache automatique des compositions Ligue 1.

Sources:
- Big Balls (secret BIGBALLS_API_KEY): matches, XI, bancs, formations.
- TheSportsDB (clé publique v1 123): portraits et statistiques d'événement disponibles.

Aucune clé privée n'est écrite dans les fichiers publics. Le script ne fabrique jamais de XI/stat.
"""
from __future__ import annotations
import datetime as dt, json, os, random, re, time, unicodedata
from difflib import SequenceMatcher
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent
SCHEDULE=ROOT/'schedule.json'; OUT=ROOT/'lineups-v10.json'; PCACHE=ROOT/'portraits-v10-cache.json'
BB='https://api.bigballsdata.com/v1'; TS='https://www.thesportsdb.com/api/v1/json/123'
PAST_DAYS=int(os.getenv('V10_PAST_DAYS','4')); FUTURE_DAYS=int(os.getenv('V10_FUTURE_DAYS','3'))
TS_MIN=2.2; _last_ts=0.0

def norm(s):
 s=unicodedata.normalize('NFD',str(s or '')); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
 return re.sub(r'[^a-z0-9]','',s.lower())

def request_json(url,headers=None,label='API',retries=5):
 for n in range(retries+1):
  try:
   req=urllib.request.Request(url,headers=headers or {'User-Agent':'FootixProno/1.0'})
   with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)
  except urllib.error.HTTPError as e:
   if e.code!=429 or n>=retries: raise RuntimeError(f'{label}: HTTP {e.code}') from e
   try:w=float(e.headers.get('Retry-After') or 0)
   except:w=0
   w=max(w,min(75,8*(2**n)))+random.uniform(.5,1.5); print(f'ATTENTE {label}: 429, retry {w:.1f}s');time.sleep(w)
  except urllib.error.URLError as e:
   if n>=retries: raise RuntimeError(f'{label}: réseau {e.reason}') from e
   w=min(30,2*(2**n))+random.random();print(f'ATTENTE {label}: réseau, retry {w:.1f}s');time.sleep(w)

def bb(path,key):return request_json(BB+path,{'Authorization':f'Bearer {key}','Accept':'application/json','User-Agent':'FootixProno/1.0'},'Big Balls')
def ts(path,params):
 global _last_ts
 wait=TS_MIN-(time.monotonic()-_last_ts)
 if wait>0:time.sleep(wait)
 try:return request_json(TS+path+'?'+urllib.parse.urlencode(params),label='TheSportsDB')
 finally:_last_ts=time.monotonic()

def load(path,default):
 try:return json.loads(path.read_text(encoding='utf-8'))
 except:return default

def fixtures():
 raw=load(SCHEDULE,[]); out=[]
 for block in raw:
  day=block.get('journee')
  for m in block.get('matches',[]):
   if len(m)<3 or not isinstance(m[2],dict) or not m[2].get('date'):continue
   try:d=dt.date.fromisoformat(m[2]['date'])
   except:continue
   out.append({'day':day,'home':m[0],'away':m[1],'meta':m[2],'date':d})
 return out

def team_canon(s):
 x=norm(s)
 aliases={
  'olympiquedemarseille':'marseille','om':'marseille','marseille':'marseille',
  'staderennaisfc':'rennes','staderennais':'rennes','rennes':'rennes',
  'parissaintgermain':'psg','parissg':'psg','psg':'psg',
  'losclille':'lille','lilleosc':'lille','losc':'lille','lille':'lille',
  'rcstrasbourgalsace':'strasbourg','rcstrasbourg':'strasbourg','strasbourg':'strasbourg',
  'stadebrestois29':'brest','stadebretois29':'brest','stadebrestois':'brest','brest':'brest',
  'ajauxerre':'auxerre','auxerre':'auxerre',
  'angerssco':'angers','angers':'angers',
  'ogcnice':'nice','nice':'nice',
  'fclorient':'lorient','lorient':'lorient',
  'asmonaco':'monaco','monaco':'monaco',
  'rclens':'lens','lens':'lens',
  'toulousefc':'toulouse','toulouse':'toulouse',
  'parisfc':'parisfc',
  'lehavreac':'lehavre','lehac':'lehavre','lehavre':'lehavre',
  'lemansfc':'lemans','lemans':'lemans',
  'estactroyes':'troyes','estac':'troyes','troyes':'troyes',
  'olympiquelyonnais':'lyon','ol':'lyon','lyon':'lyon'
 }
 return aliases.get(x,x)

def team_match(a,b):
 a,b=team_canon(a),team_canon(b)
 if not a or not b:return False
 if a==b:return True
 # Garde-fou: le fuzzy ne sert qu'aux variantes longues d'un même nom.
 if len(a)>=6 and len(b)>=6 and (a in b or b in a):return True
 return len(a)>=6 and len(b)>=6 and SequenceMatcher(None,a,b).ratio()>=0.84

def find_bb_match(key,f):
 payload=bb('/stored/matches?date='+f['date'].isoformat(),key); rows=payload.get('data') or []
 candidates=[]
 fh,fa=team_canon(f['home']),team_canon(f['away'])
 for m in rows:
  if str(m.get('sport','')).lower()!='football':continue
  h=(m.get('home') or {}).get('name');a=(m.get('away') or {}).get('name')
  if not (team_match(f['home'],h) and team_match(f['away'],a)):continue
  score=SequenceMatcher(None,fh,team_canon(h)).ratio()+SequenceMatcher(None,fa,team_canon(a)).ratio()
  candidates.append((score,m))
 if not candidates:return None
 candidates.sort(key=lambda x:x[0],reverse=True)
 if len(candidates)>1 and candidates[0][0]-candidates[1][0]<0.08:
  print('  Matching ambigu Big Balls: aucun rapprochement automatique.')
  return None
 return candidates[0][1]

def full_name(key,p):
 name=p.get('name') or 'Joueur'; pid=p.get('player_id')
 if not pid or not re.search(r'(^|\s)[A-ZÀ-ÖØ-Ý]\.?\s',name):return name
 try:
  d=bb(f'/players/{pid}?sport=football',key).get('data') or {}
  for candidate in (d.get('name'),(d.get('player') or {}).get('name'),d.get('full_name')):
   if candidate and len(str(candidate))>len(name):return str(candidate)
 except Exception:pass
 return name

def portrait(name,cache):
 ck=norm(name)
 if ck in cache:return cache[ck]
 clean=str(name or '').strip(); initial=None; surname=clean
 m=re.match(r'^([A-ZÀ-ÖØ-Ý])\.?\s+(.+)$',clean)
 if m:initial=m.group(1).lower();surname=m.group(2).strip()
 queries=[clean]
 if surname and norm(surname)!=norm(clean):queries.append(surname)
 pic={'id':None,'cutout':None,'thumb':None}; best=None
 for q in queries:
  try:rows=ts('/searchplayers.php',{'p':q}).get('player') or []
  except Exception:rows=[]
  rows=[x for x in rows if str(x.get('strSport') or '').lower()=='soccer'] or rows
  for x in rows:
   candidate=str(x.get('strPlayer') or x.get('strPlayerAlternate') or '')
   if not candidate:continue
   cn=norm(candidate);sn=norm(surname)
   score=0
   if norm(clean)==cn:score=100
   elif sn and (cn.endswith(sn) or sn in cn):score=70
   else:score=int(45*SequenceMatcher(None,norm(clean),cn).ratio())
   if initial and candidate[:1].lower()==initial:score+=20
   if x.get('strCutout'):score+=5
   elif x.get('strThumb'):score+=2
   if best is None or score>best[0]:best=(score,x)
  if best and best[0]>=90:break
 if best and best[0]>=65:
  x=best[1];pic={'id':x.get('idPlayer'),'cutout':x.get('strCutout'),'thumb':x.get('strThumb')}
 cache[ck]=pic; print(f"Portrait {name}: {'OK' if pic['cutout'] or pic['thumb'] else 'absent'}")
 return pic

def team(rows,formation,key,cache):
 def enrich(p,with_pic):
  name=full_name(key,p);pic=portrait(name,cache) if with_pic else {'id':None,'cutout':None,'thumb':None}
  return {'bigballs_player_id':p.get('player_id'),'name':name,'source_name':p.get('name'),'number':p.get('jersey_number'),'position':p.get('position'),'portrait':pic.get('cutout') or pic.get('thumb'),'cutout':pic.get('cutout'),'thumb':pic.get('thumb'),'thesportsdb_player_id':pic.get('id')}
 starters=[enrich(p,True) for p in rows if p.get('starter') is True]
 bench=[enrich(p,False) for p in rows if p.get('starter') is False]
 return {'formation':formation or None,'players':starters,'bench':bench}

def ts_stats(home,away,season='2026-2027'):
 # Optionnel: TheSportsDB peut n'exposer qu'une partie des stats selon le match.
 candidates=[f'{home}_vs_{away}',f'{home} vs {away}']
 event=None
 for q in candidates:
  try:rows=ts('/searchevents.php',{'e':q,'s':season}).get('event') or []
  except Exception:rows=[]
  if rows:event=rows[0];break
 if not event:return [],None
 eid=event.get('idEvent')
 try:rows=ts('/lookupeventstats.php',{'id':eid}).get('eventstats') or []
 except Exception:return [],eid
 labels={'passes accurate':'Passes réussies','shots insidebox':'Tirs dans la surface','shots outsidebox':'Tirs hors surface','blocked shots':'Tirs bloqués','free kicks':'Coups francs','ball possession':'Possession','total shots':'Tirs','shots on goal':'Tirs cadrés','corner kicks':'Corners','yellow cards':'Cartons jaunes','red cards':'Cartons rouges'}
 out=[]
 for x in rows:
  k=str(x.get('strStat') or '').strip().lower();h=x.get('intHome');a=x.get('intAway')
  if k not in labels or h in (None,'') or a in (None,''):continue
  suf='%' if k=='ball possession' else ''
  out.append({'label':labels[k],'home':h,'away':a,'suffix':suf,'source':'TheSportsDB'})
 return out,eid

def main():
 key=os.getenv('BIGBALLS_API_KEY','').strip()
 if not key:raise SystemExit('ERREUR: secret BIGBALLS_API_KEY absent')
 today=dt.datetime.now(dt.timezone.utc).date();lo=today-dt.timedelta(days=PAST_DAYS);hi=today+dt.timedelta(days=FUTURE_DAYS)
 targets=[f for f in fixtures() if lo<=f['date']<=hi]
 print(f'V10 Ligue 1: fenêtre {lo} → {hi}, {len(targets)} match(s) Footix')
 old=load(OUT,{'matches':{}}); matches=old.get('matches',{}) if isinstance(old,dict) else {}
 cache=load(PCACHE,{})
 ok=0
 for f in targets:
  print(f"\nJ{f['day']} {f['home']} – {f['away']} ({f['date']})")
  try:m=find_bb_match(key,f)
  except Exception as e:print('  Big Balls:',e);continue
  if not m:print('  Match Big Balls non trouvé, on conserve le cache existant.');continue
  mid=m.get('id');ck=f"{f['day']}|||{norm(f['home'])}|||{norm(f['away'])}"
  try:lp=bb(f'/stored/matches/{mid}/lineups',key);data=lp.get('data') or {};meta=lp.get('meta') or {};forms=meta.get('formation') or {}
  except Exception as e:print('  Lineups indisponibles:',e);continue
  hs=[p for p in data.get('home',[]) if p.get('starter') is True];as_=[p for p in data.get('away',[]) if p.get('starter') is True]
  if len(hs)!=11 or len(as_)!=11:
   print(f'  XI pas encore officiels ({len(hs)}/11, {len(as_)}/11). Aucun XI fictif.');continue
  home=team(data.get('home',[]),forms.get('home'),key,cache);away=team(data.get('away',[]),forms.get('away'),key,cache)
  stats=[];eid=None
  if f['meta'].get('completed') or f['meta'].get('status')=='finished':
   stats,eid=ts_stats(f['home'],f['away'])
  matches[ck]={'day':f['day'],'date':f['date'].isoformat(),'home_name':f['home'],'away_name':f['away'],'bigballs_match_id':mid,'thesportsdb_event_id':eid,'official':True,'home':home,'away':away,'stats':stats}
  print(f"  OK: {home['formation'] or '?'} / {away['formation'] or '?'} · portraits {sum(bool(p.get('portrait')) for p in home['players']+away['players'])}/22 · stats {len(stats)}")
  ok+=1
 out={'generated_at':dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'competition':'Ligue 1','season':'2026-2027','source':'Big Balls + TheSportsDB','matches':matches}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');PCACHE.write_text(json.dumps(cache,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'\nCache écrit: {len(matches)} match(s) total, {ok} actualisé(s), {len(cache)} portrait(s) mémorisé(s).')
 return 0
if __name__=='__main__':raise SystemExit(main())
