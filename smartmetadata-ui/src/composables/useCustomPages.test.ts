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
  getDetailsTabWithNewLabel,
  getRenderedActiveTab,
  getTabLabelMapFromTabs,
  pageTypeForEntityType,
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
    // A present but non-array tab list also yields defaults, as
    // officially (`customizedTabs?.map(...) ?? defaultTabs`): the tabs
    // list is not a `layout` field, so §4.4 D4 does not apply to it.
    expect(getDetailsTabWithNewLabel(defaults, {})).toEqual(defaults);
    expect(getDetailsTabWithNewLabel(defaults, 'schema')).toEqual(defaults);
    expect(getDetailsTabWithNewLabel(defaults, [{ id: 'lineage' }], { isVersionView: true })).toEqual(
      defaults,
    );
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

  it('keeps unlisted tabs, appended in default order, when preserving', () => {
    expect(
      getDetailsTabWithNewLabel(
        defaults,
        [{ id: 'lineage', displayName: 'Flow' }],
        { preserveUnlisted: true },
      ),
    ).toEqual([
      { key: 'lineage', label: 'Flow' },
      { key: 'schema', label: 'Schema' },
      { key: 'activity_feed', label: 'Activity' },
      { key: 'custom_properties', label: 'Custom Properties' },
    ]);
    expect(getDetailsTabWithNewLabel(defaults, [], { preserveUnlisted: true })).toEqual(defaults);
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
        { preserveUnlisted: true },
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
    store.document = documentWithPages([], { navigation: 'not-an-array' });
    await nextTick();
    expect(exposed().navigation.value).toBeNull();
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
