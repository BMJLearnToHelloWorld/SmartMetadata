/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePersonaStore } from '@/stores/persona';
import type { PersonaDocument } from '@/types/persona';
import {
  entityTypeForPageType,
  findCustomizedTabEntry,
  getDetailsTabWithNewLabel,
  getRenderedActiveTab,
  getTabLabelMapFromTabs,
  pageTypeForEntityType,
  resolveMountTabId,
  useCustomPages,
} from './useCustomPages';

function documentWithPages(pages: PersonaDocument['data']['pages'], extra: Record<string, unknown> = {}): PersonaDocument {
  return {
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: { pages, ...extra },
  };
}

describe('pageTypeForEntityType', () => {
  it('maps every wired product entity type to its official PageType', () => {
    expect(pageTypeForEntityType('table')).toBe('Table');
    expect(pageTypeForEntityType('topic')).toBe('Topic');
    expect(pageTypeForEntityType('storedProcedure')).toBe('StoredProcedure');
    expect(pageTypeForEntityType('dashboardDataModel')).toBe('DashboardDataModel');
    expect(pageTypeForEntityType('dashboard')).toBe('Dashboard');
    expect(pageTypeForEntityType('pipeline')).toBe('Pipeline');
    expect(pageTypeForEntityType('databaseSchema')).toBe('DatabaseSchema');
    expect(pageTypeForEntityType('database')).toBe('Database');
    expect(pageTypeForEntityType('container')).toBe('Container');
    expect(pageTypeForEntityType('searchIndex')).toBe('SearchIndex');
    expect(pageTypeForEntityType('metric')).toBe('Metric');
    expect(pageTypeForEntityType('mlmodel')).toBe('MlModel');
    expect(pageTypeForEntityType('apiEndpoint')).toBe('APIEndpoint');
    expect(pageTypeForEntityType('apiCollection')).toBe('APICollection');
    expect(pageTypeForEntityType('chart')).toBe('Chart');
    expect(pageTypeForEntityType('domain')).toBe('Domain');
    expect(pageTypeForEntityType('dataProduct')).toBe('DataProduct');
    expect(pageTypeForEntityType('glossary')).toBe('Glossary');
    expect(pageTypeForEntityType('glossaryTerm')).toBe('GlossaryTerm');
    expect(pageTypeForEntityType('tag')).toBe('Tag');
  });

  it('maps the Drive leaves, whose views do not exist yet (R-C4-DRIVE)', () => {
    expect(pageTypeForEntityType('directory')).toBe('Directory');
    expect(pageTypeForEntityType('file')).toBe('File');
    expect(pageTypeForEntityType('spreadsheet')).toBe('Spreadsheet');
    expect(pageTypeForEntityType('worksheet')).toBe('Worksheet');
  });

  it('has no mapping for Classification or query: no official consumption call', () => {
    expect(pageTypeForEntityType('classification')).toBeUndefined();
    expect(pageTypeForEntityType('query')).toBeUndefined();
    expect(pageTypeForEntityType('nope')).toBeUndefined();
  });
});

describe('entityTypeForPageType (R-EDIT-2)', () => {
  it('inverts the entity-type map, so the Custom Properties section can fetch by page', () => {
    expect(entityTypeForPageType('Table')).toBe('table');
    expect(entityTypeForPageType('Topic')).toBe('topic');
    expect(entityTypeForPageType('MlModel')).toBe('mlmodel');
    expect(entityTypeForPageType('DashboardDataModel')).toBe('dashboardDataModel');
    expect(entityTypeForPageType('Directory')).toBe('directory');
  });

  it('has no mapping for page types with no entity counterpart', () => {
    expect(entityTypeForPageType('LandingPage')).toBeUndefined();
    expect(entityTypeForPageType('Nope')).toBeUndefined();
  });
});

describe('getTabLabelMapFromTabs', () => {
  it('maps tab ids to displayNames only when both are present', () => {
    expect(
      getTabLabelMapFromTabs([
        { id: 'schema', displayName: 'Columns' },
        { id: 'lineage' },
        { id: 'profiler', displayName: '' },
        { displayName: 'NoId' },
        null,
        'schema',
      ]),
    ).toEqual({ schema: 'Columns' });
    expect(getTabLabelMapFromTabs(undefined)).toEqual({});
    expect(getTabLabelMapFromTabs({})).toEqual({});
  });
});

