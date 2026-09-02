(() => {
  'use strict';

  const cfg=window.FOOTIX_SUPABASE||{};
  const root=document.querySelector('#players-grid');
  if(!root || !window.supabase || !cfg.url || !cfg.key) return;

  const db=window.supabase.createClient(cfg.url,cfg.key);
  const search=document.querySelector('#players-search');
  const sort=document.querySelector('#players-sort');
  const count=document.querySelector('#players-count');
  let rows=[];

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  const num=v=>Number(v)||0;

  function render(){
    const q=(search?.value||'').trim().toLocaleLowerCase('fr-FR');
    const mode=sort?.value||'name';

    let filtered=rows.filter(r=>
      !q || String(r.username||'').toLocaleLowerCase('fr-FR').includes(q)
    );

    filtered=[...filtered].sort((a,b)=>{
      if(mode==='points') return num(b.points)-num(a.points) || String(a.username).localeCompare(String(b.username),'fr');
      if(mode==='rate') return num(b.success_rate)-num(a.success_rate) || num(b.points)-num(a.points);
      if(mode==='played') return num(b.played)-num(a.played) || num(b.points)-num(a.points);
      return String(a.username||'').localeCompare(String(b.username||''),'fr',{sensitivity:'base'});
    });

    if(!filtered.length){
      root.innerHTML='<div class="community-empty">Aucun joueur ne correspond à cette recherche.</div>';
      return;
    }

    root.innerHTML=filtered.map(r=>`
      <a class="player-card" href="joueur.html?id=${encodeURIComponent(r.user_id)}">
        <div class="player-card-top">
          <span class="avatar-orb avatar-${esc(r.avatar_slug)} player-card-avatar">
            <img src="avatars/${esc(r.avatar_slug)}.jpg" alt="">
          </span>
          <div class="player-card-identity">
            <small>MEMBRE FOOTIX</small>
            <strong>${esc(r.username)}</strong>
          </div>
          <span class="player-card-arrow">→</span>
        </div>
        <div class="player-card-stats">
          <div><small>POINTS</small><b>${num(r.points)}</b></div>
          <div><small>PRONOS</small><b>${num(r.played)}</b></div>
          <div><small>RÉUSSITE</small><b>${num(r.success_rate).toLocaleString('fr-FR')}%</b></div>
        </div>
        <span class="player-card-cta">VOIR LA FICHE</span>
      </a>
    `).join('');
  }

  async function load(){
    const {data,error}=await db.rpc('public_players');
    if(error){
      console.error('public_players:',error);
      root.innerHTML=`<div class="community-empty"><b>Impossible de charger les joueurs.</b><br><small>${esc(error.message)}</small></div>`;
      return;
    }

    rows=data||[];
    if(count) count.textContent=rows.length;
    render();
  }

  search?.addEventListener('input',render);
  sort?.addEventListener('change',render);
  load();
})();