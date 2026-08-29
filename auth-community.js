(() => {
  'use strict';
  const cfg = window.FOOTIX_SUPABASE || {};
  if (!window.supabase || !cfg.url || !cfg.key) return;
  const db = window.supabase.createClient(cfg.url, cfg.key);
  window.footixSupabase = db;

  const avatarFallbacks = [
    ['footix-classique','CLASSIQUE'],['footix-capitaine','CAPITAINE'],['footix-coach','COACH'],
    ['footix-gardien','GARDIEN'],['footix-supporter','SUPPORTER'],['footix-ultras','ULTRAS'],
    ['footix-lunettes','LUNETTES'],['footix-casque','CASQUE'],['footix-tacticien','TACTICIEN'],
    ['footix-elite','ÉLITE'],['footix-europe','EUROPE'],['footix-champion','CHAMPION']
  ];

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const msg = (text, type='') => {
    const box = $('#auth-message'); if (!box) return;
    box.textContent = text || ''; box.className = 'auth-message ' + type;
  };
  const normalizeError = (e) => {
    const raw = (e?.message || String(e || '')).toLowerCase();
    if (raw.includes('already registered') || raw.includes('already been registered')) return 'Cet email possède déjà un compte.';
    if (raw.includes('password')) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (raw.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if (raw.includes('duplicate') || raw.includes('username')) return 'Ce pseudo semble déjà utilisé. Essaie-en un autre.';
    return e?.message || 'Une erreur est survenue.';
  };

  function setAuthTab(name) {
    $$('.auth-form').forEach(f => f.classList.add('is-hidden'));
    $$('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.authTab === name));
    const form = name === 'signup' ? $('#signup-form') : name === 'reset' ? $('#reset-form') : $('#login-form');
    form?.classList.remove('is-hidden'); msg('');
    const title = $('#auth-title');
    if (title) title.textContent = name === 'signup' ? 'REJOINS FOOTIX PRONO' : name === 'reset' ? 'RÉINITIALISE TON MOT DE PASSE' : 'BON RETOUR PARMI NOUS';
  }
  function openAuth(tab='signup') {
    const modal = $('#auth-modal'); if (!modal) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); setAuthTab(tab);
  }
  function closeAuth() {
    const modal = $('#auth-modal'); if (!modal) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
  }

  async function getAvatars() {
    const {data} = await db.from('avatars').select('slug,label').eq('is_active',true).order('sort_order');
    return data?.length ? data.map(a => [a.slug,a.label]) : avatarFallbacks;
  }
  function avatarMarkup(slug, label, name='avatar_slug') {
    return `<label class="avatar-choice"><input type="radio" name="${name}" value="${slug}"><span class="avatar-orb avatar-${slug}"><img src="logo-footix-prono.png" alt=""></span><small>${label.replace(/^Footix /,'')}</small></label>`;
  }
  async function fillAvatarPickers() {
    const avatars = await getAvatars();
    [['#avatar-picker','avatar_slug'],['#profile-avatar-picker','avatar_slug_profile']].forEach(([sel,name]) => {
      const root = $(sel); if (!root) return;
      root.innerHTML = avatars.map(([slug,label]) => avatarMarkup(slug,label,name)).join('');
      const first = root.querySelector('input'); if (first) first.checked = true;
    });
  }

  async function upsertPendingConsent() {
    if (localStorage.getItem('footix_pending_consent') !== '1') return;
    const {data:{user}} = await db.auth.getUser();
    if (!user) return;
    const {error} = await db.from('user_consents').upsert({user_id:user.id,rules_version:'1.0',privacy_version:'1.0'},{onConflict:'user_id'});
    if (!error) localStorage.removeItem('footix_pending_consent');
  }

  async function refreshAuthUI() {
    const {data:{session}} = await db.auth.getSession();
    const logged = !!session?.user;
    $$('.login-trigger,.signup-trigger').forEach(el => el.classList.toggle('is-hidden',logged));
    $$('.account-link,.logout-link').forEach(el => el.classList.toggle('is-hidden',!logged));
    if (logged) {
      await upsertPendingConsent();
      const {data:p} = await db.from('profiles').select('username').eq('id',session.user.id).maybeSingle();
      $$('.account-label').forEach(el => el.textContent = p?.username ? p.username.toUpperCase() : 'MON PROFIL');
    }
  }

  async function loadProfile() {
    if (!$('#profile-card')) return;
    const {data:{session}} = await db.auth.getSession();
    if (!session?.user) return;
    const user = session.user;
    const {data:p} = await db.from('profiles').select('username,avatar_slug,bio').eq('id',user.id).single();
    $('#profile-username').textContent = p?.username || 'Mon profil';
    $('#profile-email').textContent = user.email || '';
    $('#profile-login')?.classList.add('is-hidden');
    const form = $('#profile-form');
    if (form && p) {
      form.username.value = p.username || ''; form.bio.value = p.bio || '';
      form.username.disabled = false; form.bio.disabled = false; form.querySelector('button[type=submit]').disabled = false;
      const radio = form.querySelector(`input[value="${CSS.escape(p.avatar_slug)}"]`); if (radio) radio.checked = true;
    }
    const av = $('#profile-avatar');
    if (av && p?.avatar_slug) av.className = `profile-avatar avatar-orb avatar-${p.avatar_slug}`;
    const {data:eligible} = await db.rpc('reward_eligible',{check_user:user.id});
    const status = $('#eligibility-status');
    if (status) {
      status.className = 'eligibility-status ' + (eligible ? 'ok' : 'pending');
      status.innerHTML = eligible ? '<b>✓ ÉLIGIBLE</b><span>Les conditions techniques actuelles sont remplies.</span>' : '<b>À FINALISER</b><span>Vérifie ton email et l’acceptation des règles.</span>';
    }
  }

  async function loadLeaderboard() {
    if (!$('#ranking-body')) return;
    let comp = '', period = 'month';
    const render = async () => {
      $('#ranking-body').innerHTML = '<tr><td colspan="5" class="community-empty">Chargement…</td></tr>';
      const args = {p_competition: comp || null, p_period: period, p_limit: 100};
      const {data,error} = await db.rpc('leaderboard',args);
      if (error) { $('#ranking-body').innerHTML = `<tr><td colspan="5" class="community-empty">Classement indisponible pour le moment.</td></tr>`; return; }
      const rows = data || [];
      $('#ranking-body').innerHTML = rows.length ? rows.map(r => `<tr><td><b class="rank-number">${r.rank}</b></td><td><div class="rank-player"><span class="avatar-orb avatar-${r.avatar_slug}"><img src="logo-footix-prono.png" alt=""></span><strong>${escapeHtml(r.username)}</strong></div></td><td><strong>${r.points}</strong></td><td>${r.played}</td><td>${r.success_rate}%</td></tr>`).join('') : '<tr><td colspan="5" class="community-empty">Pas encore de résultats sur cette période.</td></tr>';
      renderPodium(rows.slice(0,3));
    };
    $$('#ranking-competition button').forEach(b => b.addEventListener('click',()=>{ comp=b.dataset.comp; $$('#ranking-competition button').forEach(x=>x.classList.toggle('active',x===b)); render(); }));
    $$('#ranking-period button').forEach(b => b.addEventListener('click',()=>{ period=b.dataset.period; $$('#ranking-period button').forEach(x=>x.classList.toggle('active',x===b)); render(); }));
    render();
  }
  function renderPodium(rows) {
    const root=$('#podium'); if(!root) return;
    if(!rows.length) { root.innerHTML='<div class="community-empty">Le podium apparaîtra dès les premiers résultats communautaires.</div>'; return; }
    const byRank = new Map(rows.map(r=>[Number(r.rank),r]));
    const order=[2,1,3];
    root.className='podium';
    root.innerHTML=order.map(rank=>{
      const r=byRank.get(rank); if(!r) return `<div class="podium-slot rank-${rank} empty"><span>${rank}</span><b>—</b></div>`;
      return `<div class="podium-slot rank-${rank}"><span class="podium-rank">${rank}</span><div class="avatar-orb avatar-${r.avatar_slug}"><img src="logo-footix-prono.png" alt=""></div><b>${escapeHtml(r.username)}</b><strong>${r.points} PTS</strong><small>${r.success_rate}% de réussite</small></div>`;
    }).join('');
  }
  function escapeHtml(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

  document.addEventListener('click', async e => {
    if (e.target.closest('.signup-trigger')) openAuth('signup');
    if (e.target.closest('.login-trigger')) openAuth('login');
    if (e.target.closest('[data-auth-close]')) closeAuth();
    const tab = e.target.closest('[data-auth-tab]'); if (tab) setAuthTab(tab.dataset.authTab);
    if (e.target.closest('#forgot-password')) setAuthTab('reset');
    if (e.target.closest('.logout-link')) { await db.auth.signOut(); location.href='index.html'; }
  });

  $('#signup-form')?.addEventListener('submit', async e => {
    e.preventDefault(); msg('Création de ton compte…');
    const f = new FormData(e.currentTarget);
    const username=(f.get('username')||'').toString().trim();
    const avatar_slug=(f.get('avatar_slug')||'footix-classique').toString();
    localStorage.setItem('footix_pending_consent','1');
    const {data,error} = await db.auth.signUp({
      email:f.get('email'), password:f.get('password'),
      options:{data:{username,avatar_slug},emailRedirectTo:'https://footixprono.fr/profil.html'}
    });
    if (error) { localStorage.removeItem('footix_pending_consent'); msg(normalizeError(error),'error'); return; }
    if (data.session) await upsertPendingConsent();
    msg('Compte créé ! Consulte ta boîte mail et clique sur le lien de confirmation.','success');
    e.currentTarget.reset();
  });

  $('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault(); msg('Connexion…');
    const f=new FormData(e.currentTarget);
    const {error}=await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
    if(error) return msg(normalizeError(error),'error');
    await upsertPendingConsent(); msg('Connexion réussie.','success'); setTimeout(()=>{closeAuth();refreshAuthUI();loadProfile();},350);
  });

  $('#reset-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const {error}=await db.auth.resetPasswordForEmail(f.get('email'),{redirectTo:'https://footixprono.fr/profil.html'});
    msg(error?normalizeError(error):'Lien envoyé. Vérifie ta boîte mail.',error?'error':'success');
  });

  $('#profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const {data:{user}}=await db.auth.getUser(); if(!user) return openAuth('login');
    const f=new FormData(e.currentTarget);
    const avatar_slug=f.get('avatar_slug_profile') || 'footix-classique';
    const {error}=await db.from('profiles').update({username:(f.get('username')||'').toString().trim(),bio:(f.get('bio')||'').toString().trim()||null,avatar_slug}).eq('id',user.id);
    alert(error?normalizeError(error):'Profil enregistré.');
    if(!error) { await refreshAuthUI(); await loadProfile(); }
  });

  db.auth.onAuthStateChange(()=>setTimeout(()=>{refreshAuthUI();loadProfile();},0));
  fillAvatarPickers().then(loadProfile);
  refreshAuthUI();
  loadLeaderboard();
})();
