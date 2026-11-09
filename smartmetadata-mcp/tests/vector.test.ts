/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { RestClient } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';
import {
  attachMetricHierarchy,
  cleanVectorHit,
  collapseByParent,
  consumedThrough,
  fitResultsToBudget,
  slimCertification,
  slimRef,
  slimTag,
  truncateDescription,
  validateSemanticSearchParams,
} from '../src/vector.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
  readOnly: false,
  disabledTools: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('validateSemanticSearchParams', () => {
  it('requires a query', () => {
    expect(validateSemanticSearchParams(' ', {}, undefined)).toMatch(/'query' parameter is required/);
    expect(validateSemanticSearchParams(undefined, {}, undefined)).toMatch(/'query' parameter is required/);
  });

  it('rejects a filter passed at the top level', () => {
    expect(validateSemanticSearchParams('q', { entityType: ['table'] }, undefined)).toMatch(
      /must be nested under 'filters'/,
    );
  });

  it('rejects an unknown filter field and lists the supported ones', () => {
    expect(validateSemanticSearchParams('q', {}, { nope: ['x'] })).toMatch(
      /not a supported filter field/,
    );
  });

  it('accepts customProperties.* filters', () => {
    expect(validateSemanticSearchParams('q', {}, { 'customProperties.owner': ['a'] })).toBeNull();
  });
});

describe('slimRef / slimTag / slimCertification', () => {
  it('collapses a reference to its FQN and marks inheritance', () => {
    expect(slimRef({ fullyQualifiedName: 'svc.db', inherited: true })).toBe('svc.db (inherited)');
    expect(slimRef({ name: 'orders' })).toBe('orders');
    expect(slimRef('plain')).toBe('plain');
  });

  it('unquotes a single quoted FQN segment', () => {
    expect(slimRef({ fullyQualifiedName: '"vishnu.jain"' })).toBe('vishnu.jain');
    expect(slimRef({ fullyQualifiedName: 'a."b.c".d' })).toBe('a."b.c".d');
  });

  it('collapses a tag to its tagFQN', () => {
    expect(slimTag({ tagFQN: 'PII.Sensitive' })).toBe('PII.Sensitive');
    expect(slimTag([{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Tier.Gold' }])).toEqual([
      'PII.Sensitive',
      'Tier.Gold',
    ]);
  });

  it('adds an expiry suffix to a certification', () => {
    const now = Date.now();
    expect(
      slimCertification(
        { tagLabel: { tagFQN: 'Cert.Gold', metadata: { expiryDate: now + 86_400_000 } } },
        now,
      ),
    ).toMatch(/Cert\.Gold \(valid until \d{4}-\d{2}-\d{2}\)/);
    expect(
      slimCertification({ tagLabel: { tagFQN: 'Cert.Gold' }, expiryDate: now - 1_000 }, now),
    ).toMatch(/Cert\.Gold \(EXPIRED \d{4}-\d{2}-\d{2}\)/);
    expect(slimCertification({ tagLabel: { tagFQN: 'Cert.Gold' } }, now)).toBe(
      'Cert.Gold (expiry not in this index - check get_entity_details before trusting)',
    );
  });
});

describe('truncateDescription', () => {
  it('cuts an over-length description at 450 chars with an ellipsis', () => {
    const long = 'x'.repeat(600);
    expect(truncateDescription(long)).toBe('x'.repeat(450) + '...');
    expect(truncateDescription('short')).toBe('short');
  });
});

describe('cleanVectorHit', () => {
  it('keeps entity-level fields and drops bulk', () => {
    const hit = cleanVectorHit({
      entityType: 'table',
      fullyQualifiedName: 'svc.db.orders',
      name: 'orders',
      description: 'd',
      columns: [{ name: 'id' }, { name: 'total' }],
      columnNames: ['id'],
      embeddings: [0.1],
      textToLLMContext: 'noise',
      service: { fullyQualifiedName: 'svc' },
      tier: { tagFQN: 'Tier.Gold' },
      tags: [{ tagFQN: 'PII.Sensitive' }],
      _score: 0.9,
    });
    expect(hit).toEqual({
      entityType: 'table',
      fullyQualifiedName: 'svc.db.orders',
      name: 'orders',
      description: 'd',
      columnNames: ['id', 'total'],
      service: 'svc',
      tier: 'Tier.Gold',
      tags: ['PII.Sensitive'],
      similarityScore: 0.9,
    });
  });

  it('caps column names at 60 and metric code at 1000 chars', () => {
    const hit = cleanVectorHit({
      entityType: 'metric',
      fullyQualifiedName: 'm',
      columns: Array.from({ length: 80 }, (_, i) => ({ name: `c${i}` })),
      metricExpression: { code: 'y'.repeat(1500) },
    });
    expect((hit.columnNames as string[]).length).toBe(60);
    expect((hit.metricExpression as { code: string }).code).toBe('y'.repeat(1000) + '...');
  });

  it('resolves OTHER units from customUnitOfMeasurement', () => {
    const hit = cleanVectorHit({
      entityType: 'metric',
      fullyQualifiedName: 'm',
      unitOfMeasurement: 'OTHER',
      customUnitOfMeasurement: 'widgets',
    });
    expect(hit.unitOfMeasurement).toBe('widgets');
  });
});

describe('collapseByParent', () => {
  it('keeps one row per parent, best chunk first', () => {
    const collapsed = collapseByParent([
      { parentId: 'p1', fullyQualifiedName: 'a', name: 'a' },
      { parentId: 'p1', fullyQualifiedName: 'a', name: 'a2' },
      { fullyQualifiedName: 'b', name: 'b' },
      { fullyQualifiedName: 'b', name: 'b2' },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]?.name).toBe('a');
    expect(collapsed[1]?.name).toBe('b');
  });
});

describe('consumedThrough', () => {
  it('counts all ranked hits unless the budget kept fewer', () => {
    expect(consumedThrough(10, 10)).toBe(10);
    expect(consumedThrough(10, 6)).toBe(6);
    expect(consumedThrough(3, 0)).toBe(0);
  });
});

describe('fitResultsToBudget', () => {
  it('trims to the budget and says how many were withheld', () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      fullyQualifiedName: `e${i}`,
      description: 'x'.repeat(30_000),
    }));
    const result: Record<string, unknown> = { query: 'q', results, returnedCount: 5 };
    expect(fitResultsToBudget(result, results)).toBe(true);
    expect((result.results as unknown[]).length).toBeLessThan(5);
    expect(result.hasMore).toBe(true);
    expect(result.message).toMatch(/Returning \d of 5 results to stay within/);
  });

  it('leaves a small result untouched', () => {
    const results = [{ fullyQualifiedName: 'e0' }];
    const result: Record<string, unknown> = { query: 'q', results, returnedCount: 1 };
    expect(fitResultsToBudget(result, results)).toBe(false);
    expect(result.hasMore).toBeUndefined();
  });
});

