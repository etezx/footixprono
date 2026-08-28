# Footix Prono — V7

V7 apporte une refonte visuelle et corrige définitivement les écussons.

## Nouveautés

- 18 écussons de clubs stockés localement dans `assets/clubs/` : le site ne dépend plus d'une correspondance de noms distante pour les afficher.
- recherche des clubs insensible aux majuscules/minuscules et aux accents ; le calendrier peut donc rester en capitales.
- 9 rencontres présentées en cartes 3 × 3 sur ordinateur, 2 colonnes sur tablette et 1 colonne sur mobile.
- couleurs propres aux clubs dans chaque carte.
- mascotte animée avec flottement, orbites, ballon et léger effet 3D au passage de la souris.
- bandeau animé Footix Prono et arrière-plan plus coloré.
- cache-busting `?v=7` sur CSS/JS pour que GitHub Pages affiche immédiatement la nouvelle version.
- classement et mercato automatiques conservés.
- espace Admin conservé.

## Structure

Les fichiers principaux restent à la racine. La V7 ajoute seulement un dossier `assets/clubs/` pour les logos et le dossier obligatoire `.github/workflows/` pour les automatisations.

```text
footixprono/
├── .github/
│   └── workflows/
│       ├── update-mercato.yml
│       └── update-standings.yml
├── assets/
│   └── clubs/
│       └── 18 fichiers PNG
├── index.html
├── admin.html
├── admin.js
├── script.js
├── styles.css
├── logo-footix-prono.png
├── clubs.json
├── schedule.json
├── pronos.json
├── standings.json
├── mercato.json
├── update_standings.py
└── update_mercato.py
```

## Mise à jour GitHub

Le plus simple est de décompresser le ZIP puis de glisser tout le contenu dans GitHub en conservant les dossiers `assets` et `.github`.

Si GitHub Pages affiche encore l'ancienne version après le commit, recharge avec `Ctrl + F5`. Les URLs CSS/JS utilisent aussi `?v=7` pour limiter ce problème.

## Données automatiques

Les workflows écrivent directement `standings.json` et `mercato.json` à la racine. Ils nécessitent `Settings > Actions > General > Workflow permissions > Read and write permissions`.

## Logos

Les écussons sont intégrés au projet pour fiabiliser l'affichage. Les marques et logos restent la propriété de leurs ayants droit ; vérifiez leurs conditions d'utilisation avant un usage commercial/public à grande échelle.


## V7.1
- Affichage de la date et de l'heure officielles directement sur chaque carte lorsque disponibles dans `schedule.json`.
- J1 et J2 renseignées avec la programmation officielle publiée par la Ligue 1 le 6 juillet 2026.
- `Cote` devient `Pronostic` dans l'Admin et sur le site.
- Plusieurs pronostics et plusieurs buteurs peuvent être saisis, séparés par virgule, point-virgule ou retour à la ligne.
- Compatibilité conservée avec les anciens champs `cote` et `buteur`.
- Correction de l'alignement de la colonne `Pts` du classement.


## V7.3
- Retrait du bouton/lien Admin de l’interface publique.
- Retrait du badge « 9 matchs / J » autour de la mascotte.
- Suppression du texte public expliquant la publication depuis l’Admin.
- Zones Pronostic, Buteurs et Analyse laissées visuellement vides tant qu’aucune donnée n’est publiée.
- Icônes Instagram et X/Twitter ajoutées au footer, sans redirection pour le moment.
- Micro-animations supplémentaires (header, cartes, boutons journée, ambiance hero).


## V7.3
- Nouveau slogan : « On est tous le Footix de quelqu’un. »
- Hero resserré et plus éditorial.
- Suppression du rectangle/surlignage décoratif derrière le titre.
- Largeur générale et bandeaux réduits pour un rendu moins étiré.
- Conservation des cartes, animations, logos, classement, mercato et pronostics de la V7.2.


## V7.3.1
- Suppression définitive du carré bleu / overlay derrière le titre du hero.
- Conservation du dégradé texte du slogan.
- Nouveau cache-busting CSS/JS pour forcer GitHub Pages à charger la correction.


## V7.3.2
- Les matchs de chaque journée sont triés automatiquement par date puis heure officielle.
- Les rencontres sans horaire officiel restent à la fin de la journée.
- Le tri est automatique dès que `schedule.json` reçoit une date/heure officielle.


## V7.4
- Nouveau workflow `Mettre à jour le calendrier`, exécuté automatiquement chaque matin et lançable manuellement.
- `update_schedule.py` rapproche les affiches du calendrier Footix avec le flux public ESPN Ligue 1 2026/2027 et met uniquement à jour date/heure/source dans `schedule.json`.
- Les pronostics et analyses ne sont jamais modifiés par ce workflow.
- Le tri chronologique de la V7.3.2 s'applique automatiquement après chaque actualisation.
- Suppression des effets de flash blanc / surbrillance agressive liés au curseur.

