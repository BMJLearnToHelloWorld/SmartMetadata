/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { entityRefValue, removeFieldPatch, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { getTagsWithoutCertification, getTagsWithoutTier } from '@/ingestion/tierTags';
import type { TagLabelState, TagLabelType } from '@/types/api';
import type { AssetTagOption, TagSource } from '@/types/governance';

export interface TagLabelValue {
  tagFQN: string;
  source: TagSource;
  labelType: TagLabelType;
  state: TagLabelState;
}

/**
 * Picker/write option carrying the incoming labelType and state when the
 * tag already has them. The catalog itself carries neither; callers
 * overlay the existing tag's values onto the option so an edit preserves
 * them — a retained Suggested label must not flip to Confirmed.
 */
export type TagLabelInput = AssetTagOption & {
  labelType?: TagLabelType;
  state?: TagLabelState;
};

/**
 * TagLabel required keys from openmetadata-spec type/tagLabel.json. The
 * incoming labelType and state are preserved (pin entity editing
 * preserves them; pin pickers spread the incoming label and default
 * only the missing pieces); a fresh pick without them defaults to
 * Manual / Confirmed, as pin pickers build new labels.
 */
export function toTagLabel(option: TagLabelInput): TagLabelValue {
  return {
    tagFQN: option.tagFQN,
    source: option.source,
    labelType: option.labelType ?? 'Manual',
    state: option.state ?? 'Confirmed',
  };
}

/** A stored tag label as a picker input, preserving labelType/state. */
export function tagRefToInput(tag: {
  tagFQN: string;
  name: string;
  source?: string;
  labelType?: TagLabelType;
  state?: TagLabelState;
}): TagLabelInput {
  return {
    tagFQN: tag.tagFQN,
    name: tag.name,
    source: (tag.source as TagSource) || 'Classification',
    labelType: tag.labelType,
    state: tag.state,
  };
}

export function descriptionPatch(current: unknown, description: string): JsonPatchOp[] {
  return setFieldPatch('/description', current, description);
}

export function ownersPatch(
  current: unknown,
  owners: Array<{ id?: string; type: string }>,
): JsonPatchOp[] {
  return setFieldPatch(
    '/owners',
    current,
    owners.flatMap((owner) => (owner.id ? [entityRefValue(owner.id, owner.type)] : [])),
  );
}

export function tagsPatch(current: unknown, tags: TagLabelInput[]): JsonPatchOp[] {
  return setFieldPatch('/tags', current, tags.map(toTagLabel));
}

export function domainsPatch(current: unknown, domainIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/domains',
    current,
    domainIds.map((id) => entityRefValue(id, 'domain')),
  );
}

/**
 * D-F2 PATCH group (official TopicSchema / ContainerDataModel /
 * SearchIndexFieldsTable write path): the official UI edits a field's
 * tags in a local copy and PATCHes the whole entity; the product sends
 * the same change as one JSON Patch op on the field's tags array via
 * `patchAsset`, which resolves the entity path per type. The base is the
 * payload field that holds the rows — `messageSchema.schemaFields` for
 * topics, `dataModel.columns` for containers, `fields` for search
 * indexes — and each nesting level descends through `children`
 * (official Field / Column / SearchIndexField all nest under that key).
 * The value is the row's full tag list (both sources merged, as the
 * official TagsContainerV2 sends it), never a single-source subset.
 */
const COLUMN_TAGS_BASE: Record<string, string> = {
  topic: '/messageSchema/schemaFields',
  container: '/dataModel/columns',
  searchIndex: '/fields',
};

/**
 * D-2 batch 3: the APISchema face writes into one of the endpoint's two
 * schema objects, so its base is chosen by the active view, not by
 * entity type. Callers pass the base verbatim; the entity-type table
 * above stays the default.
 */
export const API_SCHEMA_FIELD_BASES = {
  requestSchema: '/requestSchema/schemaFields',
  responseSchema: '/responseSchema/schemaFields',
} as const;

export function columnTagsPatch(
  entityType: string,
  indexPath: number[] | undefined,
  currentTags: unknown,
  tags: TagLabelInput[],
  baseOverride?: string,
): JsonPatchOp[] {
  const base = baseOverride ?? COLUMN_TAGS_BASE[entityType];
  if (!base) {
    throw new Error(`No column-tags patch base for entity type "${entityType}"`);
  }
  if (!indexPath?.length) {
    throw new Error('columnTagsPatch requires a non-empty index path');
  }
  const path =
    indexPath.reduce(
      (acc, index, depth) => (depth === 0 ? `${acc}/${index}` : `${acc}/children/${index}`),
      base,
    ) + '/tags';
  return setFieldPatch(path, currentTags, tags.map(toTagLabel));
}

