# Choix de licence — note de décision

> Statut : **À trancher** par l'auteur avant publication du repo public.
> Recommandation par défaut : **AGPL-3.0**.

---

## Contexte

Romanesk sera distribué en open-source / free-use. Trois familles de licences sont sur la table. Le choix engage le projet pour longtemps : changer de licence après que des contributeurs externes ont commencé à pousser du code est compliqué (il faudrait l'accord de chacun ou un CLA prévu en amont).

Cette note compare les options pour aider à trancher.

---

## Les options

### Option A — MIT

> **Esprit** : « Faites ce que vous voulez avec le code, mentionnez juste qui l'a écrit. »

**Pour**
- Maximum d'adoption — la plupart des entreprises acceptent MIT sans process légal.
- Simplicité absolue, ~5 lignes.
- Pas de friction pour les contributeurs.
- Compatible avec quasiment tout le reste de l'écosystème.

**Contre**
- N'importe qui peut **forker, fermer le code, vendre Romanesk en SaaS** propriétaire sans rien rendre. C'est arrivé à Redis, ElasticSearch, MongoDB → ils ont *tous* changé de licence par la suite.
- Aucune protection contre l'appropriation par un acteur plus gros.

### Option B — Apache 2.0

> **Esprit** : « Comme MIT, plus une protection brevets explicite. »

**Pour**
- Permissif comme MIT.
- Clause brevets : un contributeur ne peut pas vous attaquer en brevet sur sa propre contribution.
- Adoption industrielle large (préféré par certaines fondations).

**Contre**
- Mêmes contre que MIT côté fork closed-source.
- Texte plus long (~150 lignes), légère friction de lecture.

### Option C — AGPL-3.0

> **Esprit** : « Vous pouvez faire ce que vous voulez, mais toute redistribution **— y compris en SaaS sur le réseau —** doit être accompagnée du code source modifié, sous la même licence. »

**Pour**
- **Protection forte** contre l'appropriation : un fork SaaS propriétaire est juridiquement impossible sans réécriture from scratch.
- Aligné avec l'esprit local-first / privacy-first de Romanesk.
- Communauté open-source mature, jurisprudence solide (Linux est en GPL, MongoDB est passé en SSPL voisine, Grafana est en AGPL).
- N'empêche pas les particuliers ni les entreprises d'utiliser Romanesk pour eux-mêmes — seulement la *redistribution propriétaire*.

**Contre**
- **Friction d'intégration en entreprise** : certains services juridiques refusent par principe les copyleft fortes.
- Certains contributeurs occasionnels préfèrent éviter (peur de « contaminer » leur code).
- Compatibilité parfois délicate avec des dépendances permissives (cas rares mais à vérifier).

---

## Critères de décision propres à Romanesk

| Critère | Poids | MIT | Apache | AGPL |
|---------|-------|-----|--------|------|
| Aligner licence et valeurs (privacy, local-first, no lock-in) | 🔥🔥🔥 | 🟡 neutre | 🟡 neutre | 🟢 fort |
| Maximiser adoption (plugins tiers, intégrations) | 🔥🔥 | 🟢 max | 🟢 max | 🟡 moyen |
| Empêcher un fork SaaS commercial | 🔥🔥🔥 | 🔴 nul | 🔴 nul | 🟢 fort |
| Garder l'option d'une dual-license (vendre des licences commerciales un jour) | 🔥 | 🔴 perdu | 🔴 perdu | 🟢 viable (avec CLA) |
| Friction pour contributeurs occasionnels | 🔥 | 🟢 nulle | 🟢 nulle | 🟡 moyenne |
| Compat avec dépendances OSS | 🔥🔥 | 🟢 max | 🟢 max | 🟡 à vérifier au cas par cas |

---

## Recommandation

**AGPL-3.0** — pour ces trois raisons combinées :

1. **Cohérence avec le positionnement.** Romanesk défend le local-first et la propriété des données. Une licence permissive permettrait à un acteur de prendre le code, l'héberger en SaaS opaque, et trahir cet esprit. AGPL le rend impossible.
2. **Outil personnel d'abord.** L'auteur ne perd rien à la friction d'adoption « entreprise » : ce n'est pas le marché visé en v1.
3. **Option future préservée.** Si un jour Romanesk évolue vers un modèle dual-license (open-source AGPL + license commerciale pour les exceptions), la base AGPL le permet *à condition d'avoir un CLA* — à mettre en place avant la première PR externe.

---

## Si on choisissait MIT à la place

Acceptable **si et seulement si** :
- L'objectif principal devient l'adoption massive et l'intégration dans d'autres outils (ex. Romanesk comme moteur de lore embarqué dans des éditeurs commerciaux).
- L'auteur accepte le risque d'un fork SaaS qu'il ne contrôlerait pas.
- L'écosystème de plugins prime sur la pureté du modèle.

Ce n'est pas le cas aujourd'hui, donc MIT n'est pas recommandé.

---

## Apache 2.0 comme compromis ?

Apache 2.0 ressemble à MIT côté fork mais protège mieux côté brevets. Pertinent si :
- Vous attendez beaucoup de contributions de gros acteurs avec des portefeuilles brevets.
- Vous voulez la simplicité permissive sans angle mort patent.

Pour un outil personnel d'écrivain, le bénéfice est marginal. **Pas la recommandation principale**.

---

## Décisions associées si on part sur AGPL

- **CLA (Contributor License Agreement)** : *non* en v1. AGPL fait le travail. Si on veut garder la porte ouverte à une dual-license un jour, ajouter un CLA *avant* les premières contributions externes (DCO simple suffit pour commencer ; CLA Assistant ou Linux Foundation EasyCLA si ça grossit).
- **Dépendances** : auditer chaque ajout. Crates Rust sous MIT/Apache = OK. Crates GPL = compat. Tout ce qui est `BUSL`, `SSPL`, `Elastic v2` ou non-OSI = exclu.
- **Marquage** : header AGPL-3.0 dans chaque fichier source (ou au moins par crate). Outil : `cargo-license` pour audit régulier.

---

## À trancher maintenant

- [ ] Confirmer **AGPL-3.0** comme licence par défaut, OU
- [ ] Préférer **MIT** (adoption max, on accepte le risque), OU
- [ ] Préférer **Apache 2.0** (compromis brevets), OU
- [ ] Demander une analyse plus poussée d'une 4ᵉ option (BSL avec retour OSS après N ans, Polyform, etc.).

Une fois choisie, poser le fichier `LICENSE` à la racine, ajouter le header dans chaque source, et mettre à jour `OQ8b` du PRD.