## V7.4.1
- Correction du workflow calendrier : abandon du calendrier par équipe ESPN qui renvoyait 0 match.
- Récupération désormais via le scoreboard Ligue 1, mois par mois.
- Si la source ne fournit temporairement aucune rencontre, le workflow reste valide et conserve schedule.json.
- Mise à jour partielle autorisée : seules les rencontres réellement reconnues sont modifiées.


## V7.4.2
- Suppression complète des balayages/reflets blancs animés et des effets lumineux liés au pointeur.
- Conservation des animations de mouvement et de profondeur qui ne provoquent pas de flash.

## V7.4.3
- Suppression à la source du shimmer blanc `emptyGlow` sur les pronostics vides.
- Suppression du reflet blanc `dayShine` sur la journée active.
- Bandeau lumineux du header rendu statique.
- Les animations de mouvement non lumineuses sont conservées.

## V7.5
- Bilan par journée : bons pronostics /9, bons buteurs /9 et résumé éditorial.
- Données modifiables depuis admin.html et enregistrées dans pronos.json.
- Zones Analyse Footix agrandies.
- Emplacement prêt pour Cloudflare Web Analytics.
- Compatible avec un futur sous-domaine gratuit `*.pages.dev`.

## V7.6
- Ajout d'un compteur discret de visites totales dans le footer.
- Le compteur utilise une API publique sans authentification et n'affecte pas l'espace Admin.
- Une visite correspond à un chargement de la page publique : ce n'est pas un compteur de visiteurs uniques.
- En cas d'indisponibilité du service externe, le site continue de fonctionner et affiche simplement « — ».

## V7.6.1
- Les workflows Mercato, Classement et Calendrier utilisent tous `footix-data-updates`.
- Les mises à jour se mettent en file d'attente au lieu d'écrire en même temps.
- Suppression de `git pull --rebase origin main`, source des conflits sur les JSON.

## V8.0 — refonte multi-compétitions
- Nouvelle page d'accueil dédiée à Footix Prono.
- Deux espaces : Ligue 1 et Ligue des Champions.
- Interface inspirée du nouveau mockup : sidebar, panneaux sportifs, navigation compacte et responsive.
- Le classement reste affiché quel que soit la journée sélectionnée.
- Ligue 1 : données existantes conservées (`schedule.json`, `standings.json`, `pronos.json`, `mercato.json`).
- Ligue des Champions : 36 clubs 2026/27, 8 journées, zones de qualification et structure de phase finale.
- Les dates/heures détaillées de LDC sont prévues pour être intégrées dès la publication officielle.
- L'Admin et les workflows Ligue 1 existants sont conservés.

## V8.1
- Suppression du compteur de visites dans le menu latéral.
- L'Admin propose désormais un vrai choix 1 / N / 2.
- `update_schedule.py` enregistre aussi les scores réels et l'état terminé depuis ESPN.
- Le site calcule automatiquement les pronostics 1/N/2 réussis, le nombre jugé et le taux de réussite.
- Les bons buteurs restent comptabilisés manuellement via le bilan de journée.
- Ajout du tirage officiel de la phase de ligue de Ligue des Champions 2026/27 : 8 adversaires par club, domicile/extérieur.
- Ajout des logos des 36 clubs LDC avec fallback graphique si une ressource distante est indisponible.

## V8.2
- Refonte complète de `admin.html` dans le design dashboard V8.
- Sélecteur de compétition Ligue 1 / Ligue des Champions.
- Ligue 1 : édition identique fonctionnellement, mais nouvelle interface.
- Ligue des Champions : J01 à J08, ajout/suppression manuel des affiches, choix des 36 clubs, date, heure, score Footix, 1/N/2, buteurs, analyse et bilan.
- Nouveau fichier `champions-pronos.json` publié par l'Admin séparément de `pronos.json`.
- La page `champions.html` affiche automatiquement les pronostics LDC saisis dans l'Admin.

## V8.2.1
- Correctif Admin : remplacement de deux appels `$$()` erronés par `$$a()`.
- Le bug empêchait le chargement des journées et des cartes de matchs dès l'ouverture de `admin.html`.
- Aucun changement de données, workflows ou assets.

## V8.2.2
- Restauration complète des pronostics Ligue 1 J1 depuis l'historique GitHub.
- Conversion des tendances en 1/N/2.
- Résultats réels J1 intégrés dans schedule.json.
- Bilan J1 : 7/9 pronostics 1/N/2 corrects (77,8 %).
- Buteurs : réussite sur 5 affiches sur 9 selon les noms saisis avant match.

## V8.2.3
- Résultat final affiché automatiquement sur chaque match Ligue 1 terminé.
- Verdict automatique du 1/N/2 : BON PRONO ou PRONO RATÉ.
- Badge SCORE EXACT lorsque le score Footix correspond exactement au score final.
- Nouveau script léger `update_results.py` qui ne consulte que les matchs autour de la date actuelle.
- Nouveau workflow `update-results.yml`, planifié toutes les 15 minutes.
- Le workflow calendrier quotidien reste inchangé.

