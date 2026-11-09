/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { diffJsonPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import type { EntityRef, TagRef } from '@/types/api';
import type {
  ContextMemory,
  ContextMemoryType,
  ShareVisibility,
} from '@/types/contextCenter';

/**
 * Official fetchMemories fields (ContextCenter.constants MEMORY_FIELDS).
 * Requested on every memory list/get so citations, linked entities and
 * the review compare have their fields.
 */
export const MEMORY_FIELDS =
  'owners,tags,domains,primaryEntity,relatedEntities,derivedEntities,sourceEntity';

export const MEMORY_PAGE_SIZE = 25;
export const REVIEW_PAGE_SIZE = 20;

export const DEFAULT_MEMORY_STATUSES = ['Approved', 'Unprocessed'] as const;

export const DEFAULT_MEMORY_LIST_STATUSES = [
  ...DEFAULT_MEMORY_STATUSES,
  'Draft',
] as const;

/**
 * Official handleStatusChange re-sort order: the default list statuses
 * first, then the remaining ContextMemoryStatus enum values in enum
 * declaration order.
 */
export const MEMORY_STATUSES = [
  'Approved',
  'Unprocessed',
  'Draft',
  'Archived',
  'Deprecated',
  'Invalidated',
  'Rejected',
  'Superseded',
] as const;

/** Memory types the form offers; `Learning` is agent-assigned, never offered. */
export const MEMORY_TYPE_OPTIONS: ContextMemoryType[] = [
  'FAQ',
  'Note',
  'Preference',
  'Runbook',
  'UseCase',
];

export const VISIBILITY_OPTIONS: ShareVisibility[] = ['Public', 'Shared', 'Entity', 'Private'];

export type MemorySortBy = 'updated' | 'usage' | 'updatedBy';

/**
 * Official getSortConfig (ContextCenterPureUtils): `usage` sorts by
 * appliedCount, never usageCount; updatedBy ascends, everything else
 * falls back to updatedAt desc.
 */
export function getSortConfig(sortBy: MemorySortBy): {
  sortBy: 'updatedAt' | 'appliedCount' | 'usageCount' | 'updatedBy';
  sortOrder: 'asc' | 'desc';
} {
  if (sortBy === 'usage') {
    return { sortBy: 'appliedCount', sortOrder: 'desc' };
  }
  if (sortBy === 'updatedBy') {
    return { sortBy: 'updatedBy', sortOrder: 'asc' };
  }
  return { sortBy: 'updatedAt', sortOrder: 'desc' };
}

/**
 * Official getMemoryCitations: the answers a memory was applied to once a
 * recount stamped its outcomes, otherwise the retrieval usage recorded
 * before outcomes existed.
 */
export function getMemoryCitations(memory: ContextMemory): {
  count?: number;
  lastAt?: number;
} {
  const { outcomes } = memory;
  return outcomes?.countedAt === undefined
    ? { count: memory.usageCount, lastAt: memory.lastUsedAt }
    : { count: outcomes.appliedCount ?? 0, lastAt: outcomes.lastAppliedAt };
}

/** Official submitMemoryCreate slug: lowercase, non-alphanumerics to `-`, 64 chars. */
export function slugMemoryName(title: string, text: string): string {
  return (title.trim() || text.trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64);
}

/**
 * Official resolveMemoryType: the form offers only the types people choose
 * by hand, so a stored type it cannot show (an agent's Learning) survives
 * unless the editor picks another.
 */
export function resolveMemoryType(
  stored: ContextMemoryType | undefined,
  selected: ContextMemoryType | undefined,
): ContextMemoryType | undefined {
  return (
    selected ?? (stored !== undefined && MEMORY_TYPE_OPTIONS.includes(stored) ? undefined : stored)
  );
}

export interface MemoryCreateInput {
  title?: string;
  memory: string;
  memoryType?: ContextMemoryType;
  visibility: ShareVisibility;
  tags?: TagRef[];
  primaryEntity?: EntityRef;
  relatedEntities?: EntityRef[];
}

export interface CreateContextMemoryBody {
  name: string;
  question: string;
  answer: string;
  title?: string;
  memoryType?: ContextMemoryType;
  tags?: TagRef[];
  primaryEntity?: EntityRef;
  relatedEntities?: EntityRef[];
  shareConfig: { visibility: ShareVisibility };
}

/**
 * Official submitMemoryCreate payload: `question = answer =` the memory
 * text; optional fields only when valued; `shareConfig` always present.
 */
export function buildMemoryCreatePayload(input: MemoryCreateInput): CreateContextMemoryBody {
  const text = input.memory.trim();
  const title = input.title?.trim() ?? '';
  return {
    name: slugMemoryName(title, text),
    question: text,
    answer: text,
    ...(title ? { title } : {}),
    ...(input.memoryType ? { memoryType: input.memoryType } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.primaryEntity ? { primaryEntity: input.primaryEntity } : {}),
    ...(input.relatedEntities?.length ? { relatedEntities: input.relatedEntities } : {}),
    shareConfig: { visibility: input.visibility },
  };
}

export interface MemoryEditInput {
  title: string;
  memory: string;
  memoryType?: ContextMemoryType;
  visibility: ShareVisibility;
  tags: TagRef[];
  primaryEntity?: EntityRef;
  relatedEntities: EntityRef[];
}

/** The five fields the server's patch contract carries for a linked entity. */
export function toMemoryEntityRef(ref: EntityRef): EntityRef {
  return {
    id: ref.id,
    type: ref.type,
    name: ref.name,
    displayName: ref.displayName,
    fullyQualifiedName: ref.fullyQualifiedName,
  };
}

/**
 * Official submitMemoryUpdate, minus fast-json-patch: patches only the
 * fields that actually changed, `summary` always cleared to `''`, and
 * `shareConfig` only when there is a reason to (an existing config, or a
 * visibility that differs from the default). Both sides normalize linked
 * entities to the five patch fields, so server-added fields (href, ...)
 * never emit a spurious replace op.
 */
export function buildMemoryUpdatePatch(
  memoryToEdit: ContextMemory,
  input: MemoryEditInput,
): JsonPatchOp[] {
  const hasExistingShareConfig = memoryToEdit.shareConfig?.visibility !== undefined;
  const original: Record<string, unknown> = {
    title: memoryToEdit.title ?? '',
    summary: memoryToEdit.summary ?? '',
    answer: memoryToEdit.answer ?? '',
    question: memoryToEdit.question ?? '',
    memoryType: memoryToEdit.memoryType,
    tags: memoryToEdit.tags ?? [],
    primaryEntity: memoryToEdit.primaryEntity
      ? toMemoryEntityRef(memoryToEdit.primaryEntity)
      : undefined,
    relatedEntities: (memoryToEdit.relatedEntities ?? []).map(toMemoryEntityRef),
    ...(hasExistingShareConfig
      ? { shareConfig: { visibility: memoryToEdit.shareConfig?.visibility } }
      : {}),
  };
  const updated: Record<string, unknown> = {
    title: input.title.trim(),
    summary: '',
    answer: input.memory.trim(),
    question: input.memory.trim(),
    memoryType: resolveMemoryType(memoryToEdit.memoryType, input.memoryType),
    tags: input.tags,
    primaryEntity: input.primaryEntity ? toMemoryEntityRef(input.primaryEntity) : undefined,
    relatedEntities: input.relatedEntities.map(toMemoryEntityRef),
    ...(hasExistingShareConfig || input.visibility !== 'Private'
      ? { shareConfig: { visibility: input.visibility } }
      : {}),
  };
  return diffJsonPatch(original, updated);
}

/** Derives the modal's initial values from the memory being edited. */
export function buildMemoryFormState(memoryToEdit: ContextMemory): {
  title: string;
  memory: string;
  memoryType?: ContextMemoryType;
  visibility: ShareVisibility;
  tagFqns: string[];
  assets: EntityRef[];
} {
  return {
    title: memoryToEdit.title ?? '',
    memory: memoryToEdit.answer ?? memoryToEdit.question ?? '',
    memoryType:
      memoryToEdit.memoryType !== undefined &&
      MEMORY_TYPE_OPTIONS.includes(memoryToEdit.memoryType)
        ? memoryToEdit.memoryType
        : undefined,
    visibility: memoryToEdit.shareConfig?.visibility ?? 'Private',
    tagFqns: (memoryToEdit.tags ?? []).map((tag) => tag.tagFQN),
    assets: [
      ...(memoryToEdit.primaryEntity ? [memoryToEdit.primaryEntity] : []),
      ...(memoryToEdit.relatedEntities ?? []),
    ],
  };
}

// --- Conflict review -------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapEntityRef(value: unknown): EntityRef | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const id = asString(rec.id);
  const name = asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
  if (!id && !name) {
    return undefined;
  }
  return {
    id: id || undefined,
    name: name || id,
    displayName: asString(rec.displayName) || undefined,
    type: asString(rec.type) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
  };
}

