/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail, SearchHit } from '@/types/api';
import ExplorePreview from './ExplorePreview.vue';

vi.mock('@/governance/catalogOptions', () => ({
  loadGovernanceCatalog: vi.fn(),
  ownerKey: (id: string, type: string) => `${type}:${id}`,
  parseOwnerKey: (key: string) => {
    const index = key.indexOf(':');
    if (index <= 0) {
      return null;
    }
    const type = key.slice(0, index);
    const id = key.slice(index + 1);
    if (!id || (type !== 'user' && type !== 'team')) {
      return null;
    }
    return { id, type };
  },
  classificationTagOptions: vi.fn(() => []),
}));

vi.mock('@/api/lineage', () => ({
  getLineagePagingData: vi.fn(),
  searchLineage: vi.fn(),
}));

vi.mock('@/api/testCases', () => ({
  listTestCases: vi.fn(),
  listTestCasesBySearch: vi.fn(),
}));

vi.mock('@/api/entities', () => ({
  fetchAssetDetail: vi.fn(),
  prefetchAssetDetail: vi.fn(),
  patchAsset: vi.fn(),
}));

vi.mock('@/api/customProperties', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/customProperties')>();
  return { ...actual, getMetadataTypeByName: vi.fn() };
});

vi.mock('@/api/domains', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/domains')>();
  return { ...actual, getDomainByName: vi.fn(), patchDomain: vi.fn() };
});

vi.mock('@/api/dataProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/dataProducts')>();
  return { ...actual, getDataProductByName: vi.fn(), patchDataProduct: vi.fn() };
});

vi.mock('@/api/glossaryTerms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/glossaryTerms')>();
  return { ...actual, getGlossaryTermByFqn: vi.fn(), patchGlossaryTerm: vi.fn() };
});

vi.mock('@/api/columns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/columns')>();
  return { ...actual, updateColumnDetails: vi.fn() };
});

vi.mock('@/api/queries', () => ({
  getQueryCount: vi.fn(),
}));

vi.mock('@/api/testIncidents', () => ({
  listTestCaseIncidentsFromSearch: vi.fn(),
}));

import { getLineagePagingData, searchLineage } from '@/api/lineage';
import { listTestCases, listTestCasesBySearch } from '@/api/testCases';
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getMetadataTypeByName } from '@/api/customProperties';
import { getDomainByName, patchDomain } from '@/api/domains';
import { getDataProductByName, patchDataProduct } from '@/api/dataProducts';
import { getGlossaryTermByFqn, patchGlossaryTerm } from '@/api/glossaryTerms';
import { updateColumnDetails } from '@/api/columns';
import { getQueryCount } from '@/api/queries';
import { listTestCaseIncidentsFromSearch } from '@/api/testIncidents';
import { loadGovernanceCatalog } from '@/governance/catalogOptions';

const catalogMock = loadGovernanceCatalog as unknown as ReturnType<typeof vi.fn>;

const getMock = getLineagePagingData as unknown as ReturnType<typeof vi.fn>;
const searchLineageMock = searchLineage as unknown as ReturnType<typeof vi.fn>;
const listTestCasesMock = listTestCases as unknown as ReturnType<typeof vi.fn>;
const listTestCasesBySearchMock = listTestCasesBySearch as unknown as ReturnType<typeof vi.fn>;
const fetchMock = fetchAssetDetail as unknown as ReturnType<typeof vi.fn>;
const patchMock = patchAsset as unknown as ReturnType<typeof vi.fn>;
const typeMock = getMetadataTypeByName as unknown as ReturnType<typeof vi.fn>;
const domainMock = getDomainByName as unknown as ReturnType<typeof vi.fn>;
const domainPatchMock = patchDomain as unknown as ReturnType<typeof vi.fn>;
const productMock = getDataProductByName as unknown as ReturnType<typeof vi.fn>;
const productPatchMock = patchDataProduct as unknown as ReturnType<typeof vi.fn>;
const termMock = getGlossaryTermByFqn as unknown as ReturnType<typeof vi.fn>;
const termPatchMock = patchGlossaryTerm as unknown as ReturnType<typeof vi.fn>;
const columnMock = updateColumnDetails as unknown as ReturnType<typeof vi.fn>;
const queryCountMock = getQueryCount as unknown as ReturnType<typeof vi.fn>;
const incidentsMock = listTestCaseIncidentsFromSearch as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hitWith(usageSummary: SearchHit['usageSummary']): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
    usageSummary,
  };
}

function detailWith(overrides: Partial<AssetDetail>): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

async function mountPreview(
  hit: SearchHit | null,
  allowedOperations: string[] = ['ViewBasic'],
  withAssetRoute = true,
  attachToBody = false,
) {
  // E-3a: the preview gates on useEntityPermissions, which reads through
  // the permission store (pinia) to GET /v1/permissions/{resource}/...;
  // the stub answers it, and the entity fetch is mocked per test.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.includes('/v1/permissions/')) {
        return jsonResponse({
          resource: 'table',
          permissions: allowedOperations.map((operation) => ({ operation, access: 'allow' })),
        });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  // Q-TAB-4: the mounted LineageSection calls useRouter on click, so the
  // preview mounts with a memory router. The header title is a router-link
  // to the `asset` route, so it is registered too.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      // Host views mount this shared preview under routers that never
      // register the detail routes; `withAssetRoute: false` covers that.
      ...(withAssetRoute
        ? [
            {
              path: '/assets/:entityType/:fqn',
              name: 'asset',
              component: { template: '<div>asset</div>' },
            },
            {
              path: '/lineage/:entityType/:fqn',
              name: 'lineage',
              component: { template: '<div>lineage</div>' },
            },
            { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>term</div>' } },
            { path: '/governance/tags/:id', name: 'governance-tag', component: { template: '<div>tag</div>' } },
            {
              path: '/governance/data-products/:id',
              name: 'governance-data-product',
              component: { template: '<div>dp</div>' },
            },
          ]
        : []),
    ],
  });
  const wrapper = mount(ExplorePreview, {
    props: { hit },
    global: { plugins: [Antd, router, pinia, createTestI18n()] },
    ...(attachToBody ? { attachTo: document.body } : {}),
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('ExplorePreview usage row', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('table explore overview has no Usage row (pin: usage is lineage-only for tables)', async () => {
    // Pin getTableOverview marks the Usage row visible: [lineage] only;
    // the old generic preview showed it from the hit's usageSummary.
    const wrapper = await mountPreview(hitWith({ weeklyStats: { count: 20, percentileRank: 45 } }));
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.exists()).toBe(true);
    expect(overview.text()).not.toContain('Usage');
    expect(overview.text()).not.toContain('pctile');
    wrapper.unmount();
  });

  it('database overview shows the Usage percentile from the fetched detail', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        entityType: 'database',
        usageSummary: { weeklyStats: { count: 20, percentileRank: 45 } },
      }),
    );
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      entityType: 'database',
      fullyQualifiedName: 'svc.analytics',
    });
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Usage');
    expect(overview.text()).toContain('45th pctile');
    wrapper.unmount();
  });

  it('database overview shows the NO_DATA marker when no usage rank is known', async () => {
    fetchMock.mockResolvedValue(detailWith({ entityType: 'database' }));
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      entityType: 'database',
      fullyQualifiedName: 'svc.analytics',
    });
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Usage');
    expect(overview.text()).toContain('-');
    expect(overview.text()).not.toContain('pctile');
    wrapper.unmount();
  });
});

