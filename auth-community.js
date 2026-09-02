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

  const playerHref = id => `joueur.html?id=${encodeURIComponent(id)}`;
  const playerLink = (id, username, klass='player-public-link') =>
    `<a class="${klass}" href="${playerHref(id)}">${escapeHtml(username)}</a>`;

  function ensurePlayersNavigation() {
    if (!document.getElementById('footix-player-link-style')) {
      const style=document.createElement('style');
      style.id='footix-player-link-style';
      style.textContent='.player-public-link{color:#0b4f86!important;font-weight:900!important;text-decoration:underline!important;text-decoration-thickness:1px!important;text-underline-offset:3px!important;text-decoration-color:#8fb5d6!important}.player-public-link:hover{color:#07345d!important;text-decoration-color:#07345d!important}.winner-line .player-public-link,.monthly-podium-card .player-public-link,.podium-slot .player-public-link,.dark-card .player-public-link{color:#eaf5ff!important;text-decoration-color:#78b9ef!important}.winner-line .player-public-link:hover,.monthly-podium-card .player-public-link:hover,.podium-slot .player-public-link:hover,.dark-card .player-public-link:hover{color:#9cff62!important;text-decoration-color:#9cff62!important}';
      document.head.appendChild(style);
    }
    if (document.querySelector('.site-nav-players')) return;
    const ranking=document.querySelector('.site-nav-ranking');
    if (!ranking) return;
    ranking.insertAdjacentHTML(
      'afterend',
      '<a class="side-link site-nav-players" href="joueurs.html"><span class="side-nav-ico">♟</span><span>Joueurs</span></a>'
    );
  }

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
    const safe = String(slug || 'footix-classique').replace(/[^a-z0-9-]/g,'');
    return `<label class="avatar-choice"><input type="radio" name="${name}" value="${safe}"><span class="avatar-orb avatar-${safe}"><img src="avatars/${safe}.jpg" alt="${escapeHtml(label)}"></span><small>${escapeHtml(String(label).replace(/^Footix /,''))}</small></label>`;
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
    $$('.login-trigger,.signup-trigger').forEach(el => {
      el.classList.toggle('is-hidden', logged);
      el.hidden = logged;
    });
    $$('.account-link,.logout-link').forEach(el => {
      el.classList.toggle('is-hidden', !logged);
      el.hidden = !logged;
    });

    // Sécurité visuelle supplémentaire pour le header :
    // même si une ancienne règle CSS essaie de forcer display:flex.
    $$('.v914-auth-nav .login-trigger,.v914-auth-nav .signup-trigger').forEach(el => {
      el.style.setProperty('display', logged ? 'none' : '', logged ? 'important' : '');
    });
    $$('.v914-auth-nav .account-link,.v914-auth-nav .logout-link').forEach(el => {
      el.style.setProperty('display', logged ? '' : 'none', logged ? '' : 'important');
    });
    if (logged) {
      await upsertPendingConsent();
      currentUserIsAdmin = await checkAdmin(session.user.id);
      document.body.classList.toggle('footix-admin', currentUserIsAdmin);
      const {data:p} = await db.from('profiles').select('username').eq('id',session.user.id).maybeSingle();
      $$('.account-label').forEach(el => el.textContent = p?.username ? p.username.toUpperCase() : 'MON PROFIL');
      $$('.admin-account-chip').forEach(el => el.remove());
      if (currentUserIsAdmin) {
        $$('.account-link').forEach(el => el.insertAdjacentHTML('afterend','<span class="admin-account-chip">ADMIN</span>'));
      }
    } else {
      currentUserIsAdmin = false;
      document.body.classList.remove('footix-admin');
      $$('.admin-account-chip').forEach(el => el.remove());
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
      form.username.value = p.username || '';
      form.bio.value = p.bio || '';
      form.username.disabled = false;
      form.bio.disabled = false;
      form.querySelectorAll('input[type="radio"]').forEach(r => r.disabled = false);
      const saveBtn=form.querySelector('button[type=submit]');
      if(saveBtn) saveBtn.disabled = false;
      const radio = form.querySelector(`input[value="${CSS.escape(p.avatar_slug)}"]`);
      if (radio) radio.checked = true;
    }
    const isAdmin = await checkAdmin(user.id);
    const title = $('#profile-username');
    if (title && isAdmin && !title.querySelector('.admin-badge')) {
      title.insertAdjacentHTML('beforeend',' <span class="admin-badge profile-admin-badge">ADMIN</span>');
    }
    const av = $('#profile-avatar');
    if (av && p?.avatar_slug) { av.className = `profile-avatar avatar-orb avatar-${p.avatar_slug}`; const im=av.querySelector('img'); if(im) im.src=`avatars/${p.avatar_slug}.jpg`; }
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
      $('#ranking-body').innerHTML = rows.length ? rows.map(r => `<tr><td><b class="rank-number">${r.rank}</b></td><td><div class="rank-player"><span class="avatar-orb avatar-${r.avatar_slug}"><img src="avatars/${r.avatar_slug}.jpg" alt=""></span><strong>${playerLink(r.user_id,r.username)}</strong></div></td><td><strong>${r.points}</strong></td><td>${r.played}</td><td>${r.success_rate}%</td></tr>`).join('') : '<tr><td colspan="5" class="community-empty">Pas encore de résultats sur cette période.</td></tr>';
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
      return `<div class="podium-slot rank-${rank}"><span class="podium-rank">${rank}</span><div class="avatar-orb avatar-${r.avatar_slug}"><img src="avatars/${r.avatar_slug}.jpg" alt=""></div><b>${playerLink(r.user_id,r.username)}</b><strong>${r.points} PTS</strong><small>${r.success_rate}% de réussite</small></div>`;
    }).join('');
  }
  function escapeHtml(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

  let currentUserIsAdmin = false;

  async function checkAdmin(userId) {
    if (!userId) return false;
    const {data,error} = await db.rpc('is_profile_admin',{p_user_id:userId});
    if (!error) return !!data;
    const fallback = await db.rpc('is_admin',{check_user:userId});
    return !fallback.error && !!fallback.data;
  }

  async function adminMapFor(ids=[]) {
    const unique=[...new Set(ids.filter(Boolean))];
    const pairs=await Promise.all(unique.map(async id=>[id,await checkAdmin(id)]));
    return new Map(pairs);
  }

  function adminBadge(isAdmin) {
    return isAdmin ? '<span class="admin-badge">ADMIN · FOOTIX PRONO</span>' : '';
  }

  function adminControls(post) {
    if (!currentUserIsAdmin) return '';
    const hidden = post.status && post.status !== 'visible';
    return `<div class="admin-post-actions">
      <button type="button" class="admin-pin-post">${post.pinned ? 'DÉSÉPINGLER' : 'ÉPINGLER'}</button>
      <button type="button" class="admin-toggle-post">${hidden ? 'RÉTABLIR' : 'MASQUER'}</button>
    </div>`;
  }


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
    const form=e.currentTarget;
    const saveBtn=form.querySelector('button[type=submit]');
    const status=$('#profile-save-status');
    const {data:{user}}=await db.auth.getUser();
    if(!user) return openAuth('login');

    const f=new FormData(form);
    const username=(f.get('username')||'').toString().trim();
    const bio=(f.get('bio')||'').toString().trim();
    const selected=form.querySelector('input[name="avatar_slug_profile"]:checked');
    const avatar_slug=selected?.value || 'footix-classique';

    if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='ENREGISTREMENT…'; }
    if(status){ status.textContent=''; status.className='profile-save-status'; }

    let {error}=await db.rpc('update_my_profile',{
      p_username:username,
      p_avatar_slug:avatar_slug,
      p_bio:bio || null
    });

    // Compatibilité temporaire si le SQL V9.2.0 n'a pas encore été lancé.
    if(error && /function|schema cache|PGRST202/i.test(error.message||'')){
      const fallback=await db.from('profiles')
        .update({username,bio:bio||null,avatar_slug})
        .eq('id',user.id);
      error=fallback.error;
    }

    if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='ENREGISTRER'; }

    if(error){
      if(status){ status.textContent=normalizeError(error); status.className='profile-save-status error'; }
      else alert(normalizeError(error));
      return;
    }

    if(status){ status.textContent='✓ Profil enregistré'; status.className='profile-save-status success'; }
    await refreshAuthUI();
    await loadProfile();
  });

  db.auth.onAuthStateChange(()=>setTimeout(()=>{refreshAuthUI();loadProfile();},0));
  fillAvatarPickers().then(loadProfile);
  refreshAuthUI();
  loadLeaderboard();
  loadHomePodium();

  async function loadHomePodium() {
    const root = $('#home-podium'); if (!root) return;
    const monthStart=new Date(); monthStart.setDate(1); const month=monthStart.toISOString().slice(0,10);
    const {data,error} = await db.rpc('monthly_leaderboard',{p_month:month,p_competition:null,p_limit:3});
    if (error || !data?.length) return;
    const map = new Map(data.map(r=>[Number(r.rank),r]));
    const card = (rank,klass,defaultSlug) => {
      const r=map.get(rank); if(!r) return `<div class="podium-mini ${klass}"><span>${rank}</span><img src="avatars/${defaultSlug}.jpg" alt=""><b>—</b><small>0 pts</small></div>`;
      return `<div class="podium-mini ${klass}"><span>${rank}</span><img src="avatars/${r.avatar_slug}.jpg" alt=""><b>${playerLink(r.user_id,r.username)}</b><small>${r.points} pts</small></div>`;
    };
    root.innerHTML=card(2,'place2','footix-capitaine')+card(1,'place1','footix-champion')+card(3,'place3','footix-tacticien');
  }

  let communityCategory='livre_or';
  async function loadCommunityFeed() {
    const root=$('#community-feed'); if(!root) return;
    root.innerHTML='<div class="community-empty">Chargement des messages…</div>';
    const {data:posts,error}=await db.from('community_posts')
      .select('id,author_id,category,parent_id,body,pinned,status,created_at')
      .eq('category',communityCategory).is('parent_id',null)
      .order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(60);
    if(error){root.innerHTML='<div class="community-empty">Impossible de charger les messages pour le moment.</div>';return;}
    if(!posts?.length){root.innerHTML='<div class="community-empty">Aucun message pour le moment. Sois le premier à écrire !</div>';return;}
    const ids=[...new Set(posts.map(p=>p.author_id))];
    const {data:profiles}=await db.from('profiles').select('id,username,avatar_slug').in('id',ids);
    const pm=new Map((profiles||[]).map(p=>[p.id,p]));
    const admins=await adminMapFor(ids);
    root.innerHTML=posts.map(p=>{
      const u=pm.get(p.author_id)||{username:'Membre Footix',avatar_slug:'footix-classique'};
      const d=new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(p.created_at));
      const moderation=adminControls(p);
      const state=p.status && p.status!=='visible' ? `<span class="moderation-state">${p.status.toUpperCase()}</span>` : '';
      return `<article class="community-post ${p.status && p.status!=='visible'?'post-moderated':''}" data-post-id="${p.id}" data-pinned="${p.pinned?'1':'0'}" data-status="${p.status||'visible'}">
        <img class="post-avatar" src="avatars/${u.avatar_slug}.jpg" alt="">
        <div class="post-content"><div class="post-meta"><b>${playerLink(p.author_id,u.username)}</b>${adminBadge(admins.get(p.author_id))}${p.pinned?'<span class="pinned-badge">ÉPINGLÉ</span>':''}${state}<small>${d}</small></div>
        <p>${escapeHtml(p.body).replace(/\n/g,'<br>')}</p>
        <div class="post-actions"><button type="button" class="reply-post">↩ Répondre</button><button type="button" class="report-post">⚑ Signaler</button>${moderation}</div>
        <form class="reply-form is-hidden"><textarea maxlength="1500" rows="2" placeholder="Ta réponse…"></textarea><button class="community-cta compact" type="submit">${currentUserIsAdmin?'RÉPONDRE EN ADMIN':'RÉPONDRE'}</button></form>
        <div class="replies" data-replies="${p.id}"></div></div></article>`;
    }).join('');
    for(const p of posts) loadReplies(p.id);
  }
  async function loadReplies(parentId){
    const box=document.querySelector(`[data-replies="${parentId}"]`); if(!box) return;
    const {data:rows}=await db.from('community_posts').select('id,author_id,body,status,pinned,created_at').eq('parent_id',parentId).order('created_at');
    if(!rows?.length){box.innerHTML='';return;}
    const ids=[...new Set(rows.map(p=>p.author_id))];
    const {data:profiles}=await db.from('profiles').select('id,username,avatar_slug').in('id',ids);
    const pm=new Map((profiles||[]).map(p=>[p.id,p]));
    const admins=await adminMapFor(ids);
    box.innerHTML=rows.map(p=>{
      const u=pm.get(p.author_id)||{username:'Membre Footix',avatar_slug:'footix-classique'};
      const controls=currentUserIsAdmin ? `<span class="reply-admin-controls"><button type="button" class="admin-hide-reply" data-reply-id="${p.id}">${p.status!=='visible'?'RÉTABLIR':'MASQUER'}</button></span>` : '';
      return `<div class="community-reply ${p.status!=='visible'?'post-moderated':''}" data-reply-status="${p.status||'visible'}"><img src="avatars/${u.avatar_slug}.jpg" alt=""><div><b>${playerLink(p.author_id,u.username)}</b>${adminBadge(admins.get(p.author_id))}${controls}<p>${escapeHtml(p.body).replace(/\n/g,'<br>')}</p></div></div>`;
    }).join('');
  }
  function initCommunity(){
    if(!$('#community-feed')) return;
    $$('.community-board-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      communityCategory=btn.dataset.communityTab;
      $$('.community-board-tabs button').forEach(b=>b.classList.toggle('active',b===btn));
      loadCommunityFeed();
    }));
    const ta=$('#community-post-body');
    ta?.addEventListener('input',()=>{$('#community-char-count').textContent=`${ta.value.length} / 1500`;});
    $('#community-post-form')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const {data:{user}}=await db.auth.getUser(); if(!user){openAuth('login');return;}
      const body=(ta.value||'').trim(); if(!body)return;
      const {error}=await db.from('community_posts').insert({author_id:user.id,category:communityCategory,body,status:'visible',pinned:false});
      if(error){alert(normalizeError(error));return;} ta.value=''; $('#community-char-count').textContent='0 / 1500'; loadCommunityFeed();
    });
    document.addEventListener('click',async e=>{
      const article=e.target.closest('.community-post'); if(!article)return;
      if(e.target.closest('.reply-post')) article.querySelector('.reply-form')?.classList.toggle('is-hidden');
      if(e.target.closest('.report-post')){
        const {data:{user}}=await db.auth.getUser(); if(!user){openAuth('login');return;}
        const reason=prompt('Pourquoi souhaites-tu signaler ce message ?'); if(!reason?.trim())return;
        const {error}=await db.from('post_reports').insert({post_id:Number(article.dataset.postId),reporter_id:user.id,reason:reason.trim()});
        alert(error?'Signalement déjà envoyé ou impossible.':'Merci. Le signalement a été enregistré.');
      }
      if(currentUserIsAdmin && e.target.closest('.admin-pin-post')){
        const pinned=article.dataset.pinned==='1';
        const status=article.dataset.status || 'visible';
        const {error}=await db.rpc('admin_moderate_post',{p_post_id:Number(article.dataset.postId),p_status:status,p_pinned:!pinned});
        if(error) alert(normalizeError(error)); else loadCommunityFeed();
      }
      if(currentUserIsAdmin && e.target.closest('.admin-toggle-post')){
        const status=article.dataset.status || 'visible';
        const pinned=article.dataset.pinned==='1';
        const next=status==='visible'?'hidden':'visible';
        const {error}=await db.rpc('admin_moderate_post',{p_post_id:Number(article.dataset.postId),p_status:next,p_pinned:pinned});
        if(error) alert(normalizeError(error)); else loadCommunityFeed();
      }
      const replyAdmin=e.target.closest('.admin-hide-reply');
      if(currentUserIsAdmin && replyAdmin){
        const row=replyAdmin.closest('.community-reply');
        const next=(row?.dataset.replyStatus||'visible')==='visible'?'hidden':'visible';
        const {error}=await db.rpc('admin_moderate_post',{p_post_id:Number(replyAdmin.dataset.replyId),p_status:next,p_pinned:false});
        if(error) alert(normalizeError(error)); else loadReplies(Number(article.dataset.postId));
      }
    });
    document.addEventListener('submit',async e=>{
      const form=e.target.closest('.reply-form'); if(!form)return;
      e.preventDefault();
      const {data:{user}}=await db.auth.getUser(); if(!user){openAuth('login');return;}
      const article=form.closest('.community-post'), body=(form.querySelector('textarea').value||'').trim(); if(!body)return;
      const {error}=await db.from('community_posts').insert({author_id:user.id,category:communityCategory,parent_id:Number(article.dataset.postId),body,status:'visible',pinned:false});
      if(error){alert(normalizeError(error));return;} form.reset(); form.classList.add('is-hidden'); loadReplies(Number(article.dataset.postId));
    });
    loadCommunityFeed();
  }

  ensurePlayersNavigation();
  initCommunity();
})();
