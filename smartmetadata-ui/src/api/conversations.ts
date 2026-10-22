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