describe('getDetailsTabWithNewLabel', () => {
  const defaults = [
    { key: 'schema', label: 'Schema' },
    { key: 'lineage', label: 'Lineage' },
    { key: 'activity_feed', label: 'Activity' },
    { key: 'custom_properties', label: 'Custom Properties' },
  ];

  it('leaves the defaults untouched without a customized tab list', () => {
    expect(getDetailsTabWithNewLabel(defaults, undefined)).toEqual(defaults);
    expect(getDetailsTabWithNewLabel(defaults, null)).toEqual(defaults);
    expect(getDetailsTabWithNewLabel(defaults, [{ id: 'lineage' }], { isVersionView: true })).toEqual(
      defaults,
    );
  });

  it('throws for a present-but-non-array tab list, as officially (B-12)', () => {
    // Official `customizedTabs?.map(...)`: `?.` does not short-circuit
    // a truthy non-array value and `??` does not catch the throw, so
    // the call throws TypeError instead of silently defaulting.
    // The throw surfaces through the top-level error boundary (B-9).
    expect(() => getDetailsTabWithNewLabel(defaults, {})).toThrow(TypeError);
    expect(() => getDetailsTabWithNewLabel(defaults, 'schema')).toThrow(TypeError);
    expect(() => getDetailsTabWithNewLabel(defaults, 3)).toThrow(TypeError);
  });

  it('reorders and relabels by the customized list, dropping unknown ids (official replacement)', () => {
    expect(
      getDetailsTabWithNewLabel(defaults, [
        { id: 'lineage', displayName: 'Flow' },
        { id: 'schema' },
        { id: 'nope', displayName: 'Ghost' },
      ]),
    ).toEqual([
      { key: 'lineage', label: 'Flow' },
      { key: 'schema', label: 'Schema' },
    ]);
  });

  it('yields no tabs for an empty customized list under replacement', () => {
    expect(getDetailsTabWithNewLabel(defaults, [])).toEqual([]);
  });

  it('keeps only the listed preserveKeys, appended in default order, and drops other unlisted tabs', () => {
    expect(
      getDetailsTabWithNewLabel(
        defaults,
        [{ id: 'lineage', displayName: 'Flow' }],
        { preserveKeys: ['custom_properties'] },
      ),
    ).toEqual([
      { key: 'lineage', label: 'Flow' },
      { key: 'custom_properties', label: 'Custom Properties' },
    ]);
    // Preserved keys append in default order, not in preserveKeys
    // order, and a key the customized list already mentions is not
    // duplicated; a preserveKeys entry with no default tab is ignored
    // rather than synthesized.
    expect(
      getDetailsTabWithNewLabel(
        defaults,
        [{ id: 'schema' }],
        { preserveKeys: ['custom_properties', 'schema', 'ghost', 'activity_feed'] },
      ),
    ).toEqual([
      { key: 'schema', label: 'Schema' },
      { key: 'activity_feed', label: 'Activity' },
      { key: 'custom_properties', label: 'Custom Properties' },
    ]);
    // An empty preserveKeys list is pure replacement.
    expect(
      getDetailsTabWithNewLabel(defaults, [{ id: 'lineage' }], { preserveKeys: [] }),
    ).toEqual([{ key: 'lineage', label: 'Lineage' }]);
  });

  it('yields no tabs for an explicitly empty customized list, even when preserving', () => {
    // F-1: the empty list is a stated intent (the page was saved with
    // no tabs), not an absent customization, so preservation must not
    // resurrect the defaults — even when every default is preserved.
    const preserveAll = {
      preserveKeys: ['schema', 'lineage', 'activity_feed', 'custom_properties'],
    };
    expect(getDetailsTabWithNewLabel(defaults, [], preserveAll)).toEqual([]);
    // The short-circuit runs on the parsed ids: a list whose entries
    // carry no usable id names no tab either.
    expect(
      getDetailsTabWithNewLabel(defaults, [{ name: 'schema' }, null, 'schema'], preserveAll),
    ).toEqual([]);
    // Absence still means "no customization": missing lists keep the
    // defaults even with preservation on. A present-but-non-array list
    // throws instead (B-12, official `?.map` semantics).
    expect(getDetailsTabWithNewLabel(defaults, undefined, preserveAll)).toEqual(defaults);
    expect(getDetailsTabWithNewLabel(defaults, null, preserveAll)).toEqual(defaults);
    expect(() => getDetailsTabWithNewLabel(defaults, {}, preserveAll)).toThrow(TypeError);
    expect(() => getDetailsTabWithNewLabel(defaults, 'schema', preserveAll)).toThrow(TypeError);
  });

  it('resolves official ids to product keys through aliases, exact matches first', () => {
    const productTabs = [
      { key: 'overview', label: 'Overview' },
      { key: 'activity', label: 'Activity' },
      { key: 'customProperties', label: 'Custom' },
    ];
    expect(
      getDetailsTabWithNewLabel(
        productTabs,
        [{ id: 'activity_feed' }, { id: 'custom_properties' }, { id: 'documentation' }],
        // `overview` is already reached through the `documentation`
        // alias, so preserving it must not duplicate the tab.
        { preserveKeys: ['overview'] },
      ),
    ).toEqual([
      { key: 'activity', label: 'Activity' },
      { key: 'customProperties', label: 'Custom' },
      { key: 'overview', label: 'Overview' },
    ]);
    // `details` matches exactly on split views, so the alias never fires there.
    expect(
      getDetailsTabWithNewLabel(
        [
          { key: 'details', label: 'Details' },
          { key: 'activity_feed', label: 'Activity' },
        ],
        [{ id: 'details' }],
      ),
    ).toEqual([{ key: 'details', label: 'Details' }]);
  });

  it('resolves the API endpoints tab per view through ordered alias candidates', () => {
    expect(
      getDetailsTabWithNewLabel(
        [
          { key: 'overview', label: 'Overview' },
          { key: 'apiEndpoints', label: 'Endpoints' },
        ],
        [{ id: 'apiEndpoint' }],
      ),
    ).toEqual([{ key: 'apiEndpoints', label: 'Endpoints' }]);
    expect(
      getDetailsTabWithNewLabel(
        [
          { key: 'overview', label: 'Overview' },
          { key: 'endpoint', label: 'Endpoint' },
        ],
        [{ id: 'apiEndpoint' }],
      ),
    ).toEqual([{ key: 'endpoint', label: 'Endpoint' }]);
  });

  it('resolves the APIEndpoint mount id schema to the endpoint tab only where no schema key exists', () => {
    // The endpoint view has no `schema` key: the official SCHEMA entry
    // reorders/renames the `endpoint` tab carrying the schema pane.
    expect(
      getDetailsTabWithNewLabel(
        [
          { key: 'overview', label: 'Overview' },
          { key: 'endpoint', label: 'Endpoint' },
        ],
        [{ id: 'schema', displayName: 'Schema!' }],
      ),
    ).toEqual([{ key: 'endpoint', label: 'Schema!' }]);
    // Exact match wins: on a view with a `schema` key the alias never
    // fires, so Table/Topic tabs are unaffected.
    expect(
      getDetailsTabWithNewLabel(
        [
          { key: 'schema', label: 'Schema' },
          { key: 'endpoint', label: 'Endpoint' },
        ],
        [{ id: 'schema' }],
      ),
    ).toEqual([{ key: 'schema', label: 'Schema' }]);
  });

  it('resolves the hyphenated search-index-settings id to the underscored product key', () => {
    // The official EntityTabs spelling is `search-index-settings`;
    // the product split key is `search_index_settings`. Without the
    // alias the official id would resolve to no tab and the settings
    // tab would vanish under any customization; with it, listing the
    // id keeps and renames the tab, omitting it removes the tab.
    const searchIndexTabs = [
      { key: 'fields', label: 'Fields' },
      { key: 'search_index_settings', label: 'Search index settings' },
    ];
    expect(
      getDetailsTabWithNewLabel(searchIndexTabs, [
        { id: 'search-index-settings', displayName: 'Settings' },
        { id: 'fields' },
      ]),
    ).toEqual([
      { key: 'search_index_settings', label: 'Settings' },
      { key: 'fields', label: 'Fields' },
    ]);
    expect(getDetailsTabWithNewLabel(searchIndexTabs, [{ id: 'fields' }])).toEqual([
      { key: 'fields', label: 'Fields' },
    ]);
  });

  // Order dedupes first-wins (the first occurrence fixes the position), while the
  // label map is an official-style reduce, so a later displayName for the same
  // id wins the label. Both halves are pinned: dropping the second entry
  // entirely would lose its label, keeping both would duplicate the tab.
  it('dedupes duplicate customized ids (first position wins, last label wins) and preserves extra tab fields', () => {
    const withCounts = [
      { key: 'schema', label: 'Schema', testId: 'tab-schema', count: 3 },
      { key: 'lineage', label: 'Lineage', testId: 'tab-lineage' },
    ];
    expect(
      getDetailsTabWithNewLabel(withCounts, [{ id: 'schema' }, { id: 'schema', displayName: 'Again' }]),
    ).toEqual([{ key: 'schema', label: 'Again', testId: 'tab-schema', count: 3 }]);
  });
});

