
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

let clubsCache=null;
async function getJSON(url){ const r=await fetch(url+"?v=8.2.3",{cache:"no-store"}); if(!r.ok) throw new Error(url); return r.json(); }
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

    const sorted=(day?.matches||[]).slice().sort(matchSort);
    $("#l1-match-list").innerHTML=sorted.map((m,i)=>{
      const p=pronoForMatch(pronos,current,m[0],m[1],i);
      const pick=normalizePick(p.pick);
      const score=p.score||p.scorePrevu||"—";
      const scorers=p.buteurs||p.buteur||"—";
      const analysis=p.analyse||p.analysis||"";
      const f=m[2]||{};
      const actual=resultFromFixture(f);
      const real=f.completed && Number.isFinite(Number(f.homeScore)) && Number.isFinite(Number(f.awayScore))
        ? `${f.homeScore} - ${f.awayScore}` : null;
      const pickGood=Boolean(pick&&actual&&pick===actual);
      const exactScore=Boolean(real && String(score).replace(/\s/g,"")===real.replace(/\s/g,""));
      const verdict=f.completed && actual
        ? `<span class="final-verdict ${pickGood?"ok":"ko"}">${pickGood?"✓ BON PRONO":"✕ PRONO RATÉ"}${pick?` · ${pick}`:""}</span>`
        : "";
      const exactBadge=f.completed && real && score!=="—"
        ? `<span class="exact-score ${exactScore?"ok":"muted"}">${exactScore?"✓ SCORE EXACT":"Score prévu · "+score}</span>`
        : "";

      return `<article class="match-row ${f.completed?"is-finished":""}">
        <div class="match-meta">
          <span>${fmtDayMeta(f)||"Horaire à confirmer"}</span>
          ${f.completed&&real?`<div class="final-result"><small>TERMINÉ</small><strong>FINAL · ${real}</strong></div>`:""}
        </div>
        <div class="team home">${clubLogo(m[0],clubmap)}<span>${m[0]}</span></div>
        <div class="prediction-score">${score}</div>
        <div class="team away">${clubLogo(m[1],clubmap)}<span>${m[1]}</span></div>
        <div class="match-extra">
          <span><small>PRONO 1/N/2</small><b>${pick||"—"}</b>${verdict}</span>
          <span><small>BUTEURS</small><b>${scorers}</b>${exactBadge}</span>
          <button class="analysis-btn" title="${analysis.replace(/"/g,'&quot;')}">⌁</button>
        </div>
      </article>`;
    }).join("") || `<div class="empty-state">Aucun match disponible.</div>`;
  }
  render();

  const teams=(standing.teams||[]).slice().sort((a,b)=>(b.pts-a.pts)||((b.gf-b.ga)-(a.gf-a.ga))||(b.gf-a.gf));
  $("#l1-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
  teams.map((t,i)=>`<div class="stand-row"><span>${i+1}</span><span class="stand-team">${clubLogo(t.club,clubmap)}${t.club}</span><span>${t.p}</span><span>${(t.gf-t.ga)>0?"+":""}${t.gf-t.ga}</span><strong>${t.pts}</strong></div>`).join("");

  const news=mercato.items||[];
  $("#mercato-list").innerHTML=news.length ? news.slice(0,5).map(n=>`<a class="news-item" href="${n.link||"#"}" target="_blank" rel="noopener"><span>✓</span><div><b>${n.title||"Info mercato"}</b><small>${n.source||"Actualité"}</small></div></a>`).join("") : `<div class="empty-state">Aucune actualité mercato pour le moment.</div>`;

  // Automatic 1/N/2 statistics from completed fixtures.
  let judged=0,wins=0,goodScorers=0;
  schedule.forEach(day=>{
    (day.matches||[]).forEach((m,i)=>{
      const pick=normalizePick(pronoForMatch(pronos,day.journee,m[0],m[1],i).pick);
      const actual=resultFromFixture(m[2]||{});
      if(pick && actual){ judged++; if(pick===actual) wins++; }
    });
    const review=(pronos.days||{})[String(day.journee)]?.review;
    const n=Number(review?.goodScorers);
    if(Number.isFinite(n)) goodScorers+=n;
  });
  const rate=judged ? Math.round((wins/judged)*100) : null;
  if($("#l1-prono-wins")) $("#l1-prono-wins").textContent=wins;
  if($("#l1-prono-played")) $("#l1-prono-played").textContent=judged;
  if($("#l1-prono-rate")) $("#l1-prono-rate").textContent=rate===null?"—":rate+"%";
  if($("#l1-scorer-wins")) $("#l1-scorer-wins").textContent=goodScorers;
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
initVisitorCounter(); initLigue1().catch(console.error); initUCL().catch(console.error);
