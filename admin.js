let currentCompetition = 'ligue1';
let l1Schedule = [];
let championsData = {teams:[], matchdays:[]};
let datasets = {
  ligue1: {updated_at:null, days:{}},
  ucl: {updated_at:null, days:{}}
};
let currentDay = 1;
let clubAssets = {clubs:{}};
let playerData = {clubs:{}};

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
  [l1Schedule,datasets.ligue1,clubAssets,championsData,datasets.ucl,playerData] = await Promise.all([
    getJSON('schedule.json',[]),
    getJSON('pronos.json',{updated_at:null,days:{}}),
    getJSON('clubs.json',{clubs:{}}),
    getJSON('champions.json',{teams:[],matchdays:[]}),
    getJSON('champions-pronos.json',{updated_at:null,days:{}}),
    getJSON('players.json',{clubs:{}})
  ]);
  datasets.ligue1.days ||= {};
  datasets.ucl.days ||= {};

  if (!Array.isArray(l1Schedule) || !l1Schedule.length) {
    $a('#admin-status').textContent = 'Impossible de charger schedule.json. Vérifie que le fichier est bien à la racine du dépôt.';
  }

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
  $a('#admin-must-watch-section').classList.toggle('hidden',comp!=='ligue1');

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


function renderMustWatchAdmin(dayNo,dayData,matches){
  const host=$a('#admin-must-watch-list');
  if(!host) return;

  const selected=Array.isArray(dayData.mustWatch) ? dayData.mustWatch : [];
  if(!matches.length){
    host.innerHTML='<div class="admin-empty">Aucune rencontre disponible pour cette journée.</div>';
    return;
  }

  host.innerHTML=matches.map((m,index)=>{
    const home=m[0], away=m[1];
    const key=matchKey(home,away);
    const checked=selected.includes(key);
    return `<label class="admin-must-watch-option ${checked?'selected':''}">
      <input type="checkbox" data-must-watch="${esc(key)}" ${checked?'checked':''}>
      <span class="admin-must-watch-check">✓</span>
      <span class="admin-must-watch-match">
        <small>MATCH ${String(index+1).padStart(2,'0')}</small>
        <strong>${clubInline(home,'ligue1')}<i>VS</i>${clubInline(away,'ligue1')}</strong>
      </span>
    </label>`;
  }).join('');

  host.querySelectorAll('[data-must-watch]').forEach(input=>{
    input.addEventListener('change',()=>{
      input.closest('.admin-must-watch-option')?.classList.toggle('selected',input.checked);
    });
  });
}

function renderL1(dayNo,dayData){
  const day=l1Schedule.find(d=>d.journee===dayNo);
  const matches=day?.matches||[];
  renderMustWatchAdmin(dayNo,dayData,matches);
  $a('#admin-matches').innerHTML=matches.map((m,index)=>{
    const [home,away,fixture={}] = m;
    const key=matchKey(home,away);
    const p=dayData[key]||{};
    return matchCard({key,index,home,away,fixture,p,editableTeams:false});
  }).join('') || `<div class="admin-empty">Aucun match pour cette journée.</div>`;
  document.querySelectorAll('.scorer-picker').forEach(syncScorerPicker);
}

function renderUcl(dayNo,dayData){
  dayData.matches ||= [];
  $a('#admin-matches').innerHTML=dayData.matches.map((m,index)=>{
    const fixture={date:m.date||'',time:m.time||''};
    return matchCard({key:String(index),index,home:m.home||'',away:m.away||'',fixture,p:m,editableTeams:true});
  }).join('') || `<div class="admin-empty"><b>Aucune affiche enregistrée pour J${String(dayNo).padStart(2,'0')}.</b><span>Clique sur “Ajouter un match” pour commencer.</span></div>`;
  document.querySelectorAll('.scorer-picker').forEach(syncScorerPicker);
}

function teamSelect(field,value){
  const options=championsData.teams.map(t=>`<option value="${esc(t.club)}" ${t.club===value?'selected':''}>${esc(t.club)}</option>`).join('');
  return `<select data-field="${field}"><option value="">— Choisir une équipe —</option>${options}</select>`;
}


