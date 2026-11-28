/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ChangeDescription, ChangeField } from '@/api/entities';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import type { ServiceTagLabel } from '@/types/ingestion';

/**
 * Word-level version diff engine (01 §7.4), ported from official
 * `utils/EntityDiffUtils.tsx`, `utils/EntityDiffPureUtils.ts` and
 * `utils/EntityVersionUtilsPure.ts` (pin a3012259ca). The UI carries
 * no `diff` dependency, so the word diff is implemented in-product
 * following the `diffText` precedent (`catalog/contextCenterMemories.ts`):
 * LCS over whitespace-split tokens. `diffWords` ignores whitespace-only
 * differences; `diffWordsWithSpace` treats whitespace runs as tokens.
 *
 * Adaptation notes (all behavior-preserving):
 * - The product's `ChangeField` carries the field name in `field`
 *   (official `FieldChange.name`); values are `unknown` (official
 *   strings) and are stringified with lodash-`toString` semantics.
 * - `getTextDiff` returns segments instead of an HTML string: the
 *   Vue renderer (`VersionDiffText`) turns segments into spans, so
 *   entity text never passes through `v-html`.
 * - Tag-array diffing compares by `tagFQN` value: the `diff` package's
 *   default reference equality would flag every parsed tag as both
 *   removed and added, contradicting the design's stated behavior.
 */

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export type TextDiffResult =
  | { type: 'plain'; text: string }
  | { type: 'diff'; parts: DiffPart[] };

export interface EntityDiffProps {
  added?: ChangeField;
  deleted?: ChangeField;
  updated?: ChangeField;
}

export interface EntityDiffWithMultiChanges {
  added?: ChangeField[];
  deleted?: ChangeField[];
  updated?: ChangeField[];
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

function tokenizeWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

function isWhitespaceToken(token: string): boolean {
  return /^\s+$/.test(token);
}

/**
 * LCS word diff over tokens. Consecutive parts with the same change
 * flag merge, matching the `diff` package's change grouping. Common
 * parts take the old text's tokens, so whitespace-insensitive
 * equality keeps the old spacing for unchanged text.
 */
export function diffWordParts(
  oldText: string,
  newText: string,
  ignoreWhitespace: boolean,
): DiffPart[] {
  const a = tokenizeWords(oldText);
  const b = tokenizeWords(newText);
  const tokensEqual = (left: string, right: string): boolean =>
    ignoreWhitespace && isWhitespaceToken(left) && isWhitespaceToken(right) ? true : left === right;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = tokensEqual(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (value: string, added?: boolean, removed?: boolean): void => {
    const last = parts[parts.length - 1];
    if (last && last.added === added && last.removed === removed) {
      last.value += value;
      return;
    }
    parts.push({ value, added, removed });
  };
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (tokensEqual(a[i], b[j])) {
      push(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i], undefined, true);
      i++;
    } else {
      push(b[j], true, undefined);
      j++;
    }
  }
  while (i < m) {
    push(a[i], undefined, true);
    i++;
  }
  while (j < n) {
    push(b[j], true, undefined);
    j++;
  }
  return parts;
}

/** Official `diffWords`: word diff ignoring whitespace-only differences. */
export function diffWords(oldText: string, newText: string): DiffPart[] {
  return diffWordParts(oldText, newText, true);
}

/** Official `diffWordsWithSpace`: whitespace runs are significant tokens. */
export function diffWordsWithSpace(oldText: string, newText: string): DiffPart[] {
  return diffWordParts(oldText, newText, false);
}

const BLOCK_END_PATTERN = /<\/(p|li|h[1-6]|div|pre|blockquote)>|<br\s*\/?>/gi;
// The rich-text editor always wraps content in a block element. Anything
// else (column types like `array<string>`, markdown such as `Map<K, V>`)
// is plain text and must keep its angle brackets.
const EDITOR_HTML_PATTERN = /^\s*<(p|h[1-6]|ul|ol|pre|blockquote|div|table)\b/i;

/**
 * Official `toDiffableText` (EntityDiffUtils.tsx:87-106): editor HTML
 * diffs as its readable text, one line per block; anything else
 * diffs verbatim.
 */
export function toDiffableText(text: string): string {
  if (!EDITOR_HTML_PATTERN.test(text)) {
    return text;
  }
  const html = text.replace(BLOCK_END_PATTERN, (tag) => `${tag}\n`);
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim();
}

/** Lodash `toString` for field values: null/undefined become ''. */
export function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Official `getTextDiff` (EntityDiffUtils.tsx:108-142) as segments:
 * both empty → the fallback text; either side containing an inline
 * image → the new text verbatim; otherwise a `diffWords` part list
 * over the diffable text. Added spans are underlined, removed spans
 * grey strikethrough, normal spans plain (rendered by VersionDiffText).
 */