export interface ReviewDispute {
  memory: EntityRef;
  detectedAt?: number;
}

/**
 * Official getReviewDisputes: the memories a conflict review weighs the
 * reviewed memory against, as the server recorded them. Malformed entries
 * are skipped. The payload never carries memory content, only references.
 */
export function getReviewDisputes(payload: unknown): ReviewDispute[] {
  const disputes = asRecord(payload)?.disputes;
  if (!Array.isArray(disputes)) {
    return [];
  }
  return disputes.flatMap((item) => {
    const rec = asRecord(item);
    const memory = rec ? mapEntityRef(rec.memory) : undefined;
    if (!memory?.id) {
      return [];
    }
    const detectedAt = rec ? asNumber(rec.detectedAt) : undefined;
    return [{ memory, ...(detectedAt !== undefined ? { detectedAt } : {}) }];
  });
}

/**
 * Official getClaimUpdatedAt: when a memory's claim last changed. Review,
 * lifecycle and pin writes keep `lastContentUpdatedAt`, so it dates what
 * the memory says, where `updatedAt` dates any write.
 */
export function getClaimUpdatedAt(memory?: ContextMemory): number | undefined {
  return memory?.lastContentUpdatedAt ?? memory?.updatedAt;
}

export type ClaimRecency = 'newer' | 'older';

