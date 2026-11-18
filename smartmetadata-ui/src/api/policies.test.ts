/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  createPolicy,
  deletePolicy,
  getPolicy,
  getPolicyByName,
  getPolicyFunctions,
  getPolicyResources,
  listPolicies,
  mapPolicy,
  POLICY_FIELDS,
  validateRuleCondition,
} from './policies';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

const samplePolicy = {
  id: 'p1',
  name: 'DataConsumerPolicy',
  displayName: 'Data Consumer',
  description: 'Read catalog assets',
  enabled: true,
  owners: [{ name: 'admin', type: 'user' }],
  roles: [{ id: 'r1', name: 'DataConsumer' }],
  teams: [],
  rules: [
    {
      name: 'DataConsumerPolicy-Rule',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['all'],
      condition: 'isOwner()',
    },
  ],
};

describe('policies API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps a policy and its rules without inventing operations', () => {
    expect(mapPolicy(samplePolicy)).toMatchObject({
      id: 'p1',
      name: 'DataConsumerPolicy',
      enabled: true,
      rules: [{ name: 'DataConsumerPolicy-Rule', effect: 'allow', operations: ['ViewAll'] }],
    });
    expect(mapPolicy({ displayName: 'orphan' })).toBeNull();
    expect(mapPolicy({ name: 'bare' })).toMatchObject({ name: 'bare', rules: [], enabled: undefined });
  });

  it('treats disabled system policies as not enabled', () => {
    expect(mapPolicy({ name: 'sys', disabled: true, enabled: true })?.enabled).toBe(false);
  });

  it('lists policies from GET /v1/policies with default fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [samplePolicy], paging: { total: 1, after: 'c1' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const page = await listPolicies({ limit: 25 });
    expect(page.data[0]?.name).toBe('DataConsumerPolicy');
    expect(page.data[0]?.rules).toHaveLength(1);
    expect(page.after).toBe('c1');
    const url = decodeURIComponent(lastFetch());
    expect(url).toContain('/api/v1/policies');
    expect(url).toContain(`fields=${POLICY_FIELDS}`);
    expect(url).toContain('limit=25');
  });

  it('returns an empty page when GET /v1/policies has no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(listPolicies()).resolves.toEqual({ data: [], after: undefined, before: undefined, total: undefined });
  });

  it('gets one policy from GET /v1/policies/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(samplePolicy), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const policy = await getPolicy('p1');
    expect(policy.roles[0]?.name).toBe('DataConsumer');
    expect(decodeURIComponent(lastFetch())).toContain('/api/v1/policies/p1');
  });

  it('creates a policy with POST /v1/policies', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(samplePolicy), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const created = await createPolicy({
      name: 'DataConsumerPolicy',
      rules: [{ name: 'DataConsumerPolicy-Rule', effect: 'allow', operations: ['ViewAll'], resources: ['all'] }],
    });
    expect(created.name).toBe('DataConsumerPolicy');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/policies');
    expect(init?.method).toBe('POST');
  });

  it('deletes a policy with the hardDelete/recursive wire', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await deletePolicy('p1');
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/policies/p1?hardDelete=true&recursive=false');
    expect(init?.method).toBe('DELETE');
  });

  it('carries the entity FQN verbatim and keeps rule FQNs', () => {
    const mapped = mapPolicy({
      ...samplePolicy,
      fullyQualifiedName: 'DataConsumerPolicy',
      rules: [
        {
          name: 'DataConsumerPolicy-Rule',
          effect: 'allow',
          operations: ['ViewAll'],
          resources: ['all'],
          fullyQualifiedName: 'DataConsumerPolicy.DataConsumerPolicy-Rule',
        },
      ],
    });
    expect(mapped?.fullyQualifiedName).toBe('DataConsumerPolicy');
    expect(mapped?.rules[0]?.fullyQualifiedName).toBe('DataConsumerPolicy.DataConsumerPolicy-Rule');
  });

  it('gets one policy by name with the requested fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(samplePolicy), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const policy = await getPolicyByName('DataConsumerPolicy', POLICY_FIELDS);
    expect(policy.name).toBe('DataConsumerPolicy');
    const url = decodeURIComponent(lastFetch());
    expect(url).toContain('/api/v1/policies/name/DataConsumerPolicy');
    expect(url).toContain(`fields=${POLICY_FIELDS}`);
  });

  it('fetches policy resources and functions for the rule form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/policies/resources')) {
          return new Response(
            JSON.stringify([{ name: 'table', operations: ['ViewAll', 'Create'] }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify([{ name: 'isOwner', examples: ['isOwner()'] }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await expect(getPolicyResources()).resolves.toEqual([{ name: 'table', operations: ['ViewAll', 'Create'] }]);
    await expect(getPolicyFunctions()).resolves.toEqual([{ name: 'isOwner', examples: ['isOwner()'] }]);
  });

  it('validates a rule condition with the raw interpolated expression', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(validateRuleCondition('isOwner()')).resolves.toBeUndefined();
    // The pin interpolates without URL encoding (rolesAPIV1.ts:174-186).
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/policies/validation/condition/isOwner()');
  });

  it('rejects on an invalid condition so the caller reads the error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Invalid expression' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(validateRuleCondition('nope(')).rejects.toMatchObject({ status: 400 });
  });
});
