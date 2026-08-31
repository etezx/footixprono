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
  const shortDate=v=>v?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(v)):'—';
  const logo=id=>id?`https://sports.bzzoiro.com/img/team/${encodeURIComponent(id)}/?bg=transparent`:'';
  const isFinished=m=>m.status==='finished'||!!m.result_pick;
  const isLive=m=>m.status==='live';
  const locked=m=>m.status!=='scheduled'||!m.kickoff||Date.now()>=new Date(m.kickoff).getTime();

  function pickFromScores(home,away){
    if(home==null||away==null||home===''||away==='') return null;
    const h=Number(home), a=Number(away);
    if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0) return null;
    return h>a?'1':h<a?'2':'N';
  }

  function resultFromScore(m){
    if(m.result_pick) return m.result_pick;
    if(!isFinished(m)||m.home_score==null||m.away_score==null) return null;
    return Number(m.home_score)>Number(m.away_score)?'1':Number(m.home_score)<Number(m.away_score)?'2':'N';
  }

  function votePick(v){
    if(!v) return null;
    return pickFromScores(v.home,v.away)||v.pick||null;
  }

  function hasExactScore(v){
    return !!v && v.home!=null && v.away!=null;
  }

  function pointsFor(m,v){
    if(!isFinished(m)||!v) return null;
    if(
      hasExactScore(v) &&
      m.home_score!=null &&
      m.away_score!=null &&
      Number(v.home)===Number(m.home_score) &&
      Number(v.away)===Number(m.away_score)
    ) return 3;
    return votePick(v)===resultFromScore(m)?1:0;
  }

  function verdictFor(m,v){
    const pts=pointsFor(m,v);
    if(pts===3) return {cls:'exact',text:'🎯 SCORE PARFAIT !',points:'+3 PTS'};
    if(pts===1) return {cls:'good',text:'✓ BON RÉSULTAT !',points:'+1 PT'};
    if(pts===0) return {cls:'bad',text:'✕ PRONO RATÉ !',points:'0 PT'};
    return null;
  }

  function scoreText(v){
    return hasExactScore(v)?`${v.home} - ${v.away}`:(v?.pick||'—');
  }

  async function getUser(){
    const {data}=await db.auth.getUser();
    user=data.user||null;
    const note=$('#vote-session-note');
    if(note) note.innerHTML=user
      ? '<span>✓</span> Saisis ton score puis valide-le. Tu peux le modifier jusqu’au coup d’envoi.'
      : '<span>ⓘ</span> Connecte-toi pour enregistrer tes pronostics.';
  }

  async function loadMine(){
    myVotes=new Map();
    if(!user||!rows.length) return;
    const {data,error}=await db.from('predictions')
      .select('match_id,pick,predicted_home_score,predicted_away_score')
      .eq('user_id',user.id)
      .in('match_id',rows.map(m=>m.id));
    if(!error) (data||[]).forEach(v=>myVotes.set(Number(v.match_id),{
      pick:v.pick,
      home:v.predicted_home_score,
      away:v.predicted_away_score
    }));
  }

  function crest(id,name){
    const src=logo(id);
    if(!src) return `<span class="club-logo club-logo-fallback">${esc(String(name||'?').slice(0,2).toUpperCase())}</span>`;
    return `<span class="club-logo"><img src="${src}" alt="" loading="lazy" onerror="this.parentElement.classList.add('club-logo-broken');this.style.display='none';this.parentElement.textContent='${esc(String(name||'?').slice(0,2).toUpperCase())}'"></span>`;
  }

  function scoreEditor(m,mine,disabled=false){
    const h=hasExactScore(mine)?mine.home:'';
    const a=hasExactScore(mine)?mine.away:'';
    return `<div class="score-prono-editor">
      <div class="score-inputs">
        <input class="score-prono-input" data-score-home type="number" min="0" step="1" inputmode="numeric" aria-label="Buts ${esc(m.home_team)}" value="${h}" ${disabled?'disabled':''}>
        <span>–</span>
        <input class="score-prono-input" data-score-away type="number" min="0" step="1" inputmode="numeric" aria-label="Buts ${esc(m.away_team)}" value="${a}" ${disabled?'disabled':''}>
      </div>
      <button class="score-save-btn" type="button" data-save-score ${disabled?'disabled':''}>${mine?'MODIFIER':'VALIDER'}</button>
    </div>`;
  }

  function pendingPick(mine){
    const p=votePick(mine);
    if(!p) return '<span class="muted-dash">—</span>';
    return `<div class="pending-score-wrap">
      <span class="my-score pending">${scoreText(mine)}</span>
      <small>ISSUE ${p}</small>
    </div>`;
  }

  function matchRow(m){
    const mine=myVotes.get(Number(m.id));
    const final=resultFromScore(m);
    const finished=isFinished(m);
    const live=isLive(m);
    const lock=locked(m);
    const pts=pointsFor(m,mine);
    const verdict=verdictFor(m,mine);

    let resultCell='';
    let choiceCell='';

    if(finished){
      resultCell=`<div class="result-finished">
        <b>${m.home_score ?? '—'} - ${m.away_score ?? '—'}</b>
        <span class="result-pick">RÉSULTAT ${final||'—'}</span>
      </div>`;

      choiceCell=mine
        ? `<div class="my-score-wrap ${verdict?.cls||''}">
            <span class="my-score ${verdict?.cls||''}">${scoreText(mine)}</span>
            <small>${verdict?.text||''}</small>
          </div>`
        : '<span class="muted-dash">—</span>';
    }else if(lock){
      resultCell=mine
        ? `<div class="locked-score"><b>${scoreText(mine)}</b><small>PRONO VERROUILLÉ</small></div>`
        : '<span class="muted-dash">—</span>';
      choiceCell=mine
        ? `<span class="my-pick pending">${votePick(mine)||'—'}</span>`
        : '<span class="muted-dash">—</span>';
    }else{
      resultCell=scoreEditor(m,mine,false);
      choiceCell=pendingPick(mine);
    }

    return `<article class="premium-match-row" data-match="${m.id}">
      <div class="match-time">
        <small class="match-short-date">${shortDate(m.kickoff)}</small>
        <b>${time(m.kickoff)}</b>
        <span class="match-status ${finished?'finished':live?'live':'upcoming'}">${finished?'TERMINÉ':live?'EN DIRECT':'À VENIR'}</span>
      </div>
      <div class="match-clubs">
        <div class="club home">${crest(m.home_team_id,m.home_team)}<strong>${esc(m.home_team)}</strong></div>
        <div class="score-core">${finished||live?`<b>${m.home_score ?? '—'} <i>-</i> ${m.away_score ?? '—'}</b>`:'<b>–</b>'}</div>
        <div class="club away">${crest(m.away_team_id,m.away_team)}<strong>${esc(m.away_team)}</strong></div>
      </div>
      <div class="match-result-cell">${resultCell}</div>
      <div class="match-choice-cell">${choiceCell}</div>
      <div class="match-points-cell ${pts===3?'exact':pts===1?'good':pts===0?'bad':''}">${verdict?.points||'—'}</div>
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
    const good=played.filter(m=>pointsFor(m,myVotes.get(Number(m.id)))>0).length;
    const points=played.reduce((sum,m)=>sum+(pointsFor(m,myVotes.get(Number(m.id)))||0),0);
    const box=$('#matchday-kpis');
    if(!box) return;
    const values=box.querySelectorAll('b');
    if(values[0]) values[0].textContent=`${finished.length} / ${shown.length}`;
    if(values[1]) values[1].textContent=String(good);
    if(values[2]) values[2].textContent=String(points);
  }

  function renderSummary(){
    const box=$('#community-vote-summary');
    if(!box) return;
    if(!user){box.classList.add('is-hidden');return;}
    const playedAll=rows.filter(m=>myVotes.has(Number(m.id)));
    const finished=playedAll.filter(isFinished);
    const good=finished.filter(m=>pointsFor(m,myVotes.get(Number(m.id)))>0).length;
    const points=finished.reduce((sum,m)=>sum+(pointsFor(m,myVotes.get(Number(m.id)))||0),0);
    const rate=finished.length?Math.round(good*100/finished.length):0;
    box.classList.remove('is-hidden');
    $('#side-total-points').innerHTML=`${points} <small>Point${points===1?'':'s'}</small>`;
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
          <span>HEURE</span><span>MATCH</span><span>SCORE / PRONO</span><span>MON PRONO</span><span>POINTS</span>
        </div>
        ${group.map(matchRow).join('')}
      </section>
    `).join('');
    renderSummary();
  }

  async function saveScore(btn){
    if(!user){$('.login-trigger')?.click();return;}

    const row=btn.closest('[data-match]');
    if(!row) return;

    const id=Number(row.dataset.match);
    const match=rows.find(m=>Number(m.id)===id);
    if(!match||locked(match)){
      showPronoToast('🔒 Pronostic verrouillé');
      render();
      return;
    }

    const homeInput=$('[data-score-home]',row);
    const awayInput=$('[data-score-away]',row);
    const homeRaw=homeInput?.value?.trim() ?? '';
    const awayRaw=awayInput?.value?.trim() ?? '';

    if(homeRaw===''||awayRaw===''){
      showPronoToast('⚠️ Saisis les deux scores');
      return;
    }

    const home=Number(homeRaw);
    const away=Number(awayRaw);

    if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0){
      showPronoToast('⚠️ Score invalide');
      return;
    }

    btn.disabled=true;
    const {error}=await db.rpc('save_my_score_prediction',{
      p_match_id:id,
      p_home_score:home,
      p_away_score:away
    });

    if(error){
      alert(error.message);
      btn.disabled=false;
      return;
    }

    const pick=pickFromScores(home,away);
    myVotes.set(id,{pick,home,away});
    showPronoToast(`✓ Prono ${home}-${away} enregistré`);

    try{ await db.rpc('notify_my_prediction',{p_match_id:id}); }catch(_e){}
    if(window.footixNotificationsRefresh) window.footixNotificationsRefresh();
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

    const save=e.target.closest('[data-save-score]');
    if(save){
      await saveScore(save);
    }
  });

  document.addEventListener('keydown',async e=>{
    if(e.key!=='Enter'||!e.target.matches('.score-prono-input')) return;
    e.preventDefault();
    const row=e.target.closest('[data-match]');
    const save=row?.querySelector('[data-save-score]');
    if(save&&!save.disabled) await saveScore(save);
  });

  document.addEventListener('change',e=>{
    if(e.target.id==='matchday-select'){
      selectedDay=Number(e.target.value);
      render();
    }
  });

  (async()=>{await getUser();await load()})();
})();
