/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { entityRefValue, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import type { TableConstraint } from '@/types/api';
import type { TagLabelState, TagLabelType } from '@/types/api';
import type { AssetTagOption, TagSource } from '@/types/governance';
import type { TermReference } from '@/types/governance';
import type { TermRelationInput } from '@/governance/glossaryTermWidgets';

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

export function descriptionPatch(current: unknown, description: string): JsonPatchOp[] {
  return setFieldPatch('/description', current, description);
}

export function ownersPatch(
  current: unknown,
  owners: Array<{ id: string; type: string }>,
): JsonPatchOp[] {
  return setFieldPatch(
    '/owners',
    current,
    owners.map((owner) => entityRefValue(owner.id, owner.type)),
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

export function columnTagsPatch(
  entityType: string,
  indexPath: number[] | undefined,
  currentTags: unknown,
  tags: TagLabelInput[],
): JsonPatchOp[] {
  const base = COLUMN_TAGS_BASE[entityType];
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

/** Custom property values live on the entity `extension` object. */
export function extensionPatch(current: unknown, extension: Record<string, unknown>): JsonPatchOp[] {
  return setFieldPatch('/extension', current, extension);
}

/**
 * D-2 batch 5a cell saves: whole-field writes for the glossary-term
 * and table widgets. Each is a thin `setFieldPatch` wrapper so the
 * call sites read as the field they write (pin `onUpdate({...data,
 * <field>: next})` shape, sent as one JSON Patch op per B2 §0.1).
 */
export function synonymsPatch(current: unknown, synonyms: string[]): JsonPatchOp[] {
  return setFieldPatch('/synonyms', current, synonyms);
}

export function referencesPatch(current: unknown, references: TermReference[]): JsonPatchOp[] {
  return setFieldPatch('/references', current, references);
}

export function relatedTermsPatch(
  current: unknown,
  relations: TermRelationInput[],
): JsonPatchOp[] {
  return setFieldPatch('/relatedTerms', current, relations);
}

export function termOwnersPatch(
  current: unknown,
  owners: Array<{ id: string; type: string }>,
): JsonPatchOp[] {
  return setFieldPatch(
    '/owners',
    current,
    owners.map((owner) => entityRefValue(owner.id, owner.type)),
  );
}

export function domainTypePatch(current: unknown, domainType: string): JsonPatchOp[] {
  return setFieldPatch('/domainType', current, domainType);
}

export function tableConstraintsPatch(
  current: unknown,
  constraints: TableConstraint[],
): JsonPatchOp[] {
  return setFieldPatch('/tableConstraints', current, constraints);
}
