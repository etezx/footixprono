# Footix Prono — V4

Site statique compatible GitHub Pages pour la Ligue 1 2026/2027.

## Nouveautés V4

- classement Ligue 1 mis à jour automatiquement par GitHub Actions
- source du classement : flux public ESPN `fra.1`
- calcul automatique des 5 derniers résultats (V / N / D)
- page `admin.html` pour saisir les pronostics sans modifier `index.html`
- publication de Score prévu / Cote / Buteur / Analyse dans `data/pronos.json`
- les pronostics publiés apparaissent automatiquement dans le tableau de la journée

## Fichiers à ajouter / remplacer

À la racine :
- `index.html`
- `styles.css`
- `script.js`
- `admin.html`
- `admin.js`
- `logo-footix-prono.png`
- `README.md`

Données :
- `data/schedule.json`
- `data/mercato.json`
- `data/standings.json`
- `data/pronos.json`

Automatisation :
- `scripts/update_mercato.py`
- `scripts/update_standings.py`
- `.github/workflows/update-mercato.yml`
- `.github/workflows/update-standings.yml`

## Classement automatique

Le workflow **Mettre à jour le classement** s'exécute toutes les heures et peut aussi être lancé manuellement dans **GitHub > Actions**.

Le script récupère le classement Ligue 1, puis calcule les cinq derniers résultats de chaque club. Il écrit uniquement dans `data/standings.json`. Si la source est indisponible ou renvoie un classement incomplet, le script échoue sans écraser le fichier existant.

Pour la première installation :
1. envoyer tous les fichiers de la V4 sur GitHub ;
2. ouvrir **Actions** ;
3. sélectionner **Mettre à jour le classement** ;
4. cliquer sur **Run workflow**.

## Administration des pronostics

Ouvrir :

`https://etezx.github.io/footixprono/admin.html`

L'éditeur permet de choisir une journée et de remplir pour chacun des 9 matchs :
- score prévu ;
- cote ;
- buteur ;
- analyse.

### Jeton GitHub

Comme GitHub Pages est un site statique, la page Admin ne peut pas écrire dans le dépôt sans autorisation GitHub.

Créer un **Fine-grained Personal Access Token** avec :
- accès uniquement au dépôt `etezx/footixprono` ;
- permission **Contents: Read and write** ;
- aucune autre permission nécessaire.

Le jeton est saisi dans `admin.html` au moment de publier. Il n'est pas stocké dans `localStorage`, les cookies, `data/pronos.json` ou le code du site. Il reste seulement en mémoire dans l'onglet ouvert.

Au clic sur **Publier les pronostics**, la page crée un commit qui ne modifie que `data/pronos.json`. GitHub Pages republie ensuite automatiquement le site.

> Important : ne jamais écrire le jeton directement dans un fichier du dépôt.

## Mercato

Le workflow **Mettre à jour le mercato** continue à alimenter `data/mercato.json` automatiquement.


## V5 — logos clubs et Ligue 1

- Les 18 écussons des clubs de Ligue 1 2026/2027 sont affichés dans les matchs, le classement et l’administration.
- Le logo Ligue 1 est affiché dans le bloc compétition et le classement.
- Les correspondances sont centralisées dans `data/clubs.json`, donc aucun changement de `index.html` n’est nécessaire pour remplacer une image.
- Les fichiers d’écussons pointent actuellement vers un dépôt public d’assets football. Pour un usage public/commercial durable, vérifiez les autorisations de marque des clubs et de la LFP et remplacez les URLs par des fichiers pour lesquels vous disposez des droits.
