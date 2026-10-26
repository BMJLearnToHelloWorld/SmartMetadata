/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import MyDataView from './MyDataView.vue';

const searchAssets = vi.fn();
const listAnnouncements = vi.fn();
const listTasks = vi.fn();
const listIngestionPipelines = vi.fn();
const listActivityEvents = vi.fn();
const listTestCases = vi.fn();
const listDomains = vi.fn();
const listDataProducts = vi.fn();
const listKpis = vi.fn();
const listDatabaseServices = vi.fn();
const listMessagingServices = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));
vi.mock('@/api/announcements', () => ({
  listAnnouncements: (...args: unknown[]) => listAnnouncements(...args),
}));
vi.mock('@/api/tasks', () => ({
  listTasks: (...args: unknown[]) => listTasks(...args),
}));
vi.mock('@/api/ingestionPipelines', () => ({
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
}));
vi.mock('@/api/activity', () => ({
  listActivityEvents: (...args: unknown[]) => listActivityEvents(...args),
}));
vi.mock('@/api/testCases', () => ({
  listTestCases: (...args: unknown[]) => listTestCases(...args),
}));
vi.mock('@/api/domains', () => ({
  listDomains: (...args: unknown[]) => listDomains(...args),
}));
vi.mock('@/api/dataProducts', () => ({
  listDataProducts: (...args: unknown[]) => listDataProducts(...args),
}));
vi.mock('@/api/kpi', () => ({
  listKpis: (...args: unknown[]) => listKpis(...args),
}));
vi.mock('@/api/databaseServices', () => ({
  listDatabaseServices: (...args: unknown[]) => listDatabaseServices(...args),
}));
vi.mock('@/api/messagingServices', () => ({
  listMessagingServices: (...args: unknown[]) => listMessagingServices(...args),
}));

