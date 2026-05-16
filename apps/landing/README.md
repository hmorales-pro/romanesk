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

Cible recommandée : **Cloudflare Pages** ou **Netlify** (gratuits, CDN
mondial, HTTPS automatique).

Configuration :
- **Build command** : aucune (laisser vide).
- **Publish directory** : `apps/landing`.
- **Root directory** : la racine du repo (Cloudflare clone tout, le
  `publish dir` pointe juste vers le sous-dossier).
- Domaine : `romanesk.fr` (DNS CNAME → cible Pages/Netlify).

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
