
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

let clubsCache=null;
async function getJSON(url){ const r=await fetch(url+"?v=8.6.4",{cache:"no-store"}); if(!r.ok) throw new Error(url); return r.json(); }
async function clubs(){ if(!clubsCache) clubsCache=await getJSON("clubs.json"); return clubsCache; }
function clubLogo(name, map){
  const entries=Object.entries(map?.clubs||{});
  const hit=entries.find(([k])=>norm(k)===norm(name)) || entries.find(([k])=>norm(name).includes(norm(k))||norm(k).includes(norm(name)));
  return hit ? `<img class="crest" src="${hit[1]}" alt="">` : `<span class="fake-crest">${(name||"?").slice(0,2).toUpperCase()}</span>`;
}
function fmtDayMeta(meta){
  if(!meta) return "";
  if(meta.date){
    const d=new Date(meta.date+"T12:00:00");
    return d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})+(meta.time?` · ${meta.time}`:"");
  }
  return meta.time||"";
}
function updateLigue1HeaderClock(){
  const el=$("#l1-day-date");
  if(!el) return;
  const now=new Date();
  const date=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(now);
  const time=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  el.textContent=`${date.toLocaleUpperCase("fr-FR")} · ${time}`;
}
function matchSort(a,b){
  const ma=a[2]||{}, mb=b[2]||{};
  return ((ma.date||"9999")+(ma.time||"99")).localeCompare((mb.date||"9999")+(mb.time||"99"));
}

const TEAM_SHORT_NAMES = {
  "PARIS SAINT-GERMAIN":"PSG",
  "OLYMPIQUE DE MARSEILLE":"OM",
  "OLYMPIQUE LYONNAIS":"LYON",
  "RC STRASBOURG ALSACE":"STRASBOURG",
  "STADE RENNAIS FC":"RENNES",
  "STADE BRESTOIS 29":"BREST",
  "AJ AUXERRE":"AUXERRE",
  "ANGERS SCO":"ANGERS",
  "AS MONACO":"MONACO",
  "FC LORIENT":"LORIENT",
  "LE HAVRE":"LE HAVRE",
  "LE MANS FC":"LE MANS",
  "OGC NICE":"NICE",
  "PARIS FC":"PARIS FC",
  "RC LENS":"LENS",
  "TOULOUSE FC":"TOULOUSE",
  "ESTAC TROYES":"TROYES",
  "LOSC":"LOSC"
};
function teamDisplayName(name){
  return TEAM_SHORT_NAMES[String(name||"").toUpperCase()] || String(name||"");
}

/* J01 a été jouée avant le passage à BSD. schedule.json ne contient plus ses
   buteurs. On réinjecte uniquement cet historique figé afin que les pastilles
   vert/rouge restent correctes sans dépendre du nouveau flux live. */
const LEGACY_J01_SCORERS = {
  "ANGERS SCO|||LOSC":["Olivier Giroud","Tiago Santos"],
  "LE HAVRE|||AS MONACO":["Eric Dier"],
  "LE MANS FC|||STADE BRESTOIS 29":["Dame Gueye","Louis Mafouta","Romain Del Castillo","Kamory Doumbia"],
  "RC LENS|||AJ AUXERRE":["Florian Thauvin","Franjo Ivanovic","Saud Abdulhamid","Ismaëlo Ganiou","Danny Namaso","Lamine Sy"],
  "OLYMPIQUE DE MARSEILLE|||RC STRASBOURG ALSACE":["Amine Gouiri","Keyliane Abdallah","Pierre-Emile Højbjerg"],
  "OGC NICE|||FC LORIENT":[],
  "PARIS SAINT-GERMAIN|||STADE RENNAIS FC":["Sebastian Szymanski","Esteban Lepaul","Ferran Torres"],
  "TOULOUSE FC|||OLYMPIQUE LYONNAIS":["Noah Nartey","Malick Fofana"],
  "ESTAC TROYES|||PARIS FC":[]
};
function withLegacyScorers(fixture,dayNo,home,away){
  if(Number(dayNo)!==1 || !fixture?.completed) return fixture;
  const key=`${home}|||${away}`;
  if(!(key in LEGACY_J01_SCORERS)) return fixture;
  if(Array.isArray(fixture.actualScorers) && fixture.actualScorers.length) return fixture;
  return {...fixture,actualScorers:LEGACY_J01_SCORERS[key],scorersVerified:true};
}

