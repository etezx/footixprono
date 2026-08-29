(() => {
  const cfg=window.FOOTIX_SUPABASE||{};
  if(!document.querySelector('#ps-month-points') || !window.supabase || !cfg.url || !cfg.key) return;
  const db=window.supabase.createClient(cfg.url,cfg.key);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  async function load(){
    const {data:{user}}=await db.auth.getUser();
    if(!user) return;
    const {data,error}=await db.rpc('my_prediction_stats',{p_month:null});
    if(error||!data?.length) return;
    const s=data[0];
    set('ps-month-points',`${s.month_points} pt${Number(s.month_points)>1?'s':''}`);
    set('ps-month-rank',Number(s.month_rank)>0?`#${s.month_rank}`:'—');
    set('ps-month-rate',`${s.month_success_rate}%`);
    set('ps-month-played',s.month_played);
    set('ps-total-points',s.total_points);
    set('ps-total-rate',`${s.total_success_rate}%`);
    const d=new Date();
    set('profile-stats-month',new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d).toUpperCase());
  }
  db.auth.onAuthStateChange(()=>setTimeout(load,0));
  load();
})();