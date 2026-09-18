(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function j(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(url);return r.json()}
 function matchLink(day,h,a){return `match.html?competition=ligue1&day=${day}&home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}`}
 const prettyDate=(date,time)=>{if(!date)return time||'';try{const d=new Date(`${date}T12:00:00`);return `${new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).format(d)}${time?` · ${time}`:''}`;}catch{return `${date}${time?` · ${time}`:''}`}};
 Promise.all([j('schedule.json'),j('pronos.json'),j('clubs.json')]).then(([schedule,pronos,clubData])=>{
   const logos=clubData.clubs||{};
   const now=new Date();
   let round=schedule.find(d=>(d.matches||[]).some(m=>{const x=m[2]||{};return x.date && new Date(`${x.date}T${x.time||'12:00'}:00`)>=new Date(now.getTime()-6*3600000)})) || schedule[schedule.length-1];
   if(!round)return;
   document.querySelector('#home-current-round').textContent=`Journée ${round.journee}`;
   const entries=(round.matches||[]).map(m=>{const [h,a,x={}] = m; const p=pronos?.days?.[String(round.journee)]?.[`${h}|||${a}`]||{};return {h,a,x,p}}).sort((A,B)=>`${A.x.date||''} ${A.x.time||''}`.localeCompare(`${B.x.date||''} ${B.x.time||''}`));
   document.querySelector('#home-v10-matches').innerHTML=entries.map(({h,a,x,p})=>{
     const hs=x.completed?(x.homeScore??'-'):(p.score?String(p.score).split(/\s*-\s*/)[0]:'');
     const as=x.completed?(x.awayScore??'-'):(p.score?String(p.score).split(/\s*-\s*/)[1]:'');
     return `<a class="v10-match-card" href="${matchLink(round.journee,h,a)}">
       <div class="match-meta"><span>${esc(prettyDate(x.date,x.time))}</span></div>
       <div class="match-crests">
         <div><img src="${esc(logos[h]||'logo-footix-prono.png')}" alt=""><b>${esc(h)}</b></div>
         <strong>${x.completed?`${esc(hs)}<i>-</i>${esc(as)}`:(p.score?`${esc(hs)}<i>-</i>${esc(as)}`:'VS')}</strong>
         <div><img src="${esc(logos[a]||'logo-footix-prono.png')}" alt=""><b>${esc(a)}</b></div>
       </div>
       <div class="match-foot"><span>${x.completed?'SCORE FINAL':(p.score?'PRONO FOOTIX':'À VENIR')}</span><em>Analyse du match →</em></div>
     </a>`;
   }).join('');
 }).catch(()=>{});
 j('standings.json').then(d=>{const teams=(d.teams||[]).slice(0,5);document.querySelector('#home-v10-standings').innerHTML=teams.map((t,i)=>`<div class="mini-standing-row"><span>${i+1}</span>${t.logo?`<img src="${esc(t.logo)}" alt="">`:''}<b>${esc(t.club)}</b><small>${esc(t.p)} J</small><strong>${esc(t.pts)} pts</strong></div>`).join('')}).catch(()=>{});
 j('mercato.json').then(d=>{document.querySelector('#home-v10-mercato').innerHTML=(d.items||[]).slice(0,3).map(x=>`<a href="${esc(x.link)}" target="_blank" rel="noopener"><div><small>${esc(x.source||'ACTU')}</small><b>${esc((x.title||'').replace(/ - [^-]+$/,''))}</b></div><span>›</span></a>`).join('')}).catch(()=>{});
})();