function normalizePick(value){
  const v=String(value||"").trim().toUpperCase();
  return ["1","N","2"].includes(v) ? v : null;
}
function resultFromFixture(f){
  if(!f || !f.completed) return null;
  const h=Number(f.homeScore), a=Number(f.awayScore);
  if(!Number.isFinite(h)||!Number.isFinite(a)) return null;
  return h>a ? "1" : h<a ? "2" : "N";
}
function currentResultFromFixture(f){
  if(!f || (!f.live&&!f.completed)) return null;
  const h=Number(f.homeScore), a=Number(f.awayScore);
  if(!Number.isFinite(h)||!Number.isFinite(a)) return null;
  return h>a ? "1" : h<a ? "2" : "N";
}
function pronoForMatch(pronos,dayNo,home,away,index){
  const day=(pronos.days||{})[String(dayNo)]||{};
  if(day[`${home}|||${away}`]) return day[`${home}|||${away}`];
  if(Array.isArray(day.matches)) return day.matches[index]||{};
  return {};
}
function imageWithFallback(src,abbr,klass="ucl-logo"){
  return `<span class="${klass}-wrap"><img class="${klass}" src="${src}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="${klass}-fallback">${abbr}</span></span>`;
}
function escapeHTML(value){
  return String(value??"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function normalizePersonName(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function predictedScorers(p={}){
  if(Array.isArray(p.scorers)) return p.scorers.slice(0,4);
  return String(p.buteurs||p.buteur||"")
    .split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,4);
}
function personMatches(predicted,actual){
  const p=normalizePersonName(predicted), a=normalizePersonName(actual);
  if(!p||!a) return false;
  if(p===a) return true;
  // Un nom seul (ex. Gouiri) peut correspondre au nom de famille exact du flux BSD.
  const pp=p.split(" "), aa=a.split(" ");
  return pp.length===1 && pp[0].length>=4 && aa[aa.length-1]===pp[0];
}
function scorerVerdicts(p={},fixture={}){
  const predicted=predictedScorers(p);
  const actual=Array.isArray(fixture.actualScorers) ? fixture.actualScorers : [];
  // Historique J01 : avant BSD, schedule.json pouvait déjà contenir les vrais buteurs
  // sans le nouveau drapeau scorersVerified. On conserve donc ces validations.
  // Si BSD indique explicitement scorersVerified=false, on reste en attente pour
  // éviter de transformer une liste d'incidents incomplète en faux verdict rouge.
  const legacyVerified=fixture.completed && actual.length>0 && fixture.scorersVerified===undefined;
  const verified=fixture.scorersVerified===true || legacyVerified;
  return predicted.map(name=>{
    const hit=actual.some(a=>personMatches(name,a));
    if(hit) return {name,state:"ok"};
    if(fixture.completed) return {name,state:verified?"ko":"waiting"};
    return {name,state:"pending"};
  });
}
function scorerChipsHTML(p={},fixture={}){
  const verdicts=scorerVerdicts(p,fixture);
  if(!verdicts.length) return "—";
  return `<span class="scorer-verdict-list">${verdicts.map(x=>{
    const icon=x.state==="ok"?"✓":x.state==="ko"?"✕":"";
    return `<em class="${x.state}">${icon?icon+" ":""}${escapeHTML(x.name)}</em>`;
  }).join("")}</span>`;
}
function liveEvents(data,leagueId){
  return (Array.isArray(data?.events)?data.events:[]).filter(e=>Number(e.leagueId)===Number(leagueId));
}
function liveEventFor(data,leagueId,home,away,meta={}){
  const candidates=liveEvents(data,leagueId).filter(e=>norm(e.home)===norm(home)&&norm(e.away)===norm(away));
  if(!candidates.length) return null;
  const date=String(meta?.date||"").slice(0,10);
  if(date){
    const dated=candidates.find(e=>String(e.kickoff||"").slice(0,10)===date);
    if(dated) return dated;
  }
  return candidates.slice().sort((a,b)=>String(b.kickoff||"").localeCompare(String(a.kickoff||"")))[0];
}
function mergeFixtureData(fixture={},event=null){
  if(!event) return {...fixture};
  if(fixture.completed && !event.completed) return {...fixture};
  const out={...fixture};
  ["eventId","status","live","completed","minute","period","homeScore","awayScore","updatedAt"].forEach(k=>{
    if(event[k]!==undefined && event[k]!==null) out[k]=event[k];
  });
  // Ne jamais écraser les buteurs historiques déjà validés par un flux BSD
  // incomplet. C'est notamment indispensable pour la J01, validée avant BSD.
  const oldScorers=Array.isArray(fixture.actualScorers)?fixture.actualScorers.filter(Boolean):[];
  const newScorers=Array.isArray(event.actualScorers)?event.actualScorers.filter(Boolean):[];
  if(event.scorersVerified===true){
    out.actualScorers=newScorers;
    out.scorersVerified=true;
  }else if(oldScorers.length){
    out.actualScorers=oldScorers;
    if(fixture.scorersVerified!==undefined) out.scorersVerified=fixture.scorersVerified;
    else delete out.scorersVerified; // historique : liste présente = validation héritée
  }else if(newScorers.length){
    out.actualScorers=newScorers;
    out.scorersVerified=false;
  }else if(event.scorersVerified!==undefined){
    out.scorersVerified=event.scorersVerified;
  }
  if(event.updatedAt) out.lastLiveUpdate=event.updatedAt;
  return out;
}
function fixtureScore(f){
  const h=Number(f?.homeScore),a=Number(f?.awayScore);
  return Number.isFinite(h)&&Number.isFinite(a)?`${h}–${a}`:null;
}
function verdictData(pick,fixture,home,away){
  const current=currentResultFromFixture(fixture);
  if(!fixture?.live&&!fixture?.completed){
    return {state:"pending",label:"EN ATTENTE",why:"Le match n’a pas encore commencé."};
  }
  if(!pick||!current){
    return {state:"pending",label:"À VÉRIFIER",why:"Le pronostic 1/N/2 ou le score actuel n’est pas disponible."};
  }
  const good=pick===current;
  const live=Boolean(fixture.live&&!fixture.completed);
  let why="";
  if(good){
    why=live?"Le résultat actuel correspond au pronostic de Footix.":"Le résultat final correspond au pronostic de Footix.";
  }else if(pick==="1"){
    why=live?`${home} ne mène pas pour le moment.`:`${home} n’a pas gagné comme prévu.`;
  }else if(pick==="2"){
    why=live?`${away} ne mène pas pour le moment.`:`${away} n’a pas gagné comme prévu.`;
  }else{
    why=live?"Le score n’est pas nul pour le moment.":"Le match ne s’est pas terminé sur un nul comme prévu.";
  }
  return {
    state:good?"ok":"ko",
    label:live?(good?"PRONO ACTUELLEMENT BON":"PRONO ACTUELLEMENT FAUX"):(good?"✓ BON PRONO":"✕ MAUVAIS PRONO"),
    why
  };
}
function matchFlowHTML({home,away,score,pick,fixture,homeLogo="",awayLogo=""}){
  const homeDisplay=teamDisplayName(home), awayDisplay=teamDisplayName(away);
  const live=Boolean(fixture?.live&&!fixture?.completed);
  const final=Boolean(fixture?.completed);
  const real=fixtureScore(fixture);
  const verdict=verdictData(pick,fixture,home,away);
  const status=live?`🔴 LIVE${fixture.minute!=null?` ${fixture.minute}’`:""}`:final?"RÉSULTAT":"RÉSULTAT / LIVE";
  const resultScore=real||"—";
  const teams=`<span class="flow-team home" title="${escapeHTML(home)}">${homeLogo}<b>${escapeHTML(homeDisplay)}</b></span><span class="flow-score">${escapeHTML(score||"—")}</span><span class="flow-team away" title="${escapeHTML(away)}"><b>${escapeHTML(awayDisplay)}</b>${awayLogo}</span>`;
  const resultTeams=real?`<span class="flow-team home" title="${escapeHTML(home)}">${homeLogo}<b>${escapeHTML(homeDisplay)}</b></span><span class="flow-score">${escapeHTML(resultScore)}</span><span class="flow-team away" title="${escapeHTML(away)}"><b>${escapeHTML(awayDisplay)}</b>${awayLogo}</span>`:`<span class="flow-waiting">À venir</span>`;
  return `<div class="prono-flow ${live?"is-live":final?"is-final":"is-upcoming"}">
    <div class="flow-step flow-prono"><small>PRONO</small><strong class="flow-matchline">${teams}</strong><span>${pick?`Choix ${escapeHTML(pick)}`:"Choix —"}</span></div>
    <span class="flow-arrow">→</span>
    <div class="flow-step flow-result"><small>${status}</small><strong class="flow-matchline">${resultTeams}</strong><span>${live?"Score en cours":final?"Score final":"En attente du coup d’envoi"}</span></div>
    <span class="flow-arrow">→</span>
    <div class="flow-step flow-verdict ${verdict.state}"><small>VERDICT</small><strong>${escapeHTML(verdict.label)}</strong></div>
  </div>`;
}
function competitionStandings(bsd,leagueId){
  const block=bsd?.leagues?.[String(leagueId)];
  return Array.isArray(block?.teams)?block.teams:[];
}
function applyLiveToStandings(baseTeams,eventData,leagueId){
  const map=new Map((baseTeams||[]).map(t=>[norm(t.club),{...t,live:false}]));
  const ensure=name=>{
    const key=norm(name);
    if(!map.has(key)) map.set(key,{club:name,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0,live:false});
    return map.get(key);
  };
  liveEvents(eventData,leagueId).filter(e=>e.live&&!e.completed).forEach(e=>{
    const hs=Number(e.homeScore),as=Number(e.awayScore);
    if(!Number.isFinite(hs)||!Number.isFinite(as)) return;
    const h=ensure(e.home),a=ensure(e.away);
    h.p=(Number(h.p)||0)+1;a.p=(Number(a.p)||0)+1;
    h.gf=(Number(h.gf)||0)+hs;h.ga=(Number(h.ga)||0)+as;
    a.gf=(Number(a.gf)||0)+as;a.ga=(Number(a.ga)||0)+hs;
    h.live=a.live=true;
    if(hs>as){h.w=(Number(h.w)||0)+1;h.pts=(Number(h.pts)||0)+3;a.l=(Number(a.l)||0)+1;}
    else if(hs<as){a.w=(Number(a.w)||0)+1;a.pts=(Number(a.pts)||0)+3;h.l=(Number(h.l)||0)+1;}
    else{h.d=(Number(h.d)||0)+1;a.d=(Number(a.d)||0)+1;h.pts=(Number(h.pts)||0)+1;a.pts=(Number(a.pts)||0)+1;}
  });
  return [...map.values()].sort((a,b)=>(Number(b.pts)-Number(a.pts))||(((Number(b.gf)-Number(b.ga))-(Number(a.gf)-Number(a.ga))))||(Number(b.gf)-Number(a.gf))||String(a.club).localeCompare(String(b.club)));
}
function ensurePronoPanel(){
  let panel=$("#prono-detail-overlay");
  if(panel) return panel;
  panel=document.createElement("div");
  panel.id="prono-detail-overlay";
  panel.className="prono-detail-overlay";
  panel.hidden=true;
  panel.innerHTML=`
    <div class="prono-detail-backdrop" data-prono-close></div>
    <aside class="prono-detail-panel" role="dialog" aria-modal="true" aria-labelledby="prono-detail-title">
      <button type="button" class="prono-detail-close" data-prono-close aria-label="Fermer">×</button>
      <div id="prono-detail-body"></div>
    </aside>`;
  document.body.appendChild(panel);
  panel.addEventListener("click",e=>{
    if(e.target.closest("[data-prono-close]")) closePronoPanel();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && !panel.hidden) closePronoPanel();
  });
  return panel;
}
function closePronoPanel(){
  const panel=$("#prono-detail-overlay");
  if(!panel) return;
  panel.hidden=true;
  document.body.classList.remove("prono-panel-open");
}
function openPronoPanel(data){
  const panel=ensurePronoPanel();
  const body=$("#prono-detail-body",panel);
  const {home,away,homeLogo,awayLogo,meta,score,pick,analysis,fixture,p}=data;
  const actual=resultFromFixture(fixture);
  const finished=Boolean(fixture.completed);
  const live=Boolean(fixture.live&&!fixture.completed);
  const real=fixtureScore(fixture);
  const pickGood=Boolean(pick&&actual&&pick===actual);
  const exact=Boolean(real && String(score).replace(/\s/g,"").replace(/-/g,"–")===real.replace(/\s/g,""));
  const scorerRows=scorerVerdicts(p,fixture);
  const goodScorers=scorerRows.filter(x=>x.state==="ok").length;
  const checkedScorers=scorerRows.filter(x=>["ok","ko"].includes(x.state)).length;

  body.innerHTML=`
    <div class="prono-detail-heading"><small>FOOTIX PRONO</small><h2 id="prono-detail-title">Analyse du match</h2></div>
    <div class="prono-detail-match">
      <div class="prono-detail-team">${homeLogo}<b>${escapeHTML(home)}</b></div>
      <div class="prono-detail-score"><strong>${escapeHTML(score)}</strong><small>SCORE PRÉVU</small></div>
      <div class="prono-detail-team away">${awayLogo}<b>${escapeHTML(away)}</b></div>
      <div class="prono-detail-meta">${escapeHTML(meta||"Horaire à confirmer")}${live?` <span class="live-mini">LIVE${fixture.minute!=null?` ${fixture.minute}’`:""}</span>`:finished?` <span>TERMINÉ</span>`:""}</div>
    </div>

    ${matchFlowHTML({home,away,score,pick,fixture,homeLogo,awayLogo})}

    <section class="prono-detail-section">
      <div class="prono-detail-section-title">BUTEURS PRONOSTIQUÉS <small>(VALIDATION BSD STRICTE)</small></div>
      <div class="prono-detail-scorers">
        ${scorerRows.length?scorerRows.map(x=>`
          <div class="prono-detail-scorer ${x.state}">
            <span>${x.state==="ok"?"✓":x.state==="ko"?"✕":"•"}</span>
            <b>${escapeHTML(x.name)}</b>
            <em>${x.state==="ok"?"A marqué":x.state==="ko"?"N’a pas marqué":x.state==="waiting"?"Vérification en attente":live?"Match en cours":"Match à venir"}</em>
          </div>`).join(""):`<div class="prono-no-scorer">Aucun buteur sélectionné.</div>`}
      </div>
    </section>

    <section class="prono-detail-section">
      <div class="prono-detail-section-title">MON ANALYSE</div>
      <p class="prono-analysis-text">${analysis?escapeHTML(analysis):"Aucune analyse renseignée pour ce match."}</p>
    </section>

    <section class="prono-detail-stats">
      <div><small>PRONO 1/N/2</small><strong class="${finished&&actual?(pickGood?"ok":"ko"):""}">${finished&&actual?(pickGood?"✓ BON":"✕ RATÉ"):live?"LIVE":"—"}</strong><span>${escapeHTML(pick||"—")} choisi</span></div>
      <div><small>BONS BUTEURS</small><strong>${checkedScorers?`${goodScorers} / ${scorerRows.length}`:"—"}</strong><span>${fixture.scorersVerified?"Vérification BSD":"En attente"}</span></div>
      <div><small>SCORE EXACT</small><strong class="${finished?(exact?"ok":"ko"):""}">${finished?(exact?"✓ OUI":"✕ NON"):"—"}</strong><span>${finished&&real?escapeHTML(real)+" réel":live&&real?escapeHTML(real)+" en cours":"En attente"}</span></div>
    </section>`;
  panel.hidden=false;
  document.body.classList.add("prono-panel-open");
  $(".prono-detail-close",panel)?.focus();
}