export interface ConflictRecency {
  reviewed?: ClaimRecency;
  disputed: Record<string, ClaimRecency>;
}

/**
 * Official getConflictRecency: which side states the more recent claim.
 * The reviewed memory is newer only when it is newer than every claim it
 * contradicts, and older only when it is older than all of them.
 */
export function getConflictRecency(
  reviewed: ContextMemory | undefined,
  disputed: ContextMemory[],
): ConflictRecency {
  const reviewedAt = getClaimUpdatedAt(reviewed);
  const recency: ConflictRecency = { disputed: {} };
  if (reviewedAt === undefined) {
    return recency;
  }
  const dated = disputed.filter((memory) => getClaimUpdatedAt(memory) !== undefined);
  dated.forEach((memory) => {
    const disputedAt = getClaimUpdatedAt(memory) ?? reviewedAt;
    if (disputedAt !== reviewedAt) {
      recency.disputed[memory.id] = disputedAt > reviewedAt ? 'newer' : 'older';
    }
  });
  const sides = Object.values(recency.disputed);
  if (dated.length > 0 && sides.length === dated.length) {
    if (sides.every((side) => side === 'older')) {
      recency.reviewed = 'newer';
    } else if (sides.every((side) => side === 'newer')) {
      recency.reviewed = 'older';
    }
  }
  return recency;
}

