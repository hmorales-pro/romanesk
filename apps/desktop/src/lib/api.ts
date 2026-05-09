/**
 * Wrappers typés autour des commandes Tauri exposées par
 * `apps/desktop/src-tauri/src/commands/`.
 *
 * Convention :
 * - Les commandes Rust sont génériques sur `EntityType`.
 * - Les builders TS (`characterCreate`, `locationCreate`, …) construisent
 *   le `content` JSON typé selon le sous-type avant d'appeler la commande
 *   générique.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  BriefSource,
  Chapter,
  ChapterStatus,
  ConceptKind,
  DivergenceAxis,
  DivergencePoint,
  Entity,
  EntityType,
  Era,
  Event as TimelineEvent,
  FactionKind,
  LocationKind,
  ObjectKind,
  RealityAnchor,
  RealityMode,
  Relation,
  RelationType,
  Snapshot,
  Story,
  StoryType,
  Tag,
  Universe,
  Uuid,
  WorldBrief,
} from "./types";

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

export function universeList(): Promise<Universe[]> {
  return invoke<Universe[]>("universe_list");
}

export function universeCreate(args: {
  name: string;
  description?: string;
}): Promise<Universe> {
  return invoke<Universe>("universe_create", {
    name: args.name,
    description: args.description ?? null,
  });
}

export function universeGet(id: Uuid): Promise<Universe | null> {
  return invoke<Universe | null>("universe_get", { id });
}

/**
 * Met à jour les champs éditables d'un univers (P10.1).
 * - `name === undefined` : on ne touche pas au nom
 * - `description === undefined` : on ne touche pas à la description
 * - `description === ""` ou whitespace : efface (backend met NULL en base)
 * - `description === "texte"` : remplace
 */
export function universeUpdate(args: {
  id: Uuid;
  name?: string;
  description?: string;
}): Promise<Universe> {
  return invoke<Universe>("universe_update", {
    id: args.id,
    name: args.name ?? null,
    description: args.description ?? null,
  });
}

export function universeDelete(id: Uuid): Promise<void> {
  return invoke<void>("universe_delete", { id });
}

export function universeExportMarkdown(id: Uuid): Promise<string> {
  return invoke<string>("universe_export_markdown", { id });
}

// ---------------------------------------------------------------------------
// Entity — bas niveau (générique sur EntityType)
// ---------------------------------------------------------------------------

interface CreateEntityPayload {
  universeId: Uuid;
  kind: EntityType;
  name: string;
  summary: string | null;
  content: Record<string, unknown>;
  coverImage: string | null;
  isReal: boolean;
}

interface UpdateEntityPayload {
  id: Uuid;
  name: string;
  summary: string | null;
  content: Record<string, unknown>;
  coverImage: string | null;
  isReal: boolean;
}

function entityCreateRaw(payload: CreateEntityPayload): Promise<Entity> {
  return invoke<Entity>("entity_create", { payload });
}

function entityUpdateRaw(payload: UpdateEntityPayload): Promise<Entity> {
  return invoke<Entity>("entity_update", { payload });
}

/**
 * Liste les entités d'un univers, optionnellement filtrées par type.
 * Pas de filtre = tous types confondus.
 */
export function entityListInUniverse(
  universeId: Uuid,
  kind?: EntityType,
): Promise<Entity[]> {
  return invoke<Entity[]>("entity_list_in_universe", {
    universeId,
    kind: kind ?? null,
  });
}

export function entityGet(id: Uuid): Promise<Entity | null> {
  return invoke<Entity | null>("entity_get", { id });
}

export function entityDelete(id: Uuid): Promise<void> {
  return invoke<void>("entity_delete", { id });
}

// --- Cover image ------------------------------------------------------------

export interface CoverImageData {
  mime: string;
  dataBase64: string;
}

export function entitySetCoverImage(
  entityId: Uuid,
  sourcePath: string,
): Promise<string> {
  return invoke<string>("entity_set_cover_image", { entityId, sourcePath });
}

export function entityGetCoverImageData(
  entityId: Uuid,
): Promise<CoverImageData | null> {
  return invoke<CoverImageData | null>("entity_get_cover_image_data", { entityId });
}

export function entityClearCoverImage(entityId: Uuid): Promise<void> {
  return invoke<void>("entity_clear_cover_image", { entityId });
}

// ---------------------------------------------------------------------------
// Builders typés par EntityType
// ---------------------------------------------------------------------------

