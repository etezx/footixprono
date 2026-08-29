(() => {
 const $=(s,r=document)=>r.querySelector(s);
 const cfg=window.FOOTIX_SUPABASE||{};
 const state=$('#admin-access-state'),app=$('#admin-rewards-app');
 if(!window.supabase||!cfg.url||!cfg.key){state.textContent='Supabase indisponible.';return;}
 const db=window.supabase.createClient(cfg.url,cfg.key);
 const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const medal=r=>Number(r)===1?'🥇':Number(r)===2?'🥈':'🥉';
 const level=r=>Number(r)===1?'OR':Number(r)===2?'ARGENT':'BRONZE';
 const monthLabel=v=>{
   const [y,m]=String(v).slice(0,7).split('-').map(Number);
   return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).toUpperCase();
 };
 const input=$('#admin-reward-month');
 const now=new Date();
 const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
 input.value=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;

 async function checkAdmin(){
   const {data:{user}}=await db.auth.getUser();
   if(!user){state.textContent='Connexion administrateur requise.';return false;}
   const {data,error}=await db.rpc('is_profile_admin',{p_user_id:user.id});
   if(error||!data){state.textContent='Accès refusé : compte administrateur requis.';return false;}
   state.classList.add('is-hidden');app.classList.remove('is-hidden');return true;
 }

 async function loadWinners(){
   const root=$('#admin-winners-list');
   root.innerHTML='<div class="community-empty">Chargement…</div>';
   const {data,error}=await db.rpc('admin_monthly_rewards',{p_month:null});
   if(error){root.innerHTML=`<div class="community-empty">${esc(error.message)}</div>`;return;}
   const rows=data||[];
   if(!rows.length){root.innerHTML='<div class="community-empty">Aucun mois finalisé pour le moment.</div>';return;}
   const groups={};
   rows.forEach(r=>(groups[r.month_start]??=[]).push(r));
   root.innerHTML=Object.entries(groups).map(([month,winners])=>`
     <section class="admin-month-block">
       <div class="admin-month-title"><span>MOIS FINALISÉ</span><b>${monthLabel(month)}</b></div>
       ${winners.map(w=>`
         <article class="admin-winner-row" data-month="${month}" data-rank="${w.rank}">
           <div class="admin-winner-id">
             <span class="admin-medal">${medal(w.rank)}</span>
             <span class="avatar-orb avatar-${esc(w.avatar_slug)}"><img src="avatars/${esc(w.avatar_slug)}.jpg" alt=""></span>
             <div><b>${esc(w.username)}</b><small>${level(w.rank)} · ${w.points} pts · ${w.success_rate}%</small></div>
           </div>
           <div class="admin-eligibility ${w.eligible?'ok':'no'}">${w.eligible?'✓ ÉLIGIBLE':'✕ NON ÉLIGIBLE'}</div>
           <select class="admin-status">
             ${['pending','contacted','delivered','ineligible','cancelled'].map(s=>`<option value="${s}" ${s===w.reward_status?'selected':''}>${({pending:'À traiter',contacted:'Contacté',delivered:'Remis',ineligible:'Inéligible',cancelled:'Annulé'})[s]}</option>`).join('')}
           </select>
           <input class="admin-note" placeholder="Note admin" value="${esc(w.admin_note||'')}">
           <button class="admin-save" type="button">ENREGISTRER</button>
         </article>`).join('')}
     </section>`).join('');
 }


 async function sendTestNotification(correct){
   const note=$('#admin-test-notif-note');
   note.textContent='Création de la notification de test…';
   const {error}=await db.rpc('admin_send_test_match_notification',{p_correct:correct});
   if(error){note.textContent='Erreur : '+error.message;return;}
   note.textContent=correct?'✓ Notification « bon prono » créée.':'✓ Notification « mauvais prono » créée.';
   if(window.footixNotificationsRefresh) await window.footixNotificationsRefresh();
 }
 $('#admin-test-good-prono')?.addEventListener('click',()=>sendTestNotification(true));
 $('#admin-test-bad-prono')?.addEventListener('click',()=>sendTestNotification(false));

 $('#admin-finalize-btn')?.addEventListener('click',async()=>{
   const note=$('#admin-finalize-note');
   if(!input.value){note.textContent='Choisis un mois.';return;}
   note.textContent='Finalisation…';
   const {data,error}=await db.rpc('finalize_monthly_contest',{p_month:`${input.value}-01`});
   if(error){note.textContent=error.message;return;}
   note.textContent=data?.already_finalized?'Ce mois était déjà finalisé.':`✓ Mois finalisé — ${data?.winners_saved||0} gagnant(s) enregistré(s).`;
   loadWinners();
 });

 $('#admin-winners-list')?.addEventListener('click',async e=>{
   const btn=e.target.closest('.admin-save');if(!btn)return;
   const row=btn.closest('.admin-winner-row');
   btn.disabled=true;btn.textContent='…';
   const {error}=await db.rpc('admin_update_reward',{
     p_month:row.dataset.month,
     p_rank:Number(row.dataset.rank),
     p_status:$('.admin-status',row).value,
     p_note:$('.admin-note',row).value||null
   });
   btn.disabled=false;btn.textContent=error?'ERREUR':'✓ OK';
   setTimeout(()=>btn.textContent='ENREGISTRER',1200);
 });

 $('#admin-reload-winners')?.addEventListener('click',loadWinners);

 (async()=>{if(await checkAdmin())loadWinners()})();
})();