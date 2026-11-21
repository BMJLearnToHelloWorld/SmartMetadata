/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * You may use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TagDetailView from './TagDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountTag(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/classifications', name: 'governance-classifications', component: { template: '<div>list</div>' } },
      { path: '/governance/classifications/:id', name: 'governance-classification', component: { template: '<div>detail</div>' } },
    ],
  });
  await router.push('/governance/classifications/c1');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(TagDetailView, {
    props: { id },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

function isDisabled(wrapper: Awaited<ReturnType<typeof mountTag>>, testid: string): boolean {
  return (wrapper.find(`[data-testid="${testid}"]`).element as HTMLButtonElement).disabled;
}

describe('TagDetailView edit gating (upstream revokeEditPermissions)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          // The stub encodes the tag state in the id: 'disabled-tag' loads disabled,
          // 'deleted-tag' loads deleted.
          const disabled = url.includes('disabled-tag');
          const deleted = url.includes('deleted-tag');
          return jsonResponse({
            id: deleted ? 'deleted-tag' : disabled ? 'disabled-tag' : 't1',
            name: 'pii',
            displayName: 'PII',
            disabled,
            deleted,
            owners: [],
          });
        }
        if (url.includes('/v1/permissions/tag/name/')) {
          // D-4 header gates: the edit button needs EditAll (pin TagPage
          // editTagsPermission), the delete button needs Delete.
          return jsonResponse({
            resource: 'tag',
            permissions: [
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
            ],
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables edit and delete on an enabled tag', async () => {
    const wrapper = await mountTag('t1');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(false);
    expect(isDisabled(wrapper, 'delete-tag')).toBe(false);
  });

  it('disables edit but not delete on a disabled tag', async () => {
    const wrapper = await mountTag('disabled-tag');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(true);
    // Delete is not an Edit* operation: upstream revoke leaves it untouched.
    expect(isDisabled(wrapper, 'delete-tag')).toBe(false);
  });

  it('disables edit but not delete on a deleted tag', async () => {
    // Pin TagPage isEditable is disabled AND deleted (TagPage.tsx:289);
    // the edit button reads the same isEditable computed, so the
    // deleted half is fixed by the same line. The Add assets button
    // needs no change: pin gates it on disabled only
    // (renderAddAssetsButton, TagPage.tsx:857-858).
    const wrapper = await mountTag('deleted-tag');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(true);
    expect(isDisabled(wrapper, 'delete-tag')).toBe(false);
  });
});

describe('TagDetailView header gates without a grant (D-4 fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables edit and delete when the permission fetch grants nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            disabled: false,
            owners: [],
          });
        }
        if (url.includes('/v1/permissions/tag/name/')) {
          return jsonResponse({ resource: 'tag', permissions: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
    const wrapper = await mountTag('t1');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(true);
    expect(isDisabled(wrapper, 'delete-tag')).toBe(true);
  });
});

describe('TagDetailView versions entry (M-Next A4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the newest tag version snapshot from the versions button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/t1/versions')) {
          return jsonResponse({ versions: [{ version: 0.1 }, { version: 0.2 }] });
        }
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({ id: 't1', name: 'pii', displayName: 'PII', disabled: false, owners: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/tags/:id', name: 'governance-tag', component: { template: '<div>tag</div>' } },
        {
          path: '/governance/tags/:id/versions/:version',
          name: 'governance-tag-version',
          component: { template: '<div>version</div>' },
        },
      ],
    });
    await router.push('/governance/tags/t1');
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(TagDetailView, {
      props: { id: 't1' },
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-versions"]').exists()).toBe(true);
    await wrapper.find('[data-testid="tag-versions"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/governance/tags/t1/versions/0.2');
  });
});

