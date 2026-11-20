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
          // The stub encodes the tag state in the id: 'disabled-tag' loads disabled.
          const disabled = url.includes('disabled-tag');
          return jsonResponse({
            id: disabled ? 'disabled-tag' : 't1',
            name: 'pii',
            displayName: 'PII',
            disabled,
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
    // Assets has no product backing: one honest residual state.
    // Data observability mounts the shared DQ dashboard (B-15)
    // instead of its former residual.
    const residuals = wrapper.findAll('[data-testid="asset-tab-residual"]');
    expect(residuals).toHaveLength(1);
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
    // Assets is not the widget-layout tab and keeps its residual state;
    // data-observability mounts the DQ dashboard instead of a residual,
    // and overview keeps its pane.
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(1);
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
    // Every other tab keeps its existing panel; data-observability
    // mounts the DQ dashboard instead of its former residual.
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(1);
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
