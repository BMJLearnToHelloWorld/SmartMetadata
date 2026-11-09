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
import { createToolHandlers } from '../src/tools.js';

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

function textResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

function handlers(fetchImpl: typeof fetch) {
  return createToolHandlers(new RestClient(config, fetchImpl));
}

describe('company_context', () => {
  it('posts the pill filters with explicit k=100 and projects pills', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body.query).toBe('how do we define revenue');
      expect(body.filters).toEqual({
        entityType: ['contextMemory'],
        sourceType: ['FILE_EXTRACTION'],
        visibility: ['Shared'],
        entityStatus: ['APPROVED'],
      });
      expect(body.k).toBe(100);
      expect(body.threshold).toBe(0);
      return jsonResponse({
        tookMillis: 5,
        hits: [
          {
            fullyQualifiedName: 'pill.one',
            name: 'pill one',
            title: 'Revenue',
            question: 'What is revenue?',
            answer: 'Money earned.',
            summary: 'Revenue pill.',
            sourceFile: 'report.md',
            _score: 0.95,
          },
        ],
        totalHits: 1,
        hasMore: false,
      });
    });
    const result = (await handlers(fetchImpl).company_context({
      query: 'how do we define revenue',
    })) as Record<string, unknown>;
    expect(result.returnedCount).toBe(1);
    expect(result.results).toEqual([
      {
        fullyQualifiedName: 'pill.one',
        name: 'pill one',
        title: 'Revenue',
        question: 'What is revenue?',
        answer: 'Money earned.',
        summary: 'Revenue pill.',
        sourceFile: 'report.md',
        similarityScore: 0.95,
      },
    ]);
  });

  it('rejects query and fqn together, and neither', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const tools = handlers(fetchImpl);
    await expect(
      tools.company_context({ query: 'q', fqn: 'pill.one' }),
    ).rejects.toThrow(/Either 'query' or 'fqn'/);
    await expect(tools.company_context({})).rejects.toThrow(/Either 'query' or 'fqn'/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads a pill by FQN and reports a non-shared pill as not-found', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        fullyQualifiedName: 'pill.two',
        name: 'pill two',
        sourceType: 'MANUAL',
        entityStatus: 'APPROVED',
        visibility: 'Shared',
        sourceFile: { fullyQualifiedName: 'notes.md' },
      }),
    );
    await expect(
      handlers(fetchImpl).company_context({ fqn: 'pill.two' }),
    ).rejects.toThrow(/No Company Context knowledge pill found for 'pill.two'/);
  });

  it('reads an exposable pill by FQN', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        fullyQualifiedName: 'pill.three',
        name: 'pill three',
        title: 'T',
        sourceType: 'FILE_EXTRACTION',
        entityStatus: 'APPROVED',
        visibility: 'Shared',
        sourceFile: { fullyQualifiedName: 'report.md' },
      }),
    );
    const result = await handlers(fetchImpl).company_context({ fqn: 'pill.three' });
    expect(result).toEqual({
      fullyQualifiedName: 'pill.three',
      name: 'pill three',
      title: 'T',
      sourceFile: 'report.md',
    });
  });

  it('reports a missing pill as not-found, not as a server 404 body', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"not found"}', { status: 404 }));
    await expect(handlers(fetchImpl).company_context({ fqn: 'pill.missing' })).rejects.toThrow(
      /No Company Context knowledge pill found for 'pill.missing'/,
    );
  });

  it('passes a vector 503 through as the tool error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"message":"Vector search is not enabled"}', { status: 503 }),
    );
    await expect(
      handlers(fetchImpl).company_context({ query: 'q' }),
    ).rejects.toThrow(/Vector search is not enabled/);
  });
});