/**
 * D-2 batch 3 PATCH-group column description (official TopicSchema /
 * ContainerDataModel / SearchIndexFieldsTable / APIEndpointSchema write
 * path): the official UI edits a field's description in a local copy
 * and PATCHes the whole entity; the product sends the same change as
 * one JSON Patch op on the field's description, via `patchAsset`.
 * Same base table as `columnTagsPatch` (plus `baseOverride` for the
 * APISchema face). The description string is written as-is — pin sends
 * the edited string through `updateFieldDescription`, including an
 * empty string, so no `remove` op is emitted here (unlike the entity
 * description path, where empty means remove).
 */
export function columnDescriptionPatch(
  entityType: string,
  indexPath: number[] | undefined,
  currentDescription: unknown,
  description: string,
  baseOverride?: string,
): JsonPatchOp[] {
  const base = baseOverride ?? COLUMN_TAGS_BASE[entityType];
  if (!base) {
    throw new Error(`No column-description patch base for entity type "${entityType}"`);
  }
  if (!indexPath?.length) {
    throw new Error('columnDescriptionPatch requires a non-empty index path');
  }
  const path =
    indexPath.reduce(
      (acc, index, depth) => (depth === 0 ? `${acc}/${index}` : `${acc}/children/${index}`),
      base,
    ) + '/description';
  return setFieldPatch(path, currentDescription, description);
}

/** Custom property values live on the entity `extension` object. */
export function extensionPatch(current: unknown, extension: Record<string, unknown>): JsonPatchOp[] {
  return setFieldPatch('/extension', current, extension);
}

/**
 * Whole-field write of an entity-reference list (`owners`, `domains`,
 * `experts`, `reviewers`): refs carry only `{id, type}`, the same shape
 * `ownersPatch` writes. D-2 batch 2 cell saves for the governance views
 * (which have no field-specific patch helper) build their ops through
 * this instead of the full-PUT update functions, whose Create*Request
 * bodies do not carry these fields.
 */
export function entityRefsPatch(
  path: string,
  current: unknown,
  refs: Array<{ id?: string; type: string }>,
): JsonPatchOp[] {
  // A ref without an id cannot be written; drop it instead of sending
  // an id-less reference (the cells only emit ids taken from options,
  // which always carry one, so nothing is dropped in practice).
  return setFieldPatch(
    path,
    current,
    refs.flatMap((ref) => (ref.id ? [entityRefValue(ref.id, ref.type)] : [])),
  );
}

/**
 * Whole-field write of an entity's `dataProducts` list (pin
 * DataProductsWidget `onUpdate({...data, dataProducts: refs})`, as a
 * JSON Patch op on the Asset path). Refs carry only `{id, type}` like
 * `ownersPatch`.
 */
export function dataProductsPatch(
  current: unknown,
  products: Array<{ id?: string; type: string }>,
): JsonPatchOp[] {
  return entityRefsPatch('/dataProducts', current, products);
}

/**
 * Certification field write (pin CertificationWidget
 * `updateCertificationTag`: a new value is `{tagLabel}`, clearing sends
 * no value). Setting uses a whole-field set; clearing uses `remove`
 * (never `replace` with null) — the same empty-value rule as the
 * Pipeline description `remove` (A7 §3.4).
 */
export function certificationPatch(
  current: unknown,
  tagFqn?: string,
): JsonPatchOp[] {
  if (!tagFqn) {
    return current === undefined || current === null ? [] : [removeFieldPatch('/certification')];
  }
  return setFieldPatch('/certification', current, {
    tagLabel: { tagFQN: tagFqn, source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
  });
}

/**
 * Pin `updateTierTag` (utils/TagsPureUtils.ts), on the product's tag
 * list: drop every existing `Tier.*` label, then append the new tier
 * label — or append nothing when clearing. Retained labels pass through
 * as the stored objects, untouched: rebuilding them through `toTagLabel`
 * would drop their display fields and reset an Automated labelType or
 * a Suggested state to Manual/Confirmed (same rule as `tierTagsPatch`
 * in `ingestion/tierTags.ts`).
 */
export function withTierTag(
  currentTags: readonly TagLabelInput[],
  newTier?: TagLabelInput,
): TagLabelInput[] {
  const retained = getTagsWithoutTier(currentTags);
  if (!newTier) {
    return retained;
  }
  return [...retained, newTier];
}

/**
 * Same shape as `withTierTag` for the `Certification.*` tag, used by
 * the entities whose spec carries no `certification` field (Glossary,
 * GlossaryTerm): the certification lives as a tag in `tags` there, so
 * the cell edits it by replacing that tag instead of patching the
 * field.
 */
export function withCertificationTag(
  currentTags: readonly TagLabelInput[],
  newCertification?: TagLabelInput,
): TagLabelInput[] {
  const retained = getTagsWithoutCertification(currentTags);
  if (!newCertification) {
    return retained;
  }
  return [...retained, newCertification];
}
