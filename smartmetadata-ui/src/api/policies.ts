/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { AdminPolicy, Paged, PolicyRule } from '@/types/admin';
import { apiRequest } from './client';

/** Matches `PolicyResource.FIELDS` so list/detail include role and team refs. */
export const POLICY_FIELDS = 'owners,location,teams,roles';

export interface ListPoliciesQuery {
  limit?: number;
  after?: string;
}

function mapStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const text = asString(item);
    return text ? [text] : [];
  });
}

function mapRule(raw: Record<string, unknown>): PolicyRule | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  return {
    name,
    description: asString(raw.description) || undefined,
    effect: asString(raw.effect) || undefined,
    operations: mapStrings(raw.operations),
    resources: mapStrings(raw.resources),
    condition: asString(raw.condition) || undefined,
  };
}

export function mapPolicy(raw: Record<string, unknown>): AdminPolicy | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const ruleRows = Array.isArray(raw.rules) ? raw.rules : [];
  const disabled = asBoolean(raw.disabled);
  const enabled = asBoolean(raw.enabled);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    enabled: disabled === true ? false : enabled,
    deleted: asBoolean(raw.deleted),
    owners: mapEntityRefs(raw.owners),
    teams: mapEntityRefs(raw.teams),
    roles: mapEntityRefs(raw.roles),
    rules: ruleRows.flatMap((item) => {
      const rec = asRecord(item);
      const mapped = rec ? mapRule(rec) : null;
      return mapped ? [mapped] : [];
    }),
  };
}

export function listPolicies(query: ListPoliciesQuery = {}): Promise<Paged<AdminPolicy>> {
  return apiRequest<unknown>('/v1/policies', {
    query: {
      fields: POLICY_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapPolicy));
}

export async function getPolicy(id: string): Promise<AdminPolicy> {
  const raw = await apiRequest<unknown>(`/v1/policies/${encodeURIComponent(id)}`, {
    query: { fields: POLICY_FIELDS },
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapPolicy(rec) : null;
  if (!mapped) {
    throw new Error('Policy response was missing id and name');
  }
  return mapped;
}
