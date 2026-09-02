(() => {
  'use strict';

  const cfg=window.FOOTIX_SUPABASE||{};
  const root=document.querySelector('#public-player-root');
  if(!root || !window.supabase || !cfg.url || !cfg.key) return;

  const db=window.supabase.createClient(cfg.url,cfg.key);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const num=v=>Number(v)||0;
  const id=new URLSearchParams(location.search).get('id');

  const compName=c=>c==='L1'?'LIGUE 1':c==='UCL'?'LIGUE DES CHAMPIONS':String(c||'').toUpperCase();
  const medal=r=>Number(r)===1?'🥇':Number(r)===2?'🥈':'🥉';
  const level=r=>Number(r)===1?'OR':Number(r)===2?'ARGENT':'BRONZE';

  function monthName(v){
    if(!v) return '';
    const [y,m]=String(v).slice(0,7).split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).toUpperCase();
  }

  function matchDate(v){
    if(!v) return '';
    return new Intl.DateTimeFormat('fr-FR',{
      day:'2-digit',month:'short',year:'numeric'
    }).format(new Date(v));
  }

  function predictionLabel(p){
    const exact=p.predicted_home_score!==null && p.predicted_home_score!==undefined &&
                p.predicted_away_score!==null && p.predicted_away_score!==undefined;

    if(exact){
      return `<span class="public-pred-score">SCORE PRONOSTIQUÉ <b>${num(p.predicted_home_score)}–${num(p.predicted_away_score)}</b></span>`;
    }

    const pick=String(p.pick||'').toUpperCase();
    const oldLabel=pick==='1'?'VICTOIRE DOMICILE':pick==='N'?'MATCH NUL':pick==='2'?'VICTOIRE EXTÉRIEUR':'PRONO 1/N/2';
    return `<span class="public-pred-old">ANCIEN PRONO : <b>${esc(pick||'—')}</b> · ${oldLabel}</span>`;
  }

  function verdict(p){
    if(num(p.points)===3) return '<span class="public-verdict exact">🎯 SCORE PARFAIT · +3 PTS</span>';
    if(num(p.points)===1) return '<span class="public-verdict good">✓ BONNE ISSUE · +1 PT</span>';
    return '<span class="public-verdict miss">✕ PRONO RATÉ · 0 PT</span>';
  }

  function render(d){
    const p=d?.profile;
    if(!p){
      root.innerHTML='<div class="community-empty">Joueur introuvable.</div>';
      return;
    }

    document.title=`${p.username} — Footix Prono`;
    const total=d.total||{};
    const comps=d.competitions||[];
    const medals=d.medals||[];
    const predictions=d.recent_predictions||[];

    root.innerHTML=`
      <section class="public-player-hero">
        <div class="public-player-identity">
          <span class="avatar-orb avatar-${esc(p.avatar_slug)} public-player-avatar">
            <img src="avatars/${esc(p.avatar_slug)}.jpg" alt="">
          </span>
          <div>
            <span class="players-eyebrow">PROFIL PUBLIC</span>
            <h1>${esc(p.username)}</h1>
            <p>Membre de la communauté Footix Prono.</p>
          </div>
        </div>
        <div class="public-player-global">
          <div><small>POINTS TOTAL</small><b>${num(total.points)}</b></div>
          <div><small>PRONOS TERMINÉS</small><b>${num(total.played)}</b></div>
          <div><small>RÉUSSITE</small><b>${num(total.success_rate).toLocaleString('fr-FR')}%</b></div>
        </div>
      </section>

      <section class="public-player-section">
        <div class="public-section-head">
          <div><span>PERFORMANCES</span><h2>STATISTIQUES PAR COMPÉTITION</h2></div>
        </div>
        <div class="public-comp-grid">
          ${['L1','UCL'].map(code=>{
            const c=comps.find(x=>x.competition===code)||{points:0,played:0,success_rate:0};
            return `<article class="public-comp-card">
              <span>${compName(code)}</span>
              <strong>${num(c.points)} PTS</strong>
              <div><b>${num(c.played)}</b><small>PRONOS</small></div>
              <div><b>${num(c.success_rate).toLocaleString('fr-FR')}%</b><small>RÉUSSITE</small></div>
            </article>`;
          }).join('')}
        </div>
      </section>

      <section class="public-player-section">
        <div class="public-section-head">
          <div><span>PALMARÈS</span><h2>PODIUMS MENSUELS</h2></div>
        </div>
        <div class="public-medals">
          ${medals.length?medals.map(m=>`
            <article class="public-medal place-${num(m.rank)}">
              <span class="public-medal-icon">${medal(m.rank)}</span>
              <div><small>${level(m.rank)}</small><strong>${monthName(m.month)}</strong></div>
              <div class="public-medal-stats"><b>${num(m.points)} PTS</b><span>${num(m.success_rate).toLocaleString('fr-FR')}% · ${num(m.played)} pronos</span></div>
            </article>
          `).join(''):'<div class="profile-empty-small">Pas encore de podium enregistré.</div>'}
        </div>
      </section>

      <section class="public-player-section">
        <div class="public-section-head">
          <div><span>HISTORIQUE PUBLIC</span><h2>DERNIERS PRONOSTICS TERMINÉS</h2></div>
          <p>Les pronostics ne sont visibles qu’une fois le match terminé.</p>
        </div>
        <div class="public-predictions">
          ${predictions.length?predictions.map(x=>`
            <article class="public-prediction">
              <div class="public-pred-match">
                <small>${esc(compName(x.competition))} · ${esc(matchDate(x.kickoff))}</small>
                <strong>${esc(x.home_team)} <span>${num(x.home_score)}–${num(x.away_score)}</span> ${esc(x.away_team)}</strong>
              </div>
              <div class="public-pred-result">
                ${predictionLabel(x)}
                ${verdict(x)}
              </div>
            </article>
          `).join(''):'<div class="profile-empty-small">Aucun pronostic terminé pour le moment.</div>'}
        </div>
      </section>
    `;
  }

  async function load(){
    if(!id || !/^[0-9a-f-]{36}$/i.test(id)){
      root.innerHTML='<div class="community-empty">Lien de joueur invalide.</div>';
      return;
    }

    const {data,error}=await db.rpc('public_player_profile',{p_user_id:id});
    if(error){
      console.error('public_player_profile:',error);
      root.innerHTML=`<div class="community-empty"><b>Impossible de charger ce profil.</b><br><small>${esc(error.message)}</small></div>`;
      return;
    }

    render(data);
  }

  load();
})();