describe('TagDetailView fixed tabs + widget grid (B-7)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function tagDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Tag', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            description: 'Sensitive data',
            fullyQualifiedName: 'PII.pii',
            classification: { id: 'c1', name: 'PII', displayName: 'PII' },
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            reviewers: [{ id: 'u2', name: 'carol', displayName: 'Carol' }],
            domains: [{ id: 'd1', name: 'marketing', displayName: 'Marketing' }],
            disabled: false,
            usageCount: 7,
          });
        }
        if (url.includes('/api/v1/activity/entity/tag/')) {
          return jsonResponse({
            data: [
              {
                id: 'e1',
                eventType: 'EntityUpdated',
                summary: 'description changed',
                timestamp: 1700000000000,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        return jsonResponse({}, 404);
      }),
    );
  }

  async function mountTagView() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/classifications', name: 'governance-classifications', component: { template: '<div>list</div>' } },
        { path: '/governance/classifications/:id', name: 'governance-classification', component: { template: '<div>detail</div>' } },
        { path: '/governance/tags/:id', name: 'governance-tag', component: TagDetailView, props: true },
      ],
    });
    await router.push('/governance/tags/t1');
    await router.isReady();
    const wrapper = mount(TagDetailView, {
      props: { id: 't1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountTagView>>): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  function widgetTestIds(wrapper: Awaited<ReturnType<typeof mountTagView>>): string[] {
    return wrapper
      .findAll('[data-testid^="widget-"]')
      .map((node) => node.attributes('data-testid') as string);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the fixed official tab list with the existing overview content', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Assets',
      'Activity feed',
      'Data Observability',
    ]);
    expect(wrapper.find('[data-testid="tag-disabled"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
    // Merged (r2): the assets tab mounts AssetsTabs and
    // data-observability mounts the shared DQ dashboard, so no tab
    // keeps a residual.
    const residuals = wrapper.findAll('[data-testid="asset-tab-residual"]');
    expect(residuals).toHaveLength(0);
    expect(wrapper.find('[data-testid="dq-dashboard-container"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not reorder or rename tabs from a customized Tag page (fixed list)', async () => {
    stubWithDoc(
      tagDoc([
        { id: 'assets', name: 'assets', displayName: 'Stuff' },
        { id: 'overview', name: 'overview', displayName: 'Home' },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Assets',
      'Activity feed',
      'Data Observability',
    ]);
    wrapper.unmount();
  });

  it('renders the widget grid on overview from a stored customized Tag page (history data)', async () => {
    stubWithDoc(
      tagDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [
            { i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 },
            { i: 'KnowledgePanel.Owners', x: 6, y: 0, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Sensitive data');
    expect(wrapper.find('[data-testid="widget-owners"]').text()).toContain('Alice');
    // The disable toggle is overview-pane content: absent in widget mode.
    expect(wrapper.find('[data-testid="tag-disabled"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the domain and reviewer widgets from the mapped tag fields', async () => {
    // B-2: reviewers/domains were requested (TAG_FIELDS) but dropped by
    // mapTag. REVIEWER reaches Tag pages through the shared CommonWidgets
    // registry (official TagClassBase delegates every id to
    // CommonWidgets; the registry carries REVIEWER), so both branches
    // render here.
    stubWithDoc(
      tagDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [
            { i: 'KnowledgePanel.Domain', x: 0, y: 0, w: 4, h: 1 },
            { i: 'KnowledgePanel.Reviewer', x: 4, y: 0, w: 4, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    expect(wrapper.find('[data-testid="widget-domain"]').text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="widget-reviewer"]').text()).toContain('Carol');
    wrapper.unmount();
  });

  it('renders an empty grid when the entry carries no layout', async () => {
    stubWithDoc(tagDoc([{ id: 'overview', name: 'overview' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.find('[data-testid="tag-disabled"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads activity through the generic activity APIs', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/api/v1/activity/entity/tag/name/'))).toBe(true);
    expect(calls.some((url) => url.includes('/api/v1/conversations'))).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').text()).toContain('description changed');
    wrapper.unmount();
  });

  it('keeps existing panels on non-mount tabs when their entries resolve', async () => {
    stubWithDoc(
      tagDoc([
        {
          id: 'assets',
          name: 'assets',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'data_observability', name: 'data_observability', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    // Merged (r2): neither assets nor data-observability is the
    // widget-layout tab, and both now have real content (AssetsTabs,
    // DQ dashboard), so no tab keeps a residual; overview keeps its pane.
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="dq-dashboard-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-disabled"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on overview only)', async () => {
    stubWithDoc(
      tagDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'assets', name: 'assets', layout: [] },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
        { id: 'data_observability', name: 'data_observability', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    // Mount tab: the grid replaces the overview pane.
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Sensitive data');
    expect(wrapper.find('[data-testid="tag-disabled"]').exists()).toBe(false);
    expect(widgetTestIds(wrapper)).toEqual(['widget-description']);
    // Every other tab keeps its existing panel; the assets tab mounts
    // AssetsTabs and data-observability mounts the DQ dashboard, so no
    // tab keeps a residual.
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="dq-dashboard-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the real activity panel when an entry resolves for the dead activity-feed mount (B-15)', async () => {
    stubWithDoc(
      tagDoc([
        {
          id: 'activity_feed',
          name: 'activity_feed',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    // The former GenericTab mount on activity_feed is gone: no widget
    // cell renders, the activity panel stays.
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.find('[data-testid="asset-activity-table"]').text()).toContain('description changed');
    wrapper.unmount();
  });

  it('mounts AssetsTabs on the assets tab with the ES count and a preview panel', async () => {
    // B-15 Lane A: the tab count is the ES hit total for the tag
    // query filter, not usageCount (7 on the tag doc below).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            fullyQualifiedName: 'PII.pii',
            classification: { id: 'c1', name: 'PII', displayName: 'PII' },
            disabled: false,
            owners: [],
            usageCount: 7,
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 2 },
              hits: [
                {
                  _id: 'a1',
                  _source: {
                    id: 'a1',
                    name: 'orders',
                    displayName: 'Orders',
                    fullyQualifiedName: 'svc.db.schema.orders',
                    entityType: 'table',
                  },
                },
                {
                  _id: 'a2',
                  _source: {
                    id: 'a2',
                    name: 'sales',
                    displayName: 'Sales',
                    fullyQualifiedName: 'svc.sales',
                    entityType: 'dashboard',
                  },
                },
              ],
            },
            aggregations: {},
          });
        }
        if (url.includes('/api/v1/activity/entity/tag/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return new Response('not found', { status: 404 });
        }
        return jsonResponse({}, 404);
      }),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-tab-assets-count"]').text()).toBe('2');
    expect(wrapper.text()).toContain('Orders');
    // Clicking a row opens the preview panel beside the list; the
    // close button dismisses it without navigating away.
    const rows = wrapper.findAll('.ant-table-row');
    expect(rows.length).toBe(2);
    await rows[0].trigger('click');
    expect(wrapper.find('[data-testid="tag-asset-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview"]').text()).toContain('Orders');
    await wrapper.find('[data-testid="tag-asset-preview-close"]').trigger('click');
    expect(wrapper.find('[data-testid="tag-asset-preview"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the header Add Assets button on the overview tab when editing is permitted (pin renderAddAssetsButton)', async () => {
    // Pin renders the button in the page header on every tab
    // (TagPage.tsx:857-866, 893-899, 911-916); the tag-level EditAll
    // grant alone satisfies haveAssetEditPermission, so the bulk
    // resource load may fail closed here.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/tag/name/')) {
          return jsonResponse({
            resource: 'tag',
            permissions: [{ operation: 'EditAll', access: 'allow' }],
          });
        }
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            fullyQualifiedName: 'PII.pii',
            classification: { id: 'c1', name: 'PII', displayName: 'PII' },
            disabled: false,
            owners: [],
            usageCount: 7,
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({ hits: { total: { value: 0 }, hits: [] }, aggregations: {} });
        }
        if (url.includes('/api/v1/activity/entity/tag/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return new Response('not found', { status: 404 });
        }
        return jsonResponse({}, 404);
      }),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    await flushPromises();
    await flushPromises();
    // Default tab is overview: the button must already be there.
    expect(wrapper.find('[data-testid="tag-add-assets"]').exists()).toBe(true);
    await wrapper.find('[data-testid="tag-add-assets"]').trigger('click');
    await flushPromises();
    // FormModal portals to document.body (Ant default), so the picker
    // input is asserted there, not inside the mounted wrapper.
    expect(
      document.body.querySelector('[data-testid="asset-selection-search"]'),
    ).not.toBeNull();
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps the assets count pill hidden when the ES count fetch fails', async () => {
    // Intentional deviation (f): pin's catch sets the count to 0
    // (TagPage.tsx:451-474), which would render a misleading "0" pill;
    // the lane leaves assetCount undefined, so EntityDetailShell
    // (only renders the pill when tab.count !== undefined) hides it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            fullyQualifiedName: 'PII.pii',
            classification: { id: 'c1', name: 'PII', displayName: 'PII' },
            disabled: false,
            owners: [],
            usageCount: 7,
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return new Response('error', { status: 500 });
        }
        if (url.includes('/api/v1/activity/entity/tag/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return new Response('not found', { status: 404 });
        }
        return jsonResponse({}, 404);
      }),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountTagView();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-tab-assets-count"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('TagDetailView description gate (D-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountWithOps(operations: Array<{ operation: string; access: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            description: 'Sensitive data',
            fullyQualifiedName: 'PII.pii',
            disabled: false,
            owners: [],
          });
        }
        if (url.includes('/v1/permissions/tag/name/')) {
          return jsonResponse({ resource: 'tag', permissions: operations });
        }
        if (url.includes('/api/v1/activity/entity/tag/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = await mountTag('t1');
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  it('shows the description edit button with EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'EditDescription', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the description edit button without EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'ViewBasic', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the description edit button on a disabled tag even with EditDescription', async () => {
    // Official TagPage isEditable is disabled AND deleted: the
    // composable's deleted input folds disabled in, revoking Edit*.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({
            id: 't1',
            name: 'pii',
            displayName: 'PII',
            description: 'Sensitive data',
            fullyQualifiedName: 'PII.pii',
            disabled: true,
            owners: [],
          });
        }
        if (url.includes('/v1/permissions/tag/name/')) {
          return jsonResponse({
            resource: 'tag',
            permissions: [{ operation: 'EditDescription', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = await mountTag('t1');
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