/** Official getDisputeReason: why the reviewed memory contradicts a disputed one. */
export function getDisputeReason(
  reviewed: ContextMemory | undefined,
  disputedId: string | undefined,
): string | undefined {
  return reviewed?.disputes?.find(({ memory }) => memory.id === disputedId)?.reason;
}

/** The server-opened task's transition ids and the resolution each records. */
export const REVIEW_DECISIONS = {
  approve: 'Approved',
  reject: 'Rejected',
} as const;

export type ReviewDecision = keyof typeof REVIEW_DECISIONS;

export interface ComparedMemory {
  id: string;
  contentUpdatedAt?: number;
}

/**
 * Official getComparedMemories: every memory a reviewer compared, with
 * when its claim last changed as they read it. The server refuses the
 * decision if the review or a claim moved on since; a memory the reviewer
 * could not read carries no time.
 */
export function getComparedMemories(
  memories: Array<{ id?: string; memory?: ContextMemory }>,
): ComparedMemory[] {
  return memories.flatMap(({ id, memory }) =>
    id ? [{ id, contentUpdatedAt: getClaimUpdatedAt(memory) }] : [],
  );
}

// --- Compare diff ----------------------------------------------------------

export interface DiffPart {
  id: string;
  value: string;
  change?: 'added' | 'removed';
}

export interface DiffSides {
  current: DiffPart[];
  proposed: DiffPart[];
  isChanged: boolean;
}

export interface ListValue {
  key: string;
  label: string;
}

export interface MemoryDiffRow {
  key: string;
  labelKey: string;
  kind: 'text' | 'list';
  sides: DiffSides;
}

function tokenizeWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/**
 * Word-level diff: what the current text drops and the proposed one adds.
 * Each side keeps its own words and spacing; shared words stay unmarked.
 * (Official `diffWords` semantics, implemented in-product — the UI
 * carries no `diff` dependency.)
 */
export function diffText(current = '', proposed = ''): DiffSides {
  const a = tokenizeWords(current);
  const b = tokenizeWords(proposed);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const currentParts: DiffPart[] = [];
  const proposedParts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  let changed = false;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      currentParts.push({ id: `current-${currentParts.length}`, value: a[i] });
      proposedParts.push({ id: `proposed-${proposedParts.length}`, value: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      currentParts.push({ id: `current-${currentParts.length}`, value: a[i], change: 'removed' });
      changed = true;
      i++;
    } else {
      proposedParts.push({ id: `proposed-${proposedParts.length}`, value: b[j], change: 'added' });
      changed = true;
      j++;
    }
  }
  while (i < m) {
    currentParts.push({ id: `current-${currentParts.length}`, value: a[i], change: 'removed' });
    changed = true;
    i++;
  }
  while (j < n) {
    proposedParts.push({ id: `proposed-${proposedParts.length}`, value: b[j], change: 'added' });
    changed = true;
    j++;
  }
  return { current: currentParts, proposed: proposedParts, isChanged: changed };
}

/** Values only one side holds are what that side removes or adds. */
export function diffList(current: ListValue[], proposed: ListValue[]): DiffSides {
  const inCurrent = new Set(current.map(({ key }) => key));
  const inProposed = new Set(proposed.map(({ key }) => key));
  return {
    current: current.map(({ key, label }, index) => ({
      id: `current-${index}`,
      value: label,
      change: inProposed.has(key) ? undefined : 'removed',
    })),
    proposed: proposed.map(({ key, label }, index) => ({
      id: `proposed-${index}`,
      value: label,
      change: inCurrent.has(key) ? undefined : 'added',
    })),
    isChanged:
      current.some(({ key }) => !inProposed.has(key)) ||
      proposed.some(({ key }) => !inCurrent.has(key)),
  };
}

/** Both sides as they are, nothing marked: there is no other side to compare. */
function unmarked(sides: DiffSides): DiffSides {
  return {
    current: sides.current.map(({ id, value }) => ({ id, value })),
    proposed: sides.proposed.map(({ id, value }) => ({ id, value })),
    isChanged: false,
  };
}

