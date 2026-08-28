
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

let clubsCache=null;
async function getJSON(url){ const r=await fetch(url+"?v=8.0",{cache:"no-store"}); if(!r.ok) throw new Error(url); return r.json(); }
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
async function initLigue1(){
  if(!$("#l1-day-tabs")) return;
  const [schedule,standing,pronos,clubmap,mercato] = await Promise.all([
    getJSON("schedule.json"),getJSON("standings.json"),getJSON("pronos.json").catch(()=>({days:{}})),clubs(),getJSON("mercato.json").catch(()=>({items:[]}))
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
    const pday=(pronos.days||{})[String(current)]||(pronos.days||{})[current]||{};
    const plist=pday.matches||pday;
    $("#l1-match-list").innerHTML=(day?.matches||[]).slice().sort(matchSort).map((m,i)=>{
      const p=Array.isArray(plist)?(plist[i]||{}):(plist?.[i]||{});
      const score=p.score||p.scorePrevu||"—";
      const pr=p.prono||p.cote||"—";
      const scorers=p.buteurs||p.buteur||"—";
      const analysis=p.analyse||p.analysis||"";
      return `<article class="match-row">
        <div class="match-meta">${fmtDayMeta(m[2])||"Horaire à confirmer"}</div>
        <div class="team home">${clubLogo(m[0],clubmap)}<span>${m[0]}</span></div>
        <div class="prediction-score">${score}</div>
        <div class="team away">${clubLogo(m[1],clubmap)}<span>${m[1]}</span></div>
        <div class="match-extra"><span><small>PRONO FOOTIX</small><b>${pr}</b></span><span><small>BUTEURS</small><b>${scorers}</b></span><button class="analysis-btn" title="${analysis.replace(/"/g,'&quot;')}">⌁</button></div>
      </article>`;
    }).join("") || `<div class="empty-state">Aucun match disponible.</div>`;
  }
  render();

  const teams=(standing.teams||[]).slice().sort((a,b)=>(b.pts-a.pts)||((b.gf-b.ga)-(a.gf-a.ga))||(b.gf-a.gf));
  $("#l1-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
  teams.map((t,i)=>`<div class="stand-row"><span>${i+1}</span><span class="stand-team">${clubLogo(t.club,clubmap)}${t.club}</span><span>${t.p}</span><span>${(t.gf-t.ga)>0?"+":""}${t.gf-t.ga}</span><strong>${t.pts}</strong></div>`).join("");

  const news=mercato.items||[];
  $("#mercato-list").innerHTML=news.length ? news.slice(0,5).map(n=>`<a class="news-item" href="${n.link||"#"}" target="_blank" rel="noopener"><span>✓</span><div><b>${n.title||"Info mercato"}</b><small>${n.source||"Actualité"}</small></div></a>`).join("") : `<div class="empty-state">Aucune actualité mercato pour le moment.</div>`;
  let count=0; Object.values(pronos.days||{}).forEach(d=>{ const x=d.matches||d; if(Array.isArray(x)) count+=x.filter(p=>p&&Object.keys(p).length).length;});
  if($("#l1-prono-count")) $("#l1-prono-count").textContent=count;
}
async function initUCL(){
  if(!$("#ucl-day-tabs")) return;
  const d=await getJSON("champions.json");
  d.matchdays.forEach((md,i)=>{
    const b=document.createElement("button"); b.textContent=md.label; b.className=i===0?"active":"";
    b.onclick=()=>{$$("#ucl-day-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");show(md);};
    $("#ucl-day-tabs").appendChild(b);
  });
  function show(md){ $("#ucl-day-content").innerHTML=`<div class="ucl-coming"><span>✦</span><div><b>${md.label} · ${md.window}</b><p>Les affiches seront automatiquement rangées ici dès la publication du calendrier officiel.</p></div><em>À VENIR</em></div>`;}
  show(d.matchdays[0]);
  $("#ucl-teams").innerHTML=d.teams.map(t=>`<div class="ucl-team-card"><span class="ucl-badge" style="--club:${t.color}">${t.abbr}</span><div><b>${t.club}</b><small>${t.country}</small></div></div>`).join("");
  $("#ucl-standings").innerHTML=`<div class="stand-head"><span>#</span><span>ÉQUIPE</span><span>J</span><span>DIFF</span><span>PTS</span></div>`+
  d.teams.map((t,i)=>`<div class="stand-row ${i<8?"direct":i<24?"playoff":"out"}"><span>${i+1}</span><span class="stand-team"><span class="ucl-mini" style="--club:${t.color}">${t.abbr}</span>${t.club}</span><span>0</span><span>0</span><strong>0</strong></div>`).join("");
  $("#knockout-tree").innerHTML=d.knockout.map((r,i)=>`<div class="round-card"><small>${String(i+1).padStart(2,"0")}</small><b>${r.round}</b><span>${r.dates}</span><em>${i<4?"Équipes à déterminer":"🏆"}</em></div>`).join("");
}
async function initVisitorCounter(){
  const el=$("#visitor-count"); if(!el) return;
  try{
    const r=await fetch("https://countapi.mileshilliard.com/api/v1/hit/footixprono-etezx-home-2026",{cache:"no-store"});
    if(!r.ok) throw 0; const d=await r.json(); const v=Number(d.value);
    el.textContent=Number.isFinite(v)?v.toLocaleString("fr-FR"):"—";
    ["#home-visits","#l1-visitor-copy"].forEach(s=>{if($(s))$(s).textContent=el.textContent;});
  }catch(e){ el.textContent="—"; }
}
initVisitorCounter(); initLigue1().catch(console.error); initUCL().catch(console.error);