describe('attachMetricHierarchy', () => {
  it('attaches parent/childrenCount/metricGroup and slims refs by default', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/v1/metrics/name/');
      return jsonResponse({
        parent: { fullyQualifiedName: 'parent.metric' },
        childrenCount: 2,
        metricGroup: { fullyQualifiedName: 'group.g' },
      });
    });
    const client = new RestClient(config, fetchImpl);
    const hits: Array<Record<string, unknown>> = [
      { entityType: 'metric', fullyQualifiedName: 'm.one' },
      { entityType: 'table', fullyQualifiedName: 't.one' },
    ];
    const result: Record<string, unknown> = {};
    await attachMetricHierarchy(client, hits, result);
    expect(hits[0]?.parent).toBe('parent.metric');
    expect(hits[0]?.childrenCount).toBe(2);
    expect(hits[0]?.metricGroup).toBe('group.g');
    expect(hits[1]?.parent).toBeUndefined();
    expect(result.metricHierarchyNote).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps full reference objects when slim is false', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ parent: { fullyQualifiedName: 'p', id: '1' }, childrenCount: 0 }),
    );
    const client = new RestClient(config, fetchImpl);
    const hits: Array<Record<string, unknown>> = [
      { entityType: 'metric', fullyQualifiedName: 'm.one' },
    ];
    await attachMetricHierarchy(client, hits, {}, { slim: false });
    expect(hits[0]?.parent).toEqual({ fullyQualifiedName: 'p', id: '1' });
  });

  it('degrades to a note instead of failing the batch when a read fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = new RestClient(config, fetchImpl);
    const hits: Array<Record<string, unknown>> = [
      { entityType: 'metric', fullyQualifiedName: 'm.one' },
    ];
    const result: Record<string, unknown> = {};
    await attachMetricHierarchy(client, hits, result);
    expect(hits[0]?.parent).toBeUndefined();
    expect(result.metricHierarchyNote).toMatch(/Some metric hits carry no parent/);
  });

  it('caps the batch at 10 metrics and notes the cap', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ childrenCount: 0 }));
    const client = new RestClient(config, fetchImpl);
    const hits: Array<Record<string, unknown>> = Array.from({ length: 12 }, (_, i) => ({
      entityType: 'metric',
      fullyQualifiedName: `m.${i}`,
    }));
    const result: Record<string, unknown> = {};
    await attachMetricHierarchy(client, hits, result);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(result.metricHierarchyNote).toMatch(/more than 10 metric hits/);
  });
});