function dayAfterMatchHTML(pronos,dayNo){
  const day=(pronos.days||{})[String(dayNo)]||{};
  const review=day.review||{};
  const hasSummary=String(review.summary||"").trim();
  const hasGoodPronos=review.goodPronos!==undefined && review.goodPronos!==null && String(review.goodPronos)!=="";
  const hasGoodScorers=review.goodScorers!==undefined && review.goodScorers!==null && String(review.goodScorers)!=="";
  if(!hasSummary && !hasGoodPronos && !hasGoodScorers) return "";

  return `<section class="after-match-public">
    <div class="after-match-public-head">
      <div><small>BILAN FOOTIX</small><h3>Après-match · Journée ${String(dayNo).padStart(2,"0")}</h3></div>
      <span>✓ DÉBRIEF</span>
    </div>
    <div class="after-match-public-body">
      <div class="after-match-public-stats">
        <div><small>BONS PRONOS</small><strong>${hasGoodPronos?escapeHTML(review.goodPronos)+(review.judgedPronos?` / ${escapeHTML(review.judgedPronos)}`:""):"—"}</strong></div>
        <div><small>BONS BUTEURS</small><strong>${hasGoodScorers?escapeHTML(review.goodScorers)+(review.scorerPredictions?` / ${escapeHTML(review.scorerPredictions)}`:""):"—"}</strong></div>
      </div>
      <div class="after-match-public-analysis">
        <small>ANALYSE DE LA JOURNÉE</small>
        <p>${hasSummary?escapeHTML(review.summary):"Aucune analyse après-match renseignée."}</p>
      </div>
    </div>
  </section>`;
}


