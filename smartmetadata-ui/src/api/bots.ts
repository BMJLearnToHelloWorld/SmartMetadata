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
import type {
  AdminBot,
  CreateBotRequest,
  CreateUserRequest,
  JwtAuthMechanism,
  JwtTokenExpiry,
  Paged,
} from '@/types/admin';
import { ApiError, apiRequest } from './client';
import { createUser } from './users';

function mapBot(raw: Record<string, unknown>): AdminBot | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const botUserRefs = mapEntityRefs(raw.botUser ? [raw.botUser] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    deleted: asBoolean(raw.deleted),
    botUser: botUserRefs[0],
  };
}

function mapJwt(raw: unknown): JwtAuthMechanism {
  const rec = asRecord(raw) ?? {};
  return {
    JWTToken: asString(rec.JWTToken) || undefined,
    JWTTokenExpiry: asString(rec.JWTTokenExpiry) || undefined,
    JWTTokenExpiresAt: asNumber(rec.JWTTokenExpiresAt),
  };
}

export function listBots(limit = 25, after?: string): Promise<Paged<AdminBot>> {
  return apiRequest<unknown>('/v1/bots', {
    query: { limit, after },
  }).then((payload) => parsePaged(payload, mapBot));
}

export async function getBot(id: string): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/bots/${encodeURIComponent(id)}`);
  const mapped = mapBot(raw);
  if (!mapped) {
    throw new Error('Bot response was missing id and name');
  }
  return mapped;
}

/**
 * CreateBot requires an existing bot user (`botUser` is a user name).
 * This creates the bot user first, then POST /v1/bots.
 */
export async function createBotWithUser(body: CreateBotRequest): Promise<AdminBot> {
  const userBody: CreateUserRequest = {
    name: body.botUser,
    email: body.botUserEmail,
    displayName: body.displayName || body.botUser,
    description: body.description,
    isBot: true,
    isAdmin: false,
  };
  try {
    await createUser(userBody);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) {
      throw error;
    }
  }
  const raw = await apiRequest<Record<string, unknown>>('/v1/bots', {
    method: 'POST',
    json: {
      name: body.name,
      botUser: body.botUser,
      displayName: body.displayName,
      description: body.description,
    },
  });
  const mapped = mapBot(raw);
  if (!mapped) {
    throw new Error('Create bot succeeded but the response had no bot');
  }
  return mapped;
}

export function generateBotToken(botUserId: string, expiry: JwtTokenExpiry): Promise<JwtAuthMechanism> {
  return apiRequest<unknown>(`/v1/users/generateToken/${encodeURIComponent(botUserId)}`, {
    method: 'PUT',
    json: { JWTTokenExpiry: expiry },
  }).then(mapJwt);
}

export function revokeBotToken(botUserId: string): Promise<unknown> {
  return apiRequest('/v1/users/revokeToken', {
    method: 'PUT',
    json: { id: botUserId },
  });
}

export function getBotToken(botUserId: string): Promise<JwtAuthMechanism> {
  return apiRequest<unknown>(`/v1/users/token/${encodeURIComponent(botUserId)}`).then(mapJwt);
}