## V8.3
- Sélecteur de buteurs dans l'Admin : jusqu'à 4 joueurs par match.
- Les joueurs des deux clubs apparaissent sous forme de boutons.
- Champ de secours pour ajouter un joueur absent de la liste.
- Nouveau `players.json` et `update_players.py` pour enrichir automatiquement les effectifs Ligue 1 via ESPN.
- Nouveau workflow `update-players.yml` quotidien + lancement manuel possible.
- `update_results.py` tente désormais de récupérer les buteurs réels dans le résumé ESPN après le match.
- Sur la page publique : ✓ pour un buteur trouvé, ✕ pour un buteur qui n'a pas marqué.
- La statistique « bons buteurs » se calcule automatiquement à partir des joueurs réellement buteurs lorsque la donnée ESPN est disponible.
- Compatibilité conservée avec les anciens champs texte `buteurs`.

## V8.3.1
- Refonte visuelle des cartes Ligue 1 terminées.
- Score prévu recentré entre les deux équipes.
- Score final déplacé dans un bloc compact à gauche.
- Choix 1/N/2 fortement mis en avant.
- Bouton `PRONO` à la place du petit bouton circulaire.
- Clic sur `PRONO` : panneau latéral avec analyse, score prévu/final, verdict 1/N/2, buteurs et statistiques du match.
- Buteurs : vert s'ils ont réellement marqué, rouge s'ils n'ont pas marqué, neutre si la vérification ESPN n'est pas encore disponible.
- Statistique des bons buteurs calculée automatiquement lorsque les buteurs réels ont été récupérés.

## V8.3.2
- Buteurs beaucoup plus visibles sur chaque carte.
- Badges buteurs agrandis avec états vert/rouge renforcés après match.
- Bloc BUTEURS mieux séparé visuellement du reste de la carte.
- Bouton `PRONO` remplacé par un bouton plus large `ANALYSE DU MATCH`.
- Bouton d'analyse plus contrasté, plus lisible et plus facile à cliquer sur mobile.

## V8.3.3
- Bloc BUTEURS resserré pour libérer de la place.
- Noms d'équipes légèrement réduits.
- Largeur du bouton ANALYSE DU MATCH réservée pour éviter qu'il sorte de l'écran.
- Cartes rééquilibrées sur desktop et tablette.

## V8.3.4
- Classement Ligue 1 réduit à environ 300 px sur ordinateur.
- Plus de largeur réservée à la zone des matchs.
- Colonnes équipes/prono/buteurs rééquilibrées.
- Bouton ANALYSE DU MATCH compacté et largeur garantie pour éviter toute coupure.
- Noms des équipes très légèrement réduits uniquement sur desktop.

## V8.3.5
- Le bloc `Après match` saisi dans l'Admin est désormais affiché sur la page Ligue 1 publique.
- Affichage des `Bons pronos`, `Bons buteurs` et de l'analyse/résumé de la journée.
- Le bilan suit automatiquement la journée sélectionnée.
- Si aucun bilan n'est renseigné dans l'Admin, le bloc reste masqué.

## V8.4 — Bilan automatique + IA Footix
- Nouveau `generate_review.py`.
- Dès que tous les matchs d'une journée sont terminés, calcul automatique des bons 1/N/2.
- Calcul automatique des buteurs trouvés lorsque les données buteurs ESPN sont disponibles.
- Le résumé est généré via l'API OpenAI avec la voix Footix : naturelle, drôle, professionnelle, légèrement parisienne, autodérision et 3 à 6 emojis maximum.
- Aucune donnée sportive n'est inventée : l'IA reçoit uniquement les résultats/pronos/buteurs présents dans les JSON.
- Un bilan IA déjà généré n'est pas regénéré à chaque passage du workflow.
- Si l'API IA échoue, les statistiques sont tout de même écrites et le workflow réessaiera ultérieurement.
- Secret GitHub requis : `OPENAI_API_KEY`.
- Modèle par défaut : `gpt-5-mini` (modifiable avec `OPENAI_MODEL`).

## V8.4.1 — Débrief Footix 100 % gratuit
- Suppression de la dépendance à l'API OpenAI et du secret `OPENAI_API_KEY`.
- Résumé automatique généré directement dans GitHub Actions, gratuitement.
- Ton Footix : naturel, un peu drôle, autodérision, légère fibre parisienne et emojis modérés.
- Le texte s'appuie uniquement sur les scores, pronostics et buteurs présents dans les JSON.
- Les formulations varient selon la journée afin d'éviter un texte identique à chaque fois.

## V8.4.2 — Débrief plus humain + correction buteurs
- Réécriture du débrief automatique pour raconter réellement les principaux résultats de la journée.
- Correction du texte J1 : formulation naturelle, faits marquants, humour léger et fibre parisienne.
- Correction du compteur global `Bons buteurs` : une ancienne journée sans `actualScorers` utilise désormais le bilan validé au lieu d'afficher 0.
- J1 affiche désormais 5 bons buteurs dans les statistiques globales.
- Le générateur gratuit varie les formulations et cite plusieurs résultats marquants avant de parler des statistiques Footix.
