/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildImpactColumnFilter,
  buildImpactQueryFilter,
  columnLevelNodesFromSearchLineage,
  countImpactDirectionTotals,
  depthOptionsFromPagingInfo,
  getSearchNameEsQuery,
  isImpactAnalysisMode,
  lastFqnSegment,
  parseLineageEntityCountResponse,
  parseLineagePaginationInfo,
  parseLineageTableUrlParams,
  prepareColumnLevelNodesFromEdges,
  type LineagePaginationInfo,
} from './lineageTable';
import type { LineageQuickFilterSelection } from './quickFilters';

const CENTER_FQN = 'svc.db.schema.orders';

function countPayload(): Record<string, unknown> {
  return {
    nodes: {
      [CENTER_FQN]: {
        entity: {
          id: 'center-id',
          type: 'table',
          name: 'orders',
          fullyQualifiedName: CENTER_FQN,
        },
        nodeDepth: 0,
        paging: { entityUpstreamCount: 2, entityDownstreamCount: 1 },
      },
      'svc.db.schema.raw_orders': {
        entity: {
          id: 'up-id',
          type: 'table',
          name: 'raw_orders',
          displayName: 'Raw Orders',
          fullyQualifiedName: 'svc.db.schema.raw_orders',
          description: 'Raw source',
          domains: [{ id: 'd1', name: 'sales', displayName: 'Sales', type: 'domain' }],
          owners: [{ id: 'u1', name: 'alice', displayName: 'Alice', type: 'user' }],
          tier: 'Tier.Tier1',
          tags: [
            { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            { tagFQN: 'Glossary.BusinessTerm', name: 'BusinessTerm', source: 'Glossary' },
          ],
        },
        nodeDepth: -1,
        paging: { entityUpstreamCount: 1, entityDownstreamCount: 0 },
      },
      'svc.db.schema.mart_orders': {
        entity: {
          id: 'down-id',
          type: 'table',
          name: 'mart_orders',
          fullyQualifiedName: 'svc.db.schema.mart_orders',
          tier: { tagFQN: 'Tier.Tier2', name: 'Tier2' },
        },
        nodeDepth: 2,
        paging: { entityUpstreamCount: 0, entityDownstreamCount: 0 },
      },
    },
    paginationInfo: {
      downstreamDepthInfo: [
        { depth: 0, entityCount: 1 },
        { depth: 1, entityCount: 3 },
        { depth: 2, entityCount: 2 },
      ],
      upstreamDepthInfo: [
        { depth: 0, entityCount: 1 },
        { depth: 1, entityCount: 4 },
      ],
      maxDownstreamDepth: 2,
      maxUpstreamDepth: 1,
      totalDownstreamEntities: 5,
      totalUpstreamEntities: 4,
    },
  };
}

describe('parseLineageEntityCountResponse', () => {
  it('drops the center node, sorts by nodeDepth, and splits glossary tags', () => {
    const { rows, paginationInfo } = parseLineageEntityCountResponse(countPayload(), CENTER_FQN);
    expect(rows.map((row) => row.fullyQualifiedName)).toEqual([
      'svc.db.schema.raw_orders',
      'svc.db.schema.mart_orders',
    ]);
    const up = rows[0];
    expect(up).toBeDefined();
    expect(up?.displayName).toBe('Raw Orders');
    expect(up?.nodeDepth).toBe(-1);
    expect(up?.upstreamCount).toBe(1);
    expect(up?.tier).toBe('Tier.Tier1');
    expect(up?.tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive']);
    expect(up?.glossaryTerms.map((tag) => tag.tagFQN)).toEqual(['Glossary.BusinessTerm']);
    expect(up?.owners.map((owner) => owner.displayName)).toEqual(['Alice']);
    expect(up?.domains.map((domain) => domain.displayName)).toEqual(['Sales']);
    expect(rows[1]?.tier).toBe('Tier.Tier2');
    expect(paginationInfo?.totalDownstreamEntities).toBe(5);
  });

  it('returns null pagination info when the response omits it', () => {
    const payload = countPayload();
    delete (payload as Record<string, unknown>).paginationInfo;
    expect(parseLineageEntityCountResponse(payload, CENTER_FQN).paginationInfo).toBeNull();
  });

  it('skips nodes with no entity and no id/FQN to link', () => {
    const payload = countPayload();
    const nodes = payload.nodes as Record<string, unknown>;
    nodes['svc.db.schema.ghost'] = { entity: { type: 'table', name: 'ghost' }, nodeDepth: 1 };
    nodes['svc.db.schema.empty'] = { nodeDepth: 1 };
    const { rows } = parseLineageEntityCountResponse(payload, CENTER_FQN);
    expect(rows.map((row) => row.fullyQualifiedName)).not.toContain('svc.db.schema.ghost');
    expect(rows).toHaveLength(2);
  });
});

describe('parseLineagePaginationInfo', () => {
  it('defaults missing counts to 0 and drops malformed depth rows', () => {
    const info = parseLineagePaginationInfo({
      downstreamDepthInfo: [{ depth: 1, entityCount: 3 }, { depth: 'x', entityCount: 1 }],
      upstreamDepthInfo: 'nope',
    });
    expect(info?.downstreamDepthInfo).toEqual([{ depth: 1, entityCount: 3 }]);
    expect(info?.upstreamDepthInfo).toEqual([]);
    expect(info?.totalDownstreamEntities).toBe(0);
  });

  it('returns null for a non-object payload', () => {
    expect(parseLineagePaginationInfo(null)).toBeNull();
    expect(parseLineagePaginationInfo('x')).toBeNull();
  });
});

function searchPayload(): Record<string, unknown> {
  return {
    nodes: {
      'svc.db.schema.raw_orders': {
        entity: {
          id: 'up-id',
          type: 'table',
          name: 'raw_orders',
          fullyQualifiedName: 'svc.db.schema.raw_orders',
          description: 'Raw source',
          owners: [{ id: 'u1', name: 'alice', type: 'user' }],
          columns: [
            {
              name: 'id',
              fullyQualifiedName: 'svc.db.schema.raw_orders.id',
              tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
            },
            {
              name: 'address',
              fullyQualifiedName: 'svc.db.schema.raw_orders.address',
              children: [
                {
                  name: 'city',
                  fullyQualifiedName: 'svc.db.schema.raw_orders.address.city',
                  tags: [{ tagFQN: 'Glossary.City', name: 'City', source: 'Glossary' }],
                },
              ],
            },
          ],
        },
        nodeDepth: 1,
      },
      [CENTER_FQN]: {
        entity: {
          id: 'center-id',
          type: 'table',
          name: 'orders',
          fullyQualifiedName: CENTER_FQN,
        },
        nodeDepth: 0,
      },
    },
    upstreamEdges: {
      e1: {
        fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
        toEntity: { id: 'center-id', fullyQualifiedName: CENTER_FQN, type: 'table' },
        columns: [
          { fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' },
          { fromColumns: ['svc.db.schema.raw_orders.address.city'], toColumn: 'svc.db.schema.orders.city' },
        ],
      },
      e2: {
        fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
        toEntity: { id: 'center-id', fullyQualifiedName: CENTER_FQN, type: 'table' },
        columns: [],
      },
    },
    downstreamEdges: {},
  };
}

describe('column-level rows', () => {
  it('expands upstream edges into per-column rows from the from-entity side', () => {
    const payload = searchPayload();
    const rows = columnLevelNodesFromSearchLineage(payload, 'Upstream');
    // e2 has no column mappings and yields no rows.
    expect(rows).toHaveLength(2);
    expect(rows[0]?.docId).toBe('svc.db.schema.raw_orders.id->svc.db.schema.orders.id');
    expect(rows[0]?.fromColumn).toBe('svc.db.schema.raw_orders.id');
    expect(rows[0]?.toColumn).toBe('svc.db.schema.orders.id');
    expect(rows[0]?.nodeDepth).toBe(1);
    // Upstream reads the from-entity's fields (description, owners).
    expect(rows[0]?.description).toBe('Raw source');
    expect(rows[0]?.owners.map((owner) => owner.name)).toEqual(['alice']);
    // Column tags resolve by the source column FQN (upstream: fromColumn).
    expect(rows[0]?.tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive']);
    // Nested column tags resolve through children (glossary split).
    expect(rows[1]?.glossaryTerms.map((tag) => tag.tagFQN)).toEqual(['Glossary.City']);
    expect(rows[1]?.tags).toEqual([]);
  });

  it('reads the to-entity side downstream and tags by the impacted column', () => {
    const payload = searchPayload();
    // Downstream edge center -> mart; the to-entity side (mart) supplies
    // the trailing columns and the column tags, unlike the upstream case
    // where the from-entity side does.
    const nodes = payload.nodes as Record<string, unknown>;
    nodes['svc.db.schema.mart_orders'] = {
      entity: {
        id: 'mart-id',
        type: 'table',
        name: 'mart_orders',
        fullyQualifiedName: 'svc.db.schema.mart_orders',
        description: 'Mart',
        columns: [
          {
            name: 'id',
            fullyQualifiedName: 'svc.db.schema.mart_orders.id',
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
          },
        ],
      },
      nodeDepth: 1,
    };
    payload.downstreamEdges = {
      e1: {
        fromEntity: { id: 'center-id', fullyQualifiedName: CENTER_FQN, type: 'table' },
        toEntity: { id: 'mart-id', fullyQualifiedName: 'svc.db.schema.mart_orders', type: 'table' },
        columns: [{ fromColumns: ['svc.db.schema.orders.id'], toColumn: 'svc.db.schema.mart_orders.id' }],
      },
    };
    payload.upstreamEdges = {};
    const rows = columnLevelNodesFromSearchLineage(payload, 'Downstream');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('Mart');
    expect(rows[0]?.tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive']);
  });

  it('yields no rows when the direction-side entity is missing from nodes', () => {
    const edges = [
      {
        fromEntity: { id: 'x', fullyQualifiedName: 'svc.db.schema.missing', type: 'table' },
        toEntity: { id: 'center-id', fullyQualifiedName: CENTER_FQN, type: 'table' },
        columns: [{ fromColumns: ['a'], toColumn: 'b' }],
      },
    ];
    expect(prepareColumnLevelNodesFromEdges(edges, {}, 'Upstream')).toEqual([]);
  });
});

describe('impact filter split', () => {
  const selections: LineageQuickFilterSelection[] = [
    { key: 'tag', values: ['PII.Sensitive'] },
    { key: 'column', values: ['customer_id'] },
    { key: 'domains', values: ['sales'] },
  ];

  it('builds the table-level query filter from table filters plus the search wildcard', () => {
    const filter = buildImpactQueryFilter([...selections], 'orders', 'table');
    expect(filter).toBeDefined();
    const parsed = JSON.parse(filter ?? '') as { query: { bool: { must: unknown[] } } };
    expect(parsed.query.bool.must).toHaveLength(3);
    expect(parsed.query.bool.must[2]).toEqual(getSearchNameEsQuery('orders'));
  });

  it('drops column/tag from the column-level query filter and omits the search wildcard', () => {
    const filter = buildImpactQueryFilter([...selections], 'orders', 'column');
    const parsed = JSON.parse(filter ?? '') as { query: { bool: { must: unknown[] } } };
    expect(parsed.query.bool.must).toHaveLength(1);
    expect(JSON.stringify(parsed)).toContain('domains.displayName.keyword');
  });

  it('returns undefined when nothing filters', () => {
    expect(buildImpactQueryFilter([], '', 'table')).toBeUndefined();
    expect(buildImpactQueryFilter([], '', 'column')).toBeUndefined();
  });

  it('builds the column filter only at column level', () => {
    expect(buildImpactColumnFilter([...selections], 'orders', 'table')).toBeUndefined();
    // Selection order is preserved (pin iterates selectedQuickFilters),
    // then the search term as columnName:.
    expect(buildImpactColumnFilter([...selections], 'orders', 'column')).toBe(
      'tag:PII.Sensitive,columnName:customer_id,columnName:orders',
    );
    expect(buildImpactColumnFilter([], '', 'column')).toBeUndefined();
  });
});

describe('counts, depth options, URL params', () => {
  const info: LineagePaginationInfo = {
    downstreamDepthInfo: [
      { depth: 0, entityCount: 1 },
      { depth: 1, entityCount: 3 },
      { depth: 2, entityCount: 2 },
      { depth: 3, entityCount: 9 },
    ],
    upstreamDepthInfo: [
      { depth: 0, entityCount: 1 },
      { depth: 1, entityCount: 4 },
    ],
    maxDownstreamDepth: 3,
    maxUpstreamDepth: 1,
    totalDownstreamEntities: 14,
    totalUpstreamEntities: 4,
  };

  it('sums depths 1..nodeDepth and never counts depth 0', () => {
    expect(countImpactDirectionTotals(info, 2)).toEqual({ upstreamCount: 4, downstreamCount: 5 });
    expect(countImpactDirectionTotals(null, 2)).toEqual({ upstreamCount: 0, downstreamCount: 0 });
  });

  it('derives depth options from the directional depth info', () => {
    expect(depthOptionsFromPagingInfo(info, 'Downstream')).toEqual([0, 1, 2, 3]);
    expect(depthOptionsFromPagingInfo(info, 'Upstream')).toEqual([0, 1]);
    expect(depthOptionsFromPagingInfo(null, 'Downstream')).toEqual([]);
  });

  it('parses dir/depth/page from the URL with config-depth and page-size fallbacks', () => {
    expect(parseLineageTableUrlParams({ dir: 'Upstream', depth: '2', currentPage: '3', pageSize: '25' }, 3, 1)).toEqual({
      direction: 'Upstream',
      nodeDepth: 2,
      currentPage: 3,
      pageSize: 25,
    });
    // Anything but literal Upstream is downstream; a non-numeric depth
    // falls back to the directional config depth; an off-scale page size
    // falls back to PAGE_SIZE_BASE (15).
    expect(parseLineageTableUrlParams({ dir: 'sideways', depth: 'x', pageSize: '48' }, 3, 1)).toEqual({
      direction: 'Downstream',
      nodeDepth: 1,
      currentPage: 1,
      pageSize: 15,
    });
    expect(parseLineageTableUrlParams({}, 3, 1)).toEqual({
      direction: 'Downstream',
      nodeDepth: 1,
      currentPage: 1,
      pageSize: 15,
    });
  });

  it('detects ?mode=impact_analysis', () => {
    expect(isImpactAnalysisMode({ mode: 'impact_analysis' })).toBe(true);
    expect(isImpactAnalysisMode({ mode: 'lineage' })).toBe(false);
    expect(isImpactAnalysisMode({})).toBe(false);
  });
});

describe('display helpers', () => {
  it('takes the last FQN segment quote-aware', () => {
    expect(lastFqnSegment('svc.db.schema.orders.id')).toBe('id');
    expect(lastFqnSegment('svc."my.db".schema.orders')).toBe('orders');
    expect(lastFqnSegment('')).toBe('');
  });
});
