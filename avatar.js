(() => {
  const cfg = window.FOOTIX_SUPABASE || {};
  if (!window.supabase || !cfg.url || !cfg.key) return;
  const db = window.supabase.createClient(cfg.url, cfg.key);

  const classicAvatars = [
    ['footix-classique','Classique'],['footix-capitaine','Capitaine'],['footix-coach','Coach'],
    ['footix-gardien','Gardien'],['footix-supporter','Supporter'],['footix-ultras','Ultras'],
    ['footix-lunettes','Lunettes'],['footix-casque','Casque'],['footix-tacticien','Tacticien'],
    ['footix-elite','Élite'],['footix-europe','Europe'],['footix-champion','Champion']
  ];

  let user = null;
  let profile = null;
  let selected = 'footix-classique';

  const $ = (s,r=document) => r.querySelector(s);
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const labelFor = slug => classicAvatars.find(([s])=>s===slug)?.[1] || slug.replace(/^footix-/,'').replace(/-/g,' ');
  const pathFor = slug => `avatars/${slug}.jpg`;

  function renderGrid(){
    const root = $('#avatar-gallery-grid');
    root.innerHTML = classicAvatars.map(([slug,label]) => `
      <button type="button" class="avatar-gallery-card ${slug===selected?'selected':''}" data-avatar="${esc(slug)}">
        <span class="avatar-check">✓</span>
        <img src="${pathFor(slug)}" alt="${esc(label)}">
        <strong>${esc(label)}</strong>
        <small>${slug===profile?.avatar_slug?'AVATAR ACTUEL':'CHOISIR'}</small>
      </button>`).join('');
    $('#avatar-selected-name').textContent = labelFor(selected);
  }

  function showTab(tab){
    document.querySelectorAll('[data-avatar-tab]').forEach(b=>b.classList.toggle('active',b.dataset.avatarTab===tab));
    const classic = tab === 'classic';
    $('#avatar-gallery-grid').hidden = !classic;
    $('#avatar-coming').hidden = classic;
    $('#avatar-save-btn').hidden = !classic;
    $('.avatar-gallery-footer').classList.toggle('is-coming',!classic);
  }

  async function load(){
    const {data:{user:u}} = await db.auth.getUser();
    user = u || null;
    if(!user){ window.location.href='profil.html'; return; }

    const {data:p,error} = await db.from('profiles').select('username,avatar_slug,bio').eq('id',user.id).single();
    if(error || !p){ $('#avatar-save-status').textContent='Profil introuvable.'; return; }
    profile = p;
    selected = p.avatar_slug || 'footix-classique';
    $('#avatar-current-image').src = pathFor(selected);
    $('#avatar-current-name').textContent = labelFor(selected);
    renderGrid();
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('[data-avatar]');
    if(card){ selected = card.dataset.avatar; renderGrid(); return; }
    const tab = e.target.closest('[data-avatar-tab]');
    if(tab){ showTab(tab.dataset.avatarTab); }
  });

  $('#avatar-save-btn')?.addEventListener('click', async () => {
    if(!user || !profile) return;
    const btn = $('#avatar-save-btn');
    const status = $('#avatar-save-status');
    btn.disabled = true;
    btn.textContent = 'ENREGISTREMENT…';
    status.textContent = '';
    const {error} = await db.rpc('update_my_profile',{
      p_username: profile.username,
      p_avatar_slug: selected,
      p_bio: profile.bio || ''
    });
    if(error){
      status.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'UTILISER CET AVATAR';
      return;
    }
    profile.avatar_slug = selected;
    $('#avatar-current-image').src = pathFor(selected);
    $('#avatar-current-name').textContent = labelFor(selected);
    status.textContent = '✓ Avatar mis à jour';
    renderGrid();
    btn.disabled = false;
    btn.textContent = 'UTILISER CET AVATAR';
    setTimeout(()=>{ window.location.href='profil.html'; }, 650);
  });

  load();
})();
