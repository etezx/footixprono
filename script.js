const matches = [
  {m:'Paris SG — Nantes',d:'Vendredi • 20:45',s:'3–0',o:'1.38',b:'O. Dembélé',a:'Paris devrait monopoliser le ballon. Écart offensif important et volume d’occasions attendu élevé.',c:'fort'},
  {m:'Marseille — Rennes',d:'Samedi • 17:00',s:'2–1',o:'1.82',b:'M. Greenwood',a:'Marseille est favori à domicile, mais Rennes possède suffisamment de talent pour se créer des situations.',c:'moyen'},
  {m:'Monaco — Lille',d:'Samedi • 21:05',s:'2–2',o:'3.40',b:'M. Biereth',a:'Deux équipes capables d’attaquer vite. Match potentiellement ouvert avec des occasions des deux côtés.',c:'moyen'},
  {m:'Lyon — Lens',d:'Dimanche • 15:00',s:'2–1',o:'2.05',b:'G. Mikautadze',a:'Lyon peut faire la différence par sa qualité technique entre les lignes, surtout à domicile.',c:'moyen'},
  {m:'Nice — Strasbourg',d:'Dimanche • 17:15',s:'1–1',o:'3.15',b:'E. Guessand',a:'Opposition équilibrée. Nice contrôle bien les espaces, Strasbourg peut punir en transition.',c:'moyen'},
  {m:'Brest — Auxerre',d:'Dimanche • 17:15',s:'2–0',o:'1.95',b:'L. Ajorque',a:'Brest a un profil plus solide dans les duels et devrait générer davantage de situations dans la surface.',c:'fort'},
  {m:'Toulouse — Le Havre',d:'Dimanche • 17:15',s:'1–0',o:'1.74',b:'J. King',a:'Toulouse devrait avoir l’initiative. Rencontre possiblement fermée, avec peu de buts attendus.',c:'fort'},
  {m:'Angers — Lorient',d:'Dimanche • 17:15',s:'1–1',o:'3.05',b:'E. Lepaul',a:'Écart limité entre les deux équipes. Le nul apparaît cohérent dans un match à faible marge.',c:'moyen'},
  {m:'Metz — Paris FC',d:'Dimanche • 20:45',s:'1–2',o:'2.45',b:'J. Krasso',a:'Paris FC peut profiter de séquences de transition et d’une meilleure qualité dans les trente derniers mètres.',c:'moyen'}
];

const body = document.querySelector('#matches-body');
function render(filter='all'){
  body.innerHTML = matches.filter(x=>filter==='all'||x.c===filter).map(x=>`<tr data-confidence="${x.c}">
    <td><div class="match"><div><div class="club-pair">${x.m}</div><div class="date">${x.d}</div></div></div></td>
    <td><span class="score-pick">${x.s}</span></td>
    <td><span class="odds">${x.o}</span></td>
    <td><span class="scorer">${x.b}</span></td>
    <td><div class="analysis">${x.a}</div></td>
    <td><span class="confidence ${x.c}"><span class="dot"></span>${x.c==='fort'?'Forte':'Moyenne'}</span></td>
  </tr>`).join('');
}
render();
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  render(btn.dataset.filter);
}));