function scorerArray(p={}){
  if(Array.isArray(p.scorers)) return p.scorers.slice(0,4);
  const raw=String(p.buteurs||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);
  return raw.slice(0,4);
}
function playerOptionsFor(home,away){
  const clubs=playerData.clubs||{};
  const merged=[...(clubs[home]||[]),...(clubs[away]||[])];
  const seen=new Set();
  return merged.filter(name=>{
    const k=norm(name); if(!k||seen.has(k)) return false; seen.add(k); return true;
  });
}
function scorerPicker(home,away,p){
  const selected=scorerArray(p);
  const options=playerOptionsFor(home,away);
  const names=[...options,...selected.filter(x=>!options.some(y=>norm(y)===norm(x)))];
  return `<div class="scorer-picker" data-max="4">
    <div class="scorer-picker-head"><span>Buteurs potentiels</span><small><b class="scorer-count">${selected.length}</b>/4 sélectionnés</small></div>
    <div class="scorer-options">
      ${names.length?names.map(name=>`<button type="button" class="scorer-chip ${selected.some(x=>norm(x)===norm(name))?'selected':''}" data-scorer="${esc(name)}">${esc(name)}</button>`).join(''):`<span class="scorer-empty">Effectif non chargé : lance le workflow « Mettre à jour les joueurs » ou ajoute un joueur manuellement ci-dessous.</span>`}
    </div>
    <div class="scorer-custom">
      <input class="scorer-custom-input" type="text" placeholder="Ajouter un joueur absent de la liste">
      <button class="scorer-add-btn" type="button">Ajouter</button>
    </div>
    <input type="hidden" data-field="scorers" value="${esc(JSON.stringify(selected))}">
  </div>`;
}
function syncScorerPicker(picker){
  const selected=[...picker.querySelectorAll('.scorer-chip.selected')].map(b=>b.dataset.scorer).slice(0,4);
  picker.querySelector('[data-field="scorers"]').value=JSON.stringify(selected);
  picker.querySelector('.scorer-count').textContent=String(selected.length);
  picker.querySelectorAll('.scorer-chip:not(.selected)').forEach(b=>b.disabled=selected.length>=4);
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
      <div class="scorers-field">${scorerPicker(home,away,p)}</div>
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
    const selectedMustWatch=$$a('#admin-must-watch-list [data-must-watch]:checked').map(input=>input.dataset.mustWatch);
    if(selectedMustWatch.length) day.mustWatch=selectedMustWatch;
    else delete day.mustWatch;

    $$a('.admin-match-v8').forEach(card=>{
      const key=card.dataset.key, item={};
      card.querySelectorAll('[data-field]').forEach(input=>{
        if(input.dataset.field==='scorers'){
          try{ item.scorers=JSON.parse(input.value||'[]').slice(0,4); }catch{ item.scorers=[]; }
          item.buteurs=item.scorers.join('\n');
        }else item[input.dataset.field]=input.value.trim();
      });
      if(Object.values(item).some(v=>Array.isArray(v)?v.length:Boolean(v))) day[key]=item; else delete day[key];
    });
  }else{
    day.matches=[];
    $$a('.admin-match-v8').forEach(card=>{
      const item={};
      card.querySelectorAll('[data-field]').forEach(input=>{
        if(input.dataset.field==='scorers'){
          try{ item.scorers=JSON.parse(input.value||'[]').slice(0,4); }catch{ item.scorers=[]; }
          item.buteurs=item.scorers.join('\n');
        }else item[input.dataset.field]=input.value.trim();
      });
      if(item.home||item.away||item.score||item.pick||item.buteurs||item.analyse||item.date||item.time) day.matches.push(item);
    });
  }
}

