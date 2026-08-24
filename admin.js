let adminSchedule = [];
let pronosData = {updated_at:null, days:{}};
let adminDay = 1;
let adminClubAssets = {clubs:{}};

const $a = (s) => document.querySelector(s);

function matchKey(home, away){ return `${home}|||${away}`; }
function adminNorm(name=''){return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();}
function adminClubLogo(name){ const clubs=adminClubAssets.clubs||{}; if(clubs[name]) return clubs[name]; const key=Object.keys(clubs).find(k=>adminNorm(k)===adminNorm(name)); return key?clubs[key]:''; }
function adminClub(name){ const logo=adminClubLogo(name); return `<span class="club-inline">${logo?`<img class="club-logo" src="${logo}" alt="" loading="lazy">`:''}<span>${esc(name)}</span></span>`; }
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function formatFixtureDate(value){ try{return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`));}catch{return value||'';} }

async function loadAdmin(){
  const [scheduleRes, pronosRes, assetsRes] = await Promise.all([
    fetch(`schedule.json?t=${Date.now()}`, {cache:'no-store'}),
    fetch(`pronos.json?t=${Date.now()}`, {cache:'no-store'}).catch(()=>null),
    fetch(`clubs.json?t=${Date.now()}`, {cache:'no-store'}).catch(()=>null)
  ]);
  adminSchedule = await scheduleRes.json();
  if(pronosRes?.ok) pronosData = await pronosRes.json();
  if(assetsRes?.ok) adminClubAssets = await assetsRes.json();
  pronosData.days ||= {};
  $a('#admin-day-select').innerHTML = adminSchedule.map(d=>`<option value="${d.journee}">Journée ${d.journee} — ${esc(d.date)}</option>`).join('');
  $a('#admin-day-select').addEventListener('change',()=>{ saveVisibleInputs(); renderAdminDay(Number($a('#admin-day-select').value)); });
  renderAdminDay(1);
}

function renderAdminDay(dayNo){
  adminDay = dayNo;
  $a('#admin-day-select').value = String(dayNo);
  const day = adminSchedule.find(d=>d.journee===dayNo);
  const dayData = pronosData.days[String(dayNo)] || {};
  const review = dayData.review || {};
  const gp=$a('#admin-good-pronos'), gs=$a('#admin-good-scorers'), sm=$a('#admin-day-summary');
  if(gp) gp.value=review.goodPronos ?? ''; if(gs) gs.value=review.goodScorers ?? ''; if(sm) sm.value=review.summary ?? '';
  $a('#admin-matches').innerHTML = day.matches.map((match, index)=>{
    const [home,away,fixture={}] = match;
    const key = matchKey(home,away);
    const p = dayData[key] || {};
    return `<article class="admin-match" data-key="${esc(key)}">
      <div class="admin-match-title"><span>Match ${index+1}${fixture.official && fixture.date && fixture.time ? ` • ${formatFixtureDate(fixture.date)} à ${esc(fixture.time)}` : ''}</span><strong>${adminClub(home)} <i>–</i> ${adminClub(away)}</strong></div>
      <div class="admin-fields">
        <label>Score prévu<input data-field="score" value="${esc(p.score||'')}" placeholder="2 - 1"></label>
        <label>Pronostic<textarea data-field="prono" rows="2" placeholder="Victoire PSG, +2,5 buts…">${esc(p.prono||p.cote||'')}</textarea></label>
        <label>Buteurs potentiels<textarea data-field="buteurs" rows="2" placeholder="Dembélé, Barcola, Ramos…">${esc(p.buteurs||p.buteur||'')}</textarea></label>
        <label class="analysis-field">Analyse<textarea data-field="analyse" rows="8" placeholder="Ton analyse du match…">${esc(p.analyse||'')}</textarea></label>
      </div>
    </article>`;
  }).join('');
  $a('#admin-status').textContent = `Journée ${dayNo} chargée. Les modifications sont enregistrées localement avant publication.`;
}

function saveVisibleInputs(){
  pronosData.days[String(adminDay)] ||= {};
  const reviewData={goodPronos:$a('#admin-good-pronos')?.value===''?'':Number($a('#admin-good-pronos')?.value),goodScorers:$a('#admin-good-scorers')?.value===''?'':Number($a('#admin-good-scorers')?.value),summary:$a('#admin-day-summary')?.value.trim()||''};
  if(Object.values(reviewData).some(v=>v!=='')) pronosData.days[String(adminDay)].review=reviewData; else delete pronosData.days[String(adminDay)].review;
  document.querySelectorAll('.admin-match').forEach(card=>{
    const key = card.dataset.key;
    const item = {};
    card.querySelectorAll('[data-field]').forEach(input=> item[input.dataset.field] = input.value.trim());
    const hasContent = Object.values(item).some(Boolean);
    if(hasContent) pronosData.days[String(adminDay)][key] = item;
    else delete pronosData.days[String(adminDay)][key];
  });
}

function encodeBase64Utf8(text){
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for(let i=0;i<bytes.length;i+=chunk){ binary += String.fromCharCode(...bytes.subarray(i,i+chunk)); }
  return btoa(binary);
}

async function githubRequest(url, token, options={}){
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept':'application/vnd.github+json',
      'Authorization':`Bearer ${token}`,
      'X-GitHub-Api-Version':'2022-11-28',
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  if(!res.ok){
    let message = `${res.status} ${res.statusText}`;
    try{ const body = await res.json(); if(body.message) message = body.message; }catch{}
    throw new Error(message);
  }
  return res.json();
}

async function publish(){
  saveVisibleInputs();
  const owner = $a('#repo-owner').value.trim();
  const repo = $a('#repo-name').value.trim();
  const branch = $a('#repo-branch').value.trim() || 'main';
  const token = $a('#github-token').value.trim();
  const status = $a('#admin-status');
  const button = $a('#publish-pronos');
  if(!owner || !repo || !token){ status.textContent='Renseigne le propriétaire, le dépôt et ton jeton GitHub.'; return; }

  button.disabled = true;
  status.textContent = 'Publication en cours…';
  try{
    const path = 'pronos.json';
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    let sha = null;
    try{ const current = await githubRequest(api, token); sha = current.sha; }
    catch(err){ if(!String(err.message).includes('404')) throw err; }

    pronosData.updated_at = new Date().toISOString();
    const text = JSON.stringify(pronosData, null, 2) + '\n';
    const body = {
      message: `Mise à jour pronostics — Journée ${adminDay}`,
      content: encodeBase64Utf8(text),
      branch
    };
    if(sha) body.sha = sha;
    const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
    await githubRequest(putUrl, token, {method:'PUT', body:JSON.stringify(body)});
    status.textContent = '✓ Pronostics publiés sur GitHub. Le site sera mis à jour dans quelques instants.';
  }catch(err){
    status.textContent = `Erreur : ${err.message}. Vérifie le jeton et son droit “Contents: Read and write”.`;
  }finally{
    button.disabled = false;
  }
}

$a('#publish-pronos').addEventListener('click', publish);
loadAdmin().catch(err=>{$a('#admin-matches').innerHTML=`<div class="loading-card">Impossible de charger l'éditeur : ${esc(err.message)}</div>`;});
