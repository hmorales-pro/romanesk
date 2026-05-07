# Romanesk — kit de copies pour site de présentation

Document source pour la création d'un site de présentation. Contient
plusieurs niveaux de pitch (tagline, paragraphe, sections), une liste
d'audiences, des cards de fonctionnalités, les valeurs, des mots-clés
SEO et un guide de ton à respecter.

---

## Tagline (une ligne)

**Romanesk — l'atelier d'écriture qui pense avec toi.**

### Variantes

- *L'écriture fictionnelle, augmentée et privée.*
- *Construis un univers. Écris-le. Garde-le.*
- *Worldbuilding + roman, dans un seul outil local.*
- *Ton univers. Ton manuscrit. Ta machine.*

---

## Pitch (un paragraphe)

Romanesk est un atelier d'écriture local-first pour auteurs de fiction.
Il combine la construction d'univers (personnages, lieux, factions,
objets, concepts, époques, événements, relations) et la rédaction
multi-chapitres dans un éditeur riche, avec une IA en sparring partner
intégrée à chaque étape — continuation de chapitre, brainstorming,
vérification de cohérence avec le lore, génération de fiches, atelier
de description, import et analyse d'un texte existant. Tout tourne sur
ta machine via Ollama : aucune donnée ne sort, aucun abonnement, aucun
cloud.

---

## Audience

- **Romanciers** qui jonglent avec un univers dense et veulent un
  compagnon qui se souvient à leur place.
- **Auteurs de fantasy / SF / uchronie** qui ont besoin de cohérence
  sur des centaines de fiches.
- **Game masters / showrunners** qui construisent un monde partagé.
- **Écrivains qui veulent l'IA mais pas le cloud** : ChatGPT marche,
  mais ton manuscrit ne devrait pas finir dans un dataset.

---

## Sections de fonctionnalités (cards)

### Construis ton univers

6 types de fiches polymorphes (Personnage, Lieu, Faction, Objet,
Concept, Entité réelle). Tags transversaux. Graphe nébuleux des
relations. Ancrage historique optionnel pour les uchronies.

### Écris des récits multi-chapitres

Éditeur riche avec toolbar, typographie française auto (espaces
insécables, cadratins, guillemets « »), bouton dialogue, auto-save 3s,
drag-and-drop des chapitres, export Markdown.

### L'IA en sparring partner

Continuation, réécriture, résumé, brainstorm, vérification de cohérence
avec le lore, atelier description (texte ou image). 5 modèles
configurables : créatif, littéral, embedding, vision, défaut.

### Import intelligent

Glisse un Word, PDF, Markdown ou colle ton texte. L'IA analyse,
identifie les personnages / lieux / factions / époques / chapitres, et
te propose de créer un nouvel univers ou d'enrichir un existant — avec
détection des incohérences.

### Mémoire vivante du lore

Indexation embeddings + RAG : pose une question en langage naturel sur
ton univers, l'IA répond en citant les fiches consultées.

---

## Valeurs / philosophie

- **Local-first** : tes données restent sur ta machine. SQLite local,
  modèles Ollama locaux. Aucun compte, aucun serveur.
- **Pas de lock-in** : export Markdown à tout moment. Le format de
  stockage est lisible (SQLite + Tiptap JSON).
- **L'IA n'écrit jamais directement en base** : toutes ses suggestions
  passent par ton validation.
- **Free-use** : licence Elastic 2.0 — tu peux l'utiliser librement
  sans redevance, le code source est consultable.

---

## Mots-clés / tags pour SEO et chips

`worldbuilding` · `écriture` · `roman` · `auteurs` · `fiction` · `Tauri`
· `Ollama` · `IA locale` · `RAG` · `local-first` · `privé` · `Markdown`
· `lore` · `cohérence narrative`

---

## Ton à tenir dans les copies

- **Tutoiement direct** (pas vouvoiement).
- **Pas de jargon dev** côté landing (« local-first » ok mais explique
  en deux mots à côté).
- **Ton littéraire mesuré** : on parle à des écrivains, pas à des
  startups.
- **Concret > abstrait** : « 6 types de fiches » plutôt que « système
  flexible d'entités ».
- **Pas d'emojis** dans les copies finales (sauf si tu veux casser la
  ligne très ponctuellement).

---

## Structure suggérée pour la landing

1. **Hero** : tagline + sous-tagline d'une ligne + 1 bouton
   « Télécharger » + 1 bouton secondaire « Voir les captures ».
2. **Bandeau de réassurance** : « Local-first · Aucun cloud ·
   Free-use ».
3. **Démonstration visuelle** : capture du graphe nébuleux ou de la
   page d'écriture multi-chapitres.
4. **3 cartes de fonctionnalités-clés** : Construis ton univers ·
   Écris-le · L'IA t'accompagne.
5. **Section import** : « Tu as déjà commencé ailleurs ? »
6. **Valeurs / philosophie** : local-first, pas de lock-in, IA validée.
7. **Bandeau technique discret** : Tauri · Rust · React · Ollama ·
   SQLite.
8. **CTA final** : « Télécharger Romanesk ».
9. **Footer** : licence Elastic 2.0, GitHub, contact.
