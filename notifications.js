(() => {
 const cfg=window.FOOTIX_SUPABASE||{};
 if(!window.supabase||!cfg.url||!cfg.key)return;
 const db=window.supabase.createClient(cfg.url,cfg.key);
 const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 let user=null,items=[];
 window.footixToast=(text)=>{
   let t=document.querySelector('.footix-toast');
   if(!t){t=document.createElement('div');t.className='footix-toast';document.body.appendChild(t)}
   t.textContent=text;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1800);
 };
 function mount(){
   if(document.querySelector('#footix-notifications'))return;
   const host=document.createElement('div');
   host.id='footix-notifications';
   host.className='footix-notifications is-hidden';
   host.innerHTML=`<button class="notif-bell" type="button" aria-label="Notifications">🔔<span class="notif-count is-hidden">0</span></button>
   <div class="notif-panel is-hidden">
     <div class="notif-head"><b>NOTIFICATIONS</b><button type="button" class="notif-read-all">TOUT LIRE</button></div>
     <div class="notif-list"></div>
   </div>`;
   const topNav=document.querySelector('.topbar .v914-auth-nav');
    if(topNav){
      host.classList.add('notif-in-topnav');
      topNav.insertBefore(host,topNav.firstChild);
    }else{
      document.body.appendChild(host);
    }
   host.querySelector('.notif-bell').onclick=()=>host.querySelector('.notif-panel').classList.toggle('is-hidden');
   host.querySelector('.notif-read-all').onclick=async()=>{await db.rpc('mark_notification_read',{p_id:null});items=items.map(x=>({...x,read_at:x.read_at||new Date().toISOString()}));render()};
   host.querySelector('.notif-list').onclick=async e=>{
     const row=e.target.closest('[data-notif]');if(!row)return;
     const id=Number(row.dataset.notif),item=items.find(x=>Number(x.id)===id);
     await db.rpc('mark_notification_read',{p_id:id});
     if(item?.href) location.href=item.href; else load();
   };
 }
 function ago(v){
   const mins=Math.floor((Date.now()-new Date(v))/60000);
   if(mins<1)return 'À l’instant';if(mins<60)return `${mins} min`;
   const h=Math.floor(mins/60);if(h<24)return `${h} h`;
   return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(v));
 }
 function render(){
   const host=document.querySelector('#footix-notifications');if(!host)return;
   const unread=items.filter(x=>!x.read_at).length,c=host.querySelector('.notif-count');
   c.textContent=unread;c.classList.toggle('is-hidden',!unread);
   host.querySelector('.notif-list').innerHTML=items.length?items.map(n=>`<button type="button" data-notif="${n.id}" class="notif-item ${n.read_at?'':'unread'}">
     <span class="notif-dot"></span><span><b>${esc(n.title)}</b><small>${esc(n.message)}</small><em>${ago(n.created_at)}</em></span>
   </button>`).join(''):'<div class="notif-empty">Aucune notification pour le moment.</div>';
 }
 async function load(){
   if(!user)return;
   try{ await db.rpc('refresh_my_notifications'); }catch(_e){}
   try{
     const {data,error}=await db.rpc('my_notifications',{p_limit:30});
     if(!error) items=data||[];
   }catch(_e){}
   render();
 }
 window.footixNotificationsRefresh=async()=>{ await load(); };
 async function boot(){
   mount();
   const host=document.querySelector('#footix-notifications');
   try{
     const {data:{session}}=await db.auth.getSession();
     user=session?.user||null;
   }catch(_e){ user=null; }
   if(!user){host.classList.add('is-hidden');return}
   host.classList.remove('is-hidden');
   await load();
 }
 db.auth.onAuthStateChange((_e,u)=>{user=u;setTimeout(boot,0)});
 boot();
})();