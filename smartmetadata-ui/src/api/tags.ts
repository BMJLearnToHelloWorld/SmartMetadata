/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { ClassificationTag, CreateTagRequest, EntityStyle } from '@/types/governance';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { apiRequest } from './client';

export const TAG_FIELDS = 'owners,reviewers,domains,children,usageCount';

export interface ListTagsQuery {
  parent?: string;
  limit?: number;
  after?: string;
  /** Pin TagsRequestParams.disabled: filter by the tag's disabled flag. */
  disabled?: boolean;
}

function mapTag(raw: Record<string, unknown>): ClassificationTag | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const classificationRefs = mapEntityRefs(raw.classification ? [raw.classification] : []);
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    classification: classificationRefs[0],
    parent: parentRefs[0],
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    disabled: asBoolean(raw.disabled),
    deleted: asBoolean(raw.deleted),
    usageCount: asNumber(raw.usageCount),
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    domains: mapEntityRefs(raw.domains),
  };
}

export function listTags(query: ListTagsQuery = {}): Promise<Paged<ClassificationTag>> {
  return apiRequest<unknown>('/v1/tags', {
    query: {
      fields: TAG_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      parent: query.parent,
      disabled: query.disabled,
    },
  }).then((payload) => parsePaged(payload, mapTag));
}

/**
 * A classification tag carrying its display style (pin Tag.style).
 * Kept local to this module: the shared ClassificationTag shape is
 * outside this change's ownership, and only the tier picker reads
 * style.
 */
export interface TierTag extends ClassificationTag {
  style?: EntityStyle;
}

function mapTierTag(raw: Record<string, unknown>): TierTag | null {
  const base = mapTag(raw);
  if (!base) {
    return null;
  }
  const style = asRecord(raw.style);
  const color = style ? asString(style.color) || undefined : undefined;
  const iconURL = style ? asString(style.iconURL) || undefined : undefined;
  return {
    ...base,
    style: color || iconURL ? { color, iconURL } : undefined,
  };
}

/**
 * Pin TierCard fetch (getTags with parent 'Tier', limit 50,
 * disabled false): the enabled Tier classification tags. No fields
 * param is sent — the pin call sends none, yet reads tier.style, so
 * style needs no fields expansion.
 */
export function listTierTags(): Promise<Paged<TierTag>> {
  return apiRequest<unknown>('/v1/tags', {
    query: { parent: 'Tier', limit: 50, disabled: false },
  }).then((payload) => parsePaged(payload, mapTierTag));
}

export async function getTag(id: string): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tags/${encodeURIComponent(id)}`, {
    query: { fields: TAG_FIELDS },
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Tag response was missing id and name');
  }
  return mapped;
}

/**
 * Official getTagByFqn (rest/tagAPI.ts): GET /tags/name/{fqn}. The
 * AssetsTabs remove path resolves its active entity by FQN, so the
 * tag id for the add/remove calls comes from here, never from a
 * guessed id.
 */
export async function getTagByFqn(fqn: string): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tags/name/${getEncodedFqn(fqn)}`, {
    query: { fields: TAG_FIELDS },
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Tag response was missing id and name');
  }
  return mapped;
}

/**
 * Bulk tag-assets job response (server EntityResource.editAssetsAsync):
 * both add and remove answer 200 with a BulkAssetsOperationResponse
 * {jobId, message}; the edit itself runs in the background and reports
 * through the websocket. A 200 therefore means "job accepted", never
 * "the tag was updated" — callers must not map the body as a Tag.
 */
export interface TagAssetsJobResponse {
  jobId?: string;
  message?: string;
}

function mapTagAssetsJobResponse(raw: unknown): TagAssetsJobResponse {
  const rec = asRecord(raw) ?? {};
  return {
    jobId: asString(rec.jobId) || undefined,
    message: asString(rec.message) || undefined,
  };
}

/**
 * Official addAssetsToTags (rest/tagAPI.ts): PUT
 * /tags/{tagId}/assets/add with AddTagToAssetsRequest
 * {assets: EntityReference[], dryRun}. The server answers 200 with a
 * BulkAssetsOperationResponse {jobId, message} (pin's TS type says
 * CSVExportResponse; the fork server returns the job response — see
 * EntityResource.editAssetsAsync); the edit runs async, so callers
 * wait ES_UPDATE_DELAY before refreshing.
 */
export async function addAssetsToTags(
  tagId: string,
  assets: EntityRef[],
  dryRun = false,
): Promise<TagAssetsJobResponse> {
  const raw = await apiRequest<unknown>(`/v1/tags/${encodeURIComponent(tagId)}/assets/add`, {
    method: 'PUT',
    json: { assets, dryRun },
  });
  return mapTagAssetsJobResponse(raw);
}

/**
 * Official removeAssetsFromTags (rest/tagAPI.ts): PUT
 * /tags/{tagId}/assets/remove with {assets, dryRun: false}. Same job
 * response as add (200 = accepted); the updated Tag is NOT returned,
 * despite pin's TS type saying so.
 */
export async function removeAssetsFromTags(
  tagId: string,
  assets: EntityRef[],
): Promise<TagAssetsJobResponse> {
  const raw = await apiRequest<unknown>(
    `/v1/tags/${encodeURIComponent(tagId)}/assets/remove`,
    {
      method: 'PUT',
      json: { assets, dryRun: false },
    },
  );
  return mapTagAssetsJobResponse(raw);
}

export async function createTag(body: CreateTagRequest): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/tags', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Create tag succeeded but the response had no tag');
  }
  return mapped;
}

export async function updateTag(body: CreateTagRequest): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/tags', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Update tag succeeded but the response had no tag');
  }
  return mapped;
}

/** Official deleteTag (rest/tagAPI.ts): recursive=true&hardDelete=true. */
export function deleteTag(id: string): Promise<unknown> {
  return apiRequest(`/v1/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { recursive: true, hardDelete: true },
  });
}

/** Official patchTag (rest/tagAPI.ts): JSON Patch. */
export async function patchTag(id: string, patch: JsonPatchOp[]): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tags/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Patch tag succeeded but the response had no tag');
  }
  return mapped;
}