export function getTextDiff(
  oldText: string,
  newText: string,
  latestText?: string,
): TextDiffResult {
  const imagePlaceholder = 'data:image';
  if (!oldText && !newText) {
    return { type: 'plain', text: latestText ?? '' };
  }
  if (newText?.includes(imagePlaceholder) || oldText?.includes(imagePlaceholder)) {
    return { type: 'plain', text: newText };
  }
  return {
    type: 'diff',
    parts: diffWords(toDiffableText(toStringValue(oldText)), toDiffableText(toStringValue(newText))),
  };
}

/**
 * Official `getDiffValue` (EntityDiffUtils.tsx:38-53): `diffWordsWithSpace`
 * where every part renders as `diff-added` or `diff-removed` — including
 * unchanged parts, which take the `diff-removed` span. That quirk is
 * ported verbatim: the value diff has no normal span.
 */
export function getDiffValue(oldValue: string, newValue: string): DiffPart[] {
  return diffWordsWithSpace(oldValue, newValue).map((part) => ({
    value: part.value,
    added: part.added ? true : undefined,
    removed: part.added ? undefined : true,
  }));
}

// --- EntityDiffPureUtils.ts -------------------------------------------------

export const getChangedEntityName = (diffObject?: EntityDiffProps): string | undefined =>
  diffObject?.added?.field ?? diffObject?.deleted?.field ?? diffObject?.updated?.field;

export const getChangedEntityOldValue = (diffObject?: EntityDiffProps): unknown =>
  diffObject?.added?.oldValue ?? diffObject?.deleted?.oldValue ?? diffObject?.updated?.oldValue;

export const getChangedEntityNewValue = (diffObject?: EntityDiffProps): unknown =>
  diffObject?.added?.newValue ?? diffObject?.deleted?.newValue ?? diffObject?.updated?.newValue;

