# @romanesk/landing — romanesk.fr

Landing page publique du projet. **HTML statique pur** — pas de build,
pas de framework. Tout tient dans 3 fichiers :

- `index.html` — la page complète, avec sections et CTAs.
- `styles.css` — design system papier-bordeaux, mêmes tokens OKLCH que
  l'app desktop (charte CentreOF cohérente).
- `download.js` — détection OS + fetch GitHub release pour câbler les
  vrais URLs de téléchargement au runtime.
- `tweaks-panel.jsx` + `app.jsx` — mode édition interne (Babel runtime
  via unpkg). Visible seulement en local pour itérer sur la charte.

## Servir en local

```bash
# Depuis la racine du monorepo
pnpm --filter @romanesk/landing dev
# Ou directement
cd apps/landing && npx serve -p 4173 .
```

## Déploiement

### Cible actuelle : Hostinger (mutualisé Apache)

Déploiement auto via GitHub Actions sur push de `main`. Cf workflow
`.github/workflows/deploy-landing.yml` :

1. Dans hPanel Hostinger → **Files** → **FTP Accounts** : créer un
   compte FTP dédié au repo (jamais ton compte principal).
2. Poser 4 secrets GitHub (**Settings → Secrets and variables →
   Actions**) :
   - `FTP_SERVER` (ex. `ftp.romanesk.fr`)
   - `FTP_USERNAME` (le user FTP dédié)
   - `FTP_PASSWORD`
   - `FTP_TARGET` (ex. `/public_html/` ou `/domains/romanesk.fr/public_html/`)
3. Pousser un commit qui touche `apps/landing/**` (ou déclencher
   manuellement via Actions → Run workflow). Le workflow ignore
   `node_modules/`, `uploads/`, `tweaks-panel.jsx`, `app.jsx`,
   `package.json` et `README.md`.

Le fichier `.htaccess` à la racine de `apps/landing/` configure
HTTPS forcé, headers de sécurité (CSP, X-Frame, Permissions-Policy),
compression et cache. Il est uploadé automatiquement par le workflow.

### Alternative : Cloudflare Pages / Netlify

Si tu migres plus tard sur un CDN edge (gratuit, plus rapide, preview
deploys par PR) :
- **Build command** : aucune.
- **Publish directory** : `apps/landing`.
- **Root directory** : racine du repo.
- Le fichier `_headers` à la racine remplace `.htaccess` (lu
  automatiquement par les deux services).

## Câblage avec les releases GitHub

Les boutons « Télécharger » utilisent `download.js` qui :

1. Détecte l'OS via `navigator.userAgentData` (fallback user-agent).
2. Re-libellé le bouton primaire (« Télécharger pour macOS / Windows /
   Linux ») selon ce qui est détecté.
3. Fetch `api.github.com/repos/hmorales-pro/romanesk/releases/latest`
   pour récupérer la liste des assets et câbler le bon `href` :
   - `*.aarch64.dmg` pour macOS Apple Silicon (par défaut sur Mac)
   - `*-setup.exe` pour Windows (NSIS)
   - `*.AppImage` pour Linux
4. Si le fetch échoue (offline, rate limit), le `href` de fallback
   pointe vers `releases/latest` (page GitHub) — l'utilisateur choisit
   manuellement.

Aucune clé API requise — `releases/latest` est public.

## Mode édition (tweaks panel)

`tweaks-panel.jsx` ajoute un panneau caché qui permet d'essayer en
direct différentes palettes / paires de typo / densités. Reset au
reload. C'est un outil interne pour itérer sur la charte, **pas une
feature publique** — on peut le retirer en supprimant les 4 scripts
en bas d'`index.html` (React UMD + Babel + tweaks-panel).