describe('getDetailsTabWithNewLabel per-view preserveKeys contracts (F-2)', () => {
  // Each row mirrors one call site's rendered keys and preserveKeys:
  // a customized subset removes every official tab it omits, the
  // call site's product-only keys survive an unmentioned
  // customization, and an explicitly empty list still yields no tabs.
  // Labels default to the key so renames stand out.
  const tab = (key: string, label = key) => ({ key, label });
  const cases: Array<{
    name: string;
    defaults: Array<{ key: string; label: string }>;
    options: { preserveKeys?: readonly string[] };
    customized: unknown;
    expected: Array<{ key: string; label: string }>;
  }> = [
    {
      name: 'Table split: subset removes unlisted tabs, renames and reorders the rest',
      defaults: ['schema', 'activity_feed', 'sample_data', 'table_queries', 'profiler', 'lineage', 'dbt', 'view_definition', 'contract', 'custom_properties'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'lineage', displayName: 'Flow' },
        { id: 'schema' },
        { id: 'activity_feed', displayName: 'Feed' },
      ],
      expected: [tab('lineage', 'Flow'), tab('schema'), tab('activity_feed', 'Feed')],
    },
    {
      name: 'SearchIndex split: the full editor list round-trips, including the hyphenated settings id',
      defaults: ['fields', 'activity_feed', 'sample_data', 'lineage', 'contract', 'search_index_settings', 'custom_properties'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'fields' },
        { id: 'activity_feed' },
        { id: 'sample_data' },
        { id: 'lineage' },
        { id: 'contract' },
        { id: 'search-index-settings' },
        { id: 'custom_properties' },
      ],
      expected: ['fields', 'activity_feed', 'sample_data', 'lineage', 'contract', 'search_index_settings', 'custom_properties'].map((key) => tab(key)),
    },
    {
      name: 'APICollection split: only the product-only overview survives an unmentioned customization',
      defaults: ['overview', 'apiEndpoints', 'activity_feed', 'custom_properties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [{ id: 'activity_feed' }],
      expected: [tab('activity_feed'), tab('overview')],
    },
    {
      name: 'APICollection split: alias rename and reorder keep the preserved overview appended',
      defaults: ['overview', 'apiEndpoints', 'activity_feed', 'custom_properties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [
        { id: 'apiEndpoint', displayName: 'Endpoints!' },
        { id: 'custom_properties' },
      ],
      expected: [tab('apiEndpoints', 'Endpoints!'), tab('custom_properties'), tab('overview')],
    },
    {
      name: 'APICollection split: an explicitly empty list yields no tabs despite preservation',
      defaults: ['overview', 'apiEndpoints', 'activity_feed', 'custom_properties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [],
      expected: [],
    },
    {
      name: 'APIEndpoint split: the schema alias renames the endpoint tab and overview is preserved',
      defaults: ['overview', 'endpoint', 'activity_feed', 'custom_properties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [{ id: 'schema', displayName: 'Schema!' }],
      expected: [tab('endpoint', 'Schema!'), tab('overview')],
    },
    {
      name: 'Chart fallback: official TabsIds have no Quality tab, so only the listed lineage tab remains',
      defaults: ['overview', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: [] },
      customized: [{ id: 'lineage' }],
      expected: [tab('lineage')],
    },
    {
      name: 'Chart fallback: the details alias keeps and renames overview; official has no Quality tab to preserve',
      defaults: ['overview', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: [] },
      customized: [{ id: 'details', displayName: 'Chart!' }],
      expected: [tab('overview', 'Chart!')],
    },
    {
      name: 'File fallback: the official overview id keeps overview; official has no Quality tab to preserve',
      defaults: ['overview', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: [] },
      customized: [{ id: 'overview', displayName: 'File!' }],
      expected: [tab('overview', 'File!')],
    },
    {
      name: 'catalog Pipeline fallback: official has no Quality tab; overview is preserved in default order',
      defaults: ['overview', 'tasks', 'executions', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [{ id: 'tasks' }],
      expected: [tab('tasks'), tab('overview')],
    },
    {
      name: 'Directory fallback: an id resolving to no rendered key still leaves the preserved overview',
      defaults: ['overview', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [{ id: 'children' }],
      expected: [tab('overview')],
    },
    {
      name: 'Worksheet fallback: the schema id resolves to no fallback key, preserved overview remains',
      defaults: ['overview', 'lineage', 'activity', 'customProperties'].map((key) => tab(key)),
      options: { preserveKeys: ['overview'] },
      customized: [{ id: 'schema' }],
      expected: [tab('overview')],
    },
    {
      name: 'Domain: every key resolves, so a subset removes the rest',
      defaults: ['overview', 'assets', 'subDomains', 'activity', 'customProperties'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'activity_feed', displayName: 'Feed' },
        { id: 'subdomains' },
      ],
      expected: [tab('activity', 'Feed'), tab('subDomains')],
    },
    {
      name: 'DataProduct: every key resolves, so a subset removes the rest',
      defaults: ['overview', 'assets', 'activity', 'customProperties'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'custom_properties', displayName: 'Props' },
        { id: 'activity_feed' },
      ],
      expected: [tab('customProperties', 'Props'), tab('activity')],
    },
    {
      name: 'Glossary: every key resolves, so a subset removes the rest',
      defaults: ['terms', 'relations', 'activity'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'relations_graph', displayName: 'Graph' },
        { id: 'terms' },
      ],
      expected: [tab('relations', 'Graph'), tab('terms')],
    },
    {
      name: 'GlossaryTerm: every key matches exactly, so a subset removes the rest',
      defaults: ['overview', 'glossary_terms', 'assets', 'activity_feed', 'relations_graph', 'custom_properties', 'data_observability'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'assets', displayName: 'Linked' },
        { id: 'overview' },
      ],
      expected: [tab('assets', 'Linked'), tab('overview')],
    },
    {
      name: 'Metric: every key matches exactly, so a subset removes the rest',
      defaults: ['overview', 'lineage', 'assets', 'activity_feed', 'custom_properties'].map((key) => tab(key)),
      options: {},
      customized: [
        { id: 'activity_feed', displayName: 'Feed' },
        { id: 'overview' },
      ],
      expected: [tab('activity_feed', 'Feed'), tab('overview')],
    },
    {
      name: 'ingestion Pipeline: catalog ids resolve to neither key, both product-only keys are preserved',
      defaults: ['overview', 'status'].map((key) => tab(key)),
      options: { preserveKeys: ['overview', 'status'] },
      customized: [{ id: 'tasks' }, { id: 'executions' }],
      expected: [tab('overview'), tab('status')],
    },
    {
      name: 'ingestion Pipeline: the documentation alias renames overview, status is preserved',
      defaults: ['overview', 'status'].map((key) => tab(key)),
      options: { preserveKeys: ['overview', 'status'] },
      customized: [{ id: 'documentation', displayName: 'Summary' }],
      expected: [tab('overview', 'Summary'), tab('status')],
    },
    {
      name: 'ingestion Pipeline: an explicitly empty list yields no tabs despite preservation',
      defaults: ['overview', 'status'].map((key) => tab(key)),
      options: { preserveKeys: ['overview', 'status'] },
      customized: [],
      expected: [],
    },
  ];

  it.each(cases)('$name', ({ defaults, options, customized, expected }) => {
    expect(getDetailsTabWithNewLabel(defaults, customized, options)).toEqual(expected);
  });
});

