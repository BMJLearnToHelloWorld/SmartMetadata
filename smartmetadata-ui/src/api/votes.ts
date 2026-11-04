/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { resolveVotePath } from '@/catalog/entityRoutes';
import type { EntityVotes } from '@/types/api';
import { apiRequest } from './client';

/** Official vote type (openmetadata-spec type/votes.json#/definitions/voteType). */
export type VoteType = 'votedUp' | 'votedDown' | 'unVoted';

/**
 * Official getEntityVoteStatus (openmetadata-ui/.../utils/EntityVoteUtils.ts):
 * the current user's vote comes from the voter lists, never from counts.
 */
export function getVoteStatus(userId: string, votes?: EntityVotes): VoteType {
  if (!votes) {
    return 'unVoted';
  }
  if ((votes.upVoters ?? []).some((user) => user.id === userId)) {
    return 'votedUp';
  }
  if ((votes.downVoters ?? []).some((user) => user.id === userId)) {
    return 'votedDown';
  }
  return 'unVoted';
}

/**
 * Official updateVote: PUT /v1/{collection}/{id}/vote with
 * { updatedVoteType }. The server answers a ChangeEvent, not the entity,
 * so callers reload the asset for authoritative counts — the same pattern
 * as follow/unfollow in this console.
 */
export async function voteAsset(
  entityType: string,
  id: string,
  updatedVoteType: VoteType,
): Promise<unknown> {
  const path = resolveVotePath(entityType, id);
  if (!path) {
    throw new Error(`No vote endpoint for entity type "${entityType}"`);
  }
  return apiRequest(path, {
    method: 'PUT',
    json: { updatedVoteType },
  });
}
