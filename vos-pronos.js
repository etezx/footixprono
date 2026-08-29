(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const cfg=window.FOOTIX_SUPABASE||{};
  const root=$('#community-match-list');

  if(!window.supabase || !cfg.url || !cfg.key){
    if(root) root.innerHTML='<div class="community-empty">Impossible d’initialiser les pronostics.</div>';
    return;
  }

  const db=window.supabase.createClient(cfg.url,cfg.key);
  let comp='L1', user=null, rows=[], myVotes=new Map(), selectedDay=null;
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const dt=v=>v?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'Horaire à venir';

  async function getUser(){
    const {data}=await db.auth.getUser();
    user=data.user||null;
    const n=$('#vote-session-note');
    if(n) n.textContent=user?'Tes choix sont enregistrés automatiquement.':'Connecte-toi pour enregistrer tes choix.';
  }

  async function loadMine(){
    myVotes=new Map();
    if(!user || !rows.length) return;
    const {data,error}=await db.from('predictions').select('match_id,pick').eq('user_id',user.id).in('match_id',rows.map(m=>m.id));
    if(!error) (data||[]).forEach(v=>myVotes.set(Number(v.match_id),v.pick));
  }

  const locked=m=>m.status!=='scheduled'||!m.kickoff||Date.now()>=new Date(m.kickoff).getTime();

  function card(m){
    const mine=myVotes.get(Number(m.id)), lock=locked(m), final=m.result_pick;
    let verdict='';
    if(mine&&final) verdict=mine===final?'<span class="member-verdict good">✓ BON PRONO · +1 PT</span>':'<span class="member-verdict bad">✕ MAUVAIS PRONO · 0 PT</span>';
    return `<article class="community-vote-card" data-match="${m.id}">
      <div class="vote-card-top"><span>${dt(m.kickoff)}</span><b class="${lock?'vote-lock':'vote-open'}">${lock?'🔒 VERROUILLÉ':'OUVERT'}</b></div>
      <div class="vote-fixture"><strong>${esc(m.home_team)}</strong><span class="vote-vs">${m.home_score??'—'} <i>–</i> ${m.away_score??'—'}</span><strong>${esc(m.away_team)}</strong></div>
      <div class="pick-buttons">${['1','N','2'].map(p=>`<button type="button" data-pick="${p}" class="${mine===p?'selected':''}" ${lock?'disabled':''}><b>${p}</b><small>${p==='1'?'DOMICILE':p==='N'?'NUL':'EXTÉRIEUR'}</small></button>`).join('')}</div>
      <div class="vote-community-line"><span>COMMUNAUTÉ · ${m.total_votes||0} vote${Number(m.total_votes)===1?'':'s'}</span><div class="vote-percentages"><b>1 ${m.pct_1||0}%</b><b>N ${m.pct_n||0}%</b><b>2 ${m.pct_2||0}%</b></div></div>
      <div class="vote-card-bottom">${mine?`TON CHOIX : <b>${mine}</b>`:'AUCUN CHOIX'}${verdict}</div>
    </article>`;
  }

  function render(){
    if(!rows.length){
      root.innerHTML='<div class="community-empty"><b>Aucun match dans Supabase pour cette compétition.</b></div>';
      summary(); return;
    }

    const days=[...new Set(rows.map(m=>m.matchday).filter(v=>v!==null&&v!==undefined))]
      .sort((a,b)=>Number(a)-Number(b));

    // Par défaut : première journée qui possède encore un match à venir/live.
    if(selectedDay===null || !days.includes(selectedDay)){
      const active=rows.find(m=>m.status==='live' || (m.status==='scheduled' && new Date(m.kickoff).getTime()>=Date.now()));
      selectedDay=active?.matchday ?? days[days.length-1];
    }

    const shown=rows.filter(m=>m.matchday===selectedDay);
    const idx=days.indexOf(selectedDay);
    const prev=idx>0?days[idx-1]:null;
    const next=idx>=0&&idx<days.length-1?days[idx+1]:null;

    root.innerHTML=`
      <div class="matchday-selector">
        <button type="button" data-day-nav="${prev??''}" ${prev===null?'disabled':''}>‹</button>
        <label>JOURNÉE
          <select id="matchday-select">
            ${days.map(d=>`<option value="${d}" ${d===selectedDay?'selected':''}>J${String(d).padStart(2,'0')}</option>`).join('')}
          </select>
        </label>
        <button type="button" data-day-nav="${next??''}" ${next===null?'disabled':''}>›</button>
      </div>
      <section class="vote-matchday">
        <div class="vote-matchday-title"><span>${comp==='L1'?'LIGUE 1':'LIGUE DES CHAMPIONS'}</span><b>J${String(selectedDay).padStart(2,'0')} · ${shown.length} MATCH${shown.length>1?'S':''}</b></div>
        ${shown.map(card).join('')}
      </section>`;
    summary();
  }

  function summary(){
    const box=$('#community-vote-summary');
    if(!box) return;
    if(!user){box.classList.add('is-hidden');return}
    const finished=rows.filter(m=>m.result_pick&&myVotes.has(Number(m.id)));
    const good=finished.filter(m=>myVotes.get(Number(m.id))===m.result_pick).length;
    box.classList.remove('is-hidden');
    box.innerHTML=`<div><small>TES PRONOS</small><b>${rows.filter(m=>myVotes.has(Number(m.id))).length}</b></div><div><small>BONS</small><b>${good}</b></div><div><small>POINTS</small><b>${good}</b></div><div><small>RÉUSSITE</small><b>${finished.length?Math.round(good*100/finished.length):0}%</b></div>`;
  }

  async function load(){
    root.innerHTML='<div class="community-empty">Chargement des matchs…</div>';
    const {data,error}=await db.rpc('community_matches_feed',{p_competition:comp});
    if(error){
      root.innerHTML=`<div class="community-empty"><b>Erreur de chargement Supabase</b><br><small>${esc(error.message)}</small></div>`;
      return;
    }
    rows=(data||[]).filter(m=>m.kickoff).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
    await loadMine(); render();
  }

  document.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-vote-comp]');
    if(tab){
      $$('.vote-tabs button').forEach(b=>b.classList.remove('active'));
      tab.classList.add('active'); comp=tab.dataset.voteComp; selectedDay=null; await load(); return;
    }
    const dayBtn=e.target.closest('[data-day-nav]');
    if(dayBtn && dayBtn.dataset.dayNav){
      selectedDay=Number(dayBtn.dataset.dayNav); render(); return;
    }
    const btn=e.target.closest('[data-pick]');
    if(!btn) return;
    if(!user){document.querySelector('.login-trigger')?.click();return}
    const id=Number(btn.closest('[data-match]').dataset.match);
    const {error}=await db.rpc('save_my_prediction',{p_match_id:id,p_pick:btn.dataset.pick});
    if(error){alert(error.message);return}
    await load();
  });

  document.addEventListener('change',e=>{
    if(e.target.id==='matchday-select'){
      selectedDay=Number(e.target.value);
      render();
    }
  });

  (async()=>{await getUser();await load()})();
})();