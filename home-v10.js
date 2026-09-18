(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const aliases={"LILLE":"LOSC","STADE RENNAIS":"STADE RENNAIS FC","RENNES":"STADE RENNAIS FC","LYON":"OLYMPIQUE LYONNAIS","MARSEILLE":"OLYMPIQUE DE MARSEILLE","PSG":"PARIS SAINT-GERMAIN","BREST":"STADE BRESTOIS 29","STRASBOURG":"RC STRASBOURG ALSACE","LENS":"RC LENS","AUXERRE":"AJ AUXERRE","LORIENT":"FC LORIENT","LE HAVRE AC":"LE HAVRE"};
 const key=s=>aliases[norm(s)]||norm(s);
 async function j(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(url);return r.json()}
 function matchLink(day,h,a){return `match.html?competition=ligue1&day=${day}&home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}`}
 Promise.all([j('schedule.json'),j('pronos.json')]).then(([schedule,pronos])=>{
   const now=new Date(); let round=schedule.find(d=>(d.matches||[]).some(m=>{const x=m[2]||{};return x.date && new Date(`${x.date}T${x.time||'12:00'}:00`)>=new Date(now.getTime()-6*3600000)})) || schedule[schedule.length-1];
   if(!round)return; document.querySelector('#home-current-round').textContent=`Journée ${round.journee}`;
   const entries=(round.matches||[]).map(m=>{const [h,a,x={}] = m; const p=pronos?.days?.[String(round.journee)]?.[`${h}|||${a}`]||{}; return {h,a,x,p}}).sort((A,B)=>`${A.x.date||''} ${A.x.time||''}`.localeCompare(`${B.x.date||''} ${B.x.time||''}`));
   const focus=entries.filter(e=>!e.x.completed).slice(0,3); const shown=focus.length?focus:entries.slice(-3);
   document.querySelector('#home-v10-matches').innerHTML=shown.map(({h,a,x,p})=>`<a class="v10-match-card" href="${matchLink(round.journee,h,a)}"><div class="match-meta"><span>J${round.journee}</span><time>${esc(x.date||'')} · ${esc(x.time||'')}</time></div><div class="match-teams"><b>${esc(h)}</b><strong>${x.completed?`${x.homeScore??'-'} - ${x.awayScore??'-'}`:esc(p.score||'—')}</strong><b>${esc(a)}</b></div><div class="match-foot"><span>${x.completed?'SCORE FINAL':'PRONO FOOTIX'}</span><em>Analyse du match ›</em></div></a>`).join('');
 }).catch(()=>{});
 j('standings.json').then(d=>{const teams=(d.teams||[]).slice(0,5);document.querySelector('#home-v10-standings').innerHTML=teams.map((t,i)=>`<div class="mini-standing-row"><span>${i+1}</span>${t.logo?`<img src="${esc(t.logo)}" alt="">`:''}<b>${esc(t.club)}</b><small>${esc(t.p)} J</small><strong>${esc(t.pts)} pts</strong></div>`).join('')}).catch(()=>{});
 j('mercato.json').then(d=>{document.querySelector('#home-v10-mercato').innerHTML=(d.items||[]).slice(0,3).map(x=>`<a href="${esc(x.link)}" target="_blank" rel="noopener"><div><small>${esc(x.source||'ACTU')}</small><b>${esc((x.title||'').replace(/ - [^-]+$/,''))}</b></div><span>›</span></a>`).join('')}).catch(()=>{});
})();
