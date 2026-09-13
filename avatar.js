(() => {
  const cfg = window.FOOTIX_SUPABASE || {};
  if (!window.supabase || !cfg.url || !cfg.key) return;
  const db = window.supabase.createClient(cfg.url, cfg.key);

  const classicAvatars = [
    ['footix-classique',"Classique"],
    ['footix-capitaine',"Capitaine"],
    ['footix-coach',"Coach"],
    ['footix-gardien',"Gardien"],
    ['footix-supporter',"Supporter"],
    ['footix-ultras',"Ultras"],
    ['footix-lunettes',"Lunettes"],
    ['footix-casque',"Casque"],
    ['footix-tacticien',"Tacticien"],
    ['footix-elite',"Élite"],
    ['footix-europe',"Europe"],
    ['footix-champion',"Champion"]
  ];
  const ligue1Avatars = [
    ['footix-l1-angers',"Angers"],
    ['footix-l1-auxerre',"Auxerre"],
    ['footix-l1-brest',"Brest"],
    ['footix-l1-le-havre',"Le Havre"],
    ['footix-l1-le-mans',"Le Mans"],
    ['footix-l1-lens',"Lens"],
    ['footix-l1-lorient',"Lorient"],
    ['footix-l1-lille',"Lille"],
    ['footix-l1-lyon',"Lyon"],
    ['footix-l1-marseille',"Marseille"],
    ['footix-l1-monaco',"Monaco"],
    ['footix-l1-nice',"Nice"],
    ['footix-l1-paris-fc',"Paris FC"],
    ['footix-l1-psg',"Paris Saint-Germain"],
    ['footix-l1-rennes',"Rennes"],
    ['footix-l1-strasbourg',"Strasbourg"],
    ['footix-l1-toulouse',"Toulouse"],
    ['footix-l1-troyes',"Troyes"]
  ];
  const uclAvatars = [
    ['footix-ucl-aek-athens',"AEK Athens"],
    ['footix-ucl-arsenal',"Arsenal"],
    ['footix-ucl-aston-villa',"Aston Villa"],
    ['footix-ucl-atletico-madrid',"Atlético de Madrid"],
    ['footix-ucl-barcelona',"Barcelona"],
    ['footix-ucl-bayern-munich',"Bayern München"],
    ['footix-ucl-bodo-glimt',"Bodø/Glimt"],
    ['footix-ucl-borussia-dortmund',"Borussia Dortmund"],
    ['footix-ucl-club-brugge',"Club Brugge"],
    ['footix-ucl-como',"Como"],
    ['footix-ucl-fenerbahce',"Fenerbahçe"],
    ['footix-ucl-feyenoord',"Feyenoord"],
    ['footix-ucl-galatasaray',"Galatasaray"],
    ['footix-ucl-inter',"Inter"],
    ['footix-ucl-lask',"LASK"],
    ['footix-ucl-leipzig',"Leipzig"],
    ['footix-ucl-lens',"Lens"],
    ['footix-ucl-lille',"Lille"],
    ['footix-ucl-liverpool',"Liverpool"],
    ['footix-ucl-man-city',"Manchester City"],
    ['footix-ucl-man-united',"Manchester United"],
    ['footix-ucl-napoli',"Napoli"],
    ['footix-ucl-psg',"Paris Saint-Germain"],
    ['footix-ucl-porto',"Porto"],
    ['footix-ucl-psv',"PSV"],
    ['footix-ucl-real-betis',"Real Betis"],
    ['footix-ucl-real-madrid',"Real Madrid"],
    ['footix-ucl-roma',"Roma"],
    ['footix-ucl-sabah',"Sabah"],
    ['footix-ucl-shakhtar',"Shakhtar Donetsk"],
    ['footix-ucl-slavia-praha',"Slavia Praha"],
    ['footix-ucl-slovan-bratislava',"Slovan Bratislava"],
    ['footix-ucl-sporting-cp',"Sporting CP"],
    ['footix-ucl-stuttgart',"Stuttgart"],
    ['footix-ucl-viking',"Viking"],
    ['footix-ucl-villarreal',"Villarreal"]
  ];

  const collections = {
    classic: classicAvatars,
    ligue1: ligue1Avatars,
    ucl: uclAvatars
  };

  let user = null;
  let profile = null;
  let selected = 'footix-classique';
  let activeTab = 'classic';

  const $ = (s,r=document) => r.querySelector(s);
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const allAvatars = [...classicAvatars, ...ligue1Avatars, ...uclAvatars];
  const labelFor = slug => allAvatars.find(([s])=>s===slug)?.[1] || slug.replace(/^footix-(?:l1-|ucl-)?/,'').replace(/-/g,' ');
  const pathFor = slug => `avatars/${slug}.jpg`;

  function tabForSlug(slug){
    if(String(slug).startsWith('footix-l1-')) return 'ligue1';
    if(String(slug).startsWith('footix-ucl-')) return 'ucl';
    return 'classic';
  }

  function renderGrid(){
    const root = $('#avatar-gallery-grid');
    if(!root) return;
    const avatars = collections[activeTab] || classicAvatars;
    root.innerHTML = avatars.map(([slug,label]) => `
      <button type="button" class="avatar-gallery-card ${slug===selected?'selected':''}" data-avatar="${esc(slug)}">
        <span class="avatar-check">✓</span>
        <img src="${pathFor(slug)}" alt="${esc(label)}" loading="lazy">
        <strong>${esc(label)}</strong>
        <small>${slug===profile?.avatar_slug?'AVATAR ACTUEL':'CHOISIR'}</small>
      </button>`).join('');
    $('#avatar-selected-name').textContent = labelFor(selected);
  }

  function showTab(tab){
    activeTab = collections[tab] ? tab : 'classic';
    document.querySelectorAll('[data-avatar-tab]').forEach(b=>b.classList.toggle('active',b.dataset.avatarTab===activeTab));
    $('#avatar-gallery-grid').hidden = false;
    $('#avatar-coming').hidden = true;
    $('#avatar-save-btn').hidden = false;
    $('.avatar-gallery-footer')?.classList.remove('is-coming');
    renderGrid();
  }

  async function load(){
    const {data:{user:u}} = await db.auth.getUser();
    user = u || null;
    if(!user){ window.location.href='profil.html'; return; }

    const {data:p,error} = await db.from('profiles').select('username,avatar_slug,bio').eq('id',user.id).single();
    if(error || !p){ $('#avatar-save-status').textContent='Profil introuvable.'; return; }
    profile = p;
    selected = p.avatar_slug || 'footix-classique';
    activeTab = tabForSlug(selected);
    $('#avatar-current-image').src = pathFor(selected);
    $('#avatar-current-name').textContent = labelFor(selected);
    showTab(activeTab);
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