function referenceValues(references: EntityRef[] = []): ListValue[] {
  return references.map((reference) => ({
    key: reference.fullyQualifiedName ?? reference.id ?? '',
    label: reference.displayName ?? reference.name ?? '',
  }));
}

function linkedAssets(memory?: ContextMemory): ListValue[] {
  return referenceValues(
    [memory?.primaryEntity, ...(memory?.relatedEntities ?? [])].filter(
      (asset): asset is EntityRef => Boolean(asset),
    ),
  );
}

function tagsOf(memory?: ContextMemory): ListValue[] {
  return (memory?.tags ?? []).map((tag) => ({
    key: tag.tagFQN,
    label: tag.name || tag.tagFQN,
  }));
}

function labelled(
  value: string | undefined,
  labelKey: string | undefined,
  t: (key: string) => string,
): ListValue[] {
  return value ? [{ key: value, label: labelKey ? t(labelKey) : value }] : [];
}

const MEMORY_TYPE_LABEL_KEYS: Record<string, string> = {
  FAQ: 'contextCenter.memoryTypeFaq',
  Note: 'contextCenter.memoryTypeNote',
  Preference: 'contextCenter.memoryTypePreference',
  Runbook: 'contextCenter.memoryTypeRunbook',
  UseCase: 'contextCenter.memoryTypeUseCase',
  Learning: 'contextCenter.memoryTypeLearning',
};

const VISIBILITY_LABEL_KEYS: Record<string, string> = {
  Public: 'contextCenter.visibilityPublic',
  Shared: 'contextCenter.visibilityShared',
  Entity: 'contextCenter.visibilityEntity',
  Private: 'contextCenter.visibilityPrivate',
};

function memoryTypeOf(memory: ContextMemory | undefined, t: (key: string) => string): ListValue[] {
  return labelled(
    memory?.memoryType,
    memory?.memoryType ? MEMORY_TYPE_LABEL_KEYS[memory.memoryType] : undefined,
    t,
  );
}

function visibilityOf(memory: ContextMemory | undefined, t: (key: string) => string): ListValue[] {
  const visibility = memory?.shareConfig?.visibility ?? memory?.visibility;
  return labelled(
    visibility,
    visibility ? VISIBILITY_LABEL_KEYS[visibility] : undefined,
    t,
  );
}

function sourceOf(memory: ContextMemory | undefined): ListValue[] {
  if (memory?.sourceEntity) {
    return referenceValues([memory.sourceEntity]);
  }
  // No official label keys exist for source types in the product locale;
  // the raw value is shown rather than an invented label.
  return memory?.sourceType ? [{ key: memory.sourceType, label: memory.sourceType }] : [];
}

/**
 * Official getMemoryDiffRows: every field a memory's detail view shows,
 * current memory against the one in review — text fields diff word by
 * word, the rest value by value. While a side is missing nothing is
 * marked, since a diff against nothing would mark it all.
 */
