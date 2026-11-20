/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';

// The description cell's read-only editor applies its content on a 0ms
// timer (SmRichTextEditor content effect), so mounts wait a real tick
// before asserting rendered description text.
async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import DomainDetailView from './DomainDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DomainDetailView delete', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/d1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/domains/d1') && init?.method === 'DELETE') {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'Finance',
            displayName: 'Finance Domain',
            description: 'Finance assets',
            domainType: 'Consumer-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('confirms, deletes, and navigates back to the domains list', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const deleteButton = wrapper.find('[data-testid="delete-domain"]');
    expect(deleteButton.exists()).toBe(true);
    await deleteButton.trigger('click');
    await flushPromises();
    const confirm = document.querySelector('.sm-confirm-delete');
    expect(confirm).not.toBeNull();
    const okButton = confirm?.querySelector('.ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('/api/v1/domains/d1');
    expect(router.currentRoute.value.name).toBe('governance-domains');
    wrapper.unmount();
  });

  it('renders activity and custom-properties tabs with asset writes denied without a grant', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    // The stub answers 404 for the permission endpoint, so the view must
    // fail closed: the add-assets button renders disabled.
    expect(wrapper.text()).toContain('Activity');
    expect(wrapper.text()).toContain('Custom Properties');
    const addButton = wrapper.find('[data-testid="add-domain-assets"]');
    expect(addButton.exists()).toBe(true);
    expect((addButton.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('DomainDetailView dryRun', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PUT' && url.includes('/assets/add')) {
          const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
          if (body.dryRun === true) {
            return jsonResponse({
              successRequest: [
                {
                  request: { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
                  hasSideEffects: true,
                  message: 'moves from another domain',
                },
              ],
              failedRequest: [],
            });
          }
          return jsonResponse({ successRequest: [], failedRequest: [] });
        }
        if (url.includes('/api/v1/domains/d1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'Finance',
            displayName: 'Finance Domain',
            description: 'Finance assets',
            domainType: 'Consumer-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('dryRuns on confirm, shows impacts, and only submits after confirmation', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const modal = wrapper.findComponent(AddAssetsModal);
    expect(modal.exists()).toBe(true);
    (modal.vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('confirm', [
      { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
    ]);
    await flushPromises();
    const puts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0][1]?.body))).toMatchObject({ dryRun: true });
    expect(wrapper.find('[data-testid="domain-dryrun-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('svc.db.orders');

    await wrapper.find('[data-testid="domain-dryrun-confirm"]').trigger('click');
    await flushPromises();
    const putsAfter = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putsAfter).toHaveLength(2);
    expect(JSON.parse(String(putsAfter[1][1]?.body))).not.toHaveProperty('dryRun');
    expect(wrapper.find('[data-testid="domain-dryrun-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('DomainDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'Finance',
            displayName: 'Finance Domain',
            description: 'Finance assets',
            domainType: 'Consumer-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountDomain() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    await tick();
    return wrapper;
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountDomain>>): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('reorders and renames tabs from the persona Domain page, dropping unlisted tabs', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Domain',
            tabs: [
              { id: 'activity_feed', name: 'activity_feed', displayName: 'Feed' },
              { id: 'subdomains', name: 'subdomains' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    // F-2: replacement semantics — only the customized tabs render.
    expect(tabLabels(wrapper)).toEqual(['Feed', 'Sub-domains']);
    wrapper.unmount();
  });

  it('renders the default tab order without a persona document', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Assets',
      'Sub-domains',
      'Activity',
      'Custom Properties',
    ]);
    wrapper.unmount();
  });

  it('shows the first remaining tab pane when the customization removes the initial overview tab (B-1)', async () => {
    // The view's `activeTab` starts at 'overview'; with overview
    // removed, the shell must clamp to the first rendered tab (the
    // renamed activity tab) so its pane — not a blank area — is
    // visible on first paint.
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Domain',
            tabs: [
              { id: 'activity_feed', name: 'activity_feed', displayName: 'Feed' },
              { id: 'subdomains', name: 'subdomains' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(tabLabels(wrapper)).toEqual(['Feed', 'Sub-domains']);
    const activeNav = wrapper.findAll('.ant-tabs-tab-active');
    expect(activeNav).toHaveLength(1);
    expect(activeNav[0].text()).toContain('Feed');
    const activePanes = wrapper.findAll('.ant-tabs-tabpane-active');
    expect(activePanes).toHaveLength(1);
    expect(activePanes[0].find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders no tab bar for an explicitly empty Domain tab list without throwing (m-2)', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [{ pageType: 'Domain', tabs: [] }],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.text()).toContain('Finance Domain');
    wrapper.unmount();
  });
});

describe('DomainDetailView widget grid (B-8)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function domainDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Domain', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'finance',
            displayName: 'Finance Domain',
            fullyQualifiedName: 'finance.fqn',
            description: 'Finance assets',
            domainType: 'Source-aligned',
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            experts: [{ id: 'u2', name: 'bob', displayName: 'Bob' }],
            tags: [
              { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
              { tagFQN: 'Certification.Certified', name: 'Certified', source: 'Classification' },
              { tagFQN: 'Business.term', name: 'term', source: 'Glossary' },
              { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            ],
            children: [],
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountDomain() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    await tick();
    return wrapper;
  }

  function widgetTestIds(wrapper: Awaited<ReturnType<typeof mountDomain>>): string[] {
    // Branch slots only: the shared cells carry their own `widget-*-cell`
    // root testids, which are not branches.
    return wrapper
      .findAll('[data-testid^="widget-"]')
      .map((node) => node.attributes('data-testid') as string)
      .filter((id) => !id.endsWith('-cell'));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders the widget grid on overview when a documentation entry resolves (alias)', async () => {
    stubWithDoc(
      domainDoc([
        {
          id: 'documentation',
          name: 'documentation',
          layout: [
            {
              i: 'KnowledgePanel.LeftPanel',
              x: 0,
              y: 0,
              w: 6,
              h: 2,
              children: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 1 }],
            },
            { i: 'KnowledgePanel.Owners', x: 6, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Tags', x: 6, y: 1, w: 2, h: 1 },
            { i: 'KnowledgePanel.Tier', x: 6, y: 2, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(wrapper.find('[data-testid="widget-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Finance assets');
    expect(wrapper.find('[data-testid="widget-owners"]').text()).toContain('Alice');
    const tags = wrapper.find('[data-testid="widget-tags"]');
    expect(tags.text()).toContain('Sensitive');
    expect(tags.text()).not.toContain('term');
    expect(wrapper.find('[data-testid="widget-tier"]').text()).toContain('Tier1');
    // The default overview pane (which shows the domain type row) is replaced.
    expect(wrapper.text()).not.toContain('Source-aligned');
    wrapper.unmount();
  });

  it('renders an empty grid when the mount-tab entry carries no layout', async () => {
    stubWithDoc(domainDoc([{ id: 'documentation', name: 'documentation' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain('Source-aligned');
    wrapper.unmount();
  });

  it('renders an empty grid for a non-array stored layout on the mount tab', async () => {
    stubWithDoc(domainDoc([{ id: 'documentation', name: 'documentation', layout: 'bogus' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain('Source-aligned');
    wrapper.unmount();
  });

  it('renders existing panes unchanged without a customized entry', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    expect(wrapper.text()).toContain('Source-aligned');
    expect(wrapper.find('[data-testid="add-domain-assets"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps the existing assets pane when a non-mount tab entry resolves, even with a layout', async () => {
    stubWithDoc(
      domainDoc([
        {
          id: 'assets',
          name: 'assets',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    // Assets is not the widget-layout tab: the entry never mounts a grid.
    // With an assets-only list, only the assets pane renders; the
    // unlisted overview tab (and its domain-type row) is removed (F-2).
    expect(wrapper.find('[data-testid="add-domain-assets"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Source-aligned');
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on documentation only)', async () => {
    stubWithDoc(
      domainDoc([
        {
          id: 'documentation',
          name: 'documentation',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'subdomains', name: 'subdomains', layout: [] },
        { id: 'data_products', name: 'data_products', layout: [] },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
        { id: 'assets', name: 'assets', layout: [] },
        { id: 'custom_properties', name: 'custom_properties', layout: [] },
        { id: 'data_observability', name: 'data_observability', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountDomain();
    // Mount tab: the grid replaces the overview pane.
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Finance assets');
    expect(wrapper.text()).not.toContain('Source-aligned');
    expect(widgetTestIds(wrapper)).toEqual(['widget-description']);
    // Every other tab keeps its existing panel.
    expect(wrapper.find('[data-testid="add-domain-assets"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('DomainDetailView FQN addressing (B-9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountDomainWithFqn(fqn: string, domainBody: Record<string, unknown> | null) {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/name/')) {
          return domainBody ? jsonResponse(domainBody) : new Response('not found', { status: 404 });
        }
        if (url.includes('/api/v1/domains/d1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push(`/governance/domains/${encodeURIComponent(fqn)}`);
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  it('loads a dotted FQN by name and renders the domain', async () => {
    const wrapper = await mountDomainWithFqn('Finance.Sub', {
      id: 'd9',
      name: 'Sub',
      displayName: 'Finance Sub',
      fullyQualifiedName: 'Finance.Sub',
      description: 'Sub-domain assets',
      domainType: 'Consumer-aligned',
      owners: [],
      experts: [],
      tags: [],
      children: [],
    });
    const detailCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/v1/domains/name/'));
    expect(String(detailCall?.[0])).toContain('/api/v1/domains/name/Finance.Sub');
    expect(wrapper.text()).toContain('Finance Sub');
    wrapper.unmount();
  });

  it('shows the error state, not a blank page, for a legacy UUID deep link', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const wrapper = await mountDomainWithFqn(uuid, null);
    const detailCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/v1/domains/name/'));
    expect(String(detailCall?.[0])).toContain(`/api/v1/domains/name/${uuid}`);
    const error = wrapper.find('[data-testid="entity-detail-error"]');
    expect(error.exists()).toBe(true);
    // The message is the fetch failure's own text (the stub answers a
    // plain 404 body); the assertion is that an error state renders at
    // all — no blank page, no hang — not the stub's wording.
    expect(error.text().length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain('Finance Sub');
    wrapper.unmount();
  });
});

describe('DomainDetailView description gate (D-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountWithOps(operations: Array<{ operation: string; access: string }>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'finance',
            displayName: 'Finance Domain',
            fullyQualifiedName: 'finance.fqn',
            description: 'Finance assets',
            domainType: 'Source-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        if (url.includes('/v1/permissions/domain/name/')) {
          return jsonResponse({ resource: 'domain', permissions: operations });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    await tick();
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

  it('hides the description edit button when the permission fetch fails', async () => {
    // No /v1/permissions branch in this stub: 404, fail-closed.
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/name/Finance')) {
          return jsonResponse({
            id: 'd1',
            name: 'finance',
            displayName: 'Finance Domain',
            fullyQualifiedName: 'finance.fqn',
            description: 'Finance assets',
            domainType: 'Source-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/Finance');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { fqn: 'Finance' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    await tick();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
