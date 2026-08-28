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
