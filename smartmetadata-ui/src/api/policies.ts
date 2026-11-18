/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type {
  AdminPolicy,
  CreatePolicyRequest,
  Paged,
  PolicyRule,
} from '@/types/admin';
import { apiRequest } from './client';
import { deleteEntity } from './entityDelete';
import { mapAdminEntityRefs } from './users';

/** Matches `PolicyResource.FIELDS` so list/detail include role and team refs. */
export const POLICY_FIELDS = 'owners,location,teams,roles';

export interface ListPoliciesQuery {
  limit?: number;
  after?: string;
  before?: string;
  fields?: string;
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
    // P6j-R future-write preservation (03 §14.3): an existing FQN is
    // carried verbatim; nothing here rebuilds one from the name.
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
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
    // 03 §2.1: the entity FQN is carried verbatim, never derived from name.
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    owners: mapAdminEntityRefs(raw.owners),
    teams: mapAdminEntityRefs(raw.teams),
    roles: mapAdminEntityRefs(raw.roles),
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
      fields: query.fields ?? POLICY_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
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

/** Official getPolicyByName (rest/rolesAPIV1.ts:108-117): GET /policies/name/{fqn}?fields=. */
export async function getPolicyByName(fqn: string, fields: string): Promise<AdminPolicy> {
  const raw = await apiRequest<unknown>(`/v1/policies/name/${encodeURIComponent(fqn)}`, {
    query: { fields },
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapPolicy(rec) : null;
  if (!mapped) {
    throw new Error('Policy response was missing id and name');
  }
  return mapped;
}

export async function createPolicy(body: CreatePolicyRequest): Promise<AdminPolicy> {
  const raw = await apiRequest<unknown>('/v1/policies', {
    method: 'POST',
    json: body,
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapPolicy(rec) : null;
  if (!mapped) {
    throw new Error('Create policy succeeded but the response had no policy');
  }
  return mapped;
}

/** Wire-level delete through the shared helper (03 §2.2); views use hardDeleteEntity for the toast + boolean contract. */
export function deletePolicy(id: string, recursive = false): Promise<unknown> {
  return deleteEntity('policy', id, recursive);
}

/**
 * Official patchPolicy (rest/rolesAPIV1.ts:147-155): JSON Patch on the
 * policy. Rule pages build the ops with an explicit /rules replace
 * (03 §2.3); the equivalence wording is "same end state and change
 * record under a single writer, different wire shape", never
 * byte-identical to the pin compare() output.
 */
export async function patchPolicy(id: string, patch: JsonPatchOp[]): Promise<AdminPolicy> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/policies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapPolicy(raw);
  if (!mapped) {
    throw new Error('Patch policy succeeded but the response had no policy');
  }
  return mapped;
}

/** Resource descriptor from GET /v1/policies/resources (PolicyResource.java:323-332). */
export interface PolicyResourceDescriptor {
  name: string;
  operations: string[];
}

/** Official getPolicyResources (rest/rolesAPIV1.ts:157-164). */
export async function getPolicyResources(): Promise<PolicyResourceDescriptor[]> {
  const payload = await apiRequest<unknown>('/v1/policies/resources');
  const rows = Array.isArray(payload) ? payload : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : '';
    if (!name) {
      return [];
    }
    return [{ name, operations: mapStrings(rec?.operations) }];
  });
}

/** Policy function from GET /v1/policies/functions (PolicyResource.java:334-343). Only the fields the rule form consumes are mapped. */
export interface PolicyFunctionDescriptor {
  name: string;
  examples: string[];
}

/** Official getPolicyFunctions (rest/rolesAPIV1.ts:166-172). */
export async function getPolicyFunctions(): Promise<PolicyFunctionDescriptor[]> {
  const payload = await apiRequest<unknown>('/v1/policies/functions');
  const rows = Array.isArray(payload) ? payload : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : '';
    if (!name) {
      return [];
    }
    return [{ name, examples: mapStrings(rec?.examples) }];
  });
}

/**
 * Official validateRuleCondition (rest/rolesAPIV1.ts:174-186): GET
 * `/policies/validation/condition/{expression}` with the condition
 * interpolated RAW — the pin performs no URL encoding, and neither
 * does this. A resolved promise means valid (200/204); `apiRequest`
 * throws `ApiError` otherwise, and the caller reads the error text.
 * The pin's "non-200/204 response that did not throw" branch cannot
 * occur under the fetch throw-on-error model.
 */
export function validateRuleCondition(condition: string): Promise<unknown> {
  return apiRequest<unknown>(`/v1/policies/validation/condition/${condition}`);
}
