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
  analyzeRootCause,
  annotateCompleteness,
  enforceSizeBudget,
  entityFqnFromEntityLink,
  failingTestsForNode,
  slimEdge,
  slimNodeEntity,
  summarizeRca,
} from '../src/rootCause.js';

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

describe('entityFqnFromEntityLink', () => {
  it('takes the second :: segment, with or without a column', () => {
    expect(entityFqnFromEntityLink('<#E::table::svc.db.orders>')).toBe('svc.db.orders');
    expect(entityFqnFromEntityLink('<#E::table::svc.db.orders::columns::total>')).toBe(
      'svc.db.orders',
    );
    expect(entityFqnFromEntityLink('not-a-link')).toBeNull();
    expect(entityFqnFromEntityLink(undefined)).toBeNull();
  });
});

describe('slimNodeEntity', () => {
  it('drops bulk and vector noise but keeps the description whole', () => {
    const slim = slimNodeEntity({
      fullyQualifiedName: 'svc.db.orders',
      description: 'd',
      columns: [{ name: 'id' }],
      embeddings: [0.1],
      textToLLMContext: 'noise',
      domains: [{ name: 'x' }],
      owners: [{ name: 'ada' }],
    });
    expect(slim).toEqual({
      fullyQualifiedName: 'svc.db.orders',
      description: 'd',
      owners: [{ name: 'ada' }],
    });
  });
});

describe('slimEdge', () => {
  it('keeps identity triples, folds the pipeline, keeps SQL in full', () => {
    const slim = slimEdge(
      {
        fromEntity: { id: '1', fullyQualifiedName: 'a', type: 'table', extra: 'drop' },
        toEntity: { id: '2', fullyQualifiedName: 'b', type: 'table' },
        pipeline: { type: 'pipeline', name: 'ingest' },
        source: 'manual',
        description: '',
        sqlQuery: 'SELECT 1',
        sqlQueryKey: 'k1',
        columns: [{ fromColumn: 'x' }],
      },
      false,
    );
    expect(slim).toEqual({
      fromEntity: { id: '1', fullyQualifiedName: 'a', type: 'table' },
      toEntity: { id: '2', fullyQualifiedName: 'b', type: 'table' },
      relationshipType: 'pipeline:ingest',
      source: 'manual',
      sqlQuery: 'SELECT 1',
      sqlQueryKey: 'k1',
    });
  });

  it('defaults the relationship to sql and adds columns only when asked', () => {
    expect(slimEdge({}, false).relationshipType).toBe('sql');
    expect(slimEdge({ columns: [] }, true).columns).toEqual([]);
    expect(slimEdge({ columns: [] }, false).columns).toBeUndefined();
  });
});

describe('annotateCompleteness', () => {
  it('states the count and whether the set is complete', () => {
    const tests: Record<string, unknown> = {};
    annotateCompleteness(tests, 3, false);
    expect(tests).toEqual({ failingTestCount: 3, complete: true });
    annotateCompleteness(tests, 100, true);
    expect(tests.complete).toBe(false);
    expect(tests.completeNote).toMatch(/stops at 100 test cases/);
  });
});

describe('summarizeRca', () => {
  it('distinguishes upstream, local and clean verdicts', () => {
    expect(summarizeRca('f', 2, false)).toMatch(/Found 2 failing upstream entity\(ies\)/);
    expect(summarizeRca('f', 0, true)).toMatch(/failures originate on this asset itself/);
    expect(summarizeRca('f', 0, false)).toMatch(/No failing tests found/);
  });
});

describe('failingTestsForNode', () => {
  it('says so when no test suite is attached', async () => {
    const client = new RestClient(config, vi.fn());
    const result = await failingTestsForNode(client, { fullyQualifiedName: 'svc.db.orders' });
    expect(result).toEqual({
      note: 'No test suite is attached to this asset, so no test results could be read.',
    });
  });

  it('reads the latest failing results and filters by entity link', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            entityLink: '<#E::table::svc.db.orders>',
            testCaseResult: { testCaseStatus: 'Failed', result: 'x' },
          },
          {
            entityLink: '<#E::table::svc.db.other>',
            testCaseResult: { testCaseStatus: 'Failed', result: 'y' },
          },
        ],
        paging: { total: 2 },
      }),
    );
    const client = new RestClient(config, fetchImpl);
    const result = await failingTestsForNode(client, {
      fullyQualifiedName: 'svc.db.orders',
      testSuite: { id: 'suite-1' },
    });
    expect(result.testCaseResults).toEqual([{ testCaseStatus: 'Failed', result: 'x' }]);
    expect(result.testSuiteId).toBe('suite-1');
    expect(result.resultsTruncated).toBeUndefined();
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('/v1/dataQuality/testCases?');
    expect(url).toContain('testSuiteId=suite-1');
    expect(url).toContain('testCaseStatus=Failed');
    expect(url).toContain('fields=testCaseResult');
    expect(url).not.toContain('entityFQN');
  });

  it('marks truncation from the paging total', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            entityLink: '<#E::table::svc.db.orders>',
            testCaseResult: { testCaseStatus: 'Failed' },
          },
        ],
        paging: { total: 150 },
      }),
    );
    const client = new RestClient(config, fetchImpl);
    const result = await failingTestsForNode(client, {
      fullyQualifiedName: 'svc.db.orders',
      testSuite: { id: 'suite-1' },
    });
    expect(result.resultsTruncated).toBe(true);
  });

  it('says the backend could not be reached instead of reporting none failing', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = new RestClient(config, fetchImpl);
    const result = await failingTestsForNode(client, {
      fullyQualifiedName: 'svc.db.orders',
      testSuite: { id: 'suite-1' },
    });
    expect(result.unavailable).toMatch(/could not be reached/);
  });
});

