/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, parsePaged } from '@/api/json';
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import type { Paged } from '@/types/admin';
import type { ActivityEvent, ActivityReaction, ConversationReply, CreatePostRequest } from '@/types/collaboration';
import { apiRequest } from './client';

function mapActivityReaction(raw: unknown): ActivityReaction | null {
  const rec = asRecord(raw);
  const reactionType = rec ? asString(rec.reactionType) : '';
  if (!reactionType) {
    return null;
  }
  const user = rec ? asRecord(rec.user) : undefined;
  return {
    reactionType,
    user: user
      ? {
          id: asString(user.id) || undefined,
          name: asString(user.name) || asString(user.displayName) || asString(user.id),
          displayName: asString(user.displayName) || undefined,
          type: asString(user.type) || undefined,
          fullyQualifiedName: asString(user.fullyQualifiedName) || undefined,
        }
      : undefined,
  };
}

function mapActivityReactions(value: unknown): ActivityReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const mapped = mapActivityReaction(item);
    return mapped ? [mapped] : [];
  });
}

function mapActivityEvent(raw: Record<string, unknown>): ActivityEvent | null {
  const id = asString(raw.id);
  const eventType = asString(raw.eventType);
  if (!id || !eventType) {
    return null;
  }
  const entity = asRecord(raw.entity);
  const actor = asRecord(raw.actor);
  return {
    id,
    eventType,
    timestamp: asNumber(raw.timestamp),
    summary: asString(raw.summary) || undefined,
    fieldName: asString(raw.fieldName) || undefined,
    oldValue: asString(raw.oldValue) || undefined,
    newValue: asString(raw.newValue) || undefined,
    about: asString(raw.about) || undefined,
    reactions: mapActivityReactions(raw.reactions),
    entity: entity
      ? {
          id: asString(entity.id) || undefined,
          name: asString(entity.name) || asString(entity.fullyQualifiedName) || asString(entity.id),
          displayName: asString(entity.displayName) || undefined,
          type: asString(entity.type) || undefined,
          fullyQualifiedName: asString(entity.fullyQualifiedName) || undefined,
        }
      : undefined,
    actor: actor
      ? {
          id: asString(actor.id) || undefined,
          name: asString(actor.name) || asString(actor.fullyQualifiedName) || asString(actor.id),
          displayName: asString(actor.displayName) || undefined,
          type: asString(actor.type) || undefined,
          fullyQualifiedName: asString(actor.fullyQualifiedName) || undefined,
        }
      : undefined,
  };
}

export function mapConversationReply(raw: Record<string, unknown>): ConversationReply | null {
  const id = asString(raw.id);
  const message = asString(raw.message);
  if (!id || !message) {
    return null;
  }
  const author = asRecord(raw.author);
  return {
    id,
    conversationId: asString(raw.conversationId) || undefined,
    message,
    createdAt: asNumber(raw.createdAt),
    reactions: mapActivityReactions(raw.reactions),
    author: author
      ? {
          id: asString(author.id) || undefined,
          name: asString(author.name) || asString(author.displayName) || asString(author.id),
          displayName: asString(author.displayName) || undefined,
          type: asString(author.type) || undefined,
          fullyQualifiedName: asString(author.fullyQualifiedName) || undefined,
        }
      : undefined,
  };
}

export interface ListActivityQuery {
  days?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  after?: string;
}

export function listActivityEvents(query: ListActivityQuery = {}): Promise<Paged<ActivityEvent>> {
  return apiRequest<unknown>('/v1/activity', {
    query: {
      days: query.days ?? 7,
      limit: query.limit ?? 50,
      entityType: query.entityType,
      entityId: query.entityId,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapActivityEvent));
}

export function listEntityActivity(
  entityType: string,
  fqn: string,
  query: { days?: number; limit?: number } = {},
): Promise<Paged<ActivityEvent>> {
  return apiRequest<unknown>(`/v1/activity/entity/${encodeURIComponent(entityType)}/name/${encodeFqnForApi(fqn)}`, {
    query: {
      days: query.days ?? 30,
      limit: query.limit ?? 50,
    },
  }).then((payload) => parsePaged(payload, mapActivityEvent));
}

export async function replyToActivity(id: string, body: CreatePostRequest): Promise<ConversationReply> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/activity/${encodeURIComponent(id)}/replies`, {
    method: 'POST',
    json: { message: body.message },
  });
  const mapped = mapConversationReply(raw);
  if (!mapped) {
    throw new Error('Activity reply succeeded but the response had no reply');
  }
  return mapped;
}

export function listActivityReplies(id: string): Promise<Paged<ConversationReply>> {
  return apiRequest<unknown>(`/v1/activity/${encodeURIComponent(id)}/replies`).then((payload) =>
    parsePaged(payload, mapConversationReply),
  );
}

function requireActivityEvent(raw: Record<string, unknown>, action: string): ActivityEvent {
  const mapped = mapActivityEvent(raw);
  if (!mapped) {
    throw new Error(`${action} succeeded but the response had no activity event`);
  }
  return mapped;
}

/**
 * Official add/removeActivityReaction (openmetadata-ui/.../rest/activityAPI.ts):
 * PUT / DELETE /v1/activity/{id}/reaction/{reactionType}, both returning the
 * activity event with updated reactions, so the UI echoes the response
 * instead of optimistically editing counts.
 */
export async function addActivityReaction(id: string, reactionType: string): Promise<ActivityEvent> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/activity/${encodeURIComponent(id)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'PUT' },
  );
  return requireActivityEvent(raw, 'Add activity reaction');
}

export async function removeActivityReaction(id: string, reactionType: string): Promise<ActivityEvent> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/activity/${encodeURIComponent(id)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'DELETE' },
  );
  return requireActivityEvent(raw, 'Remove activity reaction');
}