function renderMustWatch(day,pronos){
  const box=$("#l1-must-watch");
  if(!box) return;

  const dayData=((pronos.days||{})[String(day?.journee)]||{});
  const selected=Array.isArray(dayData.mustWatch) ? dayData.mustWatch : [];
  const matches=day?.matches||[];

  const chosen=selected.map(key=>{
    const found=matches.find(m=>`${m[0]}|||${m[1]}`===key);
    return found ? {home:found[0],away:found[1],fixture:found[2]||{}} : null;
  }).filter(Boolean);

  if(!chosen.length){
    box.innerHTML=`<b>Aucune rencontre sélectionnée.</b>
      <p>Footix n’a pas encore choisi son ou ses matchs à ne pas manquer pour cette journée.</p>`;
    return;
  }

  box.innerHTML=chosen.map((m,index)=>{
    const meta=fmtDayMeta(m.fixture);
    return `<div class="must-watch-manual-item">
      <b>🔥 ${escapeHTML(m.home)} – ${escapeHTML(m.away)}</b>
      <p>${meta?escapeHTML(meta)+" · ":""}${chosen.length>1?`Sélection Footix n°${index+1}`:"La sélection Footix de cette journée."}</p>
    </div>`;
  }).join("");
}


function deriveStandingsFromSchedule(schedule){
  const table=new Map();
  const ensure=name=>{
    if(!table.has(name)) table.set(name,{club:name,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0,last5:[]});
    return table.get(name);
  };
  (schedule||[]).forEach(day=>{
    (day.matches||[]).forEach(m=>{
      const home=m[0], away=m[1], f=m[2]||{};
      if(!f.completed) return;
      const hs=Number(f.homeScore), as=Number(f.awayScore);
      if(!Number.isFinite(hs)||!Number.isFinite(as)) return;
      const h=ensure(home), a=ensure(away);
      h.p++; a.p++; h.gf+=hs; h.ga+=as; a.gf+=as; a.ga+=hs;
      if(hs>as){ h.w++; h.pts+=3; a.l++; }
      else if(hs<as){ a.w++; a.pts+=3; h.l++; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    });
  });
  return [...table.values()];
}
function safeLigue1Standings(standing,schedule,bsdStandings){
  const bsdTeams=competitionStandings(bsdStandings,6);
  if(bsdTeams.length) return bsdTeams;
  const apiTeams=Array.isArray(standing?.teams)?standing.teams:[];
  const apiPlayed=apiTeams.reduce((sum,t)=>sum+(Number(t.p)||0),0);
  const derived=deriveStandingsFromSchedule(schedule);
  const derivedPlayed=derived.reduce((sum,t)=>sum+(Number(t.p)||0),0);
  if(apiPlayed===0 && derivedPlayed>0) return derived;
  return apiTeams.length ? apiTeams : derived;
}

async function initLigue1(){
  if(!$("#l1-day-tabs")) return;
  let [schedule,standing,pronos,clubmap,mercato,liveData,bsdStanding] = await Promise.all([
    getJSON("schedule.json"),getJSON("standings.json").catch(()=>({teams:[]})),
    getJSON("pronos.json").catch(()=>({days:{}})),clubs(),getJSON("mercato.json").catch(()=>({items:[]})),
    getJSON("live-results.json").catch(()=>({events:[]})),getJSON("bsd-standings.json").catch(()=>({leagues:{}}))
  ]);

  let current = Number(localStorage.getItem("footix-l1-day")||1);
  if(!schedule.some(d=>d.journee===current)) current=1;
  const tabs=$("#l1-day-tabs");
  schedule.forEach(d=>{
    const b=document.createElement("button");
    b.textContent="J"+String(d.journee).padStart(2,"0");
    b.className=d.journee===current?"active":"";
    b.onclick=()=>{current=d.journee;localStorage.setItem("footix-l1-day",current);render();};
    tabs.appendChild(b);
  });

  function effectiveFixture(m){
    const raw=m[2]||{};
    return mergeFixtureData(raw,liveEventFor(liveData,6,m[0],m[1],raw));
  }
  function renderStandings(){
    const base=safeLigue1Standings(standing,schedule,bsdStanding);
    const teams=applyLiveToStandings(base,liveData,6);
    const hasLive=liveEvents(liveData,6).some(e=>e.live&&!e.completed);
    const status=$("#l1-standings-status");
    if(status){status.textContent=hasLive?"🔴 LIVE PROVISOIRE":"BSD · officiel";status.classList.toggle("live-standing",hasLive);}
    $("#l1-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
      teams.map((t,i)=>`<div class="stand-row ${t.live?"is-live-team":""}"><span>${i+1}</span><span class="stand-team">${clubLogo(t.club,clubmap)}${escapeHTML(t.club)}${t.live?'<i class="live-dot">LIVE</i>':''}</span><span>${Number(t.p)||0}</span><span>${(Number(t.gf)-Number(t.ga))>0?"+":""}${(Number(t.gf)||0)-(Number(t.ga)||0)}</span><strong>${Number(t.pts)||0}</strong></div>`).join("");
  }
  function render(){
    $$("#l1-day-tabs button").forEach((b,i)=>b.classList.toggle("active",schedule[i].journee===current));
    const day=schedule.find(d=>d.journee===current);
    updateLigue1HeaderClock();
    renderMustWatch(day,pronos);
    const sorted=(day?.matches||[]).slice().sort(matchSort);
    $("#l1-match-list").innerHTML=sorted.map((m,i)=>{
      const p=pronoForMatch(pronos,current,m[0],m[1],i);
      const pick=normalizePick(p.pick), score=p.score||p.scorePrevu||"—", f=withLegacyScorers(effectiveFixture(m),current,m[0],m[1]);
      return `<article class="match-row-live ${f.live?"is-live":f.completed?"is-finished":""}">
        <div class="live-card-meta"><span>${escapeHTML(fmtDayMeta(m[2]||{})||"Horaire à confirmer")}</span>${f.live?`<b>🔴 LIVE${f.minute!=null?` ${f.minute}’`:""}</b>`:f.completed?"<b>TERMINÉ</b>":""}</div>
        ${matchFlowHTML({home:m[0],away:m[1],score,pick,fixture:f,homeLogo:clubLogo(m[0],clubmap),awayLogo:clubLogo(m[1],clubmap)})}
        <div class="live-card-bottom"><div class="scorers-zone"><small>BUTEURS PRONOSTIQUÉS</small>${scorerChipsHTML(p,f)}</div><button class="analysis-btn prono-open-btn" type="button" data-prono-index="${i}"><span class="prono-btn-icon">◉</span><span class="prono-btn-label">ANALYSE DU MATCH</span></button></div>
      </article>`;
    }).join("") || `<div class="empty-state">Aucun match disponible.</div>`;

    let after=$("#l1-after-match");
    if(!after){after=document.createElement("div");after.id="l1-after-match";$("#l1-match-list").insertAdjacentElement("afterend",after);}
    after.innerHTML=dayAfterMatchHTML(pronos,current);
    $$("#l1-match-list .prono-open-btn").forEach(btn=>btn.addEventListener("click",()=>{
      const idx=Number(btn.dataset.pronoIndex),m=sorted[idx];if(!m)return;
      const p=pronoForMatch(pronos,current,m[0],m[1],idx),f=withLegacyScorers(effectiveFixture(m),current,m[0],m[1]);
      openPronoPanel({home:m[0],away:m[1],homeLogo:clubLogo(m[0],clubmap),awayLogo:clubLogo(m[1],clubmap),meta:fmtDayMeta(m[2]||{}),score:p.score||p.scorePrevu||"—",pick:normalizePick(p.pick),analysis:p.analyse||p.analysis||"",fixture:f,p});
    }));
    renderStandings();
  }
  render();

  const news=mercato.items||[];
  $("#mercato-list").innerHTML=news.length ? news.slice(0,5).map(n=>`<a class="news-item" href="${n.link||"#"}" target="_blank" rel="noopener"><span>✓</span><div><b>${n.title||"Info mercato"}</b><small>${n.source||"Actualité"}</small></div></a>`).join("") : `<div class="empty-state">Aucune actualité mercato pour le moment.</div>`;

  let judged=0,wins=0;
  schedule.forEach(day=>{(day.matches||[]).forEach((m,i)=>{const p=pronoForMatch(pronos,day.journee,m[0],m[1],i);const pick=normalizePick(p.pick);const actual=resultFromFixture(effectiveFixture(m));if(pick&&actual){judged++;if(pick===actual)wins++;}});});
  const rate=judged?Math.round((wins/judged)*100):null;
  if($("#l1-prono-wins")) $("#l1-prono-wins").textContent=wins;
  if($("#l1-prono-played")) $("#l1-prono-played").textContent=judged;
  if($("#l1-prono-rate")) $("#l1-prono-rate").textContent=rate===null?"—":rate+"%";

  // Le navigateur relit les JSON chaque minute. GitHub Actions vise une mise à jour toutes les 5 min.
  setInterval(async()=>{
    try{
      const [freshSchedule,freshLive,freshBsd]=await Promise.all([getJSON("schedule.json"),getJSON("live-results.json").catch(()=>liveData),getJSON("bsd-standings.json").catch(()=>bsdStanding)]);
      schedule=freshSchedule;liveData=freshLive;bsdStanding=freshBsd;render();
    }catch(e){console.warn("Footix Live: actualisation différée",e);}
  },60000);
}
async function initUCL(){
  if(!$("#ucl-day-tabs")) return;
  let [d,uclPronos,liveData,bsdStanding]=await Promise.all([
    getJSON("champions.json"),getJSON("champions-pronos.json").catch(()=>({days:{}})),
    getJSON("live-results.json").catch(()=>({events:[]})),getJSON("bsd-standings.json").catch(()=>({leagues:{}}))
  ]);
  const byName=Object.fromEntries(d.teams.map(t=>[t.club,t]));
  let current=1;
  function logoFor(name,klass="ucl-logo"){
    const t=byName[name]||{abbr:(name||"?").slice(0,3).toUpperCase(),logo:""};
    return imageWithFallback(t.logo,t.abbr,klass);
  }
  d.matchdays.forEach((md,i)=>{
    const b=document.createElement("button");b.textContent=md.label;b.className=i===0?"active":"";
    b.onclick=()=>{current=md.day;$$("#ucl-day-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");showDay(md);};
    $("#ucl-day-tabs").appendChild(b);
  });
  function fixtureFor(m){
    const meta={date:m.date||""};
    return mergeFixtureData({},liveEventFor(liveData,7,m.home,m.away,meta));
  }
  function showDay(md){
    const day=(uclPronos.days||{})[String(md.day)]||{};
    const matches=day.matches||[];
    if(!matches.length){$("#ucl-day-content").innerHTML=`<div class="ucl-coming"><span>✦</span><div><b>${md.label} · ${md.window}</b><p>Les rencontres seront affichées ici dès qu’elles seront ajoutées depuis l’Admin ou publiées officiellement.</p></div><em>CALENDRIER À VENIR</em></div>`;return;}
    $("#ucl-day-content").innerHTML=`<div class="ucl-public-match-list live-ucl-list">${matches.map((m,i)=>{
      const f=fixtureFor(m),pick=normalizePick(m.pick),score=m.score||m.scorePrevu||"—";
      return `<article class="match-row-live ucl-live-card ${f.live?"is-live":f.completed?"is-finished":""}">
        <div class="live-card-meta"><span>${escapeHTML(m.date||"")}${m.date&&m.time?" · ":""}${escapeHTML(m.time||"")}</span>${f.live?`<b>🔴 LIVE${f.minute!=null?` ${f.minute}’`:""}</b>`:f.completed?"<b>TERMINÉ</b>":""}</div>
        ${matchFlowHTML({home:m.home||"À déterminer",away:m.away||"À déterminer",score,pick,fixture:f,homeLogo:logoFor(m.home,"flow-club-logo"),awayLogo:logoFor(m.away,"flow-club-logo")})}
        <div class="live-card-bottom"><div class="scorers-zone"><small>BUTEURS PRONOSTIQUÉS</small>${scorerChipsHTML(m,f)}</div><button class="analysis-btn prono-open-btn ucl-analysis-open" type="button" data-ucl-index="${i}"><span class="prono-btn-icon">◉</span><span class="prono-btn-label">ANALYSE DU MATCH</span></button></div>
      </article>`;
    }).join("")}</div>`;
    $$("#ucl-day-content .ucl-analysis-open").forEach(btn=>btn.addEventListener("click",()=>{
      const m=matches[Number(btn.dataset.uclIndex)];if(!m)return;const f=fixtureFor(m);
      openPronoPanel({home:m.home,away:m.away,homeLogo:logoFor(m.home,"ucl-match-logo"),awayLogo:logoFor(m.away,"ucl-match-logo"),meta:[m.date,m.time].filter(Boolean).join(" · "),score:m.score||m.scorePrevu||"—",pick:normalizePick(m.pick),analysis:m.analyse||m.analysis||"",fixture:f,p:m});
    }));
  }
  function renderUclStandings(){
    let base=competitionStandings(bsdStanding,7);
    if(!base.length) base=d.teams.map(t=>({club:t.club,p:t.p||0,w:t.w||0,d:t.d||0,l:t.l||0,gf:t.gf||0,ga:t.ga||0,pts:t.pts||0}));
    const teams=applyLiveToStandings(base,liveData,7);
    const hasLive=liveEvents(liveData,7).some(e=>e.live&&!e.completed);
    const status=$("#ucl-standings-status");if(status){status.textContent=hasLive?"🔴 LIVE PROVISOIRE":"BSD · officiel";status.classList.toggle("live-standing",hasLive);}
    $("#ucl-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
      teams.map((t,i)=>`<div class="stand-row ${i<8?"direct":i<24?"playoff":"out"} ${t.live?"is-live-team":""}"><span>${i+1}</span><span class="stand-team">${logoFor(t.club,"ucl-mini-logo")}${escapeHTML(t.club)}${t.live?'<i class="live-dot">LIVE</i>':''}</span><span>${Number(t.p)||0}</span><span>${(Number(t.gf)-Number(t.ga))>0?"+":""}${(Number(t.gf)||0)-(Number(t.ga)||0)}</span><strong>${Number(t.pts)||0}</strong></div>`).join("");
  }
  showDay(d.matchdays[0]);
  const select=$("#ucl-team-select");select.innerHTML=d.teams.map(t=>`<option value="${t.club}">${t.club}</option>`).join("");
  function opponentCard(name,side){const t=byName[name]||{club:name,abbr:name.slice(0,3).toUpperCase(),logo:"",color:"#355f8f"};return `<div class="draw-opponent">${imageWithFallback(t.logo,t.abbr,"draw-logo")}<div><b>${t.club}</b><small>${side}</small></div></div>`;}
  function renderDraw(name){const t=byName[name];if(!t)return;$("#ucl-draw-detail").innerHTML=`<div class="draw-team-main">${imageWithFallback(t.logo,t.abbr,"draw-main-logo")}<div><small>ÉQUIPE SÉLECTIONNÉE</small><strong>${t.club}</strong><span>${t.country}</span></div></div><div class="draw-side"><h4>🏠 À DOMICILE</h4>${t.draw.home.map(x=>opponentCard(x,"Domicile")).join("")}</div><div class="draw-side"><h4>✈ À L’EXTÉRIEUR</h4>${t.draw.away.map(x=>opponentCard(x,"Extérieur")).join("")}</div>`;}
  select.addEventListener("change",()=>renderDraw(select.value));renderDraw(select.value);
  $("#ucl-teams").innerHTML=d.teams.map(t=>`<button type="button" class="ucl-team-card" data-team="${t.club}">${imageWithFallback(t.logo,t.abbr,"ucl-logo")}<div><b>${t.club}</b><small>${t.country}</small></div></button>`).join("");
  $$("#ucl-teams .ucl-team-card").forEach(btn=>btn.addEventListener("click",()=>{select.value=btn.dataset.team;renderDraw(btn.dataset.team);$("#ucl-team-select").scrollIntoView({behavior:"smooth",block:"center"});}));
  renderUclStandings();
  $("#knockout-tree").innerHTML=d.knockout.map((r,i)=>`<div class="round-card"><small>${String(i+1).padStart(2,"0")}</small><b>${r.round}</b><span>${r.dates}</span><em>${i<4?"Équipes à déterminer":"🏆"}</em></div>`).join("");
  setInterval(async()=>{try{[liveData,bsdStanding]=await Promise.all([getJSON("live-results.json").catch(()=>liveData),getJSON("bsd-standings.json").catch(()=>bsdStanding)]);const md=d.matchdays.find(x=>x.day===current)||d.matchdays[0];showDay(md);renderUclStandings();}catch(e){console.warn("Footix UCL Live: actualisation différée",e);}},60000);
}
async function initHomePronoCount(){
  const el=$("#home-pronos");
  if(!el) return;
  try{
    const [schedule,pronos,uclPronos]=await Promise.all([
      getJSON("schedule.json").catch(()=>[]),
      getJSON("pronos.json").catch(()=>({days:{}})),
      getJSON("champions-pronos.json").catch(()=>({days:{}}))
    ]);

    let total=0;

    // Ligue 1 : compte uniquement les matchs ayant réellement un prono saisi.
    (schedule||[]).forEach(day=>{
      (day.matches||[]).forEach((m,i)=>{
        const p=pronoForMatch(pronos,day.journee,m[0],m[1],i)||{};
        const hasProno=Boolean(
          normalizePick(p.pick) ||
          String(p.score||p.scorePrevu||"").trim() ||
          String(p.analyse||p.analysis||"").trim() ||
          (Array.isArray(p.scorers)&&p.scorers.length) ||
          String(p.buteurs||"").trim()
        );
        if(hasProno) total++;
      });
    });

    // Ligue des Champions : compte les pronostics déjà renseignés dans le JSON.
    Object.values((uclPronos&&uclPronos.days)||{}).forEach(day=>{
      if(!day || typeof day!=="object") return;
      Object.entries(day).forEach(([key,p])=>{
        if(key==="review" || !p || typeof p!=="object") return;
        const hasProno=Boolean(
          normalizePick(p.pick) ||
          String(p.score||p.scorePrevu||"").trim() ||
          String(p.analyse||p.analysis||"").trim() ||
          (Array.isArray(p.scorers)&&p.scorers.length) ||
          String(p.buteurs||"").trim()
        );
        if(hasProno) total++;
      });
    });

    el.textContent=total.toLocaleString("fr-FR");
  }catch(e){
    el.textContent="—";
  }
}

async function initVisitorCounter(){
  const targets=["#home-visits"].map(s=>$(s)).filter(Boolean);
  if(!targets.length) return;
  try{
    const r=await fetch("https://countapi.mileshilliard.com/api/v1/hit/footixprono-etezx-home-2026",{cache:"no-store"});
    if(!r.ok) throw 0;
    const d=await r.json(), v=Number(d.value);
    const text=Number.isFinite(v)?v.toLocaleString("fr-FR"):"—";
    targets.forEach(el=>el.textContent=text);
  }catch(e){ targets.forEach(el=>el.textContent="—"); }
}
initVisitorCounter(); initHomePronoCount(); initLigue1().catch(console.error); initUCL().catch(console.error);