describe('getRenderedActiveTab', () => {
  const tabs = [{ key: 'schema' }, { key: 'lineage' }];

  it('keeps the selected tab when rendered, else falls back to the first tab', () => {
    expect(getRenderedActiveTab(tabs, 'lineage')).toBe('lineage');
    expect(getRenderedActiveTab(tabs, 'missing')).toBe('schema');
    expect(getRenderedActiveTab(tabs, undefined)).toBe('schema');
    expect(getRenderedActiveTab([], 'schema')).toBe('');
    expect(getRenderedActiveTab(undefined, undefined)).toBe('');
  });
});

describe('useCustomPages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubEmptyPersonas(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function mountHook(pageType: string | null | undefined) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = usePersonaStore();
    let exposed: ReturnType<typeof useCustomPages> | undefined;
    const probe = defineComponent({
      setup() {
        exposed = useCustomPages(pageType);
        return () => h('div');
      },
    });
    const wrapper = mount(probe, { global: { plugins: [pinia] } });
    return { wrapper, store, exposed: () => exposed as ReturnType<typeof useCustomPages> };
  }

  it('resolves the customized page for the requested pageType from the store document', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Table');
    store.document = documentWithPages([
      { pageType: 'Table', tabs: [{ id: 'schema', name: 'schema' }] },
      { pageType: 'Topic', tabs: [] },
    ]);
    await nextTick();
    expect(exposed().customizedPage.value?.pageType).toBe('Table');
    expect(exposed().customizedPage.value?.tabs).toHaveLength(1);
    expect(exposed().isLoading.value).toBe(false);
  });

  it('resolves the Tag customized page explicitly (TagPage consumption)', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Tag');
    store.document = documentWithPages([
      { pageType: 'Tag', tabs: [{ id: 'overview', name: 'overview' }] },
      { pageType: 'Classification', tabs: [] },
    ]);
    await nextTick();
    expect(exposed().customizedPage.value?.pageType).toBe('Tag');
    expect(exposed().customizedPage.value?.tabs).toHaveLength(1);
  });

  it('returns null for a missing page, a null pageType, and no document', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Table');
    store.document = documentWithPages([{ pageType: 'Topic', tabs: [] }]);
    await nextTick();
    expect(exposed().customizedPage.value).toBeNull();
    store.document = null;
    await nextTick();
    expect(exposed().customizedPage.value).toBeNull();
  });

  it('returns the document navigation array, and null without a persona document', async () => {
    stubEmptyPersonas();
    const navigation = [{ id: 'home', title: 'Home', pageId: 'p1' }];
    const { store, exposed } = mountHook('Navigation');
    expect(exposed().customizedPage.value).toBeNull();
    expect(exposed().navigation.value).toBeNull();
    store.document = documentWithPages([], { navigation });
    await nextTick();
    expect(exposed().navigation.value).toEqual(navigation);
  });

  it('throws a TypeError for a present-but-non-array navigation (D-7)', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Navigation');
    store.document = documentWithPages([], { navigation: 'not-an-array' });
    await nextTick();
    expect(() => exposed().navigation.value).toThrow(TypeError);
    store.document = documentWithPages([], { navigation: { home: true } });
    await nextTick();
    expect(() => exposed().navigation.value).toThrow(TypeError);
  });

  it('exposes the store document load error (D-9)', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Table');
    expect(exposed().loadError.value).toBeNull();
    store.documentError = 'boom';
    await nextTick();
    expect(exposed().loadError.value).toBe('boom');
    store.documentError = null;
    await nextTick();
    expect(exposed().loadError.value).toBeNull();
  });

  it('reacts to store updates, so a save lands on consumers without a refetch', async () => {
    stubEmptyPersonas();
    const { store, exposed } = mountHook('Table');
    await nextTick();
    expect(exposed().customizedPage.value).toBeNull();
    store.document = documentWithPages([{ pageType: 'Table', tabs: [{ id: 'schema' }] }]);
    await nextTick();
    expect(exposed().customizedPage.value?.pageType).toBe('Table');
    store.document = documentWithPages([]);
    await nextTick();
    expect(exposed().customizedPage.value).toBeNull();
  });

  it('loads the persona document for the selected persona', async () => {
    const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return jsonResponse({
            name: 'analyst-analyst',
            fullyQualifiedName: 'persona.analyst',
            entityType: 'Page',
            data: { pages: [{ pageType: 'Table', tabs: [{ id: 'lineage', name: 'lineage' }] }] },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { exposed } = mountHook('Table');
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(exposed().customizedPage.value?.pageType).toBe('Table');
    expect(exposed().customizedPage.value?.tabs).toHaveLength(1);
  });
});