document.addEventListener('click',e=>{
  const chip=e.target.closest('.scorer-chip');
  if(chip){
    const picker=chip.closest('.scorer-picker');
    if(chip.classList.contains('selected')) chip.classList.remove('selected');
    else{
      const count=picker.querySelectorAll('.scorer-chip.selected').length;
      if(count>=4) return;
      chip.classList.add('selected');
    }
    syncScorerPicker(picker);
    return;
  }
  const add=e.target.closest('.scorer-add-btn');
  if(add){
    const picker=add.closest('.scorer-picker');
    const input=picker.querySelector('.scorer-custom-input');
    const name=input.value.trim();
    if(!name) return;
    const count=picker.querySelectorAll('.scorer-chip.selected').length;
    if(count>=4){ input.value=''; return; }
    let existing=[...picker.querySelectorAll('.scorer-chip')].find(b=>norm(b.dataset.scorer)===norm(name));
    if(!existing){
      existing=document.createElement('button');
      existing.type='button';
      existing.className='scorer-chip';
      existing.dataset.scorer=name;
      existing.textContent=name;
      picker.querySelector('.scorer-options').appendChild(existing);
    }
    existing.classList.add('selected');
    input.value='';
    syncScorerPicker(picker);
    return;
  }
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
const supabaseCfg=window.FOOTIX_SUPABASE||{};
const adminDb=(window.supabase&&supabaseCfg.url&&supabaseCfg.key)
  ? window.supabase.createClient(supabaseCfg.url,supabaseCfg.key)
  : null;
let adminAuthorized=false;

async function verifyAdminAccess(){
  const chip=$a('#admin-auth-chip');
  const message=$a('#admin-auth-message');
  const button=$a('#publish-pronos');
  if(!adminDb){
    if(chip) chip.textContent='● SUPABASE INDISPONIBLE';
    if(message) message.textContent='Impossible de vérifier les droits administrateur.';
    if(button) button.disabled=true;
    return false;
  }
  const {data:{user},error:userError}=await adminDb.auth.getUser();
  if(userError||!user){
    if(chip) chip.textContent='● CONNEXION REQUISE';
    if(message) message.textContent='Connecte-toi d’abord à ton compte Footix Prono administrateur.';
    if(button) button.disabled=true;
    return false;
  }
  let {data:isAdmin,error}=await adminDb.rpc('is_profile_admin',{p_user_id:user.id});
  if(error){
    const fallback=await adminDb.rpc('is_admin',{check_user:user.id});
    isAdmin=fallback.data;
    error=fallback.error;
  }
  adminAuthorized=Boolean(isAdmin&&!error);
  if(chip) chip.textContent=adminAuthorized?'● ADMIN AUTORISÉ':'● ACCÈS REFUSÉ';
  if(message) message.textContent=adminAuthorized
    ? `Connecté en administrateur${user.email?` · ${user.email}`:''}. Le jeton GitHub reste côté serveur.`
    : 'Ce compte ne possède pas les droits administrateur.';
  if(button) button.disabled=!adminAuthorized;
  return adminAuthorized;
}

async function publish(){
  saveVisible();
  const status=$a('#admin-status');
  const button=$a('#publish-pronos');

  if(!adminAuthorized && !(await verifyAdminAccess())){
    status.textContent='Publication refusée : connexion administrateur requise.';
    return;
  }

  const competition=currentCompetition;
  datasets[competition].updated_at=new Date().toISOString();
  button.disabled=true;
  status.textContent=`Publication de ${competition==='ligue1'?'pronos.json':'champions-pronos.json'} en cours…`;

  try{
    const {data,error}=await adminDb.functions.invoke('publish-pronos',{
      body:{
        competition,
        day:currentDay,
        data:datasets[competition]
      }
    });

    if(error){
      console.error('EDGE FUNCTION ERROR:', error);

      let detail=error.message||'Erreur Edge Function';

      try{
        if(error.context){
          const response=error.context;
          const text=await response.text();
          if(text){
            try{
              const parsed=JSON.parse(text);
              detail=parsed.error||parsed.message||text;
            }catch{
              detail=text;
            }
          }
        }
      }catch(readErr){
        console.error('Impossible de lire la réponse Edge Function:',readErr);
      }

      throw new Error(detail);
    }

    if(!data?.ok) throw new Error(data?.error||'Réponse serveur invalide');
    status.textContent=`✓ ${competition==='ligue1'?'Pronostics Ligue 1':'Pronostics LDC'} publiés. GitHub Pages se mettra à jour dans quelques instants.`;
  }catch(err){
    status.textContent=`Erreur de publication : ${err.message||err}`;
  }finally{
    button.disabled=!adminAuthorized;
  }
}

verifyAdminAccess().catch(()=>{});

loadAdmin().catch(err=>{
  $a('#admin-matches').innerHTML=`<div class="admin-empty">Impossible de charger l’éditeur : ${esc(err.message)}</div>`;
});