// --- Character --------------------------------------------------------------

export interface CreateCharacterArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  archetype?: string;
  traits?: string[];
  /** Doc ProseMirror, string (legacy) ou null. */
  biography?: unknown;
}

export function characterCreate(args: CreateCharacterArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Character",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      archetype: args.archetype?.trim() ? args.archetype : null,
      traits: (args.traits ?? []).map((t) => t.trim()).filter(Boolean),
      biography: args.biography ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateCharacterArgs {
  id: Uuid;
  name: string;
  summary?: string;
  archetype?: string;
  traits?: string[];
  biography?: unknown;
}

export function characterUpdate(args: UpdateCharacterArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      archetype: args.archetype?.trim() ? args.archetype : null,
      traits: (args.traits ?? []).map((t) => t.trim()).filter(Boolean),
      biography: args.biography ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// --- Location ---------------------------------------------------------------

export interface CreateLocationArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  kind?: LocationKind;
  climate?: string;
  population?: string;
  /** Doc ProseMirror ou null. */
  description?: unknown;
}

export function locationCreate(args: CreateLocationArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Location",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      climate: args.climate?.trim() ? args.climate : null,
      population: args.population?.trim() ? args.population : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateLocationArgs {
  id: Uuid;
  name: string;
  summary?: string;
  kind?: LocationKind;
  climate?: string;
  population?: string;
  description?: unknown;
}

export function locationUpdate(args: UpdateLocationArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      climate: args.climate?.trim() ? args.climate : null,
      population: args.population?.trim() ? args.population : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// --- Faction (Phase 5) ------------------------------------------------------

export interface CreateFactionArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  kind?: FactionKind;
  ideology?: string;
  founded?: string;
  leader?: string;
  description?: unknown;
}

export function factionCreate(args: CreateFactionArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Faction",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      ideology: args.ideology?.trim() ? args.ideology : null,
      founded: args.founded?.trim() ? args.founded : null,
      leader: args.leader?.trim() ? args.leader : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateFactionArgs {
  id: Uuid;
  name: string;
  summary?: string;
  kind?: FactionKind;
  ideology?: string;
  founded?: string;
  leader?: string;
  description?: unknown;
}

export function factionUpdate(args: UpdateFactionArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      ideology: args.ideology?.trim() ? args.ideology : null,
      founded: args.founded?.trim() ? args.founded : null,
      leader: args.leader?.trim() ? args.leader : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// --- Object (Phase 5) -------------------------------------------------------

export interface CreateObjectArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  kind?: ObjectKind;
  origin?: string;
  owner?: string;
  properties?: string[];
  description?: unknown;
}

export function objectCreate(args: CreateObjectArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Object",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      origin: args.origin?.trim() ? args.origin : null,
      owner: args.owner?.trim() ? args.owner : null,
      properties: (args.properties ?? []).map((p) => p.trim()).filter(Boolean),
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateObjectArgs {
  id: Uuid;
  name: string;
  summary?: string;
  kind?: ObjectKind;
  origin?: string;
  owner?: string;
  properties?: string[];
  description?: unknown;
}

export function objectUpdate(args: UpdateObjectArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      origin: args.origin?.trim() ? args.origin : null,
      owner: args.owner?.trim() ? args.owner : null,
      properties: (args.properties ?? []).map((p) => p.trim()).filter(Boolean),
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// --- Concept (Phase 5) ------------------------------------------------------

export interface CreateConceptArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  kind?: ConceptKind;
  domain?: string;
  description?: unknown;
}

export function conceptCreate(args: CreateConceptArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Concept",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      domain: args.domain?.trim() ? args.domain : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateConceptArgs {
  id: Uuid;
  name: string;
  summary?: string;
  kind?: ConceptKind;
  domain?: string;
  description?: unknown;
}

export function conceptUpdate(args: UpdateConceptArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      domain: args.domain?.trim() ? args.domain : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// ---------------------------------------------------------------------------
// Relation
// ---------------------------------------------------------------------------

export interface CreateRelationArgs {
  sourceId: Uuid;
  targetId: Uuid;
  type: RelationType;
  description?: string;
  /** Optionnel — Phase 2+ avec les époques. */
  eraId?: Uuid;
}

export function relationCreate(args: CreateRelationArgs): Promise<Relation> {
  return invoke<Relation>("relation_create", {
    payload: {
      sourceId: args.sourceId,
      targetId: args.targetId,
      type: args.type,
      description: args.description ?? null,
      eraId: args.eraId ?? null,
    },
  });
}

export function relationListForEntity(entityId: Uuid): Promise<Relation[]> {
  return invoke<Relation[]>("relation_list_for_entity", { entityId });
}

export function relationListInUniverse(universeId: Uuid): Promise<Relation[]> {
  return invoke<Relation[]>("relation_list_in_universe", { universeId });
}

export function relationDelete(id: Uuid): Promise<void> {
  return invoke<void>("relation_delete", { id });
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export function tagCreateInUniverse(args: {
  universeId: Uuid;
  name: string;
  color?: string;
}): Promise<Tag> {
  return invoke<Tag>("tag_create_in_universe", {
    payload: {
      universeId: args.universeId,
      name: args.name,
      color: args.color ?? null,
    },
  });
}

export function tagListInUniverse(universeId: Uuid): Promise<Tag[]> {
  return invoke<Tag[]>("tag_list_in_universe", { universeId });
}

export interface EntityTagAssociation {
  entityId: Uuid;
  tagId: Uuid;
}

export function tagAssociationsInUniverse(
  universeId: Uuid,
): Promise<EntityTagAssociation[]> {
  return invoke<EntityTagAssociation[]>("tag_associations_in_universe", {
    universeId,
  });
}

export function tagGetForEntity(entityId: Uuid): Promise<Tag[]> {
  return invoke<Tag[]>("tag_get_for_entity", { entityId });
}

export function tagSetForEntity(entityId: Uuid, tagIds: Uuid[]): Promise<void> {
  return invoke<void>("tag_set_for_entity", {
    payload: { entityId, tagIds },
  });
}

export function tagDelete(id: Uuid): Promise<void> {
  return invoke<void>("tag_delete", { id });
}

// ---------------------------------------------------------------------------
// Era (timeline)
// ---------------------------------------------------------------------------

export interface CreateEraArgs {
  universeId: Uuid;
  name: string;
  startYear?: number;
  endYear?: number;
  description?: string;
  color?: string;
  sortOrder?: number;
}

export function eraCreate(args: CreateEraArgs): Promise<Era> {
  return invoke<Era>("era_create", {
    payload: {
      universeId: args.universeId,
      name: args.name,
      startYear: args.startYear ?? null,
      endYear: args.endYear ?? null,
      description: args.description ?? null,
      color: args.color ?? null,
      sortOrder: args.sortOrder ?? null,
    },
  });
}

export function eraListInUniverse(universeId: Uuid): Promise<Era[]> {
  return invoke<Era[]>("era_list_in_universe", { universeId });
}

export function eraGet(id: Uuid): Promise<Era | null> {
  return invoke<Era | null>("era_get", { id });
}

export interface UpdateEraArgs {
  id: Uuid;
  name: string;
  startYear?: number;
  endYear?: number;
  description?: string;
  color?: string;
  sortOrder?: number;
}

export function eraUpdate(args: UpdateEraArgs): Promise<Era> {
  return invoke<Era>("era_update", {
    payload: {
      id: args.id,
      name: args.name,
      startYear: args.startYear ?? null,
      endYear: args.endYear ?? null,
      description: args.description ?? null,
      color: args.color ?? null,
      sortOrder: args.sortOrder ?? null,
    },
  });
}

export function eraDelete(id: Uuid): Promise<void> {
  return invoke<void>("era_delete", { id });
}

// ---------------------------------------------------------------------------
// Event (timeline)
// ---------------------------------------------------------------------------

export interface CreateEventArgs {
  universeId: Uuid;
  eraId?: Uuid;
  name: string;
  year?: number;
  description?: string;
}

export function eventCreate(args: CreateEventArgs): Promise<TimelineEvent> {
  return invoke<TimelineEvent>("event_create", {
    payload: {
      universeId: args.universeId,
      eraId: args.eraId ?? null,
      name: args.name,
      year: args.year ?? null,
      description: args.description ?? null,
    },
  });
}

export function eventListInUniverse(universeId: Uuid): Promise<TimelineEvent[]> {
  return invoke<TimelineEvent[]>("event_list_in_universe", { universeId });
}

export function eventListInEra(eraId: Uuid): Promise<TimelineEvent[]> {
  return invoke<TimelineEvent[]>("event_list_in_era", { eraId });
}

export function eventGet(id: Uuid): Promise<TimelineEvent | null> {
  return invoke<TimelineEvent | null>("event_get", { id });
}

export interface UpdateEventArgs {
  id: Uuid;
  eraId?: Uuid;
  name: string;
  year?: number;
  description?: string;
}

export function eventUpdate(args: UpdateEventArgs): Promise<TimelineEvent> {
  return invoke<TimelineEvent>("event_update", {
    payload: {
      id: args.id,
      eraId: args.eraId ?? null,
      name: args.name,
      year: args.year ?? null,
      description: args.description ?? null,
    },
  });
}

export function eventDelete(id: Uuid): Promise<void> {
  return invoke<void>("event_delete", { id });
}

// ---------------------------------------------------------------------------
// Snapshot (overrides temporels d'une entité)
// ---------------------------------------------------------------------------

export interface CreateSnapshotArgs {
  entityId: Uuid;
  eraId?: Uuid;
  eventId?: Uuid;
  yearInUniverse?: number;
  snapshotJson: Record<string, unknown>;
  note?: string;
}

export function snapshotCreate(args: CreateSnapshotArgs): Promise<Snapshot> {
  return invoke<Snapshot>("snapshot_create", {
    payload: {
      entityId: args.entityId,
      eraId: args.eraId ?? null,
      eventId: args.eventId ?? null,
      yearInUniverse: args.yearInUniverse ?? null,
      snapshotJson: args.snapshotJson,
      note: args.note ?? null,
    },
  });
}

export function snapshotListForEntity(entityId: Uuid): Promise<Snapshot[]> {
  return invoke<Snapshot[]>("snapshot_list_for_entity", { entityId });
}

export function snapshotGet(id: Uuid): Promise<Snapshot | null> {
  return invoke<Snapshot | null>("snapshot_get", { id });
}

export function snapshotDelete(id: Uuid): Promise<void> {
  return invoke<void>("snapshot_delete", { id });
}

// ---------------------------------------------------------------------------
// AI (Phase 3)
// ---------------------------------------------------------------------------

export interface AiStatus {
  providerId: string;
  defaultModel: string;
  reachable: boolean;
  error: string | null;
}

export function aiPing(): Promise<AiStatus> {
  return invoke<AiStatus>("ai_ping");
}

export interface AiModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

/**
 * Liste les modèles installés sur le serveur Ollama configuré.
 * Permet aux Settings d'afficher des dropdowns au lieu de champs texte
 * libres. Échoue si Ollama est hors ligne — le caller doit gérer le
 * fallback (champ texte libre par exemple).
 */
export function aiListModels(baseUrl: string): Promise<AiModel[]> {
  return invoke<AiModel[]>("ai_list_models", {
    payload: { baseUrl },
  });
}

/**
 * Lance le téléchargement d'un modèle depuis le registry Ollama.
 * Le progrès est diffusé via l'event Tauri "model-pull-progress" — le
 * caller doit s'y abonner avec listen() pour afficher une barre de
 * progression. La promise résout quand le pull est terminé (success ou
 * erreur). Modèles courants : gemma3:4b, qwen2.5:3b, nomic-embed-text:latest,
 * llava:7b.
 */
export function aiPullModel(
  baseUrl: string,
  model: string,
): Promise<void> {
  return invoke<void>("ai_pull_model", {
    payload: { baseUrl, model },
  });
}

/**
 * Supprime un modèle local du serveur Ollama.
 */
export function aiDeleteModel(
  baseUrl: string,
  model: string,
): Promise<void> {
  return invoke<void>("ai_delete_model", {
    payload: { baseUrl, model },
  });
}

export interface ModelPullProgress {
  model: string;
  status: string;
  completed: number | null;
  total: number | null;
  done: boolean;
}

export interface AiCompleteArgs {
  user: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AiCompleteResult {
  model: string;
  content: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export function aiComplete(args: AiCompleteArgs): Promise<AiCompleteResult> {
  return invoke<AiCompleteResult>("ai_complete", {
    payload: {
      user: args.user,
      system: args.system ?? null,
      temperature: args.temperature ?? null,
      maxTokens: args.maxTokens ?? null,
      model: args.model ?? null,
    },
  });
}

export interface EntityDraft {
  name: string | null;
  summary: string | null;
  // Character
  archetype: string | null;
  traits: string[] | null;
  biographyText: string | null;
  // Location
  locationKind: string | null;
  climate: string | null;
  population: string | null;
  // Faction (P6.1)
  factionKind: string | null;
  ideology: string | null;
  founded: string | null;
  leader: string | null;
  // Object (P6.1)
  objectKind: string | null;
  origin: string | null;
  owner: string | null;
  properties: string[] | null;
  // Concept (P6.1)
  conceptKind: string | null;
  domain: string | null;
  // Description riche partagée
  descriptionText: string | null;
  rawResponse: string;
  parseWarning: string | null;
}

export function aiGenerateEntityDraft(args: {
  universeId: Uuid;
  kind: EntityType;
  name: string;
  hint?: string;
}): Promise<EntityDraft> {
  return invoke<EntityDraft>("ai_generate_entity_draft", {
    payload: {
      universeId: args.universeId,
      kind: args.kind,
      name: args.name,
      hint: args.hint ?? null,
    },
  });
}

export interface ReindexResult {
  indexedCount: number;
  model: string;
  dimension: number;
}

export function aiUniverseReindex(universeId: Uuid): Promise<ReindexResult> {
  return invoke<ReindexResult>("ai_universe_reindex", { universeId });
}

export interface RagSource {
  entityId: Uuid;
  entityName: string;
  entityType: EntityType;
  score: number;
  snippet: string;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  usedModelChat: string;
  usedModelEmbed: string;
}

export function aiRagQuery(args: {
  universeId: Uuid;
  question: string;
  topK?: number;
}): Promise<RagAnswer> {
  return invoke<RagAnswer>("ai_rag_query", {
    payload: {
      universeId: args.universeId,
      question: args.question,
      topK: args.topK ?? null,
    },
  });
}

// --- Import (P7.1) ----------------------------------------------------------

export interface ImportCharacter {
  name: string;
  summary?: string;
  archetype?: string;
  traits: string[];
  biographyText?: string;
}
export interface ImportLocation {
  name: string;
  summary?: string;
  kind?: string;
  climate?: string;
  population?: string;
  descriptionText?: string;
}
export interface ImportFaction {
  name: string;
  summary?: string;
  kind?: string;
  ideology?: string;
  founded?: string;
  leader?: string;
  descriptionText?: string;
}
export interface ImportObjectItem {
  name: string;
  summary?: string;
  kind?: string;
  origin?: string;
  owner?: string;
  properties: string[];
  descriptionText?: string;
}
export interface ImportConcept {
  name: string;
  summary?: string;
  kind?: string;
  domain?: string;
  descriptionText?: string;
}
export interface ImportEra {
  name: string;
  startYear?: number | null;
  endYear?: number | null;
  description?: string;
}
export interface ImportEvent {
  name: string;
  year?: number | null;
  eraName?: string;
  description?: string;
}
export interface ImportChapter {
  title: string;
  bodyText: string;
}
export interface ImportUniverseHeader {
  name: string;
  description?: string;
  language?: string;
  tone?: string;
}
export interface ImportAnalysis {
  universe: ImportUniverseHeader;
  isNarrative: boolean;
  storyTitle?: string;
  characters: ImportCharacter[];
  locations: ImportLocation[];
  factions: ImportFaction[];
  objects: ImportObjectItem[];
  concepts: ImportConcept[];
  eras: ImportEra[];
  events: ImportEvent[];
  chapters: ImportChapter[];
  truncationWarning?: string;
  parseWarning?: string;
  rawResponse: string;
}

export function aiAnalyzeImport(args: {
  text: string;
  targetUniverseName?: string;
}): Promise<ImportAnalysis> {
  return invoke<ImportAnalysis>("ai_analyze_import", {
    payload: {
      text: args.text,
      targetUniverseName: args.targetUniverseName ?? null,
    },
  });
}

// --- Import apply (P7.3) ----------------------------------------------------

export type ImportTarget =
  | { kind: "NewUniverse"; name: string; description?: string }
  | { kind: "ExistingUniverse"; id: Uuid };

/**
 * Sous-ensemble de ImportAnalysis qu'on envoie à import_apply : juste
 * les listes (pas les warnings ni rawResponse). Le front filtre les
 * entités décochées avant d'envoyer.
 */
export interface ImportSelections {
  characters: ImportCharacter[];
  locations: ImportLocation[];
  factions: ImportFaction[];
  objects: ImportObjectItem[];
  concepts: ImportConcept[];
  eras: ImportEra[];
  events: ImportEvent[];
  chapters: ImportChapter[];
  storyTitle?: string;
  isNarrative: boolean;
}

export interface ImportResult {
  universeId: Uuid;
  storyId: Uuid | null;
  createdCharacters: number;
  createdLocations: number;
  createdFactions: number;
  createdObjects: number;
  createdConcepts: number;
  createdEras: number;
  createdEvents: number;
  createdChapters: number;
  skipped: string[];
}

export function importApply(args: {
  analysis: ImportSelections;
  target: ImportTarget;
  forceDuplicates?: boolean;
}): Promise<ImportResult> {
  return invoke<ImportResult>("import_apply", {
    payload: {
      analysis: args.analysis,
      target: args.target,
      forceDuplicates: args.forceDuplicates ?? false,
    },
  });
}

// --- Vision (P6.6) ----------------------------------------------------------

export interface DescribeImageArgs {
  imagePath: string;
  prompt: string;
  model: string;
  baseUrl?: string;
}

export interface DescribeImageResult {
  model: string;
  content: string;
}

export function aiDescribeImage(
  args: DescribeImageArgs,
): Promise<DescribeImageResult> {
  return invoke<DescribeImageResult>("ai_describe_image", {
    payload: {
      imagePath: args.imagePath,
      prompt: args.prompt,
      model: args.model,
      baseUrl: args.baseUrl ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// RealityAnchor / DivergencePoint / WorldBrief (Phase 3.4)
// ---------------------------------------------------------------------------

export function anchorGetForUniverse(
  universeId: Uuid,
): Promise<RealityAnchor | null> {
  return invoke<RealityAnchor | null>("anchor_get_for_universe", { universeId });
}

export function anchorUpsert(args: {
  universeId: Uuid;
  mode: RealityMode;
  pivotDate?: string;
  baseWorld?: string;
  notes?: string;
}): Promise<RealityAnchor> {
  return invoke<RealityAnchor>("anchor_upsert", {
    payload: {
      universeId: args.universeId,
      mode: args.mode,
      pivotDate: args.pivotDate ?? null,
      baseWorld: args.baseWorld ?? null,
      notes: args.notes ?? null,
    },
  });
}

export function anchorDelete(id: Uuid): Promise<void> {
  return invoke<void>("anchor_delete", { id });
}

export function divergenceCreate(args: {
  anchorId: Uuid;
  whenIso: string;
  axis: DivergenceAxis;
  title: string;
  description?: string;
}): Promise<DivergencePoint> {
  return invoke<DivergencePoint>("divergence_create", {
    payload: {
      anchorId: args.anchorId,
      whenIso: args.whenIso,
      axis: args.axis,
      title: args.title,
      description: args.description ?? null,
    },
  });
}

export function divergenceList(anchorId: Uuid): Promise<DivergencePoint[]> {
  return invoke<DivergencePoint[]>("divergence_list", { anchorId });
}

export function divergenceDelete(id: Uuid): Promise<void> {
  return invoke<void>("divergence_delete", { id });
}

export function briefCreate(args: {
  anchorId: Uuid;
  snapshotDate: string;
  contentJson: Record<string, unknown>;
  source?: BriefSource;
  pinned?: boolean;
}): Promise<WorldBrief> {
  return invoke<WorldBrief>("brief_create", {
    payload: {
      anchorId: args.anchorId,
      snapshotDate: args.snapshotDate,
      contentJson: args.contentJson,
      source: args.source ?? "manual",
      pinned: args.pinned ?? true,
    },
  });
}

export function briefList(anchorId: Uuid): Promise<WorldBrief[]> {
  return invoke<WorldBrief[]>("brief_list", { anchorId });
}

export function briefDelete(id: Uuid): Promise<void> {
  return invoke<void>("brief_delete", { id });
}

// ---------------------------------------------------------------------------
// Settings (Phase 3.x)
// ---------------------------------------------------------------------------

export interface AppSettings {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  /** P6.2 : modèle préféré pour les actions créatives (continuation,
   * brainstorm, atelier description, draft). Si null/empty, retombe sur
   * chatModel. */
  creativeModel: string | null;
  /** P6.2 : modèle préféré pour les actions littérales (réécriture,
   * résumé, cohérence). Si null/empty, retombe sur chatModel. */
  literalModel: string | null;
  /** P6.6 : modèle vision Ollama (llava, qwen2.5vl, gemma3:4b…). Si
   * null/empty, le mode image de l'atelier description est désactivé. */
  visionModel: string | null;
}

export function settingsGet(): Promise<AppSettings> {
  return invoke<AppSettings>("settings_get");
}

export function settingsSave(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("settings_save", { settings });
}

// ---------------------------------------------------------------------------
// Story (Phase 4)
// ---------------------------------------------------------------------------

export interface CreateStoryArgs {
  /** `null` = story orpheline (pas rattachée à un univers). */
  universeId: Uuid | null;
  title: string;
  type: StoryType;
  synopsis?: string;
  status?: string;
  targetWordCount?: number;
  pivotEraId?: Uuid;
}

export function storyCreate(args: CreateStoryArgs): Promise<Story> {
  return invoke<Story>("story_create", {
    payload: {
      universeId: args.universeId,
      title: args.title,
      type: args.type,
      synopsis: args.synopsis ?? null,
      status: args.status ?? null,
      targetWordCount: args.targetWordCount ?? null,
      pivotEraId: args.pivotEraId ?? null,
    },
  });
}

export function storyListInUniverse(universeId: Uuid): Promise<Story[]> {
  return invoke<Story[]>("story_list_in_universe", { universeId });
}

export function storyGet(id: Uuid): Promise<Story | null> {
  return invoke<Story | null>("story_get", { id });
}

export interface UpdateStoryArgs {
  id: Uuid;
  title: string;
  type: StoryType;
  synopsis?: string;
  status: string;
  targetWordCount?: number;
  pivotEraId?: Uuid;
}

export function storyUpdate(args: UpdateStoryArgs): Promise<Story> {
  return invoke<Story>("story_update", {
    payload: {
      id: args.id,
      title: args.title,
      type: args.type,
      synopsis: args.synopsis ?? null,
      status: args.status,
      targetWordCount: args.targetWordCount ?? null,
      pivotEraId: args.pivotEraId ?? null,
    },
  });
}

export function storyDelete(id: Uuid): Promise<void> {
  return invoke<void>("story_delete", { id });
}

/** P6.5 : exporte une story complète (titre + chapitres) en Markdown. */
export function storyExportMarkdown(id: Uuid): Promise<string> {
  return invoke<string>("story_export_markdown", { id });
}

// ---------------------------------------------------------------------------
// Chapter (Phase 4)
// ---------------------------------------------------------------------------

export interface CreateChapterArgs {
  storyId: Uuid;
  title?: string;
  /** Doc Tiptap. Optionnel — `undefined` = doc vide auto-créé côté Rust. */
  bodyJson?: Record<string, unknown>;
  /** Optionnel — `undefined` = MAX(sort_order)+1. */
  sortOrder?: number;
  eraId?: Uuid;
}

export function chapterCreate(args: CreateChapterArgs): Promise<Chapter> {
  return invoke<Chapter>("chapter_create", {
    payload: {
      storyId: args.storyId,
      title: args.title ?? null,
      bodyJson: args.bodyJson ?? null,
      sortOrder: args.sortOrder ?? null,
      eraId: args.eraId ?? null,
    },
  });
}

export function chapterListForStory(storyId: Uuid): Promise<Chapter[]> {
  return invoke<Chapter[]>("chapter_list_for_story", { storyId });
}

export function chapterGet(id: Uuid): Promise<Chapter | null> {
  return invoke<Chapter | null>("chapter_get", { id });
}

export interface UpdateChapterArgs {
  id: Uuid;
  title?: string;
  bodyJson: Record<string, unknown>;
  wordCount: number;
  status: ChapterStatus;
  eraId?: Uuid;
}

export function chapterUpdate(args: UpdateChapterArgs): Promise<Chapter> {
  return invoke<Chapter>("chapter_update", {
    payload: {
      id: args.id,
      title: args.title ?? null,
      bodyJson: args.bodyJson,
      wordCount: args.wordCount,
      status: args.status,
      eraId: args.eraId ?? null,
    },
  });
}

export function chapterReorder(
  order: { id: Uuid; sortOrder: number }[],
): Promise<void> {
  return invoke<void>("chapter_reorder", { order });
}

export function chapterDelete(id: Uuid): Promise<void> {
  return invoke<void>("chapter_delete", { id });
}

// ---------------------------------------------------------------------------
// Healthcheck
// ---------------------------------------------------------------------------

export interface PingResult {
  message: string;
  echoed_at: string;
}

export function ping(): Promise<PingResult> {
  return invoke<PingResult>("ping");
}
