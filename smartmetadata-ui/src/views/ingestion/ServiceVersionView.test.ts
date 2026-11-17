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
import ServiceVersionView from './ServiceVersionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface VersionFixture {
  kind: string;
  permissionOps: string[];
  versionsFail: boolean;
  childRows: Array<Record<string, unknown>>;
}

const fetchCalls: string[] = [];

function stubFetch(fixture: VersionFixture): void {
  fetchCalls.length = 0;
  const collection = fixture.kind === 'database' ? 'databaseServices' : `${fixture.kind}Services`;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes(`/api/v1/services/${collection}/s1/versions/0.2`)) {
        return jsonResponse({
          id: 's1',
          name: 'warehouse',
          displayName: 'Warehouse',
          fullyQualifiedName: 'pg.warehouse',
          serviceType: 'Postgres',
          description: 'Warehouse service',
          owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
          domains: [{ id: 'd1', type: 'domain', name: 'Finance' }],
          tags: [{ tagFQN: 'Tier.Tier1', source: 'Classification' }],
          version: 0.2,
        });
      }
      if (url.includes(`/api/v1/services/${collection}/s1/versions`)) {
        if (fixture.versionsFail) {
          return new Response('boom', { status: 500 });
        }
        return jsonResponse({
          versions: [
            {
              version: 0.1,
              updatedBy: 'alice',
              updatedAt: 1700000000000,
              changeDescription: {
                fieldsAdded: [{ field: 'description', newValue: 'Warehouse service' }],
              },
            },
            {
              version: 0.2,
              updatedBy: 'bob',
              updatedAt: 1700001000000,
              changeDescription: {
                fieldsUpdated: [{ field: 'description', oldValue: 'Old', newValue: 'Warehouse service' }],
              },
            },
          ],
        });
      }
      if (url.includes('/api/v1/permissions/') && url.includes('/name/')) {
        return jsonResponse({
          resource: 'databaseService',
          permissions: fixture.permissionOps.map((operation) => ({ operation, access: 'allow' })),
        });
      }
      if (url.includes('/api/v1/permissions/database')) {
        return jsonResponse({
          resource: 'database',
          permissions: [{ operation: 'ViewUsage', access: 'allow' }],
        });
      }
      if (url.includes('/api/v1/databases')) {
        return jsonResponse({
          data: fixture.childRows,
          paging: { total: fixture.childRows.length },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

const mounted: Array<{ unmount(): void }> = [];

async function mountView(fixture: VersionFixture, version = '0.2') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: { template: '<div>detail</div>' },
        props: true,
      },
      {
        path: '/ingestion/services/:kind/:id/versions/:version',
        name: 'ingestion-service-version',
        component: ServiceVersionView,
        props: true,
      },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
        props: true,
      },
    ],
  });
  await router.push(`/ingestion/services/${fixture.kind}/s1/versions/${version}`);
  await router.isReady();
  const wrapper = mount(ServiceVersionView, {
    props: { kind: fixture.kind, id: 's1', version },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

function newFixture(overrides: Partial<VersionFixture> = {}): VersionFixture {
  return {
    kind: 'database',
    permissionOps: ['ViewAll'],
    versionsFail: false,
    childRows: [{ id: 'd1', name: 'db1', fullyQualifiedName: 'pg.warehouse.db1' }],
    ...overrides,
  };
}

describe('ServiceVersionView', () => {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    stubFetch(newFixture());
  });

  it('renders the snapshot header, timeline, diff rows, and current children', async () => {
    const { wrapper } = await mountView(newFixture());
    expect(wrapper.text()).toContain('Warehouse');
    expect(wrapper.text()).toContain('pg.warehouse');
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Finance');
    expect(wrapper.text()).toContain('Tier.Tier1');
    expect(wrapper.find('[data-testid="service-version-0.1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-version-0.2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-version-diff-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-version-diff-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('description');
    expect(wrapper.find('[data-testid="service-version-main-tab"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Databases');
    expect(wrapper.text()).toContain('db1');
  });

  it('navigates to another version from the timeline', async () => {
    const { wrapper, router } = await mountView(newFixture());
    await wrapper.find('[data-testid="service-version-0.1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.version).toBe('0.1');
  });

  it('navigates back to the service detail page', async () => {
    const { wrapper, router } = await mountView(newFixture());
    await wrapper.find('[data-testid="service-version-back"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's1' });
  });

  it('renders no children section for metadata services', async () => {
    const fixture = newFixture({ kind: 'metadata' });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    expect(wrapper.find('[data-testid="service-version-main-tab"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-version-children-table"]').exists()).toBe(false);
  });

  it('shows the forbidden state when ViewAll and ViewBasic are denied', async () => {
    const fixture = newFixture({ permissionOps: [] });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    expect(wrapper.find('[data-testid="service-version-state-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Access not allowed');
    expect(wrapper.find('[data-testid="service-version-main-tab"]').exists()).toBe(false);
  });

  it('shows the error state when the versions fetch fails', async () => {
    const fixture = newFixture({ versionsFail: true });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    expect(wrapper.find('[data-testid="service-version-state-error"]').exists()).toBe(true);
  });

  it('renders tier and certification columns with the tags cell filtered', async () => {
    const fixture = newFixture({
      childRows: [
        {
          id: 'd1',
          name: 'db1',
          displayName: 'DB One',
          fullyQualifiedName: 'pg.warehouse.db1',
          tags: [
            { tagFQN: 'Tier.Tier1', source: 'Classification' },
            { tagFQN: 'Certification.Gold', source: 'Classification' },
            { tagFQN: 'PII.Sensitive', source: 'Classification' },
          ],
          certification: { tagLabel: { tagFQN: 'Certification.Gold', source: 'Classification' } },
        },
      ],
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    const table = wrapper.find('[data-testid="service-version-children-table"]');
    await vi.waitFor(() => {
      expect(table.find('[data-testid="tag-PII.Sensitive"]').exists()).toBe(true);
    });
    expect(table.find('thead').text()).toContain('Tier');
    expect(table.find('thead').text()).toContain('Certification');
    expect(table.findAll('[data-testid="tag-Tier.Tier1"]')).toHaveLength(1);
    expect(table.findAll('[data-testid="tag-Certification.Gold"]')).toHaveLength(1);
    expect(table.findAll('[data-testid="tag-PII.Sensitive"]')).toHaveLength(1);
    expect(table.find('[data-testid="column-display-name"]').text()).toBe('DB One');
  });

  it('renders the change kind in the diff table', async () => {
    const { wrapper } = await mountView(newFixture());
    const table = wrapper.find('[data-testid="service-version-diff-table"]');
    expect(table.find('thead').text()).toContain('Change');
    expect(table.text()).toContain('Updated');
  });

  it('never fetches children while the view permission is forbidden', async () => {
    const fixture = newFixture({ permissionOps: [] });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-version-state-error"]').exists()).toBe(true);
    });
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('/api/v1/databases'))).toBe(false);
  });

  it('fetches children once the view permission settles as allowed', async () => {
    const { wrapper } = await mountView(newFixture());
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-version-main-tab"]').exists()).toBe(true);
    });
    expect(fetchCalls.some((url) => url.includes('/api/v1/databases'))).toBe(true);
  });
});