describe('enforceSizeBudget', () => {
  it('leaves a small analysis untouched', () => {
    const result = { fqn: 'f', status: 'success', summary: 's' };
    expect(enforceSizeBudget(result)).toBe(result);
  });

  it('trims edges to the budget and records how many were returned', () => {
    const bigEdge = { fromEntity: { id: 'a' }, toEntity: { id: 'b' }, sqlQuery: 'x'.repeat(30_000) };
    const result: Record<string, unknown> = {
      fqn: 'f',
      status: 'failed',
      summary: 's',
      upstreamAnalysis: {
        failingUpstreamEdges: [bigEdge, bigEdge, bigEdge, bigEdge],
        failingUpstreamEdgesCount: 4,
      },
      downstreamAnalysis: { downstreamEdges: [bigEdge, bigEdge] },
    };
    const out = enforceSizeBudget(result);
    expect(out.truncated).toBe(true);
    expect(
      (out.upstreamAnalysis as { failingUpstreamEdgesReturned?: number }).failingUpstreamEdgesReturned,
    ).toBeLessThan(4);
  });

  it('falls back to the minimal hint when the non-edge content alone overflows', () => {
    const result: Record<string, unknown> = {
      fqn: 'f',
      upstreamDepth: 3,
      downstreamDepth: 3,
      status: 'failed',
      summary: 's',
      upstreamAnalysis: { description: 'x'.repeat(120_000) },
      downstreamAnalysis: {},
    };
    const out = enforceSizeBudget(result);
    expect(out.message).toMatch(/exceeds the size budget/);
    expect(out.truncated).toBe(true);
    expect(out.upstreamAnalysis).toBeUndefined();
  });
});

describe('analyzeRootCause', () => {
  const dqWalk = {
    nodes: [
      {
        fullyQualifiedName: 'svc.db.orders',
        entityType: 'table',
        testSuite: { id: 'suite-root' },
      },
      {
        fullyQualifiedName: 'svc.db.customers',
        entityType: 'table',
        testSuite: { id: 'suite-up' },
      },
    ],
    edges: [
      {
        fromEntity: { id: 'u1', fullyQualifiedName: 'svc.db.customers', type: 'table' },
        toEntity: { id: 'r1', fullyQualifiedName: 'svc.db.orders', type: 'table' },
      },
    ],
  };

  it('passes upstreamDepth-1 to REST, splits root from upstream, and reports failed', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/lineage/getDataQualityLineage')) {
        return jsonResponse(dqWalk);
      }
      if (url.includes('/v1/dataQuality/testCases')) {
        return jsonResponse({
          data: [
            {
              entityLink: '<#E::table::svc.db.orders>',
              testCaseResult: { testCaseStatus: 'Failed' },
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/lineage/getLineage/downstream')) {
        return jsonResponse({
          nodes: {
            r1: { entity: { fullyQualifiedName: 'svc.db.orders', entityType: 'table' }, nodeDepth: 0 },
            d1: { entity: { fullyQualifiedName: 'svc.db.reports', entityType: 'dashboard' }, nodeDepth: 1 },
          },
          downstreamEdges: {},
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const result = await analyzeRootCause(new RestClient(config, fetchImpl), {
      fqn: 'svc.db.orders',
      entityType: 'table',
      upstreamDepth: 3,
      downstreamDepth: 3,
      includeDeleted: false,
      includeColumnLineage: false,
    });
    const dqUrl = fetchImpl.mock.calls.find(([u]) =>
      (u as string).includes('/v1/lineage/getDataQualityLineage'),
    )?.[0] as string;
    expect(dqUrl).toContain('upstreamDepth=2');
    expect(result.status).toBe('failed');
    const upstream = result.upstreamAnalysis as Record<string, unknown>;
    expect(upstream.rootHasFailingTests).toBe(true);
    expect(upstream.failingUpstreamNodesCount).toBe(1);
    expect(upstream.failingUpstreamEdgesCount).toBe(1);
    const rootTests = upstream.rootFailingTests as Record<string, unknown>;
    expect(rootTests.failingTestCount).toBe(1);
    expect(rootTests.complete).toBe(true);
    expect(result.summary).toMatch(/Found 1 failing upstream entity/);
    const downstream = result.downstreamAnalysis as Record<string, unknown>;
    expect(downstream.downstreamImpactedNodesCount).toBe(1);
  });

  it('skips the downstream call entirely when nothing failed', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/lineage/getDataQualityLineage')) {
        return jsonResponse({ nodes: [], edges: [] });
      }
      if (url.includes('/v1/lineage/table/name/')) {
        return jsonResponse({ nodes: [], edges: [] });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const result = await analyzeRootCause(new RestClient(config, fetchImpl), {
      fqn: 'svc.db.orders',
      entityType: 'table',
      upstreamDepth: 1,
      downstreamDepth: 3,
      includeDeleted: false,
      includeColumnLineage: false,
    });
    expect(result.status).toBe('success');
    expect(result.downstreamAnalysis).toEqual({
      reason: 'No failures found in upstream analysis, downstream impact analysis not needed',
    });
    expect(fetchImpl.mock.calls.some(([u]) => (u as string).includes('getLineage/downstream'))).toBe(false);
    const producers = (result.upstreamAnalysis as Record<string, unknown>).upstreamProducers;
    expect(producers).toEqual([]);
  });
});
