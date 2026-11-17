/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, mapEntityRef } from '@/api/json';
import type { EntityRef } from '@/types/api';
import type { ServiceKind } from '@/types/ingestion';
import { apiRequest } from './client';
import { SERVICE_COLLECTION_BY_KIND } from './serviceVersions';

/**
 * Pin addServiceFollower / removeServiceFollower
 * (rest/serviceAPI.ts): PUT /v1/services/{collection}/{id}/followers
 * with the user id as a JSON string body, and DELETE
 * /v1/services/{collection}/{id}/followers/{userId}. The server
 * answers with the updated service carrying a changeDescription;
 * the response is returned unmapped because the follow merge reads
 * changeDescription, which the service mappers do not carry.
 *
 * The follow display rule (database kind, not deleted) is
 * render-level only and is deliberately not enforced here.
 */
export async function followService(
  kind: ServiceKind,
  id: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  return apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${encodeURIComponent(id)}/followers`,
    { method: 'PUT', json: userId },
  );
}

export async function unfollowService(
  kind: ServiceKind,
  id: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  return apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${encodeURIComponent(id)}/followers/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

/** Follow state is membership of the current user id in the followers list. */
export function isServiceFollowing(followers: EntityRef[] | undefined, userId: string): boolean {
  return (followers ?? []).some((follower) => follower.id === userId);
}

function changeDescription(payload: Record<string, unknown>): Record<string, unknown> {
  const description = asRecord(payload.changeDescription);
  if (!description) {
    throw new Error('Follow response carried no changeDescription to merge');
  }
  return description;
}

/**
 * Pin classic follow merge (ServiceDetailsPage.tsx): append every
 * entity reference the server reports in
 * `changeDescription.fieldsAdded[0].newValue`, which is an ARRAY
 * (`[...followers, ...newValue]`).
 */
export function applyFollowChange(
  followers: EntityRef[],
  payload: Record<string, unknown>,
): EntityRef[] {
  const added = changeDescription(payload).fieldsAdded;
  const first = Array.isArray(added) ? added[0] : undefined;
  const newValue = asRecord(first)?.newValue;
  const addedRefs = Array.isArray(newValue)
    ? newValue.flatMap((item) => {
        const ref = mapEntityRef(item);
        return ref ? [ref] : [];
      })
    : [];
  if (addedRefs.length === 0) {
    throw new Error('Follow response carried no added follower in changeDescription');
  }
  return [...followers, ...addedRefs];
}

/**
 * Pin classic unfollow merge (ServiceDetailsPage.tsx): drop the
 * follower whose id matches
 * `changeDescription.fieldsDeleted[0].oldValue[0].id`.
 */
export function applyUnfollowChange(
  followers: EntityRef[],
  payload: Record<string, unknown>,
): EntityRef[] {
  const deleted = changeDescription(payload).fieldsDeleted;
  const first = Array.isArray(deleted) ? deleted[0] : undefined;
  const oldValue = asRecord(first)?.oldValue;
  const removed = Array.isArray(oldValue) ? oldValue[0] : undefined;
  const removedId = asRecord(removed)?.id;
  if (typeof removedId !== 'string' || !removedId) {
    throw new Error('Unfollow response carried no removed follower in changeDescription');
  }
  return followers.filter((follower) => follower.id !== removedId);
}
