# Code signing — guide opérationnel

Le workflow `.github/workflows/release.yml` détecte automatiquement la
présence des secrets et signe les bundles correspondants. Trois axes
indépendants : **macOS**, **Windows**, et le **Tauri Updater** (pour
les MAJ in-app, optionnel).

Sans secrets, le workflow continue à fonctionner et produit des
bundles **non signés** — utilisables en bêta interne, mais Gatekeeper
(macOS) et SmartScreen (Windows) afficheront un avertissement à
l'utilisateur final.

---

## 1. macOS — Apple Developer ID + notarization

**Coût** : 99 €/an (compte Apple Developer Program).
**Délai d'activation** : 24-72 h après paiement.
**Résultat** : `.dmg` signé + notarized, Gatekeeper l'ouvre
silencieusement.

### 1.1 Inscription

1. <https://developer.apple.com/programs/enroll/> — t'inscrire avec
   ton Apple ID. Compte personnel (pas besoin de société).
2. Attendre la validation par Apple (1-3 jours ouvrés).
3. Récupérer le **Team ID** : <https://developer.apple.com/account>
   → "Membership Details" → 10 caractères alphanumériques type `A1B2C3D4E5`.

### 1.2 Créer le certificat « Developer ID Application »

Depuis ton Mac, dans **Trousseau d'accès** :

1. Menu *Trousseau d'accès → Assistant Certificat → Demander un
   certificat à une autorité de certification*.
2. Email = ton Apple ID, sauvegarder sur disque.
3. Aller sur <https://developer.apple.com/account/resources/certificates/list>
   → bouton **+** → choisir **Developer ID Application** → uploader
   le CSR généré → télécharger le `.cer`.
4. Double-cliquer le `.cer` pour l'installer dans le Trousseau.

### 1.3 Exporter le cert en `.p12`

Dans le Trousseau → catégorie « Mes certificats » → trouver le cert
*« Developer ID Application: Hugo Morales (TEAM_ID) »* → clic-droit
**→ Exporter** → format `.p12` → choisir un mot de passe fort.

### 1.4 Encoder le `.p12` en base64 pour GitHub

```bash
base64 -i Romanesk.p12 -o Romanesk.p12.b64
cat Romanesk.p12.b64 | pbcopy
```

Le contenu est maintenant dans le presse-papier — prêt à coller dans
le secret GitHub.

### 1.5 Récupérer le hash de signing identity

```bash
security find-identity -v -p codesigning
```

Tu vois une ligne du type :
```
1) ABCD1234...  "Developer ID Application: Hugo Morales (A1B2C3D4E5)"
```

Le **signing identity** est la chaîne complète entre guillemets :
`Developer ID Application: Hugo Morales (A1B2C3D4E5)`.

### 1.6 Créer un App-Specific Password (pour la notarization)

1. <https://appleid.apple.com> → connexion.
2. Section *Sign-In and Security → App-Specific Passwords → Generate*.
3. Label : `Romanesk notarization`.
4. Copier le password généré (format `xxxx-xxxx-xxxx-xxxx`).

### 1.7 Poser les 6 secrets GitHub + décommenter le workflow

Dans le repo : **Settings → Secrets and variables → Actions → New
repository secret**. Ajouter ces 6 secrets, dans l'ordre :

| Secret                       | Valeur                                                            |
|------------------------------|-------------------------------------------------------------------|
| `APPLE_CERTIFICATE`          | contenu de `Romanesk.p12.b64`                                     |
| `APPLE_CERTIFICATE_PASSWORD` | mot de passe du `.p12`                                            |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: Hugo Morales (TEAM_ID)`                |
| `APPLE_ID`                   | ton Apple ID (email)                                              |
| `APPLE_PASSWORD`             | l'App-Specific Password (étape 1.6)                               |
| `APPLE_TEAM_ID`              | les 10 caractères du Team ID (étape 1.1)                          |

Une fois les 6 secrets posés, **décommenter le bloc `APPLE_*`** dans
`.github/workflows/release.yml` (autour de la ligne 140). Les env
sont laissées commentées par défaut parce que GitHub Actions injecte
des chaînes vides quand un secret est absent, ce qui fait planter
`security import` côté tauri-action avec `SecKeychainItemImport: One
or more parameters passed to a function were not valid`. Décommenter
seulement après avoir posé les vrais secrets.

Après le commit qui décommente, le workflow tauri-action va lire
automatiquement les variables et signer + notarizer le `.dmg` à
chaque tag `v*`.

### 1.8 Vérifier après build

Sur le `.dmg` téléchargé depuis la release :
```bash
spctl -a -v Romanesk.app
# Doit afficher : Romanesk.app: accepted source=Notarized Developer ID
```

---

## 2. Windows — code signing certificate

**Trois options** par ordre croissant de friction et coût :

### Option A : Pas de signing (gratuit)

- L'utilisateur Windows voit « SmartScreen a empêché le démarrage d'une
  application non reconnue » au premier lancement.
- Il doit cliquer « Plus d'infos » → « Exécuter quand même ».
- Acceptable pour une bêta. Au bout de quelques milliers de
  téléchargements, SmartScreen finit par accepter.
- **Action** : aucune. Le workflow produit déjà des `.exe`/`.msi` non
  signés.

### Option B : Cert OV (~250 €/an)

- SmartScreen affiche **« Éditeur : Hugo Morales »** au lieu de
  « inconnu » mais peut encore avertir tant que la réputation n'est
  pas bâtie.
- Vendeurs recommandés : SSL.com, Sectigo, DigiCert.
- Procédé : commander cert → vérification identité (passeport scanné)
  → ils livrent un `.pfx` (équivalent Windows du `.p12`).
- Puis suivre les étapes ci-dessous pour configurer le workflow.

### Option C : Cert EV (~400-600 €/an)

- Confiance immédiate SmartScreen, pas d'avertissement.
- Vérification d'identité plus stricte (extrait Kbis ou équivalent).
- Le cert vient avec un **dongle USB physique** ou un **HSM cloud**
  (Azure Key Vault, SSL.com eSigner).
- Le dongle physique complique le CI car GitHub Actions ne peut pas
  brancher d'USB. Préférer Azure Key Vault pour automatiser via
  AzureSignTool.

### Configuration workflow (options B et C avec cert standard)

Une fois le `.pfx` en main :

```bash
# Encoder en base64
base64 -i Romanesk.pfx -o Romanesk.pfx.b64
cat Romanesk.pfx.b64 | pbcopy