export function getMemoryDiffRows(
  current: ContextMemory | undefined,
  proposed: ContextMemory | undefined,
  t: (key: string) => string,
): MemoryDiffRow[] {
  const rows: MemoryDiffRow[] = [
    {
      key: 'title',
      labelKey: 'contextCenter.title',
      kind: 'text',
      sides: diffText(current?.title, proposed?.title),
    },
    {
      key: 'memory',
      labelKey: 'contextCenter.memory',
      kind: 'text',
      sides: diffText(current?.answer, proposed?.answer),
    },
    {
      key: 'question',
      labelKey: 'contextCenter.question',
      kind: 'text',
      sides: diffText(current?.question, proposed?.question),
    },
    {
      key: 'type',
      labelKey: 'contextCenter.memoryType',
      kind: 'list',
      sides: diffList(memoryTypeOf(current, t), memoryTypeOf(proposed, t)),
    },
    {
      key: 'linked-assets',
      labelKey: 'contextCenter.linkedAssets',
      kind: 'list',
      sides: diffList(linkedAssets(current), linkedAssets(proposed)),
    },
    {
      key: 'visibility',
      labelKey: 'contextCenter.visibility',
      kind: 'list',
      sides: diffList(visibilityOf(current, t), visibilityOf(proposed, t)),
    },
    {
      key: 'tags',
      labelKey: 'contextCenter.tags',
      kind: 'list',
      sides: diffList(tagsOf(current), tagsOf(proposed)),
    },
    {
      key: 'source',
      labelKey: 'contextCenter.source',
      kind: 'list',
      sides: diffList(sourceOf(current), sourceOf(proposed)),
    },
    {
      key: 'owners',
      labelKey: 'contextCenter.owners',
      kind: 'list',
      sides: diffList(referenceValues(current?.owners), referenceValues(proposed?.owners)),
    },
  ];
  return current && proposed
    ? rows
    : rows.map((row) => ({ ...row, sides: unmarked(row.sides) }));
}

// --- Compare readiness -----------------------------------------------------

export type UnavailableMemory = 'gone' | 'hidden' | 'failed';

export interface MemorySide {
  memory?: ContextMemory;
  isLoading: boolean;
  unavailable?: UnavailableMemory;
}

const UNAVAILABLE_BY_STATUS: Record<number, UnavailableMemory> = {
  404: 'gone',
  403: 'hidden',
};

/** A memory read failed: gone, not readable by this user, or not loaded. */
export function getUnavailableMemory(error: unknown): UnavailableMemory | undefined {
  const holder = error as { response?: { status?: number }; status?: number } | null;
  const status = holder?.response?.status ?? holder?.status;
  return error ? (UNAVAILABLE_BY_STATUS[status ?? 0] ?? 'failed') : undefined;
}

/**
 * A side is ready once read, or once the server said it is gone or not for
 * this reviewer; a read that failed or is still running hides a claim.
 */
export function isReadyToDecide(side: MemorySide): boolean {
  return !side.isLoading && side.unavailable !== 'failed';
}

/**
 * Official getReadiness: rejecting needs the two memories on screen;
 * approving also supersedes every other memory the one in review
 * contradicts, so it waits for all of them.
 */
export function getReadiness(
  current: MemorySide,
  proposed: MemorySide,
  disputed: MemorySide[],
): { canReject: boolean; canApprove: boolean } {
  const canReject = isReadyToDecide(current) && isReadyToDecide(proposed);
  return {
    canReject,
    canApprove: canReject && disputed.every(isReadyToDecide),
  };
}

// --- Row display -----------------------------------------------------------

export const MAX_VISIBLE_LINKED_ENTITIES = 4;

/**
 * Official MemoryRow dedup: primary + related entities, deduplicated by id
 * or FQN, at most 4 shown, the rest counted as "+N more".
 */
export function getMemoryLinkedEntities(memory: ContextMemory): {
  visible: EntityRef[];
  hiddenCount: number;
} {
  const entities = [memory.primaryEntity, ...(memory.relatedEntities ?? [])];
  const seen = new Set<string>();
  const deduplicated = entities.filter((entity): entity is EntityRef => {
    const key = entity?.id ?? entity?.fullyQualifiedName;
    if (!entity || !key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return {
    visible: deduplicated.slice(0, MAX_VISIBLE_LINKED_ENTITIES),
    hiddenCount: Math.max(0, deduplicated.length - MAX_VISIBLE_LINKED_ENTITIES),
  };
}

/** Official copy-link target: the memories list with `?memory=<name>`. */
export function memoryDeepLink(origin: string, pathname: string, name?: string): string {
  return name ? `${origin}${pathname}?memory=${encodeURIComponent(name)}` : `${origin}${pathname}`;
}