export const getChangeColumnNameFromDiffValue = (name?: string): string | undefined => {
  const nameWithoutInternalQuotes = name?.replaceAll(/"/g, '');
  return nameWithoutInternalQuotes?.split('.')?.slice(-2, -1)[0];
};

export const isEndsWithField = (checkWith: string, name?: string): boolean | undefined =>
  name?.endsWith(checkWith);

export function getDiffByFieldName(
  name: string,
  changeDescription: ChangeDescription | undefined,
  exactMatch?: boolean,
): EntityDiffProps {
  const fieldsAdded = changeDescription?.fieldsAdded ?? [];
  const fieldsDeleted = changeDescription?.fieldsDeleted ?? [];
  const fieldsUpdated = changeDescription?.fieldsUpdated ?? [];
  if (exactMatch) {
    return {
      added: fieldsAdded.find((ch) => ch.field === name),
      deleted: fieldsDeleted.find((ch) => ch.field === name),
      updated: fieldsUpdated.find((ch) => ch.field === name),
    };
  }
  return {
    added: fieldsAdded.find((ch) => ch.field?.includes(name)),
    deleted: fieldsDeleted.find((ch) => ch.field?.includes(name)),
    updated: fieldsUpdated.find((ch) => ch.field?.includes(name)),
  };
}

export function getAllDiffByFieldName(
  name: string,
  changeDescription: ChangeDescription | undefined,
  exactMatch?: boolean,
): EntityDiffWithMultiChanges {
  const fieldsAdded = changeDescription?.fieldsAdded ?? [];
  const fieldsDeleted = changeDescription?.fieldsDeleted ?? [];
  const fieldsUpdated = changeDescription?.fieldsUpdated ?? [];
  if (exactMatch) {
    return {
      added: fieldsAdded.filter((ch) => ch.field === name),
      deleted: fieldsDeleted.filter((ch) => ch.field === name),
      updated: fieldsUpdated.filter((ch) => ch.field === name),
    };
  }
  return {
    added: fieldsAdded.filter((ch) => ch.field?.includes(name)),
    deleted: fieldsDeleted.filter((ch) => ch.field?.includes(name)),
    updated: fieldsUpdated.filter((ch) => ch.field?.includes(name)),
  };
}

export function getAllChangedEntityNames(diffObject: EntityDiffWithMultiChanges): string[] {
  const changedEntityNames: string[] = [];
  (Object.keys(diffObject) as Array<keyof EntityDiffWithMultiChanges>).forEach((key) => {
    const changedValues = diffObject[key];
    if (changedValues) {
      changedValues.forEach((value) => {
        if (value.field) {
          changedEntityNames.push(value.field);
        }
      });
    }
  });
  return changedEntityNames;
}

// --- EntityVersionUtilsPure.ts: field/tag diffs -----------------------------

export function getEntityVersionByField(
  changeDescription: ChangeDescription | undefined,
  field: string,
  fallbackText?: string,
): TextDiffResult {
  const fieldDiff = getDiffByFieldName(field, changeDescription, true);
  const oldField = getChangedEntityOldValue(fieldDiff);
  const newField = getChangedEntityNewValue(fieldDiff);
  return getTextDiff(toStringValue(oldField), toStringValue(newField), toStringValue(fallbackText));
}

export interface TagLabelWithStatus extends ServiceTagLabel {
  added?: boolean;
  removed?: boolean;
}

function parseTagArray(value: unknown): ServiceTagLabel[] {
  // The wire shape is the JSON string the pin parses. The product's
  // ChangeField.newValue is `unknown`, so an already-parsed array from
  // an in-memory caller is accepted as-is instead of crashing the diff.
  if (Array.isArray(value)) {
    return value as ServiceTagLabel[];
  }
  return JSON.parse((value as string | undefined) ?? '[]') as ServiceTagLabel[];
}

/**
 * Official `getTagsDiff`: array diff over tag labels, flagging each
 * tag added/removed. Equality is by `tagFQN` value (see module note).
 */
export function getTagsDiff(
  oldTagList: ServiceTagLabel[],
  newTagList: ServiceTagLabel[],
): TagLabelWithStatus[] {
  const m = oldTagList.length;
  const n = newTagList.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldTagList[i].tagFQN === newTagList[j].tagFQN
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: TagLabelWithStatus[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldTagList[i].tagFQN === newTagList[j].tagFQN) {
      result.push({ ...newTagList[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ ...oldTagList[i], removed: true });
      i++;
    } else {
      result.push({ ...newTagList[j], added: true });
      j++;
    }
  }
  while (i < m) {
    result.push({ ...oldTagList[i], removed: true });
    i++;
  }
  while (j < n) {
    result.push({ ...newTagList[j], added: true });
    j++;
  }
  return result;
}

export function isTierTag(tagFQN: string): boolean {
  return tagFQN.startsWith('Tier.');
}

export function getTagsWithoutTier<T extends { tagFQN: string }>(tags: T[]): T[] {
  return tags.filter((item) => !isTierTag(item.tagFQN));
}

/**
 * Official `getEntityVersionTags` (EntityVersionUtilsPure.ts:105-130):
 * diff tags first, then the current version's tags, deduped by tagFQN
 * in that order, tier tags stripped.
 */
export function getEntityVersionTags(
  currentTags: ServiceTagLabel[] | undefined,
  changeDescription: ChangeDescription | undefined,
): TagLabelWithStatus[] {
  const tagsDiff = getDiffByFieldName('tags', changeDescription, true);
  const oldTags = parseTagArray(getChangedEntityOldValue(tagsDiff));
  const newTags = parseTagArray(getChangedEntityNewValue(tagsDiff));
  const flag: Record<string, boolean> = {};
  const uniqueTags: TagLabelWithStatus[] = [];
  [...(getTagsDiff(oldTags, newTags) ?? []), ...(currentTags ?? [])].forEach((elem) => {
    if (!flag[elem.tagFQN]) {
      flag[elem.tagFQN] = true;
      uniqueTags.push(elem as TagLabelWithStatus);
    }
  });
  return getTagsWithoutTier(uniqueTags);
}

/** Tier label: displayName, else the FQN's second segment. */
export function getTierLabel(tier?: Pick<ServiceTagLabel, 'tagFQN' | 'displayName'>): string {
  return tier?.displayName || (tier?.tagFQN?.split('.')[1] ?? '');
}

// --- EntityVersionUtilsPure.ts: owner/domain/tier extra info ----------------

export interface DiffReference {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  type?: string;
}

export type DiffLabelChange = 'added' | 'removed' | 'normal';

export interface DiffLabel {
  text: string;
  change: DiffLabelChange;
}

function diffLabelFor(reference: DiffReference, change: DiffLabelChange): DiffLabel {
  return { text: getEntityName(reference), change };
}

function parseReferenceArray(value: unknown): DiffReference[] {
  // Same dual-shape rule as parseTagArray: JSON string on the wire,
  // parsed arrays accepted from in-memory callers.
  if (Array.isArray(value)) {
    return value as DiffReference[];
  }
  return JSON.parse((value as string | undefined) ?? '[]') as DiffReference[];
}

function diffReferenceList(
  defaultItems: DiffReference[],
  changeDescription: ChangeDescription | undefined,
  field: string,
): Array<{ item: DiffReference; change: DiffLabelChange }> {
  const fieldDiff = getDiffByFieldName(field, changeDescription);
  const addedItems = parseReferenceArray(getChangedEntityNewValue(fieldDiff));
  const deletedItems = parseReferenceArray(getChangedEntityOldValue(fieldDiff));
  const unchangedItems = defaultItems.filter(
    (item) => !addedItems.some((addedItem) => addedItem.id === item.id),
  );
  return [
    ...unchangedItems.map((item) => ({ item, change: 'normal' as DiffLabelChange })),
    ...addedItems.map((item) => ({ item, change: 'added' as DiffLabelChange })),
    ...deletedItems.map((item) => ({ item, change: 'removed' as DiffLabelChange })),
  ];
}

/**
 * Official `getOwnerDiff` (EntityVersionUtilsPure.ts:413-452): the
 * merged owner list (unchanged, added, deleted) plus a per-name
 * display label. The field match is a substring match, not exact.
 */
export function getOwnerDiff(
  defaultItems: DiffReference[],
  changeDescription?: ChangeDescription,
  ownerField = 'owners',
): { owners: DiffReference[]; ownerDisplayName: Map<string, DiffLabel> } {
  const allItems = diffReferenceList(defaultItems, changeDescription, ownerField);
  const ownerDisplayName = new Map<string, DiffLabel>();
  allItems.forEach(({ item, change }) => {
    if (item.name) {
      ownerDisplayName.set(item.name, diffLabelFor(item, change));
    }
  });
  return { owners: allItems.map(({ item }) => item), ownerDisplayName };
}

/** Official `getDomainDiff`: same merge, display labels in list order. */
export function getDomainDiff(
  defaultItems: DiffReference[],
  changeDescription?: ChangeDescription,
  domainField = 'domains',
): { domains: DiffReference[]; domainDisplayName: DiffLabel[] } {
  const allItems = diffReferenceList(defaultItems, changeDescription, domainField);
  return {
    domains: allItems.map(({ item }) => item),
    domainDisplayName: allItems.map(({ item, change }) => diffLabelFor(item, change)),
  };
}

export type TierDisplay = TextDiffResult;

/**
 * Official `getCommonExtraInfoForVersionDetails`
 * (EntityVersionUtilsPure.ts:513-558). The tier lookup uses a
 * `Tier` prefix match (no dot), unlike `isTierTag`'s `Tier.` — both
 * are ported as written.
 */
export function getCommonExtraInfoForVersionDetails(
  changeDescription: ChangeDescription | undefined,
  owners?: DiffReference[],
  tier?: ServiceTagLabel,
  domains?: DiffReference[],
): {
  ownerRef: DiffReference[];
  ownerDisplayName: Map<string, DiffLabel>;
  domainRef: DiffReference[];
  domainDisplayName: DiffLabel[];
  tierDisplayName: TierDisplay;
} {
  const { owners: ownerRef, ownerDisplayName } = getOwnerDiff(owners ?? [], changeDescription);
  const { domains: domainRef, domainDisplayName } = getDomainDiff(domains ?? [], changeDescription);
  const tagsDiff = getDiffByFieldName('tags', changeDescription, true);
  const newTier = [...parseTagArray(getChangedEntityNewValue(tagsDiff))].find((t) =>
    (t?.tagFQN as string).startsWith('Tier'),
  );
  const oldTier = [...parseTagArray(getChangedEntityOldValue(tagsDiff))].find((t) =>
    (t?.tagFQN as string).startsWith('Tier'),
  );
  let tierDisplayName: TierDisplay = { type: 'plain', text: '' };
  if (newTier !== undefined || oldTier !== undefined) {
    tierDisplayName = { type: 'diff', parts: getDiffValue(getTierLabel(oldTier), getTierLabel(newTier)) };
  } else if (tier?.tagFQN) {
    tierDisplayName = { type: 'plain', text: getTierLabel(tier) };
  }
  return { ownerRef, ownerDisplayName, domainRef, domainDisplayName, tierDisplayName };
}

export function getCommonDiffsFromVersionData(
  currentVersionData: { tags?: ServiceTagLabel[]; displayName?: string; description?: string },
  changeDescription: ChangeDescription | undefined,
): { tags: TagLabelWithStatus[]; displayName: TextDiffResult; description: TextDiffResult } {
  return {
    tags: getEntityVersionTags(currentVersionData.tags, changeDescription),
    displayName: getEntityVersionByField(changeDescription, 'displayName', currentVersionData.displayName),
    description: getEntityVersionByField(changeDescription, 'description', currentVersionData.description),
  };
}

/** Official `isMajorVersion`: parseFloat(v1) + 1 === parseFloat(v2); NaN → false. */
export function isMajorVersion(version1: string, version2: string): boolean {
  const v1 = Number.parseFloat(version1);
  const v2 = Number.parseFloat(version2);
  const flag = !Number.isNaN(v1) && !Number.isNaN(v2);
  if (flag) {
    return v1 + 1 === v2;
  }
  return flag;
}

/**
 * Official `renderVersionButton` major check: both versions normalized
 * through `parseFloat(...).toFixed(1)` before the comparison.
 */
export function isMajorVersionForEntry(
  version: number | string | undefined,
  previousVersion: number | string | undefined,
): boolean {
  return isMajorVersion(
    Number.parseFloat(String(previousVersion)).toFixed(1).toString(),
    Number.parseFloat(String(version)).toFixed(1).toString(),
  );
}

// --- EntityVersionUtilsPure.ts / EntityVersionUtils.tsx: summaries ----------

function isValidJSONString(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Official `summaryFormatter`: columns → names, tags → tagFQNs,
 * owner → `owner <name>`, anything else → the field name. Values are
 * JSON-parsed when valid, preferring the new value. Already-parsed
 * arrays/objects are used directly (same dual-shape rule as the tag
 * and reference parsers: the wire sends JSON strings, the product
 * type permits parsed values).
 */
export function summaryFormatter(fieldChange: ChangeField, translate: TranslateFn): string {
  const parsedValue = (value: unknown): unknown =>
    typeof value === 'string'
      ? isValidJSONString(value)
        ? (JSON.parse(value) as unknown)
        : undefined
      : Array.isArray(value) || (typeof value === 'object' && value !== null)
        ? value
        : undefined;
  const newValueJSON = parsedValue(fieldChange?.newValue);
  const oldValueJSON = parsedValue(fieldChange?.oldValue) ?? {};
  const value = (newValueJSON ?? oldValueJSON) as
    | Array<{ name?: string; tagFQN?: string }>
    | { name?: string }
    | undefined;
  if (fieldChange.field === 'columns') {
    return `${translate('settings.services.summary.columnPlural')} ${(
      value as Array<{ name?: string }> | undefined
    )
      ?.map((val) => val?.name)
      .join(', ')}`;
  } else if (fieldChange.field === 'tags' || fieldChange.field?.endsWith('tags')) {
    return `${translate('settings.services.summary.tagPlural')} ${(
      value as Array<{ tagFQN?: string }> | undefined
    )
      ?.map((val) => val?.tagFQN)
      ?.join(', ')}`;
  } else if (fieldChange.field === 'owner') {
    return `${fieldChange.field} ${(value as { name?: string } | undefined)?.name}`;
  } else {
    return fieldChange.field ?? '';
  }
}

export function getGlossaryTermApprovalText(
  fieldsChanged: ChangeField[],
  translate: TranslateFn,
): string {
  const statusFieldDiff = fieldsChanged.find((field) => field.field === 'status');
  let approvalText = '';
  if (statusFieldDiff) {
    let statusLabel: string;
    if (statusFieldDiff.newValue === 'Approved') {
      statusLabel = translate('settings.services.summary.approved');
    } else if (statusFieldDiff.newValue === 'In Review') {
      statusLabel = translate('settings.services.summary.inReview');
    } else {
      statusLabel = translate('settings.services.summary.rejected');
    }
    approvalText = translate('settings.services.summary.glossaryTermStatus', { status: statusLabel });
  }
  return approvalText;
}

const ENTITY_STATUS_FIELD = 'entityStatus';

const ENTITY_STATUS_LABEL_KEYS: Record<string, string> = {
  Approved: 'settings.services.summary.approved',
  Archived: 'settings.services.summary.archived',
  Deprecated: 'settings.services.summary.deprecated',
  Draft: 'settings.services.summary.draft',
  InReview: 'settings.services.summary.inReview',
  Rejected: 'settings.services.summary.rejected',
  Unprocessed: 'settings.services.summary.unprocessed',
};

/** A lifecycle status change, read as the status the asset moved to. */
export function getEntityStatusChangeText(
  fieldsChanged: ChangeField[],
  translate: TranslateFn,
): string {
  const change = fieldsChanged.find((field) => field.field === ENTITY_STATUS_FIELD);
  const labelKey = ENTITY_STATUS_LABEL_KEYS[change?.newValue as string] ?? '';
  return labelKey ? translate('settings.services.summary.statusChangedTo', { status: translate(labelKey) }) : '';
}

export function getSummaryText(
  options: {
    isPrefix: boolean;
    fieldsChanged: ChangeField[];
    actionType: string;
    actionText: string;
    isGlossaryTerm?: boolean;
  },
  translate: TranslateFn,
): string {
  const { isPrefix, fieldsChanged, actionType, actionText, isGlossaryTerm } = options;
  const prefix = isPrefix ? `+ ${actionType}` : '';
  const entityStatusText = getEntityStatusChangeText(fieldsChanged, translate);
  const filteredFieldsChanged = fieldsChanged.filter(
    (field) =>
      !(isGlossaryTerm && field.field === 'status') &&
      !(entityStatusText && field.field === ENTITY_STATUS_FIELD),
  );
  let summaryText = '';
  if (filteredFieldsChanged.length > 0) {
    const suffix = isPrefix
      ? ''
      : translate('settings.services.summary.hasBeenActionType', { actionType: actionText });
    summaryText = `${prefix} ${filteredFieldsChanged
      .map((field) => summaryFormatter(field, translate))
      .join(', ')} ${suffix} `;
  }
  const isGlossaryTermStatusUpdated = fieldsChanged.some((field) => field.field === 'status');
  const glossaryTermApprovalText = isGlossaryTermStatusUpdated
    ? getGlossaryTermApprovalText(fieldsChanged, translate)
    : '';
  return `${glossaryTermApprovalText}${entityStatusText} ${summaryText}`;
}

/**
 * Official `getSummary` (EntityVersionUtils.tsx:91-169) as paragraph
 * strings: the deleted/restored paragraph, the added paragraph, the
 * updated paragraph, and the removed paragraph. The bulk-import
 * branch renders only the completion text — the CSV stats component
 * belongs to table versions and cannot occur for services.
 */
export function getSummary(
  options: {
    changeDescription: ChangeDescription | undefined;
    isPrefix?: boolean;
    isGlossaryTerm?: boolean;
  },
  translate: TranslateFn,
): string[] {
  const { changeDescription, isPrefix = false, isGlossaryTerm = false } = options;
  const fieldsAdded = [...(changeDescription?.fieldsAdded ?? [])];
  const fieldsDeleted = [...(changeDescription?.fieldsDeleted ?? [])];
  const fieldsUpdated = [
    ...(changeDescription?.fieldsUpdated?.filter((field) => field.field !== 'deleted') ?? []),
  ];
  const isDeleteUpdated = [
    ...(changeDescription?.fieldsUpdated?.filter((field) => field.field === 'deleted') ?? []),
  ];
  const paragraphs: string[] = [];
  if (isDeleteUpdated?.length > 0) {
    paragraphs.push(
      isDeleteUpdated
        .map((field) =>
          field.newValue
            ? translate('settings.services.summary.dataAssetHasBeenActionType', {
                actionType: translate('settings.services.summary.deletedLowercase'),
              })
            : translate('settings.services.summary.dataAssetHasBeenActionType', {
                actionType: translate('settings.services.summary.restoredLowercase'),
              }),
        )
        .join(', '),
    );
  }
  if (fieldsAdded?.length > 0) {
    paragraphs.push(
      getSummaryText(
        {
          isPrefix,
          fieldsChanged: fieldsAdded,
          actionType: translate('settings.services.summary.added'),
          actionText: translate('settings.services.summary.addedLowercase'),
        },
        translate,
      ),
    );
  }
  if (fieldsUpdated?.length) {
    const bulkImportField = fieldsUpdated.find((field) => field.field === 'bulkImport');
    const bulkImportValue =
      bulkImportField &&
      ((bulkImportField.newValue !== null && typeof bulkImportField.newValue === 'object') ||
        isValidJSONString(bulkImportField.newValue));
    paragraphs.push(
      bulkImportField && bulkImportValue
        ? translate('settings.services.summary.bulkImportCompleted')
        : getSummaryText(
            {
              isPrefix,
              fieldsChanged: fieldsUpdated,
              actionType: translate('settings.services.summary.edited'),
              actionText: translate('settings.services.summary.updatedLowercase'),
              isGlossaryTerm,
            },
            translate,
          ),
    );
  }
  if (fieldsDeleted?.length) {
    paragraphs.push(
      getSummaryText(
        {
          isPrefix,
          fieldsChanged: fieldsDeleted,
          actionType: translate('settings.services.summary.removed'),
          actionText: translate('settings.services.summary.deletedLowercase'),
        },
        translate,
      ),
    );
  }
  return paragraphs;
}

// --- EntityVersionTimeLine.tsx: R-T3 partition ------------------------------

/**
 * Timeline partition (EntityVersionTimeLine.tsx:44-55, R-T3):
 * truncate only when `maxVersions > 0`; -1, 0, and undefined render
 * everything with no hidden versions and no upgrade prompt.
 */
export function partitionVersionTimeline<T>(
  versions: readonly T[],
  maxVersions: number | undefined,
): { visible: T[]; hidden: T[] } {
  const maxAllowed = maxVersions ?? -1;
  if (maxAllowed > 0) {
    return { visible: versions.slice(0, maxAllowed), hidden: versions.slice(maxAllowed) };
  }
  return { visible: [...versions], hidden: [] };
}


/** Official `constants/Feeds.constants.ts` EntityField values used by version column diffs. */
export const EntityField = {
  COLUMNS: 'columns',
  DESCRIPTION: 'description',
  TAGS: 'tags',
  DISPLAYNAME: 'displayName',
  DATA_TYPE_DISPLAY: 'dataTypeDisplay',
  CONSTRAINT: 'constraint',
  TABLE_CONSTRAINTS: 'tableConstraints',
} as const;

export type EntityFieldName = (typeof EntityField)[keyof typeof EntityField];

/** Official `FQN_SEPARATOR_CHAR`. */
export const FQN_SEPARATOR_CHAR = '.';

/**
 * Column/field row after official `getColumnsDataWithVersionChanges`.
 * Official assigns `getTextDiff` HTML into name/description/dataTypeDisplay;
 * the product keeps the raw string for matching/search and stores the
 * existing `TextDiffResult` alongside so `VersionDiffText` can render it
 * without `v-html`.
 */
export interface VersionColumn {
  name: string;
  displayName?: string;
  dataType?: string;
  dataTypeDisplay?: string;
  description?: string;
  constraint?: string;
  tags?: TagLabelWithStatus[];
  children?: VersionColumn[];
  fullyQualifiedName?: string;
  key?: string;
  nameDiff?: TextDiffResult;
  displayNameDiff?: TextDiffResult;
  dataTypeDisplayDiff?: TextDiffResult;
  descriptionDiff?: TextDiffResult;
}

function cloneVersionColumns<A extends VersionColumn>(columns: A[] = []): A[] {
  return columns.map((column) => ({
    ...column,
    tags: column.tags?.map((tag) => ({ ...tag })),
    children: column.children ? cloneVersionColumns(column.children as A[]) : undefined,
  })) as A[];
}

function attachTextDiff<A extends VersionColumn>(
  row: A,
  key: 'name' | 'displayName' | 'dataTypeDisplay' | 'description',
  oldText: string,
  newText: string,
): void {
  const fallback = (row[key] as string | undefined) ?? newText ?? oldText ?? '';
  const diff = getTextDiff(oldText, newText, fallback);
  if (key === 'name') {
    row.nameDiff = diff;
  } else if (key === 'displayName') {
    row.displayNameDiff = diff;
  } else if (key === 'dataTypeDisplay') {
    row.dataTypeDisplayDiff = diff;
  } else {
    row.descriptionDiff = diff;
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const text = toStringValue(value);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function getEntityDescriptionDiff<A extends VersionColumn>(
  entityDiff: EntityDiffProps,
  changedEntityName?: string,
  entityList: A[] = [],
): A[] {
  const oldDescription = toStringValue(getChangedEntityOldValue(entityDiff));
  const newDescription = toStringValue(getChangedEntityNewValue(entityDiff));

  const formatEntityData = (arr: A[]) => {
    arr?.forEach((item) => {
      if (item.name === changedEntityName) {
        attachTextDiff(item, 'description', oldDescription, newDescription);
      } else if (item.children?.length) {
        formatEntityData(item.children as A[]);
      }
    });
  };

  formatEntityData(entityList);
  return entityList;
}

export function getStringEntityDiff<A extends VersionColumn>(
  entityDiff: EntityDiffProps,
  key: 'displayName' | 'dataTypeDisplay',
  changedEntityName?: string,
  entityList: A[] = [],
): A[] {
  const oldValue = toStringValue(getChangedEntityOldValue(entityDiff));
  const newValue = toStringValue(getChangedEntityNewValue(entityDiff));

  const formatEntityData = (arr: A[]) => {
    arr?.forEach((item) => {
      if (item.name === changedEntityName) {
        attachTextDiff(item, key, oldValue, newValue);
        if (newValue) {
          item[key] = newValue;
        }
      } else if (item.children?.length) {
        formatEntityData(item.children as A[]);
      }
    });
  };

  formatEntityData(entityList);
  return entityList;
}

export function getEntityTagDiff<A extends VersionColumn>(
  entityDiff: EntityDiffProps,
  changedEntityName?: string,
  entityList: A[] = [],
): A[] {
  const oldTags = parseJsonArray<ServiceTagLabel>(getChangedEntityOldValue(entityDiff));
  const newTags = parseJsonArray<ServiceTagLabel>(getChangedEntityNewValue(entityDiff));

  const formatColumnData = (arr: A[]) => {
    arr?.forEach((item) => {
      if (item.name === changedEntityName) {
        const flag: Record<string, boolean> = {};
        const uniqueTags: TagLabelWithStatus[] = [];
        const tagsDiff = getTagsDiff(oldTags, newTags);
        [...tagsDiff, ...((item.tags ?? []) as TagLabelWithStatus[])].forEach((elem) => {
          const tagFQN = elem.tagFQN ?? '';
          if (!flag[tagFQN]) {
            flag[tagFQN] = true;
            uniqueTags.push(elem);
          }
        });
        item.tags = uniqueTags;
      } else if (item.children?.length) {
        formatColumnData(item.children as A[]);
      }
    });
  };

  formatColumnData(entityList);
  return entityList;
}

export function getNewColumnFromColDiff<A extends VersionColumn>(newCol: A[]): A[] {
  return newCol.map((col) => {
    const copy: A = {
      ...col,
      tags: col.tags?.map((tag) => ({ ...tag, removed: true })),
      children: !col.children?.length ? undefined : getNewColumnFromColDiff(col.children as A[]),
    };
    attachTextDiff(copy, 'description', copy.description ?? '', '');
    attachTextDiff(copy, 'dataTypeDisplay', copy.dataTypeDisplay ?? '', '');
    attachTextDiff(copy, 'name', copy.name, '');
    return copy;
  });
}

function formatAddedColumnData<A extends VersionColumn>(arr: A[], col: A, updateAll?: boolean): void {
  arr?.forEach((item) => {
    if (item.name === col.name || updateAll) {
      item.tags = item.tags?.map((tag) => ({ ...tag, added: true }));
      attachTextDiff(item, 'description', '', item.description ?? '');
      attachTextDiff(item, 'dataTypeDisplay', '', item.dataTypeDisplay ?? '');
      attachTextDiff(item, 'name', '', item.name);
      if (item.children?.length) {
        formatAddedColumnData(item.children as A[], col, true);
      }
    } else if (item.children?.length) {
      formatAddedColumnData(item.children as A[], col);
    }
  });
}

function createAddedColumnsDiff<A extends VersionColumn>(columnsDiff: EntityDiffProps, colList: A[] = []): void {
  const newCol = parseJsonArray<A>(columnsDiff.added?.newValue);
  newCol.forEach((col) => {
    formatAddedColumnData(colList, col);
  });
}

export function addDeletedColumnsDiff<A extends VersionColumn>(
  columnsDiff: EntityDiffProps,
  colList: A[] = [],
  changedEntity = '',
): void {
  const newCol = parseJsonArray<A>(columnsDiff.deleted?.oldValue);
  const newColumns = getNewColumnFromColDiff(newCol);

  const insertNewColumn = (changedEntityField: string, colArray: VersionColumn[]) => {
    const fieldsArray = changedEntityField.split(FQN_SEPARATOR_CHAR);
    if (!changedEntityField) {
      const nonExistingColumns = newColumns.filter((newColumn) =>
        !colArray.find((existing) => existing.name === newColumn.name),
      );
      colArray.unshift(...nonExistingColumns);
    } else {
      const parentField = fieldsArray.shift();
      const children = colArray.find((existing) => existing.name === parentField)?.children;
      insertNewColumn(fieldsArray.join(FQN_SEPARATOR_CHAR), children ?? []);
    }
  };

  insertNewColumn(changedEntity, colList);
}

function uniqByName<A extends VersionColumn>(colList: A[]): A[] {
  const seen = new Set<string>();
  return colList.filter((column) => {
    if (seen.has(column.name)) {
      return false;
    }
    seen.add(column.name);
    return true;
  });
}

export function getColumnsDiff<A extends VersionColumn>(
  columnsDiff: EntityDiffProps,
  colList: A[] = [],
  changedEntity = '',
): A[] {
  if (columnsDiff.added) {
    createAddedColumnsDiff(columnsDiff, colList);
  }
  if (columnsDiff.deleted) {
    addDeletedColumnsDiff(columnsDiff, colList, changedEntity);
  }
  return uniqByName(colList);
}

export function getColumnsDataWithVersionChanges<A extends VersionColumn>(
  changeDescription: ChangeDescription | undefined,
  colList?: A[],
  isContainerEntity?: boolean,
): A[] {
  const columnsDiff = getAllDiffByFieldName(EntityField.COLUMNS, changeDescription);
  const changedFields = getAllChangedEntityNames(columnsDiff);
  let newColumnsList = cloneVersionColumns(colList ?? []);

  changedFields?.forEach((changedField) => {
    const columnDiff = getDiffByFieldName(changedField, changeDescription);
    const changedEntityName = getChangedEntityName(columnDiff);
    const changedColName = getChangeColumnNameFromDiffValue(changedEntityName);

    if (isEndsWithField(EntityField.DESCRIPTION, changedEntityName)) {
      newColumnsList = getEntityDescriptionDiff(columnDiff, changedColName, newColumnsList);
    } else if (isEndsWithField(EntityField.TAGS, changedEntityName)) {
      newColumnsList = getEntityTagDiff(columnDiff, changedColName, newColumnsList);
    } else if (isEndsWithField(EntityField.DISPLAYNAME, changedEntityName)) {
      newColumnsList = getStringEntityDiff(
        columnDiff,
        EntityField.DISPLAYNAME,
        changedColName,
        newColumnsList,
      );
    } else if (isEndsWithField(EntityField.DATA_TYPE_DISPLAY, changedEntityName)) {
      newColumnsList = getStringEntityDiff(
        columnDiff,
        EntityField.DATA_TYPE_DISPLAY,
        changedColName,
        newColumnsList,
      );
    } else if (!isEndsWithField(EntityField.CONSTRAINT, changedEntityName)) {
      const changedEntity = changedEntityName
        ?.split(FQN_SEPARATOR_CHAR)
        .slice(isContainerEntity ? 2 : 1)
        .join(FQN_SEPARATOR_CHAR);
      newColumnsList = getColumnsDiff(columnDiff, newColumnsList, changedEntity);
    }
  });

  return newColumnsList;
}

export function getConstraintChanges(
  changeDescription: ChangeDescription | undefined,
  fieldName: string,
): { addedConstraintDiffs: ChangeField[]; deletedConstraintDiffs: ChangeField[] } {
  const all = getAllDiffByFieldName(fieldName, changeDescription);
  const addedConstraintDiffs: ChangeField[] = [...(all.added ?? []), ...(all.updated ?? [])];
  const deletedConstraintDiffs: ChangeField[] = [...(all.deleted ?? []), ...(all.updated ?? [])];
  return { addedConstraintDiffs, deletedConstraintDiffs };
}