describe('semantic_search', () => {
  const vectorHit = {
    entityType: 'table',
    fullyQualifiedName: 'svc.db.orders',
    name: 'orders',
    description: 'Order lines.',
    _score: 0.8,
  };

  it('posts the vector query with explicit k and cleans hits', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body.query).toBe('orders');
      expect(body.k).toBe(100);
      expect(body.size).toBe(10);
      return jsonResponse({ tookMillis: 3, hits: [vectorHit], totalHits: 1, hasMore: false });
    });
    const result = (await handlers(fetchImpl).semantic_search({ query: 'orders' })) as Record<
      string,
      unknown
    >;
    expect(result.totalFound).toBe(1);
    expect(result.returnedCount).toBe(1);
    expect(result.results).toEqual([
      {
        entityType: 'table',
        fullyQualifiedName: 'svc.db.orders',
        name: 'orders',
        description: 'Order lines.',
        similarityScore: 0.8,
      },
    ]);
    expect(result.usage).toMatch(/get_entity_details/);
  });

  it('rejects a missing query and a misplaced filter before any HTTP call', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const tools = handlers(fetchImpl);
    await expect(tools.semantic_search({ query: '  ' })).rejects.toThrow(/'query' parameter is required/);
    await expect(
      tools.semantic_search({ query: 'q', filters: { bogus: ['x'] } }),
    ).rejects.toThrow(/not a supported filter field/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('round-trips a cursor into the next page offset', async () => {
    const urls: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return jsonResponse({
        hits: Array.from({ length: 10 }, (_, i) => ({
          ...vectorHit,
          fullyQualifiedName: `svc.db.t${i}`,
        })),
        totalHits: 25,
        hasMore: true,
      });
    });
    const tools = handlers(fetchImpl);
    const first = (await tools.semantic_search({ query: 'q', size: 10 })) as Record<string, unknown>;
    expect(first.hasMore).toBe(true);
    const cursor = String(first.nextCursor);
    urls.push(cursor);
    const second = (await tools.semantic_search({ query: 'q', cursor })) as Record<string, unknown>;
    expect(bodies[1]?.from).toBe(10);
    expect(second.returnedCount).toBe(10);
    expect(urls).toHaveLength(1);
  });

  it('rejects an illegal cursor with a 400-style error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hits: [] }));
    await expect(
      handlers(fetchImpl).semantic_search({ query: 'q', cursor: '!!!' }),
    ).rejects.toThrow(/Invalid page cursor/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns an empty result with a message when the index has nothing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tookMillis: 1, hits: [], totalHits: 0 }));
    const result = (await handlers(fetchImpl).semantic_search({ query: 'nothing' })) as Record<
      string,
      unknown
    >;
    expect(result).toMatchObject({
      totalFound: 0,
      returnedCount: 0,
      message: 'No results found for semantic search',
    });
  });
});

describe('get_persona_context', () => {
  it('reads markdown via the JSON+markdown pair and pages part 1', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('format=json')) {
        return jsonResponse({ prompt: 'Be helpful.', fingerprint: 'fp-9' });
      }
      return textResponse('# Persona\nBe helpful.', 200, { 'Content-Type': 'text/markdown' });
    });
    const result = (await handlers(fetchImpl).get_persona_context({})) as Record<string, unknown>;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/v1/personas/me/context?format=json');
    expect(calls[1]).toContain('/v1/personas/me/context?format=markdown');
    expect(result.format).toBe('markdown');
    expect(result.content).toBe('# Persona\nBe helpful.');
    expect(result.instructions).toEqual({ prompt: 'Be helpful.' });
    expect(result.fingerprint).toBe('fp-9');
  });

  it('reads a named persona and skips the markdown call for format json', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/v1/personas/name/analyst/context?format=json');
      return jsonResponse({ prompt: 'p', fingerprint: 'f' });
    });
    const result = (await handlers(fetchImpl).get_persona_context({
      personaName: 'analyst',
      format: 'json',
    })) as Record<string, unknown>;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.format).toBe('json');
  });
});