# Récupérer le thumbprint (Windows uniquement, ou via openssl)
openssl pkcs12 -in Romanesk.pfx -nokeys | openssl x509 -fingerprint -sha1 -noout
# Affiche : SHA1 Fingerprint=AB:CD:EF:...  → enlever les ':' pour le thumbprint
```

Secrets GitHub à poser :
- `WINDOWS_CERTIFICATE` : contenu base64 du `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD` : mot de passe du `.pfx`

Puis ajuster `apps/desktop/src-tauri/tauri.conf.json` :
```json
"bundle": {
  "windows": {
    "certificateThumbprint": "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

**Recommandation pratique** : démarrer en Option A pour la bêta v0.6.x.
Passer en Option B le jour où tu vises une release publique large.

---

## 3. Tauri Updater (optionnel)

Permet à l'app de vérifier et installer ses propres mises à jour
in-app. Pas une signature de binaire — c'est juste une signature
cryptographique du **fichier `latest.json`** que l'updater fetch.

**Tu peux complètement skipper si tu préfères que l'utilisateur
re-télécharge manuellement depuis romanesk.fr ou GitHub Releases.**

### 3.1 Générer la paire de clés

```bash
# Une seule fois — depuis n'importe où, sauvegarde la clé privée précieusement.
pnpm --filter @romanesk/desktop exec tauri signer generate -w ~/.tauri/romanesk.key
```

Crée :
- `~/.tauri/romanesk.key` — **clé privée** (jamais commiter).
- `~/.tauri/romanesk.key.pub` — clé publique (à mettre dans
  `tauri.conf.json`).

### 3.2 Activer l'updater dans tauri.conf.json

Section `plugins.updater` à ajouter :
```json
"plugins": {
  "updater": {
    "pubkey": "CONTENU DE romanesk.key.pub",
    "endpoints": [
      "https://github.com/hmorales-pro/romanesk/releases/latest/download/latest.json"
    ]
  }
}
```

### 3.3 Secrets GitHub

- `TAURI_SIGNING_PRIVATE_KEY` : contenu de `~/.tauri/romanesk.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : mot de passe choisi à la
  génération (vide si tu n'en as pas mis)

tauri-action générera et signera `latest.json` automatiquement à
chaque release.

---

## Checklist avant le premier release publique signé

- [ ] Apple Developer Program payé et validé
- [ ] 6 secrets `APPLE_*` posés dans le repo GitHub
- [ ] (Optionnel) cert Windows + 2 secrets `WINDOWS_*` posés
- [ ] (Optionnel) paire de clés Tauri générée et 2 secrets `TAURI_SIGNING_*` posés
- [ ] Test sur tag pre-release : `git tag v0.6.1-rc1 && git push origin v0.6.1-rc1`
- [ ] Vérifier que la GitHub Release contient les assets signés
- [ ] Télécharger le `.dmg` macOS et vérifier `spctl -a -v Romanesk.app`
- [ ] Tester l'install sur une machine Mac qui n'a jamais vu l'app
- [ ] Si tout OK : `git tag v0.6.1 && git push origin v0.6.1`

---

## Coûts récurrents — résumé

| Élément                | Coût annuel                  |
|------------------------|------------------------------|
| Apple Developer Program | 99 €                         |
| Domaine romanesk.fr    | 10-15 €                      |
| Cloudflare Pages       | 0 € (free tier suffisant)    |
| GitHub Actions         | 0 € (2000 min/mois free tier) |
| Cert Windows OV        | 0-250 € (selon option)       |
| **Total minimal**      | **~110 €/an**                |
| **Total avec Windows OV** | **~360 €/an**             |
