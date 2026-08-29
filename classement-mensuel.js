(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const cfg=window.FOOTIX_SUPABASE||{};
  const body=$('#monthly-ranking-body');
  if(!body || !window.supabase || !cfg.url || !cfg.key) return;
  const db=window.supabase.createClient(cfg.url,cfg.key);
  let comp='';

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const monthInput=$('#ranking-month');
  const now=new Date();
  monthInput.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  function monthDate(){
    const [y,m]=monthInput.value.split('-').map(Number);
    return `${y}-${String(m).padStart(2,'0')}-01`;
  }
  function monthInfo(value=monthInput.value){
    const [y,m]=value.split('-').map(Number);
    const first=new Date(y,m-1,1);
    const last=new Date(y,m,0);
    const monthName=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(first).toUpperCase();
    const monthOnly=new Intl.DateTimeFormat('fr-FR',{month:'long'}).format(first);
    return {y,m,first,last,monthName,monthOnly};
  }
  function label(){ return monthInfo().monthName; }
  function updatePeriodTitle(){
    const x=monthInfo();
    const title=document.querySelector('#ranking-title-month');
    const range=document.querySelector('#ranking-date-range');
    if(title) title.textContent=x.monthName;
    if(range) range.textContent=`Du 1er au ${x.last.getDate()} ${x.monthOnly} ${x.y}. Le classement évolue automatiquement à chaque résultat définitif.`;
  }
  function medal(rank){
    return rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
  }
  function reward(rank){
    return rank===1?'OR':rank===2?'ARGENT':rank===3?'BRONZE':'';
  }
  function podium(rows){
    const root=$('#monthly-podium');
    const map=new Map(rows.slice(0,3).map(r=>[Number(r.rank),r]));
    const order=[2,1,3];
    root.innerHTML=order.map(rank=>{
      const r=map.get(rank);
      if(!r) return `<article class="monthly-podium-card place-${rank} empty"><span class="podium-medal">${medal(rank)}</span><b>${reward(rank)}</b><strong>—</strong><small>0 pt</small></article>`;
      return `<article class="monthly-podium-card place-${rank}">
        <span class="podium-medal">${medal(rank)}</span>
        <b>${reward(rank)}</b>
        <span class="avatar-orb avatar-${esc(r.avatar_slug)}"><img src="avatars/${esc(r.avatar_slug)}.jpg" alt=""></span>
        <strong>${esc(r.username)}</strong>
        <em>${r.points} PT${Number(r.points)>1?'S':''}</em>
        <small>${r.success_rate}% · ${r.played} pronos</small>
      </article>`;
    }).join('');
  }

  async function load(){
    updatePeriodTitle();
    body.innerHTML='<tr><td colspan="5" class="community-empty">Chargement…</td></tr>';
    $('#ranking-period-label').textContent=label();
    const {data,error}=await db.rpc('monthly_leaderboard',{
      p_month:monthDate(),
      p_competition:comp||null,
      p_limit:100
    });
    if(error){
      body.innerHTML=`<tr><td colspan="5" class="community-empty">Classement indisponible.<br><small>${esc(error.message)}</small></td></tr>`;
      $('#monthly-podium').innerHTML='<div class="community-empty">Podium indisponible.</div>';
      return;
    }
    const rows=data||[];
    podium(rows);
    body.innerHTML=rows.length?rows.map(r=>`
      <tr class="${Number(r.rank)<=3?'top-rank rank-'+r.rank:''}">
        <td><span class="ranking-rank">${Number(r.rank)<=3?medal(Number(r.rank)):r.rank}</span></td>
        <td><div class="rank-player"><span class="avatar-orb avatar-${esc(r.avatar_slug)}"><img src="avatars/${esc(r.avatar_slug)}.jpg" alt=""></span><strong>${esc(r.username)}</strong>${Number(r.rank)<=3?`<small class="rank-reward">${reward(Number(r.rank))}</small>`:''}</div></td>
        <td><strong>${r.points}</strong></td>
        <td>${r.played}</td>
        <td>${r.success_rate}%</td>
      </tr>`).join('')
      :'<tr><td colspan="5" class="community-empty">Pas encore de match terminé avec pronostics sur ce mois.</td></tr>';
  }


  function previousMonths(count=12){
    const result=[];
    const today=new Date();
    for(let i=1;i<=count;i++){
      const d=new Date(today.getFullYear(),today.getMonth()-i,1);
      result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return result;
  }

  async function loadHistory(){
    const root=$('#winners-history-list');
    if(!root) return;
    const cards=[];
    for(const ym of previousMonths(12)){
      const [y,m]=ym.split('-').map(Number);
      const {data,error}=await db.rpc('monthly_leaderboard',{
        p_month:`${ym}-01`,
        p_competition:null,
        p_limit:3
      });
      if(error) continue;
      const winners=data||[];
      if(!winners.length) continue;
      const d=new Date(y,m-1,1);
      const monthName=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d).toUpperCase();
      cards.push(`<article class="winner-month-card">
        <div class="winner-month-title"><span>PALMARÈS</span><b>${monthName}</b></div>
        <div class="winner-three">
          ${[1,2,3].map(rank=>{
            const r=winners.find(x=>Number(x.rank)===rank);
            const medalIcon=medal(rank), level=reward(rank);
            if(!r) return `<div class="winner-line empty"><span>${medalIcon}</span><b>${level}</b><strong>—</strong><em>—</em></div>`;
            return `<div class="winner-line place-${rank}">
              <span>${medalIcon}</span><b>${level}</b>
              <span class="avatar-orb avatar-${esc(r.avatar_slug)}"><img src="avatars/${esc(r.avatar_slug)}.jpg" alt=""></span>
              <strong>${esc(r.username)}</strong><em>${r.points} pt${Number(r.points)>1?'s':''}</em>
            </div>`;
          }).join('')}
        </div>
      </article>`);
    }
    root.innerHTML=cards.length?cards.join(''):'<div class="community-empty">Aucun mois terminé avec des gagnants pour le moment.</div>';
  }

  $$('#monthly-ranking-comp button').forEach(btn=>btn.addEventListener('click',()=>{
    comp=btn.dataset.comp||'';
    $$('#monthly-ranking-comp button').forEach(b=>b.classList.toggle('active',b===btn));
    load();
  }));
  monthInput.addEventListener('change',load);
  load();
  loadHistory();
})();