describe('ExplorePreview Generated-tag rendering', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a Generated tag with pin\'s Generated badge (E-3c retarget)', async () => {
    // E-3c retarget: the tags section now renders through the detail
    // page's WidgetTagsCell, and pin's TagsViewer gives auto-classification
    // (Generated) tags "a distinct brand-blue badge" — the old "plain,
    // no badge class" assertion predated the cell reuse and asserted the
    // old preview's own plain Tag rendering, not pin.
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' }],
    });
    const section = wrapper.find('[data-testid="explore-preview-tags"]');
    const chips = section.findAll('.ant-tag');
    expect(chips.map((chip) => chip.text().trim())).toContain('Email');
    expect(chips.map((chip) => chip.classes())).toContainEqual(
      expect.arrayContaining(['asset-overview__generated-tag']),
    );
    wrapper.unmount();
  });
});

describe('ExplorePreview D26 governance detail navigation', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function governanceHit(entityType: string, id?: string): SearchHit {
    return {
      name: 'term',
      fullyQualifiedName: 'biz.term',
      entityType,
      owners: [],
      tags: [],
      domains: [],
      dataProducts: [],
      ...(id ? { id } : {}),
    };
  }

  it.each(['glossaryTerm', 'tag', 'dataProduct'])(
    'opens a %s hit instead of showing the unwired marker',
    async (entityType) => {
      const hit = governanceHit(entityType, `${entityType}-1`);
      const wrapper = await mountPreview(hit);
      expect(wrapper.find('[data-testid="explore-preview-open"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('Detail page not wired for this type');
      await wrapper.find('[data-testid="explore-preview-open"]').trigger('click');
      expect(wrapper.emitted('open')).toBeTruthy();
      expect(wrapper.emitted('open')?.[0]).toEqual([hit]);
      wrapper.unmount();
    },
  );

  it('keeps the unwired marker for a governance hit without an id', async () => {
    const wrapper = await mountPreview(governanceHit('tag'));
    expect(wrapper.find('[data-testid="explore-preview-open"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Detail page not wired for this type');
    wrapper.unmount();
  });
});

describe('ExplorePreview D25 lineage entry', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits openLineage for a lineage-capable hit', async () => {
    const hit = hitWith(undefined);
    const wrapper = await mountPreview(hit);
    const lineage = wrapper.find('[data-testid="explore-preview-lineage"]');
    expect(lineage.exists()).toBe(true);
    expect(lineage.text()).toContain('Open lineage');
    await lineage.trigger('click');
    expect(wrapper.emitted('openLineage')).toBeTruthy();
    expect(wrapper.emitted('openLineage')?.[0]).toEqual([hit]);
    wrapper.unmount();
  });

  it.each(['glossaryTerm', 'tag', 'dataProduct'])(
    'shows no lineage entry for a %s hit',
    async (entityType) => {
      const wrapper = await mountPreview({
        name: 'term',
        fullyQualifiedName: 'biz.term',
        entityType,
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
        id: `${entityType}-1`,
      });
      expect(wrapper.find('[data-testid="explore-preview-lineage"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );
});

describe('ExplorePreview lineage section (Q-TAB-4)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [{ depth: 1, entityCount: 1 }],
      downstreamDepthInfo: [{ depth: 1, entityCount: 4 }],
      maxUpstreamDepth: 1,
      maxDownstreamDepth: 1,
      totalUpstreamEntities: 1,
      totalDownstreamEntities: 4,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the lineage section after overview for a lineage type', async () => {
    const wrapper = await mountPreview(hitWith({ weeklyStats: { count: 20, percentileRank: 45 } }));
    await flushPromises();
    const section = wrapper.find('[data-testid="explore-preview-lineage-section"]');
    expect(section.exists()).toBe(true);
    expect(wrapper.find('[data-testid="upstream-count"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="downstream-count"]').text()).toBe('4');
    // Pin section order: description, overview, lineage, owners.
    const blocks = wrapper.findAll('.preview__block');
    const testIds = blocks.map((block) => block.attributes('data-testid'));
    expect(testIds.indexOf('explore-preview-overview')).toBeLessThan(
      testIds.indexOf('explore-preview-lineage-section'),
    );
    expect(testIds.indexOf('explore-preview-lineage-section')).toBeLessThan(
      testIds.indexOf('explore-preview-owners'),
    );
    wrapper.unmount();
  });

  it('omits the lineage section for types outside the pin set (metric)', async () => {
    const wrapper = await mountPreview({ ...hitWith(undefined), entityType: 'metric' });
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview-lineage-section"]').exists()).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('ExplorePreview E-3a shell', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [],
      downstreamDepthInfo: [],
      maxUpstreamDepth: 0,
      maxDownstreamDepth: 0,
      totalUpstreamEntities: 0,
      totalDownstreamEntities: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // E-3d retarget: the Schema / Lineage / Data Quality tabs landed in
  // E-3d, so a table hit now shows all five pin tabs (Overview, Schema,
  // Lineage, Data Quality, Custom Properties) in the vertical nav.
  it('shows all five pin tabs in the vertical nav for a table hit', async () => {
    const wrapper = await mountPreview(hitWith(undefined));
    expect(wrapper.find('[data-testid="overview-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schema-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="data-quality-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-properties-tab"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('links the display name to the detail page and drops the FQN line', async () => {
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      displayName: 'Orders',
    });
    const link = wrapper.find('[data-testid="explore-preview-title-link"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('Orders');
    expect(link.attributes('href')).toContain('/assets/table/svc.db.schema.orders');
    expect(wrapper.text()).not.toContain('svc.db.schema.orders');
    wrapper.unmount();
  });

  it('renders the title as plain text when the router has no detail route (host-view regression)', async () => {
    // vue-router rejects (unhandled) when a router-link resolves an
    // unregistered named location; host views mount this shared preview
    // under routers with no 'asset' route, and the unhandled rejection
    // broke their whole mount (GlossaryTerm/Tag/Metric detail views).
    const wrapper = await mountPreview({ ...hitWith(undefined), displayName: 'Orders' }, ['ViewBasic'], false);
    expect(wrapper.find('[data-testid="explore-preview-title-link"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Orders');
    wrapper.unmount();
  });

  it('has no X close in official Explore mode and labels the official tab set', async () => {
    const wrapper = await mountPreview(hitWith(undefined));
    expect(wrapper.find('[data-testid="explore-preview-close"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="overview-tab"]').text()).toContain('Overview');
    expect(wrapper.get('[data-testid="schema-tab"]').text()).toContain('Schema');
    expect(wrapper.get('[data-testid="lineage-tab"]').text()).toContain('Lineage');
    expect(wrapper.get('[data-testid="data-quality-tab"]').text()).toContain('Data Quality');
    expect(wrapper.get('[data-testid="custom-properties-tab"]').text()).toContain('Custom Properties');
    expect(wrapper.get('[data-testid="overview-tab"]').find('svg').exists()).toBe(true);
    expect(wrapper.get('[data-testid="schema-tab"]').find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the per-type table overview (Type / Queries / Columns / Incidents)', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        id: 't1',
        tableType: 'Regular',
        schemaRows: [
          { key: 'a', name: 'a', dataType: 'int' },
          { key: 'b', name: 'b', dataType: 'varchar(50)' },
        ],
      }),
    );
    queryCountMock.mockResolvedValue(3);
    incidentsMock.mockResolvedValue({ data: [], total: 5 });
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewDataProfile']);
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Type');
    expect(overview.text()).toContain('Regular');
    expect(overview.text()).toContain('Queries');
    expect(overview.text()).toContain('3');
    expect(overview.text()).toContain('Columns');
    expect(overview.text()).toContain('2');
    expect(overview.text()).toContain('Incidents');
    expect(overview.text()).toContain('5');
    // The old generic rows are gone in explore mode (pin lineage-only).
    expect(overview.text()).not.toContain('Service');
    expect(overview.text()).not.toContain('Database');
    wrapper.unmount();
  });

  it('renders the column overview from the search hit (pin: no column fetch)', async () => {
    const wrapper = await mountPreview({
      name: 'customer_id',
      fullyQualifiedName: 'svc.db.schema.orders.customer_id',
      entityType: 'tableColumn',
      dataType: 'varchar(50)',
      tableName: 'orders',
      tableFqn: 'svc.db.schema.orders',
      serviceName: 'BigQuery Prod',
      databaseName: 'analytics',
      schemaName: 'marts',
      constraint: 'PRIMARY_KEY',
      owners: [],
      tags: [],
      domains: [],
      dataProducts: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Data Type');
    expect(overview.text()).toContain('varchar(50)');
    expect(overview.text()).toContain('Table');
    expect(overview.text()).toContain('orders');
    expect(overview.text()).toContain('PRIMARY_KEY');
    wrapper.unmount();
  });

  it('merges the fetched entity over the stale search hit', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        description: 'Fresh description',
        owners: [{ name: 'alice', displayName: 'Alice' }],
      }),
    );
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      description: 'Stale description',
      owners: [],
    });
    expect(wrapper.find('[data-testid="explore-preview-description"]').text()).toContain('Fresh description');
    expect(wrapper.find('[data-testid="explore-preview-owners"]').text()).toContain('Alice');
    expect(fetchMock).toHaveBeenCalledWith('table', 'svc.db.schema.orders');
    wrapper.unmount();
  });

  it('falls back to the search hit when the entity fetch fails', async () => {
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      description: 'Hit description',
    });
    expect(wrapper.find('[data-testid="explore-preview-description"]').text()).toContain('Hit description');
    wrapper.unmount();
  });

  it('refetches and resets to Overview when the entity changes', async () => {
    const wrapper = await mountPreview(hitWith(undefined));
    expect(fetchMock).toHaveBeenCalledWith('table', 'svc.db.schema.orders');
    await wrapper.setProps({
      hit: { ...hitWith(undefined), entityType: 'topic', fullyQualifiedName: 'kafka.events', name: 'events' },
    });
    await flushPromises();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('topic', 'kafka.events');
    expect(wrapper.find('[data-testid="explore-preview-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the permission placeholder when view access is denied', async () => {
    const wrapper = await mountPreview(hitWith(undefined), []);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('knowledge-page layout shows description, owners, tags, glossary only', async () => {
    const wrapper = await mountPreview({
      name: 'guide',
      fullyQualifiedName: 'docs.guide',
      entityType: 'page',
      owners: [],
      tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
      domains: [{ name: 'finance', displayName: 'Finance' }],
      dataProducts: [],
    });
    expect(wrapper.find('[data-testid="explore-preview-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-owners"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-tags"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-glossary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-domains"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-tier"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-products"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('data-product layout shows domains and tier but no glossary section', async () => {
    const wrapper = await mountPreview({
      name: 'dp',
      fullyQualifiedName: 'biz.dp',
      entityType: 'dataProduct',
      owners: [],
      tags: [
        { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
        { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary' },
      ],
      domains: [{ name: 'finance', displayName: 'Finance' }],
      dataProducts: [],
      id: 'dp-1',
    });
    expect(wrapper.find('[data-testid="explore-preview-domains"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-tier"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-glossary"]').exists()).toBe(false);
    // Pin data-product layout filters Glossary tags out of the Tags section.
    expect(wrapper.find('[data-testid="explore-preview-tags"]').text()).toContain('Email');
    expect(wrapper.find('[data-testid="explore-preview-tags"]').text()).not.toContain('Term');
    wrapper.unmount();
  });

  it('misc layout shows owners and tags but no domains or data products', async () => {
    const wrapper = await mountPreview({
      name: 'alice',
      fullyQualifiedName: 'users.alice',
      entityType: 'user',
      owners: [],
      tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
      domains: [{ name: 'finance', displayName: 'Finance' }],
      dataProducts: [],
    });
    expect(wrapper.find('[data-testid="explore-preview-owners"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-tags"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-domains"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-products"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ExplorePreview E-3b custom properties', () => {
  const tableDefs = [
    { name: 'sensitivity', displayName: 'Sensitivity', propertyType: 'string' },
    { name: 'retentionDays', displayName: 'Retention days', propertyType: 'integer' },
  ];

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    patchMock.mockReset();
    patchMock.mockResolvedValue({});
    typeMock.mockReset();
    typeMock.mockResolvedValue({ name: 'table', customProperties: tableDefs });
    domainMock.mockReset();
    domainMock.mockResolvedValue({ id: 'dom-1', extension: { sensitivity: 'high' } });
    domainPatchMock.mockReset();
    domainPatchMock.mockResolvedValue({});
    productMock.mockReset();
    productMock.mockResolvedValue({ id: 'dp-1', extension: { sensitivity: 'high' } });
    productPatchMock.mockReset();
    productPatchMock.mockResolvedValue({});
    termMock.mockReset();
    termMock.mockResolvedValue({ id: 'term-1', extension: { sensitivity: 'high' } });
    termPatchMock.mockReset();
    termPatchMock.mockResolvedValue({});
    columnMock.mockReset();
    columnMock.mockResolvedValue({});
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [],
      downstreamDepthInfo: [],
      maxUpstreamDepth: 0,
      maxDownstreamDepth: 0,
      totalUpstreamEntities: 0,
      totalDownstreamEntities: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function openCustomPropertiesTab(wrapper: Awaited<ReturnType<typeof mountPreview>>) {
    await wrapper.find('[data-testid="custom-properties-tab"]').trigger('click');
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  it('shows the tab for a table hit and not for types pin excludes (tag, testSuite)', async () => {
    const wrapper = await mountPreview(hitWith(undefined));
    expect(wrapper.find('[data-testid="custom-properties-tab"]').exists()).toBe(true);
    wrapper.unmount();

    for (const entityType of ['tag', 'testSuite']) {
      const excluded = await mountPreview({
        name: 'x',
        fullyQualifiedName: 'x.y',
        entityType,
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
        id: `${entityType}-1`,
      });
      expect(excluded.find('[data-testid="custom-properties-tab"]').exists()).toBe(false);
      excluded.unmount();
    }
  });

  it('renders one row per property with values from the fetched extension', async () => {
    fetchMock.mockResolvedValue(
      detailWith({ id: 't1', extension: { sensitivity: 'high', retentionDays: 30 } }),
    );
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewCustomFields']);
    await openCustomPropertiesTab(wrapper);
    expect(typeMock).toHaveBeenCalledWith('table');
    const list = wrapper.find('[data-testid="custom-properties-list"]');
    expect(list.exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('Sensitivity');
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('high');
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('String');
    expect(wrapper.find('[data-testid="custom-property-retentionDays-row"]').text()).toContain('30');
    expect(wrapper.find('[data-testid="custom-property-retentionDays-row"]').text()).toContain('Integer');
    wrapper.unmount();
  });

  it('shows "No value yet" for a property without a value', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', extension: {} }));
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewCustomFields']);
    await openCustomPropertiesTab(wrapper);
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('No value yet');
    wrapper.unmount();
  });

  it('filters rows by name, displayName, and property-type name', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', extension: {} }));
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewCustomFields']);
    await openCustomPropertiesTab(wrapper);
    const search = wrapper.find('[data-testid="searchbar"]');
    await search.setValue('integer');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-property-retentionDays-row"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').exists()).toBe(false);
    await search.setValue('zzz-no-match');
    await flushPromises();
    expect(wrapper.find('[data-testid="no-matching-custom-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-matching-custom-properties"]').text()).toContain(
      'No matching custom properties',
    );
    wrapper.unmount();
  });

  it('shows the docs-linked empty state when the type defines no custom properties', async () => {
    typeMock.mockResolvedValue({ name: 'table', customProperties: [] });
    fetchMock.mockResolvedValue(detailWith({ id: 't1' }));
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewCustomFields']);
    await openCustomPropertiesTab(wrapper);
    const empty = wrapper.find('[data-testid="explore-preview-custom-properties-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('There are currently no custom properties defined for the Table.');
    const link = empty.find('a');
    expect(link.attributes('href')).toContain('docs.open-metadata.org');
    expect(link.attributes('href')).toContain('custom');
    wrapper.unmount();
  });

  it('shows the permission placeholder without ViewCustomFields', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', extension: {} }));
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic']);
    await openCustomPropertiesTab(wrapper);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-properties-list"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders rows read-only without EditCustomFields', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', extension: { sensitivity: 'high' } }));
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewCustomFields']);
    await openCustomPropertiesTab(wrapper);
    expect(wrapper.find('[data-testid="edit-custom-property-sensitivity"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves an edit through the extension PATCH and refetches the entity', async () => {
    fetchMock.mockResolvedValue(
      detailWith({ id: 't1', extension: { sensitivity: 'high', retentionDays: 30 } }),
    );
    const wrapper = await mountPreview(
      hitWith(undefined),
      ['ViewBasic', 'ViewCustomFields', 'EditCustomFields'],
      true,
      true,
    );
    await openCustomPropertiesTab(wrapper);
    await wrapper.find('[data-testid="edit-custom-property-sensitivity"]').trigger('click');
    await flushPromises();
    const input = document.querySelector(
      '[data-testid="custom-prop-sensitivity"]',
    ) as HTMLInputElement | null;
    expect(input?.value).toBe('high');
    if (input) {
      input.value = 'critical';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/extension', value: { sensitivity: 'critical', retentionDays: 30 } },
    ]);
    // The save refetches the entity (initial fetch + post-save refetch).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('loads data-product values through the governance fetch and saves through patchDataProduct', async () => {
    const wrapper = await mountPreview(
      {
        name: 'dp',
        fullyQualifiedName: 'biz.dp',
        entityType: 'dataProduct',
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
        id: 'dp-1',
      },
      ['ViewBasic', 'ViewCustomFields', 'EditCustomFields'],
    );
    await openCustomPropertiesTab(wrapper);
    expect(productMock).toHaveBeenCalledWith('biz.dp');
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('high');
    await wrapper.find('[data-testid="edit-custom-property-sensitivity"]').trigger('click');
    await flushPromises();
    const input = document.querySelector(
      '[data-testid="custom-prop-sensitivity"]',
    ) as HTMLInputElement | null;
    if (input) {
      input.value = 'critical';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const dpOk = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(dpOk).not.toBeNull();
    dpOk?.click();
    await flushPromises();
    await flushPromises();
    expect(productPatchMock).toHaveBeenCalledWith('dp-1', [
      { op: 'replace', path: '/extension', value: { sensitivity: 'critical' } },
    ]);
    wrapper.unmount();
  });

  it('loads column values from the parent table and saves through updateColumnDetails', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        entityType: 'table',
        schemaRows: [
          {
            key: 'customer_id',
            name: 'customer_id',
            dataType: 'varchar(50)',
            fullyQualifiedName: 'svc.db.schema.orders.customer_id',
            extension: { sensitivity: 'high' },
          },
        ],
      }),
    );
    const wrapper = await mountPreview(
      {
        name: 'customer_id',
        fullyQualifiedName: 'svc.db.schema.orders.customer_id',
        entityType: 'tableColumn',
        dataType: 'varchar(50)',
        tableName: 'orders',
        tableFqn: 'svc.db.schema.orders',
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
      },
      ['ViewBasic', 'ViewCustomFields', 'EditCustomFields'],
    );
    await openCustomPropertiesTab(wrapper);
    expect(typeMock).toHaveBeenCalledWith('column');
    expect(fetchMock).toHaveBeenCalledWith('table', 'svc.db.schema.orders');
    expect(wrapper.find('[data-testid="custom-property-sensitivity-row"]').text()).toContain('high');
    await wrapper.find('[data-testid="edit-custom-property-sensitivity"]').trigger('click');
    await flushPromises();
    const input = document.querySelector(
      '[data-testid="custom-prop-sensitivity"]',
    ) as HTMLInputElement | null;
    if (input) {
      input.value = 'critical';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const colOk = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(colOk).not.toBeNull();
    colOk?.click();
    await flushPromises();
    await flushPromises();
    expect(columnMock).toHaveBeenCalledWith('svc.db.schema.orders.customer_id', 'table', {
      extension: { sensitivity: 'critical' },
    });
    wrapper.unmount();
  });
});

describe('ExplorePreview E-3c overview inline edits', () => {
  const ALL_EDIT_OPS = [
    'ViewBasic',
    'EditDescription',
    'EditOwners',
    'EditDomains',
    'EditTier',
    'EditTags',
    'EditGlossaryTerms',
    'EditAll',
    'EditDisplayName',
  ];

  const TEST_CATALOG = {
    owners: [
      { key: 'user:u1', id: 'u1', type: 'user' as const, label: 'Alice (user)' },
      { key: 'user:u2', id: 'u2', type: 'user' as const, label: 'Bob (user)' },
      { key: 'team:t1', id: 't1', type: 'team' as const, label: 'Data Eng (team)' },
    ],
    tags: [
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' as const },
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' as const },
      { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' as const },
      { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary' as const },
      { tagFQN: 'Glossary.Address', name: 'Address', source: 'Glossary' as const },
      { tagFQN: 'Glossary.Phone', name: 'Phone', source: 'Glossary' as const },
      { tagFQN: 'Glossary.SSN', name: 'SSN', source: 'Glossary' as const },
    ],
    domains: [
      {
        id: 'd1',
        name: 'finance',
        displayName: 'Finance',
        domainType: 'Aggregate',
        owners: [],
        experts: [],
        tags: [],
      },
      {
        id: 'd2',
        name: 'marketing',
        displayName: 'Marketing',
        domainType: 'Aggregate',
        owners: [],
        experts: [],
        tags: [],
      },
    ],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    patchMock.mockReset();
    patchMock.mockResolvedValue({});
    columnMock.mockReset();
    columnMock.mockResolvedValue({});
    catalogMock.mockReset();
    catalogMock.mockResolvedValue(TEST_CATALOG);
    productMock.mockReset();
    productMock.mockResolvedValue({ id: 'dp-1', extension: {} });
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [],
      downstreamDepthInfo: [],
      maxUpstreamDepth: 0,
      maxDownstreamDepth: 0,
      totalUpstreamEntities: 0,
      totalDownstreamEntities: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // The description cell's read-only editor applies its content on a
  // 0ms timer (SmRichTextEditor content effect), as in
  // EntityDescriptionCell.test.ts.
  async function tick(ms = 10) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await flushPromises();
  }

  function modalOkButton(): HTMLElement | null {
    return document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
  }

  function richHit(): SearchHit {
    return {
      ...hitWith(undefined),
      id: 't1',
      owners: [{ name: 'alice', displayName: 'Alice', id: 'u1', type: 'user' }],
      domains: [{ name: 'finance', displayName: 'Finance', id: 'd1', type: 'domain' }],
      tags: [
        { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' },
        { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification', labelType: 'Manual' },
        { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual' },
      ],
      dataProducts: [{ name: 'dp2', displayName: 'DP2', id: 'dp-2', type: 'dataProduct' }],
    };
  }

  it('hides every edit affordance without edit permissions', async () => {
    const wrapper = await mountPreview(richHit());
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-edit-displayName"]').exists()).toBe(false);
    for (const section of [
      'explore-preview-owners',
      'explore-preview-domains',
      'explore-preview-tier',
      'explore-preview-glossary',
      'explore-preview-tags',
      'explore-preview-products',
    ]) {
      const block = wrapper.find(`[data-testid="${section}"]`);
      expect(block.find('[data-testid="edit-button"]').exists()).toBe(false);
      expect(block.find('[data-testid="add-ref"]').exists()).toBe(false);
      expect(block.find('[data-testid="add-domain"]').exists()).toBe(false);
      expect(block.find('[data-testid="add-tier"]').exists()).toBe(false);
      expect(block.find('[data-testid="add-tag"]').exists()).toBe(false);
      expect(block.find('[data-testid="add-data-product"]').exists()).toBe(false);
    }
    wrapper.unmount();
  });

  /**
   * The open editor's Select teleports its modal to `document.body`, so a
   * DOM-scoped search misses it; find it by the value the cell seeds it
   * with (every other cell's Select still holds its empty initial value).
   */
  function findOpenSelect(
    wrapper: Awaited<ReturnType<typeof mountPreview>>,
    expectedValue: unknown,
  ) {
    const select = wrapper
      .findAllComponents(Select)
      .find(
        (candidate) =>
          JSON.stringify(candidate.props('value')) === JSON.stringify(expectedValue),
      );
    expect(select, `no Select seeded with ${JSON.stringify(expectedValue)}`).toBeDefined();
    return select!;
  }

  it('shows an edit affordance in every section with edit permissions', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-edit-displayName"]').exists()).toBe(true);
    for (const section of [
      'explore-preview-owners',
      'explore-preview-domains',
      'explore-preview-tier',
      'explore-preview-glossary',
      'explore-preview-tags',
      'explore-preview-products',
    ]) {
      expect(wrapper.find(`[data-testid="${section}"]`).find('[data-testid="edit-button"]').exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('saves a description edit through the /description PATCH and refetches', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', description: 'Fresh description' }));
    const wrapper = await mountPreview(hitWith(undefined), ALL_EDIT_OPS, true, true);
    await tick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await tick();
    const save = document.querySelector('[data-testid="save"]') as HTMLElement | null;
    expect(save).not.toBeNull();
    save?.click();
    await tick();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/description', value: expect.stringContaining('Fresh description') },
    ]);
    // The save refetches the entity (initial fetch + post-save refetch).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('keeps the description editor open when the PATCH fails', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', description: 'Fresh description' }));
    patchMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountPreview(hitWith(undefined), ALL_EDIT_OPS, true, true);
    await tick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await tick();
    (document.querySelector('[data-testid="save"]') as HTMLElement | null)?.click();
    await tick();
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="save"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('saves an owners edit through the /owners PATCH', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-owners"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, ['user:u1']);
    await select.vm.$emit('change', ['user:u1', 'user:u2']);
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      {
        op: 'replace',
        path: '/owners',
        value: [
          { id: 'u1', type: 'user' },
          { id: 'u2', type: 'user' },
        ],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('keeps the owners editor open when the PATCH fails', async () => {
    patchMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-owners"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    modalOkButton()?.click();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(modalOkButton()).not.toBeNull();
    wrapper.unmount();
  });

  it('saves a domains edit through the /domains PATCH', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-domains"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, ['d1']);
    await select.vm.$emit('change', ['d1', 'd2']);
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      {
        op: 'replace',
        path: '/domains',
        value: [
          { id: 'd1', type: 'domain' },
          { id: 'd2', type: 'domain' },
        ],
      },
    ]);
    wrapper.unmount();
  });

  it('saves a tier edit as a tags PATCH with the old tier dropped', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-tier"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, 'Tier.Tier1');
    await select.vm.$emit('change', 'Tier.Tier1');
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      {
        op: 'replace',
        path: '/tags',
        value: [
          { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'Glossary.Contact', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ]);
    wrapper.unmount();
  });

  it('saves a tags edit through the /tags PATCH, keeping glossary and tier labels', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-tags"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, ['PII.Email']);
    await select.vm.$emit('change', ['PII.Email', 'PII.Sensitive']);
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      {
        op: 'replace',
        path: '/tags',
        value: [
          { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'Glossary.Contact', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ]);
    wrapper.unmount();
  });

  it('caps glossary terms at 3 with a "+N more" toggle (pin maxVisibleGlossaryTerms)', async () => {
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      tags: [
        { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary' },
        { tagFQN: 'Glossary.Address', name: 'Address', source: 'Glossary' },
        { tagFQN: 'Glossary.Phone', name: 'Phone', source: 'Glossary' },
        { tagFQN: 'Glossary.SSN', name: 'SSN', source: 'Glossary' },
      ],
    });
    const section = wrapper.find('[data-testid="explore-preview-glossary"]');
    const chips = section.findAll('.ant-tag');
    expect(chips.map((chip) => chip.text().trim())).toEqual(['Contact', 'Address', 'Phone']);
    const more = section.find('[data-testid="show-more-tags"]');
    expect(more.exists()).toBe(true);
    expect(more.text()).toContain('+1 more');
    await more.trigger('click');
    expect(section.findAll('.ant-tag').map((chip) => chip.text().trim())).toEqual([
      'Contact',
      'Address',
      'Phone',
      'SSN',
    ]);
    expect(section.find('[data-testid="show-less-tags"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves a data-products edit through the /dataProducts PATCH', async () => {
    const wrapper = await mountPreview(richHit(), ALL_EDIT_OPS);
    await tick();
    await wrapper
      .find('[data-testid="explore-preview-products"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, ['dp-2']);
    await select.vm.$emit('change', ['dp-2']);
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/dataProducts', value: [{ id: 'dp-2', type: 'dataProduct' }] },
    ]);
    wrapper.unmount();
  });

  it('saves a display-name edit through the /displayName PATCH and refetches', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', displayName: 'Orders' }));
    const wrapper = await mountPreview(hitWith(undefined), ALL_EDIT_OPS, true, true);
    await tick();
    await wrapper.find('[data-testid="explore-preview-edit-displayName"]').trigger('click');
    const input = document.querySelector(
      '[data-testid="explore-preview-displayName-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'Orders v2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('[data-testid="explore-preview-save-displayName"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flushPromises();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/displayName', value: 'Orders v2' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('keeps the display-name modal open when the PATCH fails', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', displayName: 'Orders' }));
    patchMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountPreview(hitWith(undefined), ALL_EDIT_OPS, true, true);
    await tick();
    await wrapper.find('[data-testid="explore-preview-edit-displayName"]').trigger('click');
    const input = document.querySelector(
      '[data-testid="explore-preview-displayName-input"]',
    ) as HTMLInputElement | null;
    if (input) {
      input.value = 'Orders v2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('[data-testid="explore-preview-save-displayName"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flushPromises();
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="explore-preview-save-displayName"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('routes a data-product domains save through patchDataProduct and reads the saved values back', async () => {
    productMock.mockResolvedValue({
      id: 'dp-1',
      name: 'dp',
      displayName: 'DP',
      domains: [{ name: 'marketing', displayName: 'Marketing', id: 'd2', type: 'domain' }],
      owners: [],
      tags: [],
    });
    const wrapper = await mountPreview(
      {
        name: 'dp',
        fullyQualifiedName: 'biz.dp',
        entityType: 'dataProduct',
        owners: [],
        tags: [],
        domains: [{ name: 'finance', displayName: 'Finance', id: 'd1', type: 'domain' }],
        dataProducts: [],
        id: 'dp-1',
      },
      ALL_EDIT_OPS,
    );
    await tick();
    expect(wrapper.find('[data-testid="explore-preview-domains"]').text()).toContain('Finance');
    await wrapper
      .find('[data-testid="explore-preview-domains"]')
      .find('[data-testid="edit-button"]')
      .trigger('click');
    const select = findOpenSelect(wrapper, ['d1']);
    await select.vm.$emit('change', ['d2']);
    modalOkButton()?.click();
    await flushPromises();
    await flushPromises();
    expect(productPatchMock).toHaveBeenCalledWith('dp-1', [
      { op: 'replace', path: '/domains', value: [{ id: 'd2', type: 'domain' }] },
    ]);
    // The post-save read-back replaces the stale hit domains without leaving the tab.
    expect(wrapper.find('[data-testid="explore-preview-domains"]').text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="explore-preview-domains"]').text()).not.toContain('Finance');
    wrapper.unmount();
  });

  it('edits description and tags on a column, never owners/domains/tier/data products', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        entityType: 'table',
        id: 't1',
        schemaRows: [
          {
            key: 'customer_id',
            name: 'customer_id',
            dataType: 'varchar(50)',
            fullyQualifiedName: 'svc.db.schema.orders.customer_id',
            description: 'Fresh column',
            tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
          },
        ],
      }),
    );
    const wrapper = await mountPreview(
      {
        name: 'customer_id',
        fullyQualifiedName: 'svc.db.schema.orders.customer_id',
        entityType: 'tableColumn',
        dataType: 'varchar(50)',
        tableName: 'orders',
        tableFqn: 'svc.db.schema.orders',
        serviceName: 'BigQuery Prod',
        databaseName: 'analytics',
        schemaName: 'marts',
        description: 'Column desc',
        owners: [],
        tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' }],
        domains: [],
        dataProducts: [],
      },
      ALL_EDIT_OPS,
      true,
      true,
    );
    await tick();
    // Pin DataAssetSummaryPanelV1.tsx:490-493: columns inherit owners,
    // domains, tier and data products from the parent table.
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview-tags"]').find('[data-testid="edit-button"]').exists()).toBe(true);
    for (const section of [
      'explore-preview-owners',
      'explore-preview-domains',
      'explore-preview-tier',
      'explore-preview-products',
    ]) {
      expect(wrapper.find(`[data-testid="${section}"]`).find('[data-testid="edit-button"]').exists()).toBe(false);
      expect(wrapper.find(`[data-testid="${section}"]`).find('[data-testid="add-ref"]').exists()).toBe(false);
    }
    // Column description saves through updateColumnDetails, not patchAsset.
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await tick();
    (document.querySelector('[data-testid="save"]') as HTMLElement | null)?.click();
    await tick();
    expect(columnMock).toHaveBeenCalledWith('svc.db.schema.orders.customer_id', 'table', {
      description: expect.stringContaining('Column desc'),
    });
    expect(patchMock).not.toHaveBeenCalled();
    // The post-save read-back shows the parent table's fresh column row.
    expect(wrapper.find('[data-testid="explore-preview-description"]').text()).toContain('Fresh column');
    wrapper.unmount();
  });

  it('shows no edit affordance for a type with no wired patch endpoint, whatever the permissions say', async () => {
    const wrapper = await mountPreview(
      {
        name: 'term',
        fullyQualifiedName: 'biz.term',
        entityType: 'tag',
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
        id: 'tag-1',
      },
      ALL_EDIT_OPS,
    );
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-edit-displayName"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-preview-owners"]').find('[data-testid="add-ref"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ExplorePreview E-3d remaining tabs', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('no detail endpoint in test'));
    queryCountMock.mockReset();
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [],
      downstreamDepthInfo: [],
      maxUpstreamDepth: 0,
      maxDownstreamDepth: 0,
      totalUpstreamEntities: 0,
      totalDownstreamEntities: 0,
    });
    searchLineageMock.mockReset();
    searchLineageMock.mockResolvedValue({
      nodes: {
        'svc.db.schema.orders': {
          entity: {
            id: 't1',
            name: 'orders',
            displayName: 'Orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            type: 'table',
          },
          nodeDepth: 0,
        },
        'svc.dash.orders': {
          entity: {
            id: 'd1',
            name: 'orders',
            displayName: 'Orders dashboard',
            fullyQualifiedName: 'svc.dash.orders',
            type: 'dashboard',
          },
          nodeDepth: 1,
        },
      },
      upstreamEdges: {},
      downstreamEdges: {
        e2: {
          fromEntity: { id: 't1', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
          toEntity: { id: 'd1', fullyQualifiedName: 'svc.dash.orders', type: 'dashboard' },
        },
      },
    });
    listTestCasesMock.mockReset();
    listTestCasesMock.mockResolvedValue({ data: [], total: 0 });
    listTestCasesBySearchMock.mockReset();
    listTestCasesBySearchMock.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the Schema tab for a table hit and renders its columns from the fetched entity', async () => {
    fetchMock.mockResolvedValue(
      detailWith({
        id: 't1',
        schemaRows: [
          { key: 'a', name: 'a', dataType: 'int', description: 'first column' },
          { key: 'b', name: 'b', dataType: 'varchar(50)' },
        ],
      }),
    );
    const wrapper = await mountPreview(hitWith(undefined));
    await wrapper.find('[data-testid="schema-tab"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview-schema"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-schema-row-a"]').text()).toContain('first column');
    expect(wrapper.find('[data-testid="preview-schema-row-b"]').text()).toContain('varchar(50)');
    // The Overview content unmounts with the tab switch (mount = activation).
    expect(wrapper.find('[data-testid="explore-preview-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows no Schema tab for types pin excludes (metric)', async () => {
    const wrapper = await mountPreview({ ...hitWith(undefined), entityType: 'metric' });
    expect(wrapper.find('[data-testid="schema-tab"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the Lineage tab for a table hit and renders the downstream summary list', async () => {
    const wrapper = await mountPreview(hitWith(undefined));
    await wrapper.find('[data-testid="lineage-tab"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(searchLineageMock).toHaveBeenCalledWith({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      upstreamDepth: 1,
      downstreamDepth: 1,
      size: 50,
    });
    expect(wrapper.find('[data-testid="preview-lineage-item-d1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-lineage-item-d1"]').text()).toContain('Orders dashboard');
    wrapper.unmount();
  });

  it('shows no Lineage tab for types pin excludes (metric)', async () => {
    const wrapper = await mountPreview({ ...hitWith(undefined), entityType: 'metric' });
    expect(wrapper.find('[data-testid="lineage-tab"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the Data Quality tab for a table hit and renders its test cases', async () => {
    listTestCasesBySearchMock.mockResolvedValue({
      data: [
        {
          id: 'tc-1',
          name: 'test_column_values_to_not_be_null',
          displayName: 'Column values not null',
          fullyQualifiedName: 'svc.db.schema.orders.customer_id.test_column_values_to_not_be_null',
          entityLink: '<#E::table::svc.db.schema.orders::columns::customer_id>',
          testSuites: [],
          parameterValues: [],
          testCaseResult: { testCaseStatus: 'Success' },
        },
      ],
      total: 1,
    });
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewTests']);
    await wrapper.find('[data-testid="data-quality-tab"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(listTestCasesBySearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityFQN: 'svc.db.schema.orders', includeAllTests: true, limit: 50 }),
    );
    expect(wrapper.find('[data-testid="preview-test-case-tc-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-test-case-tc-1"]').text()).toContain('customer_id');
    wrapper.unmount();
  });

  it('shows no Data Quality tab for non-table hits (topic)', async () => {
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      entityType: 'topic',
      fullyQualifiedName: 'kafka.events',
      name: 'events',
    });
    expect(wrapper.find('[data-testid="data-quality-tab"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the Overview DQ strip with success/aborted/failed/total from listTestCases limit 100', async () => {
    listTestCasesMock.mockResolvedValue({
      data: [
        { id: 'tc-1', name: 'a', testSuites: [], parameterValues: [], testCaseResult: { testCaseStatus: 'Success' } },
        { id: 'tc-2', name: 'b', testSuites: [], parameterValues: [], testCaseResult: { testCaseStatus: 'Success' } },
        { id: 'tc-3', name: 'c', testSuites: [], parameterValues: [], testCaseResult: { testCaseStatus: 'Failed' } },
        { id: 'tc-4', name: 'd', testSuites: [], parameterValues: [], testCaseResult: { testCaseStatus: 'Aborted' } },
        { id: 'tc-5', name: 'e', testSuites: [], parameterValues: [] },
      ],
      total: 5,
    });
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewDataProfile']);
    await flushPromises();
    expect(listTestCasesMock).toHaveBeenCalledWith({
      entityFQN: 'svc.db.schema.orders',
      includeAllTests: true,
      limit: 100,
    });
    const strip = wrapper.find('[data-testid="explore-preview-data-quality"]');
    expect(strip.exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-dq-strip-success"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="preview-dq-strip-failed"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="preview-dq-strip-aborted"]').text()).toBe('1');
    // Pin counts only cases with a status in the total.
    expect(wrapper.find('[data-testid="preview-dq-strip-total"]').text()).toBe('4');
    wrapper.unmount();
  });

  it('shows no DQ strip for non-table hits (topic)', async () => {
    const wrapper = await mountPreview({
      ...hitWith(undefined),
      entityType: 'topic',
      fullyQualifiedName: 'kafka.events',
      name: 'events',
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview-data-quality"]').exists()).toBe(false);
    expect(listTestCasesMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('links the Overview Incidents row to the table profiler tab (pin EntityTabs.PROFILER)', async () => {
    fetchMock.mockResolvedValue(detailWith({ id: 't1', tableType: 'Regular', schemaRows: [] }));
    queryCountMock.mockResolvedValue(0);
    incidentsMock.mockResolvedValue({ data: [], total: 5 });
    const wrapper = await mountPreview(hitWith(undefined), ['ViewBasic', 'ViewDataProfile']);
    await flushPromises();
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Incidents');
    const link = overview.find('a[href*="tab=profiler"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('5');
    wrapper.unmount();
  });
});
