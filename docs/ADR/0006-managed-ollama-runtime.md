# ADR 0006 — Runtime Ollama managé (« tout packagé en un seul endroit »)

- **Statut** : Accepté
- **Date** : 2026-07-30
- **Décideurs** : Hugo Morales

## Contexte

Jusqu'à P16, la couche IA de Romanesk exigeait qu'Ollama soit installé et
démarré par l'utilisateur (téléchargement sur ollama.com, éventuellement
`ollama serve` dans un terminal). C'est la principale marche d'entrée pour
un public d'écrivains non techniques, et elle contredit la promesse
« un seul installeur, tout au même endroit ».

Les apps comparables (Jan, LM Studio) embarquent ou téléchargent leur
moteur d'inférence et leurs modèles elles-mêmes, sans dépendance externe
visible.

Deux options étudiées :

1. **Ollama managé par l'app** : Romanesk télécharge le binaire Ollama
   officiel au premier lancement, le lance en processus enfant sur un
   port privé et stocke les modèles dans son dossier de données.
2. **llama.cpp embarqué** (modèle Jan strict) : `llama-server` en sidecar,
   modèles GGUF téléchargés depuis Hugging Face, nouveau provider
   OpenAI-compatible.

## Décision

Option 1 — **runtime Ollama managé, téléchargé au premier lancement**
(pas bundlé : les archives avec runners GPU pèsent de ~30 Mo à >1 Go
selon la plateforme, incompatible avec des installeurs légers et la
notarisation macOS).

Points clés :

- **Trois modes** (`AppSettings::ollama_mode`) : `auto` (défaut — Ollama
  système s'il répond, sinon runtime managé), `system` (comportement
  historique), `managed` (toujours le runtime Romanesk).
- **Port privé 11540** (`runtime::MANAGED_PORT`) pour cohabiter sans
  collision avec un Ollama système présent ou installé plus tard.
- **`OLLAMA_MODELS` → `app_data_dir/models`** : les modèles vivent avec
  les données Romanesk ; une désinstallation efface tout.
- **Cycle de vie lié à l'app** : spawn au setup (selon mode), kill sur
  `RunEvent::Exit`. Un runtime orphelin d'une session crashée qui répond
  encore sur 11540 est adopté, pas dédoublé.
- **Téléchargement** streamé depuis GitHub Releases
  (`releases/latest/download`, fallback ollama.com), vérification
  SHA-256 best-effort via le `sha256sum.txt` publié — même modèle de
  confiance que l'install.sh officiel quand le checksum est indisponible.
- **Le backend est la source de vérité de l'URL effective**
  (`runtime_status`) ; le front ne suppose plus `localhost:11434`.
- **Modèle recommandé selon la RAM** (`gemma3:1b/4b/12b`) : l'onboarding
  un-clic télécharge moteur + modèle chat + modèle d'embedding sans
  décision technique demandée à l'utilisateur.

L'option 2 (llama.cpp) reste ouverte derrière le trait `Provider` si le
poids d'Ollama ou sa licence devenait un problème — rien dans cette
décision ne l'exclut.

## Conséquences

- Nouveaux modules : `src-tauri/src/runtime.rs` (manager, download,
  spawn) et `src-tauri/src/commands/runtime.rs` (commandes
  `runtime_status` / `runtime_download` / `runtime_start`).
- `settings_save` applique la politique du mode (start/stop du managé)
  et rebranche les providers sur l'URL effective.
- CSP : ajout de `http://127.0.0.1:11540` / `http://localhost:11540`.
- Le managé démarre avec `OLLAMA_ORIGINS=*` (bind 127.0.0.1 uniquement)
  pour autoriser l'origine `tauri://` du WebView.
- Dépendances ajoutées côté desktop : `sha2`, `flate2`, `tar`, `zip`,
  `sysinfo`.
- Non couvert (assumé) : redémarrage automatique si le runtime managé
  crashe en cours de session (le badge IA passe hors ligne, la gate
  propose « Relancer le moteur IA ») ; reprise partielle d'un
  téléchargement interrompu.
