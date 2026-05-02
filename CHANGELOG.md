# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/) ; le projet suit (à terme) [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `LICENSE` à la racine — texte intégral de l'**Elastic License 2.0**.
- ADR `0002-editor.md` (Tiptap vs Lexical — décision Tiptap par défaut).
- ADR `0003-relations.md` (set figé en v1, extensible en Phase 1+).

### Changed
- **Pivot du modèle de distribution** : open-source AGPL → **propriétaire source-available, free-use** sous Elastic License 2.0.
- `Cargo.toml` (workspace + `crates/core`) : `license = "LicenseRef-Elastic-2.0"`, `repository = "https://github.com/hmorales-pro/romanesk"`.
- `docs/LICENSE-CHOICE.md` réécrit pour acter la décision ELv2 et expliquer le raisonnement.
- `README.md`, `PRD.md` (§15 entière), `CONTRIBUTING.md` : retrait des mentions « open-source » au sens OSI ; positionnement clarifié en source-available free-use ; note CLA pour les contributions futures.
- `PHASE-0-PLAN.md` (J1) : objectif licence remis à jour vers ELv2.

### En cours
- Phase 0 : scaffolding Tauri, schéma DB initial, trait `Provider` IA, CI offline-only.

## [0.0.0] — 2026-05-02

### Added
- PRD v0.3 (vision, modèle de données, ancrage réel, distribution).
- Plan détaillé Phase 0 (`PHASE-0-PLAN.md`).
- Note de décision sur la licence (`docs/LICENSE-CHOICE.md`).
- Structure initiale du repo (README, CONTRIBUTING, CODE_OF_CONDUCT, .gitignore).

[Unreleased]: https://github.com/hmorales-pro/romanesk/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.0.0
