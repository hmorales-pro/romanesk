# Choix de licence — note de décision

> **Statut** : ✅ tranché — **Elastic License 2.0** (ELv2).
> **Date** : 2026-05-02.
> **Décideur** : Hugo Morales.

---

## Décision

Romanesk est distribué sous **Elastic License 2.0** (texte intégral dans `LICENSE` à la racine). Le projet est **propriétaire et source-available, en free-use** : son utilisation est gratuite et illimitée pour les particuliers comme pour les entreprises, mais la redistribution sous forme d'un service hébergé concurrent est interdite.

Le repository GitHub `hmorales-pro/romanesk` reste **privé** pendant la Phase 0. Une éventuelle ouverture en source-available (repo public sous ELv2) sera décidée à la fin de la Phase 0 selon l'état du code.

---

## Pourquoi ELv2

L'objectif de Romanesk est d'être :
- **Gratuit pour ses utilisateurs** (particuliers et entreprises) sans abonnement obligatoire ;
- **Local-first et transparent** sur la gestion des données ;
- **Protégé contre le rebranding et l'hébergement SaaS opaque** par un tiers.

Quatre familles de licence ont été comparées :

| Option | Free use perso/pro | Empêche fork SaaS | Conversion OSS | Reconnu | Verdict |
|--------|--------------------|-------------------|----------------|---------|---------|
| MIT / Apache 2.0 | ✅ | ❌ | n/a | ✅✅ | Trop permissif : un acteur peut héberger Romanesk en SaaS opaque demain. |
| AGPL-3.0 | ✅ (sous copyleft fort) | 🟡 (oblige à publier le code, mais n'empêche pas l'hébergement) | n/a | ✅✅ | Aligné valeurs OSS, mais le projet n'est **pas** open-source. |
| FSL-1.1 (Sentry) | ✅ | ✅ | ⏰ MIT/Apache après 2 ans | 🟡 | Bon équilibre mais Hugo veut rester propriétaire indéfiniment. |
| **Elastic License 2.0** | **✅** | **✅** | **❌ (jamais)** | **✅** | **Choisi** : reste propriétaire, free use total, blocage SaaS clair. |

L'ELv2 est utilisée par Elasticsearch / Kibana 7.11+, Redis Stack, MariaDB MaxScale, etc. Le texte est court (~80 lignes), connu des équipes juridiques d'entreprise, et ses trois interdictions sont sans ambiguïté :

1. **Pas de SaaS hébergé** : on ne peut pas fournir Romanesk « as a managed service » à des tiers.
2. **Pas de contournement de système de licence** : si un jour Romanesk introduit une feature payante derrière une clé, on ne peut pas la débrider.
3. **Pas d'altération des notices** : copyright et mentions licence doivent rester intacts.

Tout le reste (use, copy, distribute, modify, derivative works, usage commercial interne) est explicitement autorisé.

---

## Conséquences pratiques

### Pour les utilisateurs
- Téléchargent et utilisent Romanesk gratuitement, à vie.
- Peuvent l'utiliser dans un cadre professionnel, dans une entreprise, sur autant de machines que voulu.
- Ne peuvent pas le rebrand/republier ni le proposer en SaaS.

### Pour les contributions externes
- **Repo privé en Phase 0** → pas de PR externes possibles aujourd'hui.
- Quand le repo s'ouvrira (au plus tôt à la fin de la Phase 0) :
  - Toute PR devra être accompagnée d'un **CLA** (Contributor License Agreement) qui assigne le copyright à Hugo Morales. Indispensable pour pouvoir vendre des licences commerciales d'exception un jour, et pour pouvoir évoluer la licence si nécessaire.
  - Démarrage probable avec un **DCO** (Developer Certificate of Origin) léger ; CLA Assistant ou EasyCLA si la base de contributeurs grossit.
- Un fichier `CONTRIBUTING.md` et une note CLA seront posés *avant* la première PR externe — pas avant.

### Pour Hugo (auteur)
- Garde 100% du copyright tant qu'il est seul à coder, donc reste libre de :
  - Vendre des **licences commerciales d'exception** (ex. à un acteur qui voudrait offrir Romanesk en SaaS) ;
  - Proposer un **tier payant** (sync hébergée, modèles cloud premium, etc.) avec une fonctionnalité protégée par clé ;
  - **Relicencier** plus tard (ex. basculer en OSS si la stratégie change) sans accord d'aucun contributeur.
- Doit auditer chaque dépendance ajoutée :
  - Crates Rust sous MIT / Apache / BSD / ISC : **OK**.
  - Crates sous LGPL : **OK** côté lien dynamique, à valider au cas par cas.
  - Crates sous **GPL / AGPL** : **interdit** (incompatibles avec une distribution propriétaire).
  - Outil : `cargo-deny` configuré pour bloquer GPL/AGPL en CI.

---

## Ce qui change par rapport à la version précédente de cette note

La version initiale de cette note recommandait **AGPL-3.0** (modèle open-source copyleft). Décision révisée le 2026-05-02 :

- Hugo souhaite **garder le contrôle commercial** de Romanesk (option dual-license, tier payant futur, exception SaaS payante) sans la contrainte de gérer un CLA dès le jour 1 d'une base AGPL.
- Le positionnement « propriétaire mais free-use » est cohérent avec les outils de référence du marché (Obsidian, Linear, Notion côté desktop) et n'enlève rien à l'accessibilité pour l'utilisateur final.
- L'ELv2 fournit un texte standard pré-établi qui colle exactement à ce besoin, sans avoir à rédiger un EULA custom (et sans avocat).

Romanesk **n'est donc pas un projet open-source** au sens OSI. C'est un projet **propriétaire, source-available (à terme), free-use**.

---

## Actions de suivi

- [x] Poser `LICENSE` à la racine (Elastic License 2.0).
- [x] Bumper `Cargo.toml` (workspace) en `license = "LicenseRef-Elastic-2.0"` (SPDX standard pour licences non-OSI).
- [x] Mettre à jour README, PRD, ROADMAP pour retirer toute mention « open-source » et la remplacer par « source-available, free-use ».
- [ ] Ajouter `cargo-deny.toml` qui bloque les dépendances GPL/AGPL (Phase 0 — J5).
- [ ] Décider en fin de Phase 0 si le repo passe public (source-available) ou reste privé (binaire seulement).
- [ ] Si le repo s'ouvre : ajouter `CONTRIBUTING.md` mis à jour + DCO + note CLA *avant* la première PR externe.