function emptyPage<T>(data: T[] = [], total = data.length) {
  return { data, total };
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useAuthStore } = await import('@/stores/auth');
  const auth = useAuthStore();
  auth.user = { id: 'u-1', name: 'alice.admin', displayName: 'alice.admin' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: MyDataView },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/insights', name: 'insights', component: { template: '<div>insights</div>' } },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
      { path: '/tasks', name: 'tasks', component: { template: '<div>tasks</div>' } },
      { path: '/announcements', name: 'announcements', component: { template: '<div>ann</div>' } },
      { path: '/activity', name: 'activity', component: { template: '<div>activity</div>' } },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: { template: '<div>svc</div>' },
      },
      { path: '/ingestion/services', name: 'ingestion-services', component: { template: '<div>svcs</div>' } },
      { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div>pipe</div>' } },
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: { template: '<div>pipes</div>' } },
      {
        path: '/quality/test-cases/:id',
        name: 'quality-test-case',
        component: { template: '<div>tc</div>' },
      },
      { path: '/quality/test-cases', name: 'quality-test-cases', component: { template: '<div>tcs</div>' } },
      {
        path: '/governance/domains/:id',
        name: 'governance-domain',
        component: { template: '<div>domain</div>' },
      },
      { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>domains</div>' } },
      {
        path: '/governance/data-products/:id',
        name: 'governance-data-product',
        component: { template: '<div>dp</div>' },
      },
      {
        path: '/governance/data-products',
        name: 'governance-data-products',
        component: { template: '<div>dps</div>' },
      },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'home' });
  await router.isReady();
  const wrapper = mount(MyDataView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MyDataView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    listAnnouncements.mockReset();
    listTasks.mockReset();
    listIngestionPipelines.mockReset();
    listActivityEvents.mockReset();
    listTestCases.mockReset();
    listDomains.mockReset();
    listDataProducts.mockReset();
    listKpis.mockReset();
    listDatabaseServices.mockReset();
    listMessagingServices.mockReset();

    listAnnouncements.mockImplementation(async (query: { system?: boolean }) => {
      if (query.system) {
        return emptyPage([{ id: 'sys-1', displayName: 'Maintenance window', description: 'Saturday 02:00' }]);
      }
      return emptyPage([{ id: 'ann-1', displayName: 'New glossary terms', description: 'Review ownership' }]);
    });
    searchAssets.mockImplementation(async (query: string) => {
      if (String(query).includes('owners.id')) {
        return {
          total: 1,
          hits: [{ id: 't-1', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', entityType: 'table' }],
          facets: [],
        };
      }
      if (String(query).includes('followers')) {
        return {
          total: 1,
          hits: [{ id: 't-2', name: 'customers', fullyQualifiedName: 'svc.db.schema.customers', entityType: 'table' }],
          facets: [],
        };
      }
      return {
        total: 12,
        hits: [],
        facets: [
          { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 10 }] },
          { id: 'serviceType', field: 'serviceType', buckets: [{ key: 'Postgres', count: 12 }] },
        ],
      };
    });
    listTasks.mockResolvedValue(emptyPage([{ id: 'task-1', name: 'Request description', status: 'Open' }], 1));
    listIngestionPipelines.mockResolvedValue(emptyPage([{ id: 'pipe-1', name: 'postgres-metadata', enabled: true }], 1));
    listActivityEvents.mockResolvedValue(
      emptyPage([
        {
          id: 'act-1',
          eventType: 'DescriptionUpdated',
          summary: 'Updated description',
          entity: { name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' },
        },
      ]),
    );
    listTestCases.mockResolvedValue(
      emptyPage([{ id: 'tc-1', name: 'orders_row_count', testCaseStatus: 'Failed' }], 1),
    );
    listDomains.mockResolvedValue(emptyPage([{ id: 'dom-1', name: 'finance', displayName: 'Finance', domainType: 'Source-aligned' }]));
    listDataProducts.mockResolvedValue(emptyPage([{ id: 'dp-1', name: 'revenue', displayName: 'Revenue' }]));
    listKpis.mockResolvedValue(
      emptyPage([{ id: 'kpi-1', name: 'description-coverage', kpiResult: { targetResult: [{ name: 'a', value: '42' }] } }]),
    );
    listDatabaseServices.mockResolvedValue(
      emptyPage([{ id: 'svc-1', name: 'postgres', serviceType: 'Postgres', kind: 'database' }]),
    );
    listMessagingServices.mockResolvedValue(emptyPage([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the OM My Data greeting, announcements rail, and topic widgets from live APIs', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="home-landing-page-header"]').text()).toContain('Hi Alice Admin');
    expect(wrapper.text()).toContain("Here's what needs your attention across your data.");
    expect(wrapper.get('[data-testid="home-critical-announcement"]').text()).toContain('Maintenance window');
    expect(wrapper.get('[data-testid="home-announcements-rail"]').text()).toContain('New glossary terms');
    expect(wrapper.get('[data-testid="topics-to-catch-up-on"]').text()).toContain('Topics to catch up on');
    expect(wrapper.get('[data-testid="home-widget-platformHealth"]').text()).toContain('postgres');
    expect(wrapper.get('[data-testid="home-widget-dataEstate"]').text()).toContain('Postgres');
    expect(wrapper.get('[data-testid="home-widget-totalAssets"]').text()).toContain('12');
    expect(wrapper.get('[data-testid="home-widget-myTasks"]').text()).toContain('Request description');
    expect(wrapper.get('[data-testid="home-widget-pipelineStatus"]').text()).toContain('postgres-metadata');
    expect(wrapper.get('[data-testid="home-widget-activityFeed"]').text()).toContain('Updated description');
    expect(wrapper.get('[data-testid="owned-assets"]').text()).toContain('orders');
    expect(wrapper.get('[data-testid="followed-assets"]').text()).toContain('customers');
    expect(wrapper.get('[data-testid="home-widget-dataQuality"]').text()).toContain('orders_row_count');
    expect(wrapper.get('[data-testid="home-widget-domains"]').text()).toContain('Finance');
    expect(wrapper.get('[data-testid="home-widget-dataProducts"]').text()).toContain('Revenue');
    expect(wrapper.get('[data-testid="home-widget-kpi"]').text()).toContain('description-coverage');
    expect(wrapper.get('[data-testid="home-widget-kpi"]').text()).toContain('42');
    expect(wrapper.find('[data-testid="home-customize"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="home-widget-knowledgeCenter"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/DAU|page views/i);
    expect(searchAssets).toHaveBeenCalledWith('owners.id:"u-1"', 0, 5, { includeAggregations: false });
    expect(searchAssets).toHaveBeenCalledWith('followers:"u-1"', 0, 5, { includeAggregations: false });
  });

  it('keeps honest empties when APIs return no rows and does not invent KPI or estate metrics', async () => {
    listAnnouncements.mockResolvedValue(emptyPage());
    searchAssets.mockResolvedValue({ total: 0, hits: [], facets: [] });
    listTasks.mockResolvedValue(emptyPage());
    listIngestionPipelines.mockResolvedValue(emptyPage());
    listActivityEvents.mockResolvedValue(emptyPage());
    listTestCases.mockResolvedValue(emptyPage());
    listDomains.mockResolvedValue(emptyPage());
    listDataProducts.mockResolvedValue(emptyPage());
    listKpis.mockResolvedValue(emptyPage());
    listDatabaseServices.mockResolvedValue(emptyPage());
    listMessagingServices.mockResolvedValue(emptyPage());
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="home-announcements-empty"]').text()).toContain('No Active Announcements');
    expect(wrapper.get('[data-testid="home-widget-kpi-empty"]').text()).toContain('Set a target for coverage');
    expect(wrapper.get('[data-testid="home-widget-totalAssets-empty"]').text()).toContain(
      'Assets appear after your first metadata ingestion completes',
    );
    expect(wrapper.find('[data-testid="home-kpi-row"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/\b0 DAU\b|fake/i);
  });

  it('opens an existing collaboration or catalog route from a widget row', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="home-task-row"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('task');
    expect(router.currentRoute.value.params.id).toBe('task-1');
  });

  it('switches the topic grid to a single column list and can collapse the widgets', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="home-widget-grid"]').exists()).toBe(true);
    await wrapper.get('[data-testid="home-view-list"]').trigger('click');
    await wrapper.get('[data-testid="toggle-all-widgets"]').trigger('click');
    expect(wrapper.find('[data-testid="home-widget-grid"]').exists()).toBe(false);
    await wrapper.get('[data-testid="toggle-all-widgets"]').trigger('click');
    expect(wrapper.find('[data-testid="home-widget-grid"]').exists()).toBe(true);
  });
});
