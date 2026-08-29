(() => {

const showPronoToast=(text)=>{
  let t=document.querySelector('.footix-toast');
  if(!t){
    t=document.createElement('div');
    t.className='footix-toast';
    document.body.appendChild(t);
  }
  t.textContent=text;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),1800);
};

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
  const kickoffDate=v=>v?new Date(v):null;
  const time=v=>v?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—';
  const dayLabel=v=>v?new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(v)).toUpperCase():'DATE À VENIR';
  const logo=id=>id?`https://sports.bzzoiro.com/img/team/${encodeURIComponent(id)}/?bg=transparent`:'';
  const isFinished=m=>m.status==='finished'||!!m.result_pick;
  const isLive=m=>m.status==='live';
  const locked=m=>m.status!=='scheduled'||!m.kickoff||Date.now()>=new Date(m.kickoff).getTime();

  function resultFromScore(m){
    if(m.result_pick) return m.result_pick;
    if(!isFinished(m)||m.home_score==null||m.away_score==null) return null;
    return Number(m.home_score)>Number(m.away_score)?'1':Number(m.home_score)<Number(m.away_score)?'2':'N';
  }

  async function getUser(){
    const {data}=await db.auth.getUser();
    user=data.user||null;
    const note=$('#vote-session-note');
    if(note) note.innerHTML=user
      ? '<span>✓</span> Tes choix sont enregistrés automatiquement jusqu’au coup d’envoi.'
      : '<span>ⓘ</span> Connecte-toi pour enregistrer tes pronostics.';
  }

  async function loadMine(){
    myVotes=new Map();
    if(!user||!rows.length) return;
    const {data,error}=await db.from('predictions')
      .select('match_id,pick')
      .eq('user_id',user.id)
      .in('match_id',rows.map(m=>m.id));
    if(!error) (data||[]).forEach(v=>myVotes.set(Number(v.match_id),v.pick));
  }

  function crest(id,name){
    const src=logo(id);
    if(!src) return `<span class="club-logo club-logo-fallback">${esc(String(name||'?').slice(0,2).toUpperCase())}</span>`;
    return `<span class="club-logo"><img src="${src}" alt="" loading="lazy" onerror="this.parentElement.classList.add('club-logo-broken');this.style.display='none';this.parentElement.textContent='${esc(String(name||'?').slice(0,2).toUpperCase())}'"></span>`;
  }

  function pickPill(p, mine, disabled=false){
    return `<button type="button" data-pick="${p}" class="pick-mini ${mine===p?'selected':''}" ${disabled?'disabled':''}>${p}</button>`;
  }

  function matchRow(m){
    const mine=myVotes.get(Number(m.id));
    const final=resultFromScore(m);
    const finished=isFinished(m);
    const live=isLive(m);
    const lock=locked(m);
    const good=finished&&mine&&mine===final;
    const pts=finished&&mine?(good?1:0):null;

    let resultCell='';
    let choiceCell='';
    if(finished){
      resultCell=`<div class="result-finished"><b>${m.home_score ?? '—'} - ${m.away_score ?? '—'}</b><span class="result-pick">${final||'—'}</span></div>`;
      choiceCell=mine?`<span class="my-pick ${good?'good':'bad'}">${mine}</span>`:'<span class="muted-dash">—</span>';
    }else{
      resultCell=`<div class="pick-inline">${['1','N','2'].map(p=>pickPill(p,mine,lock)).join('')}</div>`;
      choiceCell=mine?`<span class="my-pick pending">${mine}</span>`:'<span class="muted-dash">—</span>';
    }

    return `<article class="premium-match-row" data-match="${m.id}">
      <div class="match-time">
        <b>${time(m.kickoff)}</b>
        <span class="${finished?'finished':live?'live':'upcoming'}">${finished?'Terminé':live?'En direct':'À venir'}</span>
      </div>
      <div class="match-clubs">
        <div class="club home">${crest(m.home_team_id,m.home_team)}<strong>${esc(m.home_team)}</strong></div>
        <div class="score-core">${finished||live?`<b>${m.home_score ?? '—'} <i>-</i> ${m.away_score ?? '—'}</b>`:'<b>–</b>'}</div>
        <div class="club away">${crest(m.away_team_id,m.away_team)}<strong>${esc(m.away_team)}</strong></div>
      </div>
      <div class="match-result-cell">${resultCell}</div>
      <div class="match-choice-cell">${choiceCell}</div>
      <div class="match-points-cell ${pts===1?'good':pts===0?'bad':''}">${pts===1?'+1 PT':pts===0?'0 PT':'—'}</div>
    </article>`;
  }

  function dayGroups(matches){
    const groups=new Map();
    matches.forEach(m=>{
      const d=kickoffDate(m.kickoff);
      const key=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'unknown';
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(m);
    });
    return [...groups.values()];
  }

  function getDays(){
    return [...new Set(rows.map(m=>Number(m.matchday)).filter(Number.isFinite))].sort((a,b)=>a-b);
  }

  function chooseDefaultDay(days){
    if(selectedDay!==null&&days.includes(Number(selectedDay))) return;
    const now=Date.now();
    const active=rows.find(m=>m.status==='live'||(m.status==='scheduled'&&m.kickoff&&new Date(m.kickoff).getTime()>=now));
    selectedDay=active?.matchday!=null?Number(active.matchday):days[days.length-1];
  }

  function renderDayControls(days){
    chooseDefaultDay(days);
    const sel=$('#matchday-select');
    if(sel) sel.innerHTML=days.map(d=>`<option value="${d}" ${Number(d)===Number(selectedDay)?'selected':''}>J${String(d).padStart(2,'0')}</option>`).join('');
    const idx=days.indexOf(Number(selectedDay));
    const prev=$('#day-prev'), next=$('#day-next');
    if(prev){prev.disabled=idx<=0;prev.dataset.dayNav=idx>0?days[idx-1]:'';}
    if(next){next.disabled=idx<0||idx>=days.length-1;next.dataset.dayNav=idx>=0&&idx<days.length-1?days[idx+1]:'';}
  }

  function renderKpis(shown){
    const finished=shown.filter(isFinished);
    const played=finished.filter(m=>myVotes.has(Number(m.id)));
    const good=played.filter(m=>myVotes.get(Number(m.id))===resultFromScore(m)).length;
    const box=$('#matchday-kpis');
    if(!box) return;
    const values=box.querySelectorAll('b');
    if(values[0]) values[0].textContent=`${finished.length} / ${shown.length}`;
    if(values[1]) values[1].textContent=String(good);
    if(values[2]) values[2].innerHTML=`${good} <small>PTS</small>`;
  }

  function renderSummary(){
    const box=$('#community-vote-summary');
    if(!box) return;
    if(!user){box.classList.add('is-hidden');return;}
    const playedAll=rows.filter(m=>myVotes.has(Number(m.id)));
    const finished=playedAll.filter(isFinished);
    const good=finished.filter(m=>myVotes.get(Number(m.id))===resultFromScore(m)).length;
    const rate=finished.length?Math.round(good*100/finished.length):0;
    box.classList.remove('is-hidden');
    $('#side-total-points').innerHTML=`${good} <small>Point${good===1?'':'s'}</small>`;
    $('#side-good').textContent=good;
    $('#side-played').textContent=playedAll.length;
    $('#side-rate').textContent=`${rate}%`;
  }

  function render(){
    if(!rows.length){
      root.innerHTML='<div class="community-empty"><b>Aucun match pour cette compétition.</b></div>';
      renderSummary();
      return;
    }
    const days=getDays();
    if(!days.length){
      root.innerHTML='<div class="community-empty"><b>Aucune journée disponible.</b></div>';
      return;
    }
    renderDayControls(days);
    const shown=rows.filter(m=>Number(m.matchday)===Number(selectedDay));
    renderKpis(shown);

    root.innerHTML=dayGroups(shown).map(group=>`
      <section class="premium-date-group">
        <div class="date-bar">${dayLabel(group[0]?.kickoff)}</div>
        <div class="match-table-head">
          <span>HEURE</span><span>MATCH</span><span>RÉSULTAT / PRONO</span><span>MON PRONO</span><span>POINTS</span>
        </div>
        ${group.map(matchRow).join('')}
      </section>
    `).join('');
    renderSummary();
  }

  async function load(){
    root.innerHTML='<div class="community-empty">Chargement des matchs…</div>';
    const {data,error}=await db.rpc('community_matches_feed',{p_competition:comp});
    if(error){
      root.innerHTML=`<div class="community-empty"><b>Erreur de chargement Supabase</b><br><small>${esc(error.message)}</small></div>`;
      return;
    }
    rows=(data||[]).filter(m=>m.kickoff).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
    await loadMine();
    render();
  }

  document.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-vote-comp]');
    if(tab){
      $$('[data-vote-comp]').forEach(b=>b.classList.remove('active'));
      tab.classList.add('active');
      comp=tab.dataset.voteComp;
      selectedDay=null;
      await load();
      return;
    }

    const nav=e.target.closest('[data-day-nav]');
    if(nav&&nav.dataset.dayNav){
      selectedDay=Number(nav.dataset.dayNav);
      render();
      return;
    }

    const btn=e.target.closest('[data-pick]');
    if(!btn) return;
    if(!user){$('.login-trigger')?.click();return;}
    const row=btn.closest('[data-match]');
    if(!row) return;
    const id=Number(row.dataset.match);
    btn.disabled=true;
    const {error}=await db.rpc('save_my_prediction',{p_match_id:id,p_pick:btn.dataset.pick});
    if(error){alert(error.message);btn.disabled=false;return;}
    myVotes.set(id,btn.dataset.pick);
    showPronoToast('✓ Prono enregistré');
    render();
  });

  document.addEventListener('change',e=>{
    if(e.target.id==='matchday-select'){
      selectedDay=Number(e.target.value);
      render();
    }
  });

  (async()=>{await getUser();await load()})();
})();