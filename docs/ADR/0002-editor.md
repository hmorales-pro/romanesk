# ADR 0002 — Éditeur de texte riche

- **Statut** : Accepté provisoirement (Tiptap par défaut, POC court à mener avant Phase 0 — J8)
- **Date** : 2026-05-02
- **Décideurs** : Hugo Morales

## Contexte

Romanesk a besoin d'un éditeur de texte riche pour deux usages distincts :

1. **Fiches de lore** (Phase 0 puis Phase 1) : champs longs type *biographie d'un personnage*, *description d'un lieu*, *histoire d'une faction* — texte mis en forme avec sections, listes, citations, peut-être quelques liens vers d'autres entités.
2. **Manuscrit / chapitres** (Phase 4) : la vraie surface d'écriture. Mode focus, traitement de paragraphes, *continuation IA* avec preview gris non-validé, suggestions inline, suivi des modifications, gros documents (chapitres de 5-15k mots).

Le choix de l'éditeur doit tenir sur les deux usages, sans avoir à en intégrer deux différents. Deux candidats sérieux dans l'écosystème React + ProseMirror-based :

- **Tiptap 2** (au-dessus de ProseMirror) — communauté MIT large, écosystème d'extensions massif.
- **Lexical** (Meta) — moteur custom, plus jeune mais conçu pour la perf et l'accessibilité.

## Décision

**Tiptap 2 par défaut**, avec un POC court (1 jour par éditeur) à mener avant l'intégration en Phase 0 — J8.

Si le POC révèle un blocage côté Tiptap sur la **continuation IA avec preview gris** (le cas d'usage le plus exigeant, Phase 4) ou sur la **perf à 15k mots dans un chapitre**, on bascule sur Lexical.

## Comparatif

| Critère | Tiptap 2 | Lexical |
|---------|----------|---------|
| Maturité | ✅ stable depuis 2021, v2 en prod chez de nombreux outils | 🟡 stable depuis 2022, encore moins éprouvé sur des éditeurs littéraires longs |
| Écosystème extensions | ✅✅ très large (StarterKit, Collab, Mention, Math, Tables, etc.) | 🟡 plus pauvre, plus de code à écrire soi-même |
| Documentation | ✅ excellente, tutos abondants | 🟡 docs Meta correctes mais moins de contenu communautaire |
| Performance gros docs | 🟡 ProseMirror tient bien jusqu'à 30-50 pages, ralentit ensuite | ✅ conçu pour la perf, scale mieux sur 100+ pages |
| Continuation IA (preview gris) | 🟡 faisable via decorations ProseMirror, mais demande du code custom | ✅ Lexical a un modèle de *nodes décoratifs* plus naturel pour ça |
| Accessibilité | 🟡 standard ProseMirror, à compléter | ✅ Lexical a l'accessibilité comme objectif explicite (Meta = grosse base utilisateurs) |
| Licence | ✅ MIT (compat ELv2) | ✅ MIT (compat ELv2) |
| Bundle size | 🟡 ~150 ko gz pour StarterKit | ✅ ~70 ko gz core |
| Sérialisation | ✅ JSON ProseMirror ou HTML ou Markdown | 🟡 JSON Lexical, format plus jeune (moins d'outils tiers) |
| Migration éventuelle | 🟡 ProseMirror JSON → Lexical : faisable mais coûteux | n/a |

## Pourquoi Tiptap par défaut

1. **Risque inférieur en Phase 0/1.** L'écosystème Tiptap couvre tout ce dont on a besoin pour les fiches de lore (StarterKit + Placeholder + Link + Mention) sans coder grand-chose. La Phase 4 (manuscrit) est encore loin et le risque y est plus opportun à prendre.
2. **JSON ProseMirror est un format mature** : on peut le persister en SQLite (`chapters.body_json` dans la migration `0001_init.sql`), le rejouer côté serveur si besoin, et il existe une vaste boîte à outils.
3. **Doc et stack-overflow.** Quand on coince un samedi à 23 h, Tiptap aura toujours plus de réponses Google qu'un point obscur de Lexical.
4. **La porte de sortie reste ouverte.** Si la Phase 4 confirme que la continuation IA + perf 15k mots ne tient pas en Tiptap, on migre. Coût estimé : 1 à 2 semaines (la couche métier ne dépend pas du runtime de l'éditeur, seulement du format de sérialisation).

## Ce que le POC doit valider (avant J8)

- [ ] Charger un document de 10k mots, vérifier la latence de saisie (< 16 ms par frappe).
- [ ] Afficher un fragment « gris non-validé » à la fin d'un paragraphe, et un raccourci pour l'accepter ou le rejeter — prouver le mécanisme.
- [ ] Sérialiser en JSON, persister en SQLite, recharger : round-trip fidèle.
- [ ] Plugin minimal `@tiptap/extension-mention` qui suggère des entités du lore (tape `@`, popup avec entités). C'est un usage typique en Phase 1.

Si **un seul** de ces 4 points casse → escalade en POC Lexical équivalent.

## Conséquences

- **Stack frontend ajoutée** : `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-mention`. Toutes en MIT, compat ELv2 — vérifié.
- **Schéma DB déjà aligné** : `chapters.body_json` (TEXT) et `lore_entities.content_json` (TEXT) acceptent du JSON ProseMirror tel quel.
- **Tests** : prévoir un *snapshot test* sur le round-trip JSON pour détecter les régressions de sérialisation à chaque upgrade Tiptap.
- **Migration Tiptap 2 → 3** (si elle sort en cours de projet) : à anticiper, l'équipe Tiptap a un historique de breaking changes par majeure.

## Alternatives écartées

- **Lexical (par défaut)** : meilleur pour Phase 4, mais on prend la dette d'écosystème sur Phase 0/1 où l'enjeu est la vitesse de livraison.
- **Slate.js** : moins maintenu, modèle de données reconnu instable sur les gros docs.
- **CodeMirror 6** : excellent pour le code, pas adapté au texte littéraire.
- **Quill** : éditeur historique mais l'API et l'extensibilité sont en dessous de Tiptap/Lexical.
- **Plate.js** (au-dessus de Slate) : prometteur mais moins éprouvé que Tiptap.
- **Custom au-dessus de ProseMirror direct** : trop coûteux pour un solo dev.
