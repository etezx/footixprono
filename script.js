
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

let clubsCache=null;
async function getJSON(url){ const r=await fetch(url+"?v=8.3.1",{cache:"no-store"}); if(!r.ok) throw new Error(url); return r.json(); }
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
function matchSort(a,b){
  const ma=a[2]||{}, mb=b[2]||{};
  return ((ma.date||"9999")+(ma.time||"99")).localeCompare((mb.date||"9999")+(mb.time||"99"));
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
function scorerVerdicts(p={},fixture={}){
  const predicted=predictedScorers(p);
  const actual=Array.isArray(fixture.actualScorers) ? fixture.actualScorers : [];
  if(!fixture.completed) return predicted.map(name=>({name,state:"pending"}));
  if(!actual.length) return predicted.map(name=>({name,state:"waiting"}));
  const actualNorm=actual.map(normalizePersonName);
  return predicted.map(name=>{
    const n=normalizePersonName(name);
    const hit=actualNorm.some(a=>a===n || a.endsWith(" "+n) || n.endsWith(" "+a));
    return {name,state:hit?"ok":"ko"};
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
  const {
    home,away,homeLogo,awayLogo,meta,score,pick,analysis,fixture,p
  }=data;
  const actual=resultFromFixture(fixture);
  const finished=Boolean(fixture.completed);
  const real=finished && Number.isFinite(Number(fixture.homeScore)) && Number.isFinite(Number(fixture.awayScore))
    ? `${fixture.homeScore} - ${fixture.awayScore}` : null;
  const pickGood=Boolean(pick&&actual&&pick===actual);
  const exact=Boolean(real && String(score).replace(/\s/g,"")===real.replace(/\s/g,""));
  const scorerRows=scorerVerdicts(p,fixture);
  const goodScorers=scorerRows.filter(x=>x.state==="ok").length;
  const checkedScorers=scorerRows.filter(x=>["ok","ko"].includes(x.state)).length;

  body.innerHTML=`
    <div class="prono-detail-heading">
      <small>FOOTIX PRONO</small>
      <h2 id="prono-detail-title">Analyse du match</h2>
    </div>
    <div class="prono-detail-match">
      <div class="prono-detail-team">${homeLogo}<b>${escapeHTML(home)}</b></div>
      <div class="prono-detail-score"><strong>${escapeHTML(score)}</strong><small>SCORE PRÉVU</small></div>
      <div class="prono-detail-team away">${awayLogo}<b>${escapeHTML(away)}</b></div>
      <div class="prono-detail-meta">${escapeHTML(meta||"Horaire à confirmer")}${finished?` <span>TERMINÉ</span>`:""}</div>
    </div>

    <section class="prono-detail-section">
      <div class="prono-detail-section-title">MON PRONOSTIC</div>
      <div class="prono-detail-pick-row">
        <span class="prono-big-pick">${escapeHTML(pick||"—")}</span>
        ${finished&&actual?`<b class="prono-detail-verdict ${pickGood?"ok":"ko"}">${pickGood?"✓ BON PRONO":"✕ PRONO RATÉ"}</b>`:`<b class="prono-detail-verdict pending">EN ATTENTE</b>`}
        <span class="prono-detail-forecast">Score prévu : <b>${escapeHTML(score)}</b></span>
      </div>
    </section>

    <section class="prono-detail-section">
      <div class="prono-detail-section-title">BUTEURS PRONOSTIQUÉS <small>(JUSQU’À 4)</small></div>
      <div class="prono-detail-scorers">
        ${scorerRows.length?scorerRows.map(x=>`
          <div class="prono-detail-scorer ${x.state}">
            <span>${x.state==="ok"?"✓":x.state==="ko"?"✕":"•"}</span>
            <b>${escapeHTML(x.name)}</b>
            <em>${x.state==="ok"?"A marqué":x.state==="ko"?"N’a pas marqué":x.state==="waiting"?"Vérification en attente":"Match à venir"}</em>
          </div>`).join(""):`<div class="prono-no-scorer">Aucun buteur sélectionné.</div>`}
      </div>
    </section>

    ${finished&&real?`
      <section class="prono-detail-final">
        <span>SCORE FINAL</span>
        <strong>${escapeHTML(real)}</strong>
      </section>`:""}

    <section class="prono-detail-section">
      <div class="prono-detail-section-title">MON ANALYSE</div>
      <p class="prono-analysis-text">${analysis?escapeHTML(analysis):"Aucune analyse renseignée pour ce match."}</p>
    </section>

    <section class="prono-detail-stats">
      <div><small>PRONO 1/N/2</small><strong class="${finished&&actual?(pickGood?"ok":"ko"):""}">${finished&&actual?(pickGood?"✓ BON":"✕ RATÉ"):"—"}</strong><span>${escapeHTML(pick||"—")} choisi</span></div>
      <div><small>BONS BUTEURS</small><strong>${checkedScorers?`${goodScorers} / ${scorerRows.length}`:"—"}</strong><span>${checkedScorers?Math.round(goodScorers/scorerRows.length*100)+" %":"En attente"}</span></div>
      <div><small>SCORE EXACT</small><strong class="${finished?(exact?"ok":"ko"):""}">${finished?(exact?"✓ OUI":"✕ NON"):"—"}</strong><span>${finished&&real?escapeHTML(real)+" réel":"En attente"}</span></div>
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


function normalizeClubKey(name){
  return String(name||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|29)\b/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function mustWatchMatch(day,pronos,standing){
  const rows=(standing&&standing.teams)||[];
  const byClub=new Map(rows.map((t,i)=>[normalizeClubKey(t.club),{...t,rank:i+1}]));
  const prestige={
    "paris saint germain":5,
    "olympique de marseille":4.5,
    "as monaco":3.8,
    "olympique lyonnais":3.7,
    "losc":3.5,
    "rc lens":3.3,
    "stade rennais":3.0,
    "ogc nice":3.0
  };

  function teamStats(name){
    const key=normalizeClubKey(name);
    if(byClub.has(key)) return byClub.get(key);
    for(const [k,v] of byClub){
      if(k.includes(key)||key.includes(k)) return v;
    }
    return {p:0,gf:0,ga:0,pts:0,rank:99};
  }

  function scoreMatch(m,i){
    const home=m[0], away=m[1];
    const a=teamStats(home), b=teamStats(away);
    const p=pronoForMatch(pronos,day.journee,home,away,i);

    let predictedGoals=0;
    const sm=String(p.score||p.scorePrevu||"").match(/(\d+)\s*[-–:]\s*(\d+)/);
    if(sm) predictedGoals=Number(sm[1])+Number(sm[2]);

    const played=(Number(a.p)||0)+(Number(b.p)||0);
    let statisticalSpectacle=0;
    if(played>0){
      const rateA=Number(a.p)?((Number(a.gf)||0)+(Number(a.ga)||0))/Number(a.p):0;
      const rateB=Number(b.p)?((Number(b.gf)||0)+(Number(b.ga)||0))/Number(b.p):0;
      statisticalSpectacle=(rateA+rateB)*2.2;

      const rankBonus=
        Math.max(0,20-Number(a.rank||20))/20 +
        Math.max(0,20-Number(b.rank||20))/20;
      statisticalSpectacle+=rankBonus*1.4;
    }

    const prestigeBonus=
      (prestige[normalizeClubKey(home)]||0)+
      (prestige[normalizeClubKey(away)]||0);

    return {
      home,away,
      total:statisticalSpectacle + predictedGoals*1.6 + prestigeBonus*.55,
      predictedGoals,
      played
    };
  }

  return (day.matches||[])
    .map(scoreMatch)
    .sort((x,y)=>y.total-x.total)[0]||null;
}

function renderMustWatch(day,pronos,standing){
  const box=$("#l1-must-watch");
  if(!box) return;
  const pick=mustWatchMatch(day,pronos,standing);

  if(!pick){
    box.innerHTML="<b>Aucune affiche disponible.</b><p>Le calendrier de cette journée n'est pas encore renseigné.</p>";
    return;
  }

  const reason=pick.played>0
    ? "Cette affiche ressort grâce au rythme de buts des deux équipes, à leur dynamique au classement et au potentiel offensif attendu."
    : "En début de saison, Footix s'appuie surtout sur le potentiel de buts du prono et le niveau des équipes ; les statistiques réelles prendront ensuite le relais.";

  box.innerHTML=`<b>🔥 ${escapeHTML(pick.home)} – ${escapeHTML(pick.away)}</b><p>${reason}</p>`;
}


async function initLigue1(){
  if(!$("#l1-day-tabs")) return;
  const [schedule,standing,pronos,clubmap,mercato] = await Promise.all([
    getJSON("schedule.json"),getJSON("standings.json"),
    getJSON("pronos.json").catch(()=>({days:{}})),
    clubs(),getJSON("mercato.json").catch(()=>({items:[]}))
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

  function render(){
    $$("#l1-day-tabs button").forEach((b,i)=>b.classList.toggle("active",schedule[i].journee===current));
    const day=schedule.find(d=>d.journee===current);
    $("#l1-day-date").textContent=day?.date||"";
    renderMustWatch(day,pronos,standing);

    const sorted=(day?.matches||[]).slice().sort(matchSort);
    $("#l1-match-list").innerHTML=sorted.map((m,i)=>{
      const p=pronoForMatch(pronos,current,m[0],m[1],i);
      const pick=normalizePick(p.pick);
      const score=p.score||p.scorePrevu||"—";
      const analysis=p.analyse||p.analysis||"";
      const f=m[2]||{};
      const actual=resultFromFixture(f);
      const real=f.completed && Number.isFinite(Number(f.homeScore)) && Number.isFinite(Number(f.awayScore))
        ? `${f.homeScore} - ${f.awayScore}` : null;
      const pickGood=Boolean(pick&&actual&&pick===actual);
      const scorerHTML=scorerChipsHTML(p,f);

      return `<article class="match-row match-row-v831 ${f.completed?"is-finished":""}">
        <div class="match-meta">
          <span class="match-kickoff">${fmtDayMeta(f)||"Horaire à confirmer"}</span>
          ${f.completed&&real?`<span class="finished-label">TERMINÉ</span><div class="final-score-box"><small>SCORE FINAL</small><strong>${real}</strong></div>`:""}
        </div>
        <div class="team home">${clubLogo(m[0],clubmap)}<span>${m[0]}</span></div>
        <div class="prediction-score-wrap"><strong class="prediction-score">${score}</strong><small>SCORE PRÉVU</small></div>
        <div class="team away">${clubLogo(m[1],clubmap)}<span>${m[1]}</span></div>
        <div class="match-extra">
          <div class="pick-zone">
            <small>PRONO 1/N/2</small>
            <div class="pick-line">
              <strong class="pick-value pick-${(pick||"x").toLowerCase()}">${pick||"—"}</strong>
              ${f.completed&&actual?`<span class="final-verdict ${pickGood?"ok":"ko"}">${pickGood?"✓ BON PRONO":"✕ PRONO RATÉ"}</span>`:""}
            </div>
          </div>
          <div class="scorers-zone"><small>BUTEURS</small>${scorerHTML}</div>
          <button class="analysis-btn prono-open-btn" type="button" data-prono-index="${i}"><span class="prono-btn-icon">◉</span><span class="prono-btn-label">ANALYSE DU MATCH</span></button>
        </div>
      </article>`;
    }).join("") || `<div class="empty-state">Aucun match disponible.</div>`;

    let after=$("#l1-after-match");
    if(!after){
      after=document.createElement("div");
      after.id="l1-after-match";
      $("#l1-match-list").insertAdjacentElement("afterend",after);
    }
    after.innerHTML=dayAfterMatchHTML(pronos,current);

    $$("#l1-match-list .prono-open-btn").forEach(btn=>btn.addEventListener("click",()=>{
      const idx=Number(btn.dataset.pronoIndex);
      const m=sorted[idx];
      if(!m) return;
      const p=pronoForMatch(pronos,current,m[0],m[1],idx);
      openPronoPanel({
        home:m[0],away:m[1],
        homeLogo:clubLogo(m[0],clubmap),awayLogo:clubLogo(m[1],clubmap),
        meta:fmtDayMeta(m[2]||{}),
        score:p.score||p.scorePrevu||"—",
        pick:normalizePick(p.pick),
        analysis:p.analyse||p.analysis||"",
        fixture:m[2]||{},
        p
      });
    }));
  }
  render();

  const teams=(standing.teams||[]).slice().sort((a,b)=>(b.pts-a.pts)||((b.gf-b.ga)-(a.gf-a.ga))||(b.gf-a.gf));
  $("#l1-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
  teams.map((t,i)=>`<div class="stand-row"><span>${i+1}</span><span class="stand-team">${clubLogo(t.club,clubmap)}${t.club}</span><span>${t.p}</span><span>${(t.gf-t.ga)>0?"+":""}${t.gf-t.ga}</span><strong>${t.pts}</strong></div>`).join("");

  const news=mercato.items||[];
  $("#mercato-list").innerHTML=news.length ? news.slice(0,5).map(n=>`<a class="news-item" href="${n.link||"#"}" target="_blank" rel="noopener"><span>✓</span><div><b>${n.title||"Info mercato"}</b><small>${n.source||"Actualité"}</small></div></a>`).join("") : `<div class="empty-state">Aucune actualité mercato pour le moment.</div>`;

  // Statistiques Footix Ligue 1 : uniquement les pronostics 1/N/2.
  let judged=0,wins=0;
  schedule.forEach(day=>{
    (day.matches||[]).forEach((m,i)=>{
      const p=pronoForMatch(pronos,day.journee,m[0],m[1],i);
      const pick=normalizePick(p.pick);
      const actual=resultFromFixture(m[2]||{});
      if(pick && actual){ judged++; if(pick===actual) wins++; }
    });
  });
  const rate=judged ? Math.round((wins/judged)*100) : null;
  if($("#l1-prono-wins")) $("#l1-prono-wins").textContent=wins;
  if($("#l1-prono-played")) $("#l1-prono-played").textContent=judged;
  if($("#l1-prono-rate")) $("#l1-prono-rate").textContent=rate===null?"—":rate+"%";
}
async function initUCL(){
  if(!$("#ucl-day-tabs")) return;
  const [d,uclPronos]=await Promise.all([
    getJSON("champions.json"),
    getJSON("champions-pronos.json").catch(()=>({days:{}}))
  ]);
  const byName=Object.fromEntries(d.teams.map(t=>[t.club,t]));
  let current=1;

  function logoFor(name,klass="ucl-logo"){
    const t=byName[name]||{abbr:(name||"?").slice(0,3).toUpperCase(),logo:""};
    return imageWithFallback(t.logo,t.abbr,klass);
  }

  d.matchdays.forEach((md,i)=>{
    const b=document.createElement("button");
    b.textContent=md.label;
    b.className=i===0?"active":"";
    b.onclick=()=>{
      current=md.day;
      $$("#ucl-day-tabs button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      showDay(md);
    };
    $("#ucl-day-tabs").appendChild(b);
  });

  function showDay(md){
    const day=(uclPronos.days||{})[String(md.day)]||{};
    const matches=day.matches||[];
    if(!matches.length){
      $("#ucl-day-content").innerHTML=`<div class="ucl-coming"><span>✦</span><div><b>${md.label} · ${md.window}</b><p>Les rencontres seront affichées ici dès qu’elles seront ajoutées depuis l’Admin ou publiées officiellement.</p></div><em>CALENDRIER À VENIR</em></div>`;
      return;
    }
    $("#ucl-day-content").innerHTML=`<div class="ucl-public-match-list">${matches.map((m,i)=>`
      <article class="ucl-public-match">
        <div class="ucl-public-date">${m.date||m.time?`${m.date||""}${m.date&&m.time?" · ":""}${m.time||""}`:"Horaire à confirmer"}</div>
        <div class="ucl-public-teams">
          <span>${logoFor(m.home,"ucl-match-logo")}<b>${m.home||"À déterminer"}</b></span>
          <strong>${m.score||"—"}</strong>
          <span>${logoFor(m.away,"ucl-match-logo")}<b>${m.away||"À déterminer"}</b></span>
        </div>
        <div class="ucl-public-extra">
          <span><small>PRONO</small><b>${m.pick||"—"}</b></span>
          <span><small>BUTEURS</small><b>${m.buteurs||"—"}</b></span>
          <span><small>ANALYSE</small><b>${m.analyse||"À venir"}</b></span>
        </div>
      </article>`).join("")}</div>`;
  }
  showDay(d.matchdays[0]);

  const select=$("#ucl-team-select");
  select.innerHTML=d.teams.map(t=>`<option value="${t.club}">${t.club}</option>`).join("");

  function opponentCard(name,side){
    const t=byName[name]||{club:name,abbr:name.slice(0,3).toUpperCase(),logo:"",color:"#355f8f"};
    return `<div class="draw-opponent">
      ${imageWithFallback(t.logo,t.abbr,"draw-logo")}
      <div><b>${t.club}</b><small>${side}</small></div>
    </div>`;
  }
  function renderDraw(name){
    const t=byName[name]; if(!t) return;
    $("#ucl-draw-detail").innerHTML=`
      <div class="draw-team-main">
        ${imageWithFallback(t.logo,t.abbr,"draw-main-logo")}
        <div><small>ÉQUIPE SÉLECTIONNÉE</small><strong>${t.club}</strong><span>${t.country}</span></div>
      </div>
      <div class="draw-side"><h4>🏠 À DOMICILE</h4>${t.draw.home.map(x=>opponentCard(x,"Domicile")).join("")}</div>
      <div class="draw-side"><h4>✈ À L’EXTÉRIEUR</h4>${t.draw.away.map(x=>opponentCard(x,"Extérieur")).join("")}</div>`;
  }
  select.addEventListener("change",()=>renderDraw(select.value));
  renderDraw(select.value);

  $("#ucl-teams").innerHTML=d.teams.map(t=>`<button type="button" class="ucl-team-card" data-team="${t.club}">
    ${imageWithFallback(t.logo,t.abbr,"ucl-logo")}
    <div><b>${t.club}</b><small>${t.country}</small></div>
  </button>`).join("");
  $$("#ucl-teams .ucl-team-card").forEach(btn=>btn.addEventListener("click",()=>{
    select.value=btn.dataset.team;
    renderDraw(btn.dataset.team);
    $("#ucl-team-select").scrollIntoView({behavior:"smooth",block:"center"});
  }));

  $("#ucl-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
  d.teams.map((t,i)=>`<div class="stand-row ${i<8?"direct":i<24?"playoff":"out"}"><span>${i+1}</span><span class="stand-team">${imageWithFallback(t.logo,t.abbr,"ucl-mini-logo")}${t.club}</span><span>${t.p||0}</span><span>${(t.gf||0)-(t.ga||0)}</span><strong>${t.pts||0}</strong></div>`).join("");

  $("#knockout-tree").innerHTML=d.knockout.map((r,i)=>`<div class="round-card"><small>${String(i+1).padStart(2,"0")}</small><b>${r.round}</b><span>${r.dates}</span><em>${i<4?"Équipes à déterminer":"🏆"}</em></div>`).join("");
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
