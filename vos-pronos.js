(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const db=window.footixSupabase;
  if(!db) return;

  let comp='ligue1', user=null, myVotes=new Map(), rows=[];

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const compDb=()=>comp==='ligue1'?'ligue1':'champions';
  const dt=v=>v?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'Horaire à venir';

  async function session(){
    const r=await db.auth.getUser(); user=r.data.user||null;
    $('#vote-session-note').textContent=user?'Tes choix sont enregistrés automatiquement.':'Connecte-toi pour enregistrer tes choix.';
  }

  async function loadMine(){
    myVotes=new Map();
    if(!user || !rows.length) return;
    const ids=rows.map(x=>x.id);
    const {data}=await db.from('predictions').select('match_id,pick').eq('user_id',user.id).in('match_id',ids);
    (data||[]).forEach(v=>myVotes.set(Number(v.match_id),v.pick));
  }

  function locked(m){ return m.status!=='scheduled' || !m.kickoff || Date.now()>=new Date(m.kickoff).getTime(); }

  function render(){
    const root=$('#community-match-list');
    if(!rows.length){root.innerHTML='<div class="vote-empty">Aucun match disponible pour le moment.</div>';return;}
    const byDay=new Map();
    rows.forEach(m=>{const k=m.matchday??'—'; if(!byDay.has(k))byDay.set(k,[]); byDay.get(k).push(m);});
    root.innerHTML=[...byDay].map(([day,ms])=>`
      <section class="vote-matchday">
        <div class="vote-matchday-title"><span>${comp==='ligue1'?'LIGUE 1':'LIGUE DES CHAMPIONS'}</span><b>J${String(day).padStart(2,'0')}</b></div>
        ${ms.map(card).join('')}
      </section>`).join('');
    summary();
  }

  function card(m){
    const mine=myVotes.get(Number(m.id));
    const isLocked=locked(m);
    const final=m.result_pick;
    const good=isLocked && final && mine ? mine===final : null;
    const verdict=mine && final ? `<span class="member-verdict ${good?'good':'bad'}">${good?'✓ BON PRONO · +1 PT':'✕ MAUVAIS PRONO · 0 PT'}</span>`:'';
    return `<article class="community-vote-card" data-match="${m.id}">
      <div class="vote-card-top"><span>${dt(m.kickoff)}</span>${isLocked?'<b class="vote-lock">🔒 VERROUILLÉ</b>':'<b class="vote-open">OUVERT</b>'}</div>
      <div class="vote-fixture">
        <strong>${esc(m.home_team)}</strong><span class="vote-vs">${m.home_score??'—'} <i>–</i> ${m.away_score??'—'}</span><strong>${esc(m.away_team)}</strong>
      </div>
      <div class="pick-buttons">
        ${['1','N','2'].map(p=>`<button type="button" data-pick="${p}" class="${mine===p?'selected':''}" ${isLocked?'disabled':''}><b>${p}</b><small>${p==='1'?'DOMICILE':p==='N'?'NUL':'EXTÉRIEUR'}</small></button>`).join('')}
      </div>
      <div class="vote-community-line">
        <span>COMMUNAUTÉ · ${m.total_votes||0} vote${Number(m.total_votes)===1?'':'s'}</span>
        <div class="vote-percentages"><b>1&nbsp; ${m.pct_1||0}%</b><b>N&nbsp; ${m.pct_n||0}%</b><b>2&nbsp; ${m.pct_2||0}%</b></div>
      </div>
      <div class="vote-bars"><i style="--w:${m.pct_1||0}%"></i><i style="--w:${m.pct_n||0}%"></i><i style="--w:${m.pct_2||0}%"></i></div>
      <div class="vote-card-bottom">${mine?`TON CHOIX : <b>${mine}</b>`:'AUCUN CHOIX'} ${verdict}</div>
    </article>`;
  }

  function summary(){
    if(!user){$('#community-vote-summary').classList.add('is-hidden');return;}
    const voted=rows.filter(m=>myVotes.has(Number(m.id))).length;
    const finished=rows.filter(m=>m.result_pick && myVotes.has(Number(m.id)));
    const good=finished.filter(m=>myVotes.get(Number(m.id))===m.result_pick).length;
    const box=$('#community-vote-summary');
    box.classList.remove('is-hidden');
    box.innerHTML=`<div><small>TES PRONOS</small><b>${voted}</b></div><div><small>BONS</small><b>${good}</b></div><div><small>POINTS</small><b>${good}</b></div><div><small>RÉUSSITE</small><b>${finished.length?Math.round(good*100/finished.length):0}%</b></div>`;
  }

  async function load(){
    const root=$('#community-match-list'); root.innerHTML='<div class="vote-empty">Chargement des matchs…</div>';
    const {data,error}=await db.rpc('community_matches_feed',{p_competition:compDb()});
    if(error){root.innerHTML=`<div class="vote-empty">La partie Vos pronos doit être activée dans Supabase.<br><small>${esc(error.message)}</small></div>`;return;}
    rows=(data||[]).filter(m=>m.kickoff).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
    await loadMine(); render();
  }

  document.addEventListener('click',async e=>{
    const tab=e.target.closest('.vote-tab');
    if(tab){$$('.vote-tab').forEach(x=>x.classList.remove('active'));tab.classList.add('active');comp=tab.dataset.voteComp;await load();return;}
    const btn=e.target.closest('[data-pick]');
    if(!btn)return;
    if(!user){document.querySelector('.login-trigger')?.click();return;}
    const card=btn.closest('[data-match]'), id=Number(card.dataset.match), pick=btn.dataset.pick;
    btn.disabled=true;
    const {error}=await db.rpc('save_my_prediction',{p_match_id:id,p_pick:pick});
    if(error){alert(error.message);btn.disabled=false;return;}
    await load();
  });

  db.auth.onAuthStateChange(async()=>{await session();await load();});
  (async()=>{await session();await load();})();
})();