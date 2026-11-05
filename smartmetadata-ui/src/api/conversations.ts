/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mapConversationReply } from '@/api/activity';
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  ActivityReaction,
  Conversation,
  ConversationReply,
  CreateConversationRequest,
  CreatePostRequest,
} from '@/types/collaboration';
import { apiRequest } from './client';

export interface ListConversationsQuery {
  entityLink?: string;
  limit?: number;
  after?: string;
  resolved?: boolean;
}

function mapConversationReactions(value: unknown): ActivityReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    const reactionType = rec ? asString(rec.reactionType) : '';
    if (!rec || !reactionType) {
      return [];
    }
    return [
      {
        reactionType,
        user: mapEntityRefs(rec.user ? [rec.user] : [])[0],
      },
    ];
  });
}

function mapConversation(raw: Record<string, unknown>): Conversation | null {
  const id = asString(raw.id);
  const about = asString(raw.about);
  if (!id || !about) {
    return null;
  }
  const replies = Array.isArray(raw.replies)
    ? raw.replies.flatMap((item) => {
        const rec = asRecord(item);
        const mapped = rec ? mapConversationReply(rec) : null;
        return mapped ? [mapped] : [];
      })
    : [];
  return {
    id,
    source: asString(raw.source) || undefined,
    about,
    message: asString(raw.message) || undefined,
    createdAt: asNumber(raw.createdAt),
    updatedAt: asNumber(raw.updatedAt),
    resolved: asBoolean(raw.resolved),
    replyCount: asNumber(raw.replyCount),
    entityRef: mapEntityRefs(raw.entityRef ? [raw.entityRef] : [])[0],
    createdBy: mapEntityRefs(raw.createdBy ? [raw.createdBy] : [])[0],
    replies,
    reactions: mapConversationReactions(raw.reactions),
  };
}

export function listConversations(query: ListConversationsQuery = {}): Promise<Paged<Conversation>> {
  return apiRequest<unknown>('/v1/conversations', {
    query: {
      entityLink: query.entityLink,
      limit: query.limit ?? 20,
      after: query.after,
      resolved: query.resolved,
    },
  }).then((payload) => parsePaged(payload, mapConversation));
}

export async function createConversation(body: CreateConversationRequest): Promise<Conversation> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/conversations', {
    method: 'POST',
    json: { message: body.message, about: body.about },
  });
  const mapped = mapConversation(raw);
  if (!mapped) {
    throw new Error('Create conversation succeeded but the response had no conversation');
  }
  return mapped;
}

export async function createConversationReply(id: string, body: CreatePostRequest): Promise<ConversationReply> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/conversations/${encodeURIComponent(id)}/replies`, {
    method: 'POST',
    json: { message: body.message },
  });
  const mapped = mapConversationReply(raw);
  if (!mapped) {
    throw new Error('Conversation reply succeeded but the response had no reply');
  }
  return mapped;
}

export interface ListConversationRepliesQuery {
  limit?: number;
  after?: string;
}

/**
 * Official conversationsAPI.ts:91,102,161,173 — conversation and reply
 * reactions. PUT adds, DELETE removes; both return the updated
 * conversation / reply, so the UI echoes the response (same pattern as
 * the activity-event reactions in api/activity.ts).
 */
export async function addConversationReaction(id: string, reactionType: string): Promise<Conversation> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/conversations/${encodeURIComponent(id)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'PUT' },
  );
  const mapped = mapConversation(raw);
  if (!mapped) {
    throw new Error('Add conversation reaction succeeded but the response had no conversation');
  }
  return mapped;
}

export async function removeConversationReaction(id: string, reactionType: string): Promise<Conversation> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/conversations/${encodeURIComponent(id)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'DELETE' },
  );
  const mapped = mapConversation(raw);
  if (!mapped) {
    throw new Error('Remove conversation reaction succeeded but the response had no conversation');
  }
  return mapped;
}

export function listConversationReplies(
  id: string,
  query: ListConversationRepliesQuery = {},
): Promise<Paged<ConversationReply>> {
  return apiRequest<unknown>(`/v1/conversations/${encodeURIComponent(id)}/replies`, {
    query: {
      limit: query.limit ?? 20,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapConversationReply));
}

export async function addConversationReplyReaction(
  id: string,
  replyId: string,
  reactionType: string,
): Promise<ConversationReply> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/conversations/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'PUT' },
  );
  const mapped = mapConversationReply(raw);
  if (!mapped) {
    throw new Error('Add conversation reply reaction succeeded but the response had no reply');
  }
  return mapped;
}

export async function removeConversationReplyReaction(
  id: string,
  replyId: string,
  reactionType: string,
): Promise<ConversationReply> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/conversations/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}/reaction/${encodeURIComponent(reactionType)}`,
    { method: 'DELETE' },
  );
  const mapped = mapConversationReply(raw);
  if (!mapped) {
    throw new Error('Remove conversation reply reaction succeeded but the response had no reply');
  }
  return mapped;
}
