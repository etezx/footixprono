const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const short={"staderennaisfc":"RENNES","olympiquedemarseille":"MARSEILLE","parissaintgermain":"PSG","olympiquelyonnais":"LYON","rcstrasbourgalsace":"STRASBOURG","stadebrestois29":"BREST","fcLorient":"LORIENT"};
const display=n=>short[norm(n)]||String(n||"").replace(/ FC$/i,"");
async function json(url){const r=await fetch(`${url}?_=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw Error(url);return r.json()}
function logo(name,clubs){const e=Object.entries(clubs.clubs||{}).find(([k])=>norm(k)===norm(name));return e?e[1]:"logo-footix-prono.png"}
function findStanding(name,standings){return (standings.teams||[]).find(t=>norm(t.club)===norm(name)||norm(t.club).includes(norm(name))||norm(name).includes(norm(t.club)))}
function rank(name,standings){const i=(standings.teams||[]).findIndex(t=>norm(t.club)===norm(name)||norm(t.club).includes(norm(name))||norm(name).includes(norm(t.club)));return i>=0?`${i+1}e de Ligue 1`:"Classement indisponible"}
function allFixtures(schedule){return schedule.flatMap(d=>(d.matches||[]).map(m=>({day:d.journee,home:m[0],away:m[1],meta:m[2]||{}})))}
function findFixture(schedule,home,away,day){const all=allFixtures(schedule);return all.find(x=>(!day||String(x.day)===String(day))&&norm(x.home)===norm(home)&&norm(x.away)===norm(away))||all.find(x=>norm(x.home)===norm(home)&&norm(x.away)===norm(away))}
function formFor(team,target,all){
  const targetDay=Number(target?.day)||999;
  const targetDate=target?.meta?.date||"";
  return all.filter(x=>{
    if(!x.meta?.completed||(norm(x.home)!==norm(team)&&norm(x.away)!==norm(team)))return false;
    const xDay=Number(x.day)||0;
    // Certaines journées terminées n'ont pas encore de date dans schedule.json :
    // on utilise alors le numéro de journée pour ne pas perdre le résultat.
    if(xDay&&targetDay!==999)return xDay<targetDay;
    return !!(x.meta?.date&&targetDate&&x.meta.date<targetDate);
  }).sort((a,b)=>(Number(b.day)||0)-(Number(a.day)||0)).slice(0,5).reverse().map(x=>{
    const isHome=norm(x.home)===norm(team);
    const gf=Number(isHome?x.meta.homeScore:x.meta.awayScore),ga=Number(isHome?x.meta.awayScore:x.meta.homeScore);
    const result=gf>ga?"w":gf===ga?"d":"l";
    const opponent=isHome?x.away:x.home;
    return {result,opponent,score:`${x.meta.homeScore}–${x.meta.awayScore}`,day:x.day,home:x.home,away:x.away};
  });
}
function formHTML(form){return `<div class="form-row">${form.length?form.map(m=>{const label=m.result==="w"?"V":m.result==="d"?"N":"D";const tip=`${display(m.home)} ${m.score} ${display(m.away)} · J${m.day}`;return `<span class="form-dot ${m.result}" tabindex="0" aria-label="${esc(tip)}"><span>${label}</span><span class="form-tooltip">${esc(display(m.home))} <b>${esc(m.score)}</b> ${esc(display(m.away))}<small>Ligue 1 · Journée ${esc(m.day)}</small></span></span>`}).join(""):`<span class="muted">Forme à venir</span>`}</div>`}
function pronoFor(pronos,day,home,away){const d=pronos.days?.[String(day)]||{};return d[`${home}|||${away}`]||Object.entries(d).find(([k])=>{const [h,a]=k.split("|||");return norm(h)===norm(home)&&norm(a)===norm(away)})?.[1]||{}}
function fmtDate(meta){if(!meta?.date)return "DATE À CONFIRMER";const d=new Date(meta.date+"T12:00:00");return d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()+` · ${meta.time||""}`}
function status(meta){if(meta?.completed||meta?.status==="finished")return ["TERMINÉ","finished"];if(meta?.live)return [`LIVE · ${meta.minute||""}'`,"live"];return ["À VENIR",""]}
function score(meta){if(meta?.completed||meta?.live)return `${meta.homeScore??0} – ${meta.awayScore??0}`;return "VS"}
function verdict(meta,p){if(!meta?.completed||!p?.score)return null;const [ph,pa]=String(p.score).split(/[-–]/).map(Number);const ah=Number(meta.homeScore),aa=Number(meta.awayScore);if([ph,pa,ah,aa].some(Number.isNaN))return null;const exact=ph===ah&&pa===aa;const out=(x,y)=>x>y?"1":x<y?"2":"N";const good=out(ph,pa)===out(ah,aa);return exact?["SCORE EXACT · PRONO PARFAIT","good"]:good?["BON RÉSULTAT, SCORE DIFFÉRENT","good"]:["PRONO RATÉ","bad"]}
function statRows(stats){if(!stats||!stats.length)return `<div class="empty-block">Les statistiques détaillées ne sont pas encore disponibles dans le cache V10. Aucun chiffre n’est inventé.</div>`;return stats.map(s=>{const total=(+s.home||0)+(+s.away||0)||1,h=Math.round((+s.home||0)/total*100),a=100-h,suffix=s.suffix||"";return `<div class="stat-line"><span class="num">${esc(s.home)}${esc(suffix)}</span><span class="bar"><i style="width:${h}%"></i></span><span class="stat-name">${esc(s.label)}</span><span class="bar away"><i style="width:${a}%"></i></span><span class="num">${esc(s.away)}${esc(suffix)}</span></div>`}).join("")}
const lineupLayouts={
 "4-3-3":[[50,88],[16,70],[38,70],[62,70],[84,70],[24,48],[50,48],[76,48],[20,23],[50,19],[80,23]],
 "4-2-3-1":[[50,88],[16,70],[38,70],[62,70],[84,70],[35,51],[65,51],[18,32],[50,31],[82,32],[50,15]]
};
const noAccents=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const initials=n=>String(n).split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();
function lineupKey(home,away,day){return `${norm(home)}|${norm(away)}|${day}`}
function teamPitchHTML(t){const coords=lineupLayouts[t.formation]||lineupLayouts["4-3-3"];return `<article class="lineup-team-card ${t.cls||""}"><div class="lineup-team-head"><strong>${esc(t.name||"")}</strong><span>${esc(t.formation)}</span></div><div class="lineup-pitch">${t.players.map((p,i)=>{const name=Array.isArray(p)?p[0]:p.name,num=Array.isArray(p)?p[1]:p.number,portrait=Array.isArray(p)?"":(p.portrait||p.cutout||p.thumb||""),[x,y]=coords[i];return `<div class="lineup-player" data-player="${esc(name)}" data-portrait="${esc(portrait)}" style="left:${x}%;top:${y}%"><div class="lineup-portrait"><span>${initials(name)}</span></div><b class="lineup-number">${num??""}</b><em title="${esc(name)}">${esc(name)}</em></div>`}).join("")}</div></article>`}
let cachedLineups={};
function lineupBlock(home,away,day,meta){const cacheKey=`${day}|||${norm(home)}|||${norm(away)}`;const l=cachedLineups?.matches?.[cacheKey];if(!l)return `<div class="lineup-empty"><strong>⚽ COMPOSITION V10</strong><p>La composition de cette rencontre n'est pas encore disponible dans le cache Footix. Aucun XI fictif n'est affiché.</p></div>`;if(l.home&&!l.home.name){l.home={...l.home,name:display(home),cls:"home"};l.away={...l.away,name:display(away),cls:"away"}}const official=meta?.completed||meta?.status==="finished";return `<div class="lineup-status"><span class="${official?"official":"probable"}">${l.official?"✓ XI OFFICIELS":"COMPOSITION DISPONIBLE"}</span><small>${l.official?"Données officielles mises en cache":"Données Footix"}</small></div><div class="double-pitches">${teamPitchHTML(l.home)}${teamPitchHTML(l.away)}</div>`}
async function hydratePortraits(){[...document.querySelectorAll(".lineup-player")].forEach(el=>{const url=el.dataset.portrait||null;if(!url)return;const img=new Image();img.alt=el.dataset.player;img.onload=()=>{const w=el.querySelector(".lineup-portrait");w.innerHTML="";w.appendChild(img)};img.src=url})}
async function init(){try{const [schedule,pronos,standings,clubs,lineups]=await Promise.all([json("schedule.json"),json("pronos.json"),json("standings.json"),json("clubs.json"),json("lineups-v10.json").catch(()=>({matches:{}}))]);cachedLineups=lineups||{matches:{}};const q=new URLSearchParams(location.search);
const competition=String(q.get("competition")||"").toLowerCase();
let home=q.get("home"),away=q.get("away"),day=q.get("day");
if(competition!=="ligue1"||!home||!away||!day)throw Error("Match introuvable");
const fixture=findFixture(schedule,home,away,day);
if(!fixture||String(fixture.day)!==String(day)||norm(fixture.home)!==norm(home)||norm(fixture.away)!==norm(away))throw Error("Match introuvable");
home=fixture.home;away=fixture.away;day=fixture.day;const meta=fixture.meta||{},cacheKey=`${day}|||${norm(home)}|||${norm(away)}`,cachedMatch=cachedLineups?.matches?.[cacheKey]||{},p=pronoFor(pronos,day,home,away),all=allFixtures(schedule),hf=formFor(home,fixture,all),af=formFor(away,fixture,all),[st,stClass]=status(meta),v=verdict(meta,p);document.title=`${display(home)} – ${display(away)} | Footix Prono`;$("#match-app").innerHTML=`
<section class="match-hero"><div class="hero-kicker"><span>LIGUE 1 · JOURNÉE ${esc(day)}</span><span class="status-pill ${stClass}">${esc(st)}</span><span>${esc(fmtDate(meta))}</span></div><div class="hero-teams"><div class="hero-team"><img src="${esc(logo(home,clubs))}" alt=""><div><h1>${esc(display(home))}</h1><div class="team-rank">${esc(rank(home,standings))}</div>${formHTML(hf)}</div></div><div class="hero-score"><strong>${esc(score(meta))}</strong><span>${meta.completed?"SCORE FINAL":"COUP D’ENVOI"}</span></div><div class="hero-team away"><img src="${esc(logo(away,clubs))}" alt=""><div><h1>${esc(display(away))}</h1><div class="team-rank">${esc(rank(away,standings))}</div>${formHTML(af)}</div></div></div></section>
<div class="v10-grid">
<section class="v10-card"><div class="card-head"><h2>🧠 ANALYSE FOOTIX</h2><span>AVANT-MATCH</span></div><div class="card-body analysis-text">${esc(p.analyse||"Aucune analyse publiée pour cette rencontre.")}</div></section>
<aside class="v10-card"><div class="card-head"><h3>🎯 PRONO FOOTIX</h3><span>NOTRE AVIS</span></div><div class="card-body"><div class="prono-box"><div class="prono-metric"><small>SCORE PRÉVU</small><strong>${esc(p.score||"—")}</strong></div><div class="prono-metric scorers"><small>BUTEUR(S)</small><strong>${esc((p.scorers||[]).join(" · ")||p.buteurs||"—")}</strong></div></div></div></aside>
<section class="v10-card pitch-card"><div class="card-head"><h2>⚽ COMPOSITIONS</h2><span>PROBABLE → OFFICIELLE</span></div><div class="pitch-layout">${lineupBlock(home,away,day,meta)}</div></section>
<section class="v10-card stats-card"><div class="card-head"><h2>📊 STATISTIQUES DU MATCH</h2><span>${meta.completed?"APRÈS-MATCH":"DISPONIBLES APRÈS LE MATCH"}</span></div><div class="card-body"><div class="stats-list">${statRows(cachedMatch.stats?.length?cachedMatch.stats:meta.stats)}</div>${v?`<div class="after-prono"><div class="after-prono-title">BILAN DU PRONO FOOTIX</div><div class="after-score-grid"><div class="after-score-card"><small>PRONO FOOTIX</small><strong>${esc(p.score)}</strong></div><div class="after-score-card final"><small>SCORE FINAL</small><strong>${esc(meta.homeScore)}–${esc(meta.awayScore)}</strong></div></div><div class="verdict ${v[1]}">${v[0]}</div></div>`:""}</div></section>
</div>`;hydratePortraits()}catch(e){console.error(e);$("#match-app").innerHTML=`<div class="empty-block"><b>Impossible de charger cette fiche match.</b><br><span class="muted">Vérifie les paramètres du match ou les fichiers de données.</span></div>`}}
init();