describe('findCustomizedTabEntry', () => {
  it('returns the entry whose id matches the rendered key exactly', () => {
    const schema = { id: 'schema', layout: [] };
    const tabs = [{ id: 'overview' }, schema, { id: 'lineage' }];
    expect(findCustomizedTabEntry(tabs, 'schema')).toBe(schema);
  });

  it('resolves through aliases when no entry matches exactly', () => {
    expect(findCustomizedTabEntry([{ id: 'activity_feed' }], 'activity')).toEqual({
      id: 'activity_feed',
    });
    expect(findCustomizedTabEntry([{ id: 'documentation' }], 'overview')).toEqual({
      id: 'documentation',
    });
    expect(findCustomizedTabEntry([{ id: 'custom_properties' }], 'customProperties')).toEqual({
      id: 'custom_properties',
    });
    expect(findCustomizedTabEntry([{ id: 'subdomains' }], 'subDomains')).toEqual({
      id: 'subdomains',
    });
    expect(findCustomizedTabEntry([{ id: 'relations_graph' }], 'relations')).toEqual({
      id: 'relations_graph',
    });
    expect(findCustomizedTabEntry([{ id: 'search-index-settings' }], 'search_index_settings')).toEqual({
      id: 'search-index-settings',
    });
  });

  it('tries each alias candidate for the shared apiEndpoint id', () => {
    expect(findCustomizedTabEntry([{ id: 'apiEndpoint' }], 'apiEndpoints')).toEqual({
      id: 'apiEndpoint',
    });
    expect(findCustomizedTabEntry([{ id: 'apiEndpoint' }], 'endpoint')).toEqual({
      id: 'apiEndpoint',
    });
  });

  it('prefers an exact match over an alias match, regardless of order', () => {
    const aliased = { id: 'documentation' };
    const exact = { id: 'overview' };
    expect(findCustomizedTabEntry([aliased, exact], 'overview')).toBe(exact);
    expect(findCustomizedTabEntry([exact, aliased], 'overview')).toBe(exact);
  });

  it('returns undefined when nothing resolves to the rendered key', () => {
    expect(findCustomizedTabEntry([{ id: 'schema' }], 'lineage')).toBeUndefined();
    expect(findCustomizedTabEntry([], 'overview')).toBeUndefined();
    expect(findCustomizedTabEntry([{ id: 'activity_feed' }], 'overview')).toBeUndefined();
  });

  it('returns undefined for a non-array tab list', () => {
    expect(findCustomizedTabEntry(undefined, 'overview')).toBeUndefined();
    expect(findCustomizedTabEntry(null, 'overview')).toBeUndefined();
    expect(findCustomizedTabEntry({ id: 'overview' }, 'overview')).toBeUndefined();
    expect(findCustomizedTabEntry('overview', 'overview')).toBeUndefined();
  });

  it('skips entries without a usable string id', () => {
    const schema = { id: 'schema' };
    const tabs = [null, 'schema', { name: 'schema' }, { id: '' }, { id: 3 }, schema];
    expect(findCustomizedTabEntry(tabs, 'schema')).toBe(schema);
    expect(findCustomizedTabEntry([null, { name: 'overview' }], 'overview')).toBeUndefined();
  });

  it('returns the entry itself, including its layout', () => {
    const layout = [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 2 }];
    const entry = { id: 'schema', layout };
    expect(findCustomizedTabEntry([entry], 'schema')?.layout).toBe(layout);
  });
});

describe('resolveMountTabId', () => {
  it('maps the two alias targets and leaves every other key identical (Batch 6)', () => {
    // Pin: APIEndpoint mounts GenericTab on SCHEMA (APIEndpointUtils.tsx:109),
    // APICollection on API_ENDPOINT (APICollectionUtils.tsx:~103); Chart's
    // `details` mount is pageType-scoped in AssetDetailView, so `overview`
    // stays identity here.
    expect(resolveMountTabId('endpoint')).toBe('schema');
    expect(resolveMountTabId('apiEndpoints')).toBe('apiEndpoint');
    expect(resolveMountTabId('overview')).toBe('overview');
    expect(resolveMountTabId('schema')).toBe('schema');
    expect(resolveMountTabId('details')).toBe('details');
    expect(resolveMountTabId('activity')).toBe('activity');
    expect(resolveMountTabId('')).toBe('');
  });
});
