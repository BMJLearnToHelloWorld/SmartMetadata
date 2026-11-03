/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { EntityRef, Paged } from '@/types/api';
import type { CreatePersonaRequest, Persona } from '@/types/persona';
import { apiRequest } from './client';

/** Official PersonaAPI list fields: the list page reads users. */
export const PERSONA_LIST_FIELDS = 'users';

export interface ListPersonasQuery {
  limit?: number;
  after?: string;
  before?: string;
  fields?: string;
}

function mapPersona(raw: Record<string, unknown>): Persona | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const users = mapEntityRefs(raw.users);
  const domains = mapEntityRefs(raw.domains);
  return {
    id,
    name,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    users: users.length ? users : undefined,
    default: typeof raw.default === 'boolean' ? raw.default : undefined,
    domains: domains.length ? domains : undefined,
  };
}

/** Official getAllPersonas (rest/PersonaAPI.ts): GET /v1/personas. */
export function listPersonas(query: ListPersonasQuery = {}): Promise<Paged<Persona>> {
  return apiRequest<unknown>('/v1/personas', {
    query: {
      fields: query.fields ?? PERSONA_LIST_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapPersona));
}

/** Official searchPersonas: GET /v1/personas/search?q&limit&offset=0. */
export async function searchPersonas(query: string, limit = 25): Promise<Persona[]> {
  const payload = await apiRequest<unknown>('/v1/personas/search', {
    query: { q: query || undefined, limit, offset: 0 },
  });
  return parsePaged(payload, mapPersona).data;
}

/**
 * Official getPersonaByName: GET /v1/personas/name/{fqn}, default fields
 * users,contextDefinition (contextDefinition is not mapped: the AI
 * context surface belongs to the context-center group).
 */
export async function getPersonaByName(fqn: string, fields?: string): Promise<Persona> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/personas/name/${encodeURIComponent(fqn)}`,
    { query: { fields: fields ?? 'users,contextDefinition' } },
  );
  const mapped = mapPersona(raw);
  if (!mapped) {
    throw new Error('Persona response was missing id and name');
  }
  return mapped;
}

/** Official createPersona: POST /v1/personas. */
export async function createPersona(data: CreatePersonaRequest): Promise<Persona> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/personas', { json: data });
  const mapped = mapPersona(raw);
  if (!mapped) {
    throw new Error('Create persona succeeded but the response had no persona');
  }
  return mapped;
}

/**
 * Official updatePersona: PATCH /v1/personas/{id} with JSON Patch ops.
 * Callers build the ops for exactly the fields they changed (users,
 * displayName, description, default); there is no whole-object PUT.
 */
export async function updatePersona(id: string, patch: JsonPatchOp[]): Promise<Persona> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/personas/${encodeURIComponent(id)}`,
    { method: 'PATCH', json: patch, contentType: 'application/json-patch+json' },
  );
  const mapped = mapPersona(raw);
  if (!mapped) {
    throw new Error('Update persona succeeded but the response had no persona');
  }
  return mapped;
}

/**
 * Replace-op builder for a persona's member list (detail users tab).
 * The value carries the full references, as the official detail page's
 * whole-object diff does — not id stubs.
 */
export function personaUsersPatch(users: EntityRef[]): JsonPatchOp[] {
  return [{ op: 'replace', path: '/users', value: users }];
}
