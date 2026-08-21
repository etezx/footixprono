let schedule = [];
let pronos = {days:{}};
let activeDay = 1;
let clubAssets = {league_logo:'', clubs:{}, colors:{}};
let standingsLogoMap = {};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function matchKey(home, away){ return `${home}|||${away}`; }
function clubLogo(name){ return standingsLogoMap[name] || clubAssets.clubs?.[name] || ''; }
function clubColor(name){ return clubAssets.colors?.[name] || '#3982ff'; }
function initials(name){ return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
function clubWithLogo(name){
  const logo=clubLogo(name), color=clubColor(name);
  return `<span class="club-inline" style="--club:${color}"><span class="club-badge"><span class="club-fallback">${escapeHtml(initials(name))}</span>${logo?`<img class="club-logo" src="${logo}" alt="Logo ${escapeHtml(name)}" loading="lazy">`:''}</span><span>${escapeHtml(name)}</span></span>`;
}

async function loadSchedule(){
  const [scheduleRes, pronosRes, assetsRes, standingsRes] = await Promise.all([
    fetch('schedule.json', {cache:'no-store'}),
    fetch(`pronos.json?t=${Date.now()}`, {cache:'no-store'}).catch(()=>null),
    fetch(`clubs.json?t=${Date.now()}`, {cache:'no-store'}).catch(()=>null),
    fetch(`standings.json?t=${Date.now()}`, {cache:'no-store'}).catch(()=>null)
  ]);
  schedule = await scheduleRes.json();
  if(assetsRes?.ok) clubAssets = await assetsRes.json();
  if(pronosRes?.ok) pronos = await pronosRes.json();
  if(standingsRes?.ok){ const sd=await standingsRes.json(); (sd.teams||[]).forEach(t=>{ if(t.club && t.logo) standingsLogoMap[t.club]=t.logo; }); }
  pronos.days ||= {};
  buildDayNavigation();
  renderDay(1);
  const leagueLogo=document.querySelector('#league-logo');
  if(leagueLogo && clubAssets.league_logo){leagueLogo.src=clubAssets.league_logo;leagueLogo.hidden=false;}
}

function buildDayNavigation(){
  const menu = $('#day-menu');
  const select = $('#day-select');
  menu.innerHTML = schedule.map(d => `<button class="day-btn ${d.journee===1?'active':''}" data-day="${d.journee}" title="${cleanDate(d.date)}">J${String(d.journee).padStart(2,'0')}</button>`).join('');
  select.innerHTML = schedule.map(d => `<option value="${d.journee}">Journée ${d.journee} — ${cleanDate(d.date)}</option>`).join('');
  menu.addEventListener('click',e=>{const b=e.target.closest('.day-btn'); if(b) renderDay(Number(b.dataset.day));});
  select.addEventListener('change',()=>renderDay(Number(select.value)));
}

function cleanDate(s){
  return s.toLowerCase().replace(/^samedi/i,'Samedi').replace(/^dimanche/i,'Dimanche').replace('août','août').replace('septembre','septembre').replace('octobre','octobre').replace('novembre','novembre').replace('décembre','décembre').replace('janvier','janvier').replace('février','février').replace('avril','avril').replace('mai','mai');
}

function valueOrPlaceholder(value, text, cls='placeholder'){
  return value ? `<span class="published-value">${escapeHtml(value)}</span>` : `<span class="${cls}">${text}</span>`;
}

function renderDay(n){
  const day = schedule.find(d=>d.journee===n); if(!day) return;
  activeDay=n;
  $$('.day-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.day)===n));
  $('#day-select').value=String(n);
  $('#matchday-kicker').textContent=`Journée ${n} • Ligue 1 2026/2027`;
  $('#matchday-title').textContent='Les 9 matchs';
  $('#matchday-date').textContent=cleanDate(day.date);
  const dayPronos = pronos.days?.[String(n)] || {};
  $('#matches-body').innerHTML=day.matches.map(([home,away],idx)=>{
    const p = dayPronos[matchKey(home,away)] || {};
    return `<tr class="match-row" style="--home:${clubColor(home)};--away:${clubColor(away)}">
      <td><div class="match-number">${String(idx+1).padStart(2,'0')}</div><div class="club-pair">${clubWithLogo(home)}<span class="versus">–</span>${clubWithLogo(away)}</div></td>
      <td>${valueOrPlaceholder(p.score,'À définir')}</td>
      <td>${valueOrPlaceholder(p.cote,'À renseigner')}</td>
      <td>${valueOrPlaceholder(p.buteur,'À analyser')}</td>
      <td>${p.analyse ? `<div class="analysis-published">${escapeHtml(p.analyse)}</div>` : '<div class="analysis-placeholder">Analyse Footix Prono à publier avant la rencontre.</div>'}</td>
    </tr>`;
  }).join('');
}

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#${name}-view`).classList.add('active');
  $$('.nav-link[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='mercato') loadMercato();
}

$$('.nav-link[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$$('[data-view-link]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showView(b.dataset.viewLink)}));

