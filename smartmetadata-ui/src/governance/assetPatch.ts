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

/** Custom property values live on the entity `extension` object. */
export function extensionPatch(current: unknown, extension: Record<string, unknown>): JsonPatchOp[] {
  return setFieldPatch('/extension', current, extension);
}
