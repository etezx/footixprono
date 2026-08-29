(() => {
 const $=(s,r=document)=>r.querySelector(s);
 const cfg=window.FOOTIX_SUPABASE||{};
 if(!window.supabase||!cfg.url||!cfg.key) return;
 const db=window.supabase.createClient(cfg.url,cfg.key);
 const avatars=['footix-classique','footix-capitaine','footix-coach','footix-gardien','footix-supporter','footix-ultras','footix-lunettes','footix-casque','footix-tacticien','footix-elite','footix-europe','footix-champion'];
 const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const set=(id,v)=>{const e=$('#'+id);if(e)e.textContent=v};
 const monthName=v=>{
   if(!v)return '';
   const [y,m]=String(v).slice(0,7).split('-').map(Number);
   return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));
 };
 const medal=r=>Number(r)===1?'🥇':Number(r)===2?'🥈':'🥉';
 const level=r=>Number(r)===1?'OR':Number(r)===2?'ARGENT':'BRONZE';
 let user=null,profile=null,selectedAvatar='footix-classique';

 function avatarPath(slug){return `avatars/${slug}.jpg`}
 function renderPicker(){
   const root=$('#profile-avatar-picker'); if(!root)return;
   root.innerHTML=avatars.map(a=>`<button type="button" data-avatar="${a}" class="${a===selectedAvatar?'selected':''}"><img src="${avatarPath(a)}" alt="${esc(a)}"></button>`).join('');
 }
 function renderIdentity(){
   if(!profile)return;
   set('profile-username',profile.username||'MEMBRE FOOTIX');
   set('profile-email',user?.email||'');
   const av=$('#profile-avatar');
   if(av){av.className=`profile-avatar avatar-orb avatar-${profile.avatar_slug||'footix-classique'}`;av.innerHTML=`<img src="${avatarPath(profile.avatar_slug||'footix-classique')}" alt="">`}
   const u=$('#profile-edit-username'),b=$('#profile-edit-bio');
   if(u)u.value=profile.username||''; if(b)b.value=profile.bio||'';
   selectedAvatar=profile.avatar_slug||'footix-classique';renderPicker();
 }
 function renderDashboard(d){
   const total=d?.total||{};
   set('ps-total-points',total.points??0);set('ps-total-played',total.played??0);set('ps-total-rate',`${total.success_rate??0}%`);
   const comps=d?.competitions||[];
   $('#profile-comp-stats').innerHTML=['L1','UCL'].map(code=>{
     const c=comps.find(x=>x.competition===code)||{played:0,points:0,success_rate:0};
     return `<div><span>${code==='L1'?'LIGUE 1':'LIGUE DES CHAMPIONS'}</span><strong>${c.points} pts</strong><small>${c.success_rate}% · ${c.played} pronos terminés</small></div>`;
   }).join('');
   const medals=d?.medals||[];
   $('#profile-medals').innerHTML=medals.length?medals.map(m=>`<div class="profile-medal ${level(m.rank).toLowerCase()}"><span>${medal(m.rank)}</span><div><b>${level(m.rank)}</b><small>${monthName(m.month).toUpperCase()} · ${m.points} PTS</small></div></div>`).join(''):'<div class="profile-empty-small">Ton premier podium apparaîtra ici.</div>';
   const months=d?.months||[];
   const max=Math.max(1,...months.map(m=>Number(m.points)||0));
   $('#profile-month-history').innerHTML=months.length?months.map(m=>`<div class="history-month"><span>${monthName(m.month)}</span><div class="history-bar"><i style="width:${Math.max(4,(Number(m.points)||0)/max*100)}%"></i></div><b>${m.points} pts</b><small>${m.success_rate}%</small></div>`).join(''):'<div class="profile-empty-small">Tes performances mensuelles apparaîtront ici.</div>';
 }
 async function load(){
   const {data:{user:u}}=await db.auth.getUser();user=u||null;
   if(!user)return;
   $('#profile-login')?.classList.add('is-hidden');
   const [{data:p},{data:s},{data:d}]=await Promise.all([
     db.from('profiles').select('username,avatar_slug,bio').eq('id',user.id).single(),
     db.rpc('my_prediction_stats',{p_month:null}),
     db.rpc('my_profile_dashboard')
   ]);
   profile=p||{};renderIdentity();
   if(s?.length){
     const x=s[0];set('ps-month-points',`${x.month_points} pt${Number(x.month_points)>1?'s':''}`);set('ps-month-rank',Number(x.month_rank)>0?`#${x.month_rank}`:'—');set('ps-month-rate',`${x.month_success_rate}%`);set('ps-month-played',x.month_played);
   }
   const now=new Date();set('profile-stats-month',new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(now).toUpperCase());
   if(d)renderDashboard(d);
 }
 document.addEventListener('click',e=>{
   const b=e.target.closest('[data-avatar]');if(!b)return;
   selectedAvatar=b.dataset.avatar;renderPicker();
 });
 $('#profile-edit-form')?.addEventListener('submit',async e=>{
   e.preventDefault();if(!user)return;
   const username=$('#profile-edit-username').value.trim(),bio=$('#profile-edit-bio').value.trim();
   const note=$('#profile-save-note');note.textContent='Enregistrement…';
   const {error}=await db.rpc('update_my_profile',{p_username:username,p_avatar_slug:selectedAvatar,p_bio:bio});
   if(error){note.textContent=error.message;return}
   note.textContent='✓ Profil enregistré';profile={...profile,username,bio,avatar_slug:selectedAvatar};renderIdentity();
 });
 db.auth.onAuthStateChange(()=>setTimeout(load,0));
 load();
})();