function fmtDate(value){
  try{return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return value||''}
}

async function loadMercato(){
  const grid=$('#mercato-grid');
  try{
    const r=await fetch(`mercato.json?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok) throw new Error('flux indisponible');
    const data=await r.json();
    $('#mercato-updated').textContent=fmtDate(data.updated_at);
    if(!data.items?.length) throw new Error('aucune actualité');
    grid.innerHTML=data.items.map(item=>`<a class="news-card" href="${item.link}" target="_blank" rel="noopener noreferrer">
      <div class="news-source"><span>${item.source||'Actualité'}</span><span>${fmtDate(item.published)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <span class="read">Lire l'article ↗</span>
    </a>`).join('');
  }catch(e){
    grid.innerHTML=`<div class="loading-card"><strong>Le flux mercato n'est pas encore alimenté.</strong><p>Après l'envoi du dossier <code>.github</code> et du script sur GitHub, lance une fois l'action “Mettre à jour le mercato”.</p></div>`;
    $('#mercato-updated').textContent='En attente de la première mise à jour';
  }
}
$('#refresh-mercato').addEventListener('click',loadMercato);
loadSchedule().catch(()=>{$('#matches-body').innerHTML='<tr><td colspan="5">Impossible de charger le calendrier.</td></tr>'});

async function loadStandings(){
  const body=$('#standings-body');
  if(!body) return;
  try{
    const r=await fetch(`standings.json?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok) throw new Error('classement indisponible');
    const data=await r.json();
    (data.teams||[]).forEach(t=>{ if(t.club && t.logo) standingsLogoMap[t.club]=t.logo; });
    const teams=[...(data.teams||[])].sort((a,b)=>
      (b.pts-a.pts)||((b.gf-b.ga)-(a.gf-a.ga))||(b.gf-a.gf)||a.club.localeCompare(b.club,'fr')
    );
    body.innerHTML=teams.map((t,i)=>{
      const diff=(t.gf||0)-(t.ga||0);
      const diffClass=diff>0?'positive':diff<0?'negative':'';
      const diffText=diff>0?`+${diff}`:`${diff}`;
      const form=[...(t.last5||[])].slice(-5);
      while(form.length<5) form.unshift('-');
      const badges=form.map(x=>{
        const cls=x==='V'?'win':x==='N'?'draw':x==='D'?'loss':'empty';
        return `<span class="form-badge ${cls}" title="${x==='V'?'Victoire':x==='N'?'Match nul':x==='D'?'Défaite':'Pas encore joué'}">${x}</span>`;
      }).join('');
      return `<tr>
        <td class="standing-pos">${i+1}</td>
        <td class="standing-club">${clubWithLogo(t.club)}</td>
        <td>${t.p||0}</td><td>${t.w||0}</td><td>${t.d||0}</td><td>${t.l||0}</td>
        <td>${t.gf||0}</td><td>${t.ga||0}</td><td class="standing-diff ${diffClass}">${diffText}</td>
        <td class="standing-points">${t.pts||0}</td>
        <td class="form-cell"><div class="form-row">${badges}</div></td>
      </tr>`;
    }).join('');
    if(schedule.length) renderDay(activeDay);
    const updated=$('#standings-updated');
    if(updated){
      const source=data.source?' • source : flux public ESPN':'';
      updated.textContent=data.updated_at?`Dernière mise à jour automatique : ${fmtDate(data.updated_at)}${source}`:'Classement prêt pour le début de saison.';
    }
  }catch(e){
    body.innerHTML='<tr><td colspan="11">Impossible de charger le classement.</td></tr>';
  }
}

loadStandings();
