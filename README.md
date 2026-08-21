# Footix Prono V5.1 — version simplifiée pour GitHub

Cette version est prévue pour que presque tous les fichiers restent **à la racine du dépôt**, exactement comme sur ta capture GitHub.

## Fichiers à la racine

- `index.html`
- `admin.html`
- `admin.js`
- `script.js`
- `styles.css`
- `logo-footix-prono.png`
- `clubs.json`
- `mercato.json`
- `pronos.json`
- `schedule.json`
- `standings.json`
- `update_mercato.py`
- `update_standings.py`

## Seul dossier obligatoire

GitHub Actions impose que les workflows soient placés ici :

```text
.github/
└── workflows/
    ├── update-mercato.yml
    └── update-standings.yml
```

Tous les chemins du site et des scripts ont été adaptés à cette structure plate.

## Mise à jour

Remplace les anciens fichiers à la racine par ceux de cette archive. Ensuite crée le dossier `.github/workflows/` dans le dépôt et place les deux fichiers YAML dedans.

Le site reste accessible via GitHub Pages et l'administration via `admin.html`. Les pronostics sont enregistrés dans `pronos.json`, tandis que le classement et le mercato sont mis à jour automatiquement par GitHub Actions.
