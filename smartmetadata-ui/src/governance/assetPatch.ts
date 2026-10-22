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
import type { AssetTagOption, TagSource } from '@/types/governance';

export interface TagLabelValue {
  tagFQN: string;
  source: TagSource;
  labelType: 'Manual';
  state: 'Confirmed';
}

/** TagLabel required keys from openmetadata-spec type/tagLabel.json. */
export function toTagLabel(option: AssetTagOption): TagLabelValue {
  return {
    tagFQN: option.tagFQN,
    source: option.source,
    labelType: 'Manual',
    state: 'Confirmed',
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

export function tagsPatch(current: unknown, tags: AssetTagOption[]): JsonPatchOp[] {
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
