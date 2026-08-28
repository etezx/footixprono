let currentCompetition = 'ligue1';
let l1Schedule = [];
let championsData = {teams:[], matchdays:[]};
let datasets = {
  ligue1: {updated_at:null, days:{}},
  ucl: {updated_at:null, days:{}}
};
let currentDay = 1;
let clubAssets = {clubs:{}};

const $a = s => document.querySelector(s);
const $$a = s => [...document.querySelectorAll(s)];

function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function norm(name=''){return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();}
function matchKey(home,away){return `${home}|||${away}`;}
function l1Logo(name){
  const clubs=clubAssets.clubs||{};
  if(clubs[name]) return clubs[name];
  const k=Object.keys(clubs).find(x=>norm(x)===norm(name));
  return k?clubs[k]:'';
}
function clubInline(name, comp=currentCompetition){
  if(comp==='ligue1'){
    const logo=l1Logo(name);
    return `<span class="admin-club-inline">${logo?`<img src="${logo}" alt="">`:''}<b>${esc(name)}</b></span>`;
  }
  const team=championsData.teams.find(t=>t.club===name);
  const logo=team?.logo||'';
  const abbr=team?.abbr||name.slice(0,3).toUpperCase();
  return `<span class="admin-club-inline">${logo?`<img src="${logo}" alt="" onerror="this.style.display='none'">`:`<i>${esc(abbr)}</i>`}<b>${esc(name)}</b></span>`;
}
function formatFixture(f={}){
  if(!f.date && !f.time) return 'Horaire à confirmer';
  const date=f.date ? new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${f.date}T12:00:00`)) : '';
  return [date,f.time].filter(Boolean).join(' · ');
}
function blankUclMatch(){
  return {home:'',away:'',date:'',time:'',score:'',pick:'',buteurs:'',analyse:''};
}
function getDayData(comp,day){
  datasets[comp].days ||= {};
  datasets[comp].days[String(day)] ||= {};
  return datasets[comp].days[String(day)];
}
async function getJSON(path,fallback){
  try{
    const r=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok) throw 0;
    return await r.json();
  }catch{return fallback;}
}

async function loadAdmin(){
  [l1Schedule,datasets.ligue1,clubAssets,championsData,datasets.ucl] = await Promise.all([
    getJSON('schedule.json',[]),
    getJSON('pronos.json',{updated_at:null,days:{}}),
    getJSON('clubs.json',{clubs:{}}),
    getJSON('champions.json',{teams:[],matchdays:[]}),
    getJSON('champions-pronos.json',{updated_at:null,days:{}})
  ]);
  datasets.ligue1.days ||= {};
  datasets.ucl.days ||= {};

  $$a('.admin-comp-btn').forEach(btn=>btn.addEventListener('click',()=>switchCompetition(btn.dataset.comp)));
  $a('#admin-day-select').addEventListener('change',()=>{saveVisible(); renderDay(Number($a('#admin-day-select').value));});
  $a('#add-ucl-match').addEventListener('click',()=>{saveVisible(); addUclMatch();});
  $a('#publish-pronos').addEventListener('click',publish);
  switchCompetition('ligue1');
}

function switchCompetition(comp){
  saveVisible();
  currentCompetition=comp;
  currentDay=1;
  $$a('.admin-comp-btn').forEach(b=>b.classList.toggle('active',b.dataset.comp===comp));
  $a('#admin-current-comp').textContent=comp==='ligue1'?'LIGUE 1':'LIGUE DES CHAMPIONS';
  $a('#admin-editor-kicker').textContent=comp==='ligue1'?'LIGUE 1 · 2026/27':'LIGUE DES CHAMPIONS · 2026/27';
  $a('#admin-editor-title').textContent=comp==='ligue1'?'Pronostics de la journée':'Pronostics de la phase de ligue';
  $a('#ucl-admin-toolbar').classList.toggle('hidden',comp!=='ucl');

  const days=comp==='ligue1'
    ? l1Schedule.map(d=>({day:d.journee,label:`Journée ${d.journee}`}))
    : (championsData.matchdays||Array.from({length:8},(_,i)=>({day:i+1,label:`J${String(i+1).padStart(2,'0')}`}))).map(d=>({day:d.day,label:`J${String(d.day).padStart(2,'0')}`}));

  $a('#admin-day-select').innerHTML=days.map(d=>`<option value="${d.day}">${d.label}</option>`).join('');
  renderDay(1);
}

function renderDay(dayNo){
  currentDay=dayNo;
  $a('#admin-day-select').value=String(dayNo);
  const dayData=getDayData(currentCompetition,dayNo);
  const review=dayData.review||{};
  $a('#admin-good-pronos').value=review.goodPronos??'';
  $a('#admin-good-scorers').value=review.goodScorers??'';
  $a('#admin-day-summary').value=review.summary??'';

  if(currentCompetition==='ligue1') renderL1(dayNo,dayData);
  else renderUcl(dayNo,dayData);

  const max=currentCompetition==='ligue1'?9:18;
  $a('#admin-good-pronos').max=String(max);
  $a('#admin-good-scorers').max=String(max);
  $a('#admin-status').textContent=`${currentCompetition==='ligue1'?'Ligue 1':'Ligue des Champions'} · journée ${dayNo} chargée.`;
}

function renderL1(dayNo,dayData){
  const day=l1Schedule.find(d=>d.journee===dayNo);
  const matches=day?.matches||[];
  $a('#admin-matches').innerHTML=matches.map((m,index)=>{
    const [home,away,fixture={}] = m;
    const key=matchKey(home,away);
    const p=dayData[key]||{};
    return matchCard({key,index,home,away,fixture,p,editableTeams:false});
  }).join('') || `<div class="admin-empty">Aucun match pour cette journée.</div>`;
}

function renderUcl(dayNo,dayData){
  dayData.matches ||= [];
  $a('#admin-matches').innerHTML=dayData.matches.map((m,index)=>{
    const fixture={date:m.date||'',time:m.time||''};
    return matchCard({key:String(index),index,home:m.home||'',away:m.away||'',fixture,p:m,editableTeams:true});
  }).join('') || `<div class="admin-empty"><b>Aucune affiche enregistrée pour J${String(dayNo).padStart(2,'0')}.</b><span>Clique sur “Ajouter un match” pour commencer.</span></div>`;
}

function teamSelect(field,value){
  const options=championsData.teams.map(t=>`<option value="${esc(t.club)}" ${t.club===value?'selected':''}>${esc(t.club)}</option>`).join('');
  return `<select data-field="${field}"><option value="">— Choisir une équipe —</option>${options}</select>`;
}

function matchCard({key,index,home,away,fixture,p,editableTeams}){
  const title=editableTeams
    ? `<div class="admin-team-selects">${teamSelect('home',home)}<span>VS</span>${teamSelect('away',away)}</div>`
    : `<strong>${clubInline(home,'ligue1')}<i>VS</i>${clubInline(away,'ligue1')}</strong>`;

  return `<article class="admin-match-v8" data-key="${esc(key)}">
    <div class="admin-match-top">
      <div>
        <small>MATCH ${String(index+1).padStart(2,'0')}</small>
        ${title}
      </div>
      ${editableTeams?`<button class="remove-ucl-match" type="button" data-remove="${index}" title="Supprimer ce match">×</button>`:`<span class="fixture-chip">${formatFixture(fixture)}</span>`}
    </div>

    ${editableTeams?`<div class="ucl-fixture-fields">
      <label><span>Date</span><input data-field="date" type="date" value="${esc(fixture.date||'')}"></label>
      <label><span>Heure</span><input data-field="time" type="time" value="${esc(fixture.time||'')}"></label>
    </div>`:''}

    <div class="admin-fields-v8">
      <label><span>Score Footix</span><input data-field="score" value="${esc(p.score||'')}" placeholder="2 - 1"></label>
      <label><span>Pronostic</span>
        <select data-field="pick">
          <option value="" ${!p.pick?'selected':''}>— 1 / N / 2 —</option>
          <option value="1" ${p.pick==='1'?'selected':''}>1 · Domicile</option>
          <option value="N" ${p.pick==='N'?'selected':''}>N · Nul</option>
          <option value="2" ${p.pick==='2'?'selected':''}>2 · Extérieur</option>
        </select>
      </label>
      <label class="scorers-field"><span>Buteurs potentiels</span><textarea data-field="buteurs" rows="2" placeholder="Dembélé, Mbappé, Salah…">${esc(p.buteurs||'')}</textarea></label>
      <label class="analysis-field-v8"><span>Analyse Footix</span><textarea data-field="analyse" rows="6" placeholder="Ton analyse du match…">${esc(p.analyse||'')}</textarea></label>
    </div>
  </article>`;
}

function addUclMatch(){
  const day=getDayData('ucl',currentDay);
  day.matches ||= [];
  day.matches.push(blankUclMatch());
  renderDay(currentDay);
}

function saveVisible(){
  const gp=$a('#admin-good-pronos'), gs=$a('#admin-good-scorers'), sm=$a('#admin-day-summary');
  if(!gp||!gs||!sm) return;

  const day=getDayData(currentCompetition,currentDay);
  const review={
    goodPronos:gp.value===''?'':Number(gp.value),
    goodScorers:gs.value===''?'':Number(gs.value),
    summary:sm.value.trim()
  };
  if(Object.values(review).some(v=>v!=='')) day.review=review; else delete day.review;

  if(currentCompetition==='ligue1'){
    $$('.admin-match-v8').forEach(card=>{
      const key=card.dataset.key, item={};
      card.querySelectorAll('[data-field]').forEach(input=>item[input.dataset.field]=input.value.trim());
      if(Object.values(item).some(Boolean)) day[key]=item; else delete day[key];
    });
  }else{
    day.matches=[];
    $$('.admin-match-v8').forEach(card=>{
      const item={};
      card.querySelectorAll('[data-field]').forEach(input=>item[input.dataset.field]=input.value.trim());
      if(item.home||item.away||item.score||item.pick||item.buteurs||item.analyse||item.date||item.time) day.matches.push(item);
    });
  }
}

document.addEventListener('click',e=>{
  const btn=e.target.closest('.remove-ucl-match');
  if(!btn) return;
  saveVisible();
  const day=getDayData('ucl',currentDay);
  day.matches.splice(Number(btn.dataset.remove),1);
  renderDay(currentDay);
});

function encodeBase64Utf8(text){
  const bytes=new TextEncoder().encode(text);
  let binary='',chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}
async function githubRequest(url,token,options={}){
  const res=await fetch(url,{...options,headers:{
    'Accept':'application/vnd.github+json',
    'Authorization':`Bearer ${token}`,
    'X-GitHub-Api-Version':'2022-11-28',
    'Content-Type':'application/json',
    ...(options.headers||{})
  }});
  if(!res.ok){
    let message=`${res.status} ${res.statusText}`;
    try{const body=await res.json();if(body.message)message=body.message;}catch{}
    throw new Error(message);
  }
  return res.json();
}

async function publish(){
  saveVisible();
  const owner=$a('#repo-owner').value.trim();
  const repo=$a('#repo-name').value.trim();
  const branch=$a('#repo-branch').value.trim()||'main';
  const token=$a('#github-token').value.trim();
  const status=$a('#admin-status');
  const button=$a('#publish-pronos');

  if(!owner||!repo||!token){
    status.textContent='Renseigne le propriétaire, le dépôt et ton jeton GitHub.';
    return;
  }

  const path=currentCompetition==='ligue1'?'pronos.json':'champions-pronos.json';
  button.disabled=true;
  status.textContent=`Publication de ${path} en cours…`;

  try{
    const api=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    let sha=null;
    try{const current=await githubRequest(api,token);sha=current.sha;}
    catch(err){if(!String(err.message).includes('404'))throw err;}

    datasets[currentCompetition].updated_at=new Date().toISOString();
    const text=JSON.stringify(datasets[currentCompetition],null,2)+'\n';
    const body={
      message:`Mise à jour ${currentCompetition==='ligue1'?'Ligue 1':'LDC'} — J${currentDay}`,
      content:encodeBase64Utf8(text),
      branch
    };
    if(sha) body.sha=sha;
    const putUrl=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
    await githubRequest(putUrl,token,{method:'PUT',body:JSON.stringify(body)});
    status.textContent=`✓ ${currentCompetition==='ligue1'?'Pronostics Ligue 1':'Pronostics LDC'} publiés. GitHub Pages se mettra à jour dans quelques instants.`;
  }catch(err){
    status.textContent=`Erreur : ${err.message}. Vérifie le jeton et son droit “Contents: Read and write”.`;
  }finally{
    button.disabled=false;
  }
}

loadAdmin().catch(err=>{
  $a('#admin-matches').innerHTML=`<div class="admin-empty">Impossible de charger l’éditeur : ${esc(err.message)}</div>`;
});
