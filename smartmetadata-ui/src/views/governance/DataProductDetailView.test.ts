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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataProductDetailView from './DataProductDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(grantEditAll: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/dataProducts/name/marketing.churn/inputPorts')) {
        return jsonResponse({
          data: [
            { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/dataProducts/name/marketing.churn/outputPorts')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/dataProducts/dp1/assets/remove') && init?.method === 'PUT') {
        return jsonResponse({ status: 'success', numberOfRowsPassed: 1, successRequest: [] });
      }
      if (url.includes('/api/v1/dataProducts/dp1/assets')) {
        return jsonResponse({
          data: [
            { id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/dataProducts/dp1')) {
        return jsonResponse({
          id: 'dp1',
          name: 'churn',
          displayName: 'Churn',
          fullyQualifiedName: 'marketing.churn',
          description: 'Churn scores',
          domains: [],
          owners: [],
          experts: [],
          tags: [],
          extension: {},
        });
      }
      if (url.includes('/api/v1/permissions/dataProduct/name/')) {
        return jsonResponse({
          resource: 'dataProduct',
          permissions: grantEditAll ? [{ operation: 'EditAll', access: 'allow' }] : [],
        });
      }
      if (url.includes('/api/v1/activity/entity/dataProduct/')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/conversations')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/metadata/types/name/dataProduct/customProperties')) {
        return jsonResponse([{ name: 'sensitivity', propertyType: 'string' }]);
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function mountView(): ReturnType<typeof mount> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/data-products', name: 'governance-data-products', component: { template: '<div>list</div>' } },
      { path: '/governance/data-products/:id', name: 'governance-data-product', component: DataProductDetailView, props: true },
    ],
  });
  const wrapper = mount(DataProductDetailView, {
    props: { id: 'dp1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
  return wrapper;
}

describe('DataProductDetailView assets + tabs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders activity and custom-properties tabs and enables asset writes with an EditAll grant', async () => {
    stubFetch(true);
    const wrapper = mountView();
    await flushPromises();
    // Ant TabPane does not forward data-testid to the DOM; the shell's own
    // test asserts tab presence via rendered labels, and so does this one.
    expect(wrapper.text()).toContain('Activity');
    expect(wrapper.text()).toContain('Custom Properties');
    const addButton = wrapper.find('[data-testid="add-data-product-assets"]');
    expect(addButton.exists()).toBe(true);
    expect((addButton.element as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });

  it('denies asset writes when the permission fetch carries no EditAll grant (fail-closed)', async () => {
    stubFetch(false);
    const wrapper = mountView();
    await flushPromises();
    const addButton = wrapper.find('[data-testid="add-data-product-assets"]');
    expect((addButton.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('shows the description edit button with EditAll and hides it without any grant (D-4)', async () => {
    stubFetch(true);
    const granted = mountView();
    await flushPromises();
    expect(granted.find('[data-testid="edit-description"]').exists()).toBe(true);
    granted.unmount();

    stubFetch(false);
    const denied = mountView();
    await flushPromises();
    expect(denied.find('[data-testid="edit-description"]').exists()).toBe(false);
    denied.unmount();
  });

  it('removes an asset with PUT assets/remove after confirmation', async () => {
    stubFetch(true);
    const wrapper = mountView();
    await flushPromises();
    const removeButton = wrapper.find('[data-testid="remove-asset-a1"]');
    expect(removeButton.exists()).toBe(true);
    await removeButton.trigger('click');
    await flushPromises();
    const confirm = document.querySelector('.sm-confirm-delete');
    expect(confirm).not.toBeNull();
    const okButton = confirm?.querySelector('.ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const removeCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => String(url).includes('/assets/remove') && init?.method === 'PUT');
    expect(removeCall).toBeDefined();
    wrapper.unmount();
  });

  // Q-TAB-4 item 3 (host lane): the input/output ports tab renders after
  // activity, with the pin port lists and counts.
  it('renders the Input/Output Ports tab with the pin port lists', async () => {
    stubFetch(true);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Input/Output Ports');
    expect(wrapper.find('[data-testid="data-product-ports-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="input-ports-heading"]').text()).toContain('Input ports (1)');
    expect(wrapper.find('[data-testid="output-ports-heading"]').text()).toContain('Output ports (0)');
    expect(wrapper.text()).toContain('orders');
    const inputCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/dataProducts/name/marketing.churn/inputPorts'));
    expect(inputCall).toBeDefined();
    wrapper.unmount();
  });
});

describe('DataProductDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataProducts/dp1')) {
          return jsonResponse({
            id: 'dp1',
            name: 'churn',
            displayName: 'Churn',
            fullyQualifiedName: 'marketing.churn',
            description: 'Churn scores',
            domains: [],
            owners: [],
            experts: [],
            tags: [],
            extension: {},
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/activity/entity/dataProduct/') ||
          url.includes('/api/v1/conversations')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function tabLabels(wrapper: ReturnType<typeof mountView>): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('reorders and renames tabs from the persona DataProduct page, dropping unlisted tabs', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'DataProduct',
            tabs: [
              { id: 'custom_properties', name: 'custom_properties', displayName: 'Props' },
              { id: 'activity_feed', name: 'activity_feed' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    // F-2: replacement semantics — only the customized tabs render.
    expect(tabLabels(wrapper)).toEqual(['Props', 'Activity']);
    wrapper.unmount();
  });

  it('renders the default tab order without a persona document', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    // Q-TAB-4 (host lane): the default order gains Input/Output Ports
    // after Activity (pin DataProductClassBase.ts:78-90).
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Assets',
      'Activity',
      'Input/Output Ports',
      'Custom Properties',
    ]);
    wrapper.unmount();
  });

  it('renders no tab bar for an explicitly empty DataProduct tab list without throwing (m-2)', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [{ pageType: 'DataProduct', tabs: [] }],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.text()).toContain('Churn');
    wrapper.unmount();
  });
});

describe('DataProductDetailView widget grid (B-8)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function productDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'DataProduct', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataProducts/dp1')) {
          return jsonResponse({
            id: 'dp1',
            name: 'churn',
            displayName: 'Churn Scores',
            fullyQualifiedName: 'marketing.churn',
            description: 'Predicts customer churn',
            domains: [{ id: 'dom1', name: 'marketing', displayName: 'Marketing' }],
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            reviewers: [{ id: 'u3', name: 'carol', displayName: 'Carol' }],
            experts: [{ id: 'u2', name: 'bob', displayName: 'Bob' }],
            tags: [
              { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
              { tagFQN: 'Business.term', name: 'term', source: 'Glossary' },
              { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            ],
            extension: {},
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/activity/entity/dataProduct/') ||
          url.includes('/api/v1/conversations')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountProduct() {
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  function widgetTestIds(wrapper: ReturnType<typeof mountView>): string[] {
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
      productDoc([
        {
          id: 'documentation',
          name: 'documentation',
          layout: [
            { i: 'KnowledgePanel.Domain', x: 0, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Experts', x: 2, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Tier', x: 4, y: 0, w: 2, h: 1 },
            // Dispatch resolves DomainType to null on DataProduct pages
            // (exact-=== DOMAIN check only): the cell stays empty.
            { i: 'KnowledgePanel.DomainType', x: 6, y: 0, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    expect(wrapper.find('[data-testid="widget-domain"]').text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="widget-experts"]').text()).toContain('Bob');
    expect(wrapper.find('[data-testid="widget-tier"]').text()).toContain('Tier1');
    expect(wrapper.find('[data-testid="widget-domain-type"]').exists()).toBe(false);
    // The default overview pane (which shows the description row) is replaced.
    expect(wrapper.text()).not.toContain('Predicts customer churn');
    wrapper.unmount();
  });

  it('renders the reviewer widget from the mapped reviewers field', async () => {
    // MB-3 (R-2): reviewers were requested (DATA_PRODUCT_FIELDS) but
    // dropped by mapDataProduct. REVIEWER reaches DataProduct pages
    // through the shared CommonWidgets registry (official
    // DataProductClassBase delegates to getDataProductWidgetsFromKey,
    // whose only specific branch is DOMAIN; the registry carries
    // REVIEWER), so the branch renders here.
    stubWithDoc(
      productDoc([
        {
          id: 'documentation',
          name: 'documentation',
          layout: [{ i: 'KnowledgePanel.Reviewer', x: 0, y: 0, w: 4, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    expect(wrapper.find('[data-testid="widget-reviewer"]').text()).toContain('Carol');
    wrapper.unmount();
  });

  it('renders an empty grid when the mount-tab entry carries no layout', async () => {
    stubWithDoc(productDoc([{ id: 'documentation', name: 'documentation' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain('Predicts customer churn');
    wrapper.unmount();
  });

  it('mounts the default widget grid without a customized entry (batch 6 unconditional mount)', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    // Batch 6: documentation is an unconditional-mount tab — with no
    // customized page the grid mounts with the default layout and the
    // legacy Descriptions pane is gone. The description still renders,
    // inside the widget-description branch.
    expect(widgetTestIds(wrapper)).toEqual([
      'widget-description',
      'widget-domain',
      'widget-owners',
      'widget-tier',
      'widget-certification',
      'widget-tags',
      'widget-glossary-terms',
      'widget-experts',
      'widget-knowledge-article',
      'widget-custom-properties',
    ]);
    expect(wrapper.findAll('.ant-descriptions-row')).toHaveLength(0);
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Predicts customer churn');
    expect(wrapper.find('[data-testid="add-data-product-assets"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the existing assets pane when a non-mount tab entry resolves, even with a layout', async () => {
    stubWithDoc(
      productDoc([
        {
          id: 'assets',
          name: 'assets',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    // Assets is not the widget-layout tab: the entry never mounts a grid.
    // With an assets-only list, only the assets pane renders; the
    // unlisted overview tab (and its description) is removed (F-2).
    expect(wrapper.find('[data-testid="add-data-product-assets"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Predicts customer churn');
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on documentation only)', async () => {
    stubWithDoc(
      productDoc([
        {
          id: 'documentation',
          name: 'documentation',
          layout: [{ i: 'KnowledgePanel.Domain', x: 0, y: 0, w: 2, h: 1 }],
        },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
        { id: 'input_output_ports', name: 'input_output_ports', layout: [] },
        { id: 'assets', name: 'assets', layout: [] },
        { id: 'contract', name: 'contract', layout: [] },
        { id: 'data_observability', name: 'data_observability', layout: [] },
        { id: 'custom_properties', name: 'custom_properties', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountProduct();
    // Mount tab: the grid replaces the overview pane.
    expect(wrapper.find('[data-testid="widget-domain"]').text()).toContain('Marketing');
    expect(wrapper.text()).not.toContain('Predicts customer churn');
    expect(widgetTestIds(wrapper)).toEqual(['widget-domain']);
    // Every other tab keeps its existing panel.
    expect(wrapper.find('[data-testid="add-data-product-assets"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