describe('get_user_context', () => {
  it('reads the logged-in user with both summaries by default', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/users/loggedInUser')) {
        return jsonResponse({ id: 'u1', name: 'ada', teams: [], roles: [], domains: [] });
      }
      return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
    });
    const result = (await handlers(fetchImpl).get_user_context({})) as Record<string, unknown>;
    expect((result.user as { name: string }).name).toBe('ada');
    expect(result.ownedSummary).toBeDefined();
    expect(result.followedSummary).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('find_context', () => {
  it('renders markdown from the find response', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/v1/ai/context/find?');
      expect(url).toContain('q=revenue');
      return jsonResponse({
        items: [
          {
            type: 'glossaryTerm',
            name: 'Revenue',
            displayName: 'Revenue',
            fullyQualifiedName: 'Business.Revenue',
            content: 'Money earned.',
          },
        ],
        candidateAssets: [{ fqn: 'svc.db.orders', entityType: 'table', via: 'Revenue' }],
      });
    });
    const result = (await handlers(fetchImpl).find_context({ query: 'revenue' })) as Record<
      string,
      unknown
    >;
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('# Relevant Knowledge');
    expect(result.content).toContain('### Revenue (Glossary Term)');
    expect(result.content).toContain('- `svc.db.orders` (table) — via `Revenue`');
  });

  it('returns JSON items with a message when nothing was found', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [], candidateAssets: [] }));
    const result = (await handlers(fetchImpl).find_context({ query: 'nope', format: 'json' })) as Record<
      string,
      unknown
    >;
    expect(result.items).toEqual([]);
    expect(result.message).toBe('No company knowledge found for this query: nope.');
  });

  it('requires a query', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(handlers(fetchImpl).find_context({ query: '  ' })).rejects.toThrow(
      /'query' parameter is required/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('get_concept_context', () => {
  it('passes markdown through from the concept context endpoint', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(
        'http://om.example/api/v1/glossaryTerms/name/Business.Revenue/context?format=markdown',
      );
      return textResponse('# Revenue\nMoney earned.', 200, { 'Content-Type': 'text/markdown' });
    });
    const result = (await handlers(fetchImpl).get_concept_context({
      entityType: 'glossaryTerm',
      fqn: 'Business.Revenue',
    })) as Record<string, unknown>;
    expect(result).toEqual({ format: 'markdown', content: '# Revenue\nMoney earned.' });
  });

  it('rejects an entity type outside glossaryTerm/metric', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(
      handlers(fetchImpl).get_concept_context({ entityType: 'table', fqn: 't' }),
    ).rejects.toThrow(/entityType must be glossaryTerm or metric/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('root_cause_analysis', () => {
  it('delegates to the DQ walk and reports success when nothing failed', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/lineage/getDataQualityLineage')) {
        expect(url).toContain('upstreamDepth=0');
        return jsonResponse({ nodes: [], edges: [] });
      }
      if (url.includes('/v1/lineage/table/name/')) {
        return jsonResponse({ nodes: [], edges: [] });
      }
      throw new Error(`unexpected ${url}`);
    });
    const result = (await handlers(fetchImpl).root_cause_analysis({
      fqn: 'svc.db.orders',
      entityType: 'table',
      upstreamDepth: 1,
    })) as Record<string, unknown>;
    expect(result.status).toBe('success');
    expect(result.summary).toMatch(/No failing tests found/);
  });
});

describe('shacl_validate / ontology_describe', () => {
  it('shacl_validate is admin-only through the endpoint and reports conformance', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/rdf/validate')) {
        return textResponse('report', 200, { 'OM-SHACL-Conforms': 'true' });
      }
      throw new Error(`unexpected ${url}`);
    });
    const result = (await handlers(fetchImpl).shacl_validate({ fullGraph: true })) as Record<
      string,
      unknown
    >;
    expect(result.scope).toBe('full-graph');
    expect(result.conforms).toBe(true);
  });

  it('ontology_describe returns the bundled ontology', async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse('@prefix : <http://example.com/> .', 200, { 'Content-Type': 'text/turtle' }),
    );
    const result = (await handlers(fetchImpl).ontology_describe({})) as Record<string, unknown>;
    expect(result.scope).toBe('full-ontology');
    expect(result.body).toContain('@prefix');
  });
});
