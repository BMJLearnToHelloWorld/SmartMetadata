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
import Antd, { message, Table, Tooltip } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import ServiceVersionTimeline from '@/components/ingestion/ServiceVersionTimeline.vue';
import { createTestI18n } from '@/test/i18n';
import ServiceVersionView from './ServiceVersionView.vue';
import { SERVICE_COLLECTION_BY_KIND } from '@/api/serviceVersions';
import type { ServiceKind } from '@/types/ingestion';

// New keys under settings.services.version.* (never written to the locale
// files by this worker; merged here so the view renders real copy).
const MESSAGES = {
  settings: {
    services: {
      viewEntity: 'View {entity}',
      version: {
        exitVersionHistory: 'Exit Version History',
        noTier: 'No Tier',
        noDomains: 'No Domains',
        noOwner: 'No Owner',
        deleted: 'Deleted',
        scheduleInterval: 'Schedule Interval',
        service: 'Service',
        domains: 'Domains',
        dataProducts: 'Data Products',
        historyTitle: 'Versions History',
        major: 'Major',
        moreVersions: '+{count} more versions',
        unlockAllHistory: 'Unlock all of your version history',
        upgradeToPaidPlan: 'Upgrade to paid plan for access to all of your version history.',
      },
      summary: {
        added: 'Added',
        addedLowercase: 'added',
        edited: 'Edited',
        updatedLowercase: 'updated',
        removed: 'Removed',
        deletedLowercase: 'deleted',
        restoredLowercase: 'restored',
        hasBeenActionType: 'has been {actionType}',
        dataAssetHasBeenActionType: 'Data Asset has been {actionType}',
        columnPlural: 'columns',
        tagPlural: 'tags',
      },
    },
  },
  message: {
    'no-access-placeholder':
      "You don't have necessary permissions. Please check with the admin to get the <0>{entity}</0> permission.",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface VersionFixture {
  kind: string;
  permissionOps: string[];
  permissionFail: boolean;
  versionsFail: boolean;
  versionsAsStrings: boolean;
  snapshotOverrides: Record<string, unknown>;
  versionEntries: Array<Record<string, unknown>>;
  childRows: Array<Record<string, unknown>>;
  childPaging: { total: number; after?: string; before?: string };
  maxVersions: number | null;
  holdSnapshot: boolean;
  holdResolution: boolean;
}

const fetchCalls: string[] = [];
let releaseSnapshot: (() => void) | null = null;
let releaseResolution: (() => void) | null = null;

function defaultEntries(): Array<Record<string, unknown>> {
  return [
    {
      version: 0.1,
      updatedBy: 'alice',
      updatedAt: 1700000000000,
      changeDescription: {
        fieldsAdded: [{ field: 'description', newValue: 'Old' }],
      },
    },
    {
      version: 0.2,
      updatedBy: 'bob',
      updatedAt: 1700001000000,
      changeDescription: {
        fieldsUpdated: [
          { field: 'description', oldValue: 'Old', newValue: 'Warehouse service' },
        ],
        fieldsAdded: [
          {
            field: 'tags',
            newValue: [{ tagFQN: 'PII.Sensitive', source: 'Classification' }],
          },
        ],
      },
    },
  ];
}

function defaultSnapshot(): Record<string, unknown> {
  return {
    id: 's1',
    name: 'warehouse',
    displayName: 'Warehouse',
    fullyQualifiedName: 'pg.warehouse',
    serviceType: 'Postgres',
    description: 'Warehouse service',
    owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
    domains: [{ id: 'd1', type: 'domain', name: 'Finance' }],
    tags: [
      { tagFQN: 'Tier.Tier1', source: 'Classification' },
      { tagFQN: 'PII.Sensitive', source: 'Classification' },
      { tagFQN: 'Glossary.Term1', source: 'Glossary' },
    ],
    version: 0.2,
  };
}

function defaultChildRows(): Array<Record<string, unknown>> {
  return [
    {
      id: 'd1',
      name: 'db1',
      displayName: 'DB One',
      fullyQualifiedName: 'pg.warehouse.db1',
      description: 'First database',
      owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
      domains: [
        { id: 'd1', type: 'domain', name: 'Finance' },
        { id: 'd2', type: 'domain', name: 'Risk' },
      ],
      dataProducts: [{ id: 'p1', type: 'dataProduct', name: 'DP1' }],
      tags: [
        { tagFQN: 'Tier.Tier1', source: 'Classification' },
        { tagFQN: 'Certification.Gold', source: 'Classification' },
        { tagFQN: 'PII.Sensitive', source: 'Classification' },
      ],
      certification: {
        tagLabel: { tagFQN: 'Certification.Gold', source: 'Classification' },
      },
      usageSummary: { weeklyStats: { percentileRank: 50 } },
    },
  ];
}

function stubFetch(fixture: VersionFixture): void {
  fetchCalls.length = 0;
  releaseSnapshot = null;
  releaseResolution = null;
  const snapshotBody = { ...defaultSnapshot(), ...fixture.snapshotOverrides };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      // Snapshot: /versions/<version> — before the list branch.
      if (/\/versions\/[^/?]+(\?|$)/.test(url)) {
        if (fixture.holdSnapshot) {
          await new Promise<void>((resolve) => {
            releaseSnapshot = resolve;
          });
        }
        return jsonResponse(snapshotBody);
      }
      if (url.includes('/versions')) {
        if (fixture.versionsFail) {
          return new Response('boom', { status: 500 });
        }
        const versions = fixture.versionsAsStrings
          ? fixture.versionEntries.map((entry) => JSON.stringify(entry))
          : fixture.versionEntries;
        return jsonResponse({ versions });
      }
      if (url.includes('/api/v1/permissions/') && url.includes('/name/')) {
        if (fixture.permissionFail) {
          return new Response('denied', { status: 500 });
        }
        return jsonResponse({
          resource: 'databaseService',
          permissions: fixture.permissionOps.map((operation) => ({
            operation,
            access: 'allow',
          })),
        });
      }
      if (url.includes('/api/v1/permissions/')) {
        return jsonResponse({
          resource: 'database',
          permissions: [{ operation: 'ViewUsage', access: 'allow' }],
        });
      }
      if (url.includes('/api/v1/limits/features/')) {
        if (fixture.maxVersions === null) {
          return new Response('not found', { status: 404 });
        }
        return jsonResponse({
          featureLimitStatuses: [
            { configuredLimit: { maxVersions: fixture.maxVersions } },
          ],
        });
      }
      // Resolution: /services/<collection>/s1 (no /versions segment).
      if (/\/api\/v1\/services\/[^/]+\/s1(\?|$)/.test(url) || /\/api\/v1\/services\/[^/]+\/name\/pg\.warehouse(\?|$)/.test(url)) {
        if (fixture.holdResolution) {
          await new Promise<void>((resolve) => {
            releaseResolution = resolve;
          });
        }
        return jsonResponse(snapshotBody);
      }
      // Children: any remaining collection endpoint.
      if (url.includes('/api/v1/')) {
        return jsonResponse({
          data: fixture.childRows,
          paging: fixture.childPaging,
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
  const i18n = createTestI18n();
  i18n.global.mergeLocaleMessage('en-US', MESSAGES);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/connections',
        name: 'connections',
        component: { template: '<div>list</div>' },
      },
      {
        path: '/service/:serviceCategory/:fqn/:tab?/:subTab?',
        name: 'service-detail',
        component: { template: '<div>detail</div>' },
        props: true,
      },
      {
        path: '/service/:serviceCategory/:fqn/versions/:version',
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
      {
        path: '/users/:name',
        name: 'user-profile',
        component: { template: '<div>user</div>' },
        props: true,
      },
    ],
  });
  const serviceCategory = SERVICE_COLLECTION_BY_KIND[fixture.kind as ServiceKind] ?? fixture.kind;
  const fqn = 'pg.warehouse';
  await router.push(`/service/${serviceCategory}/${encodeURIComponent(fqn)}/versions/${version}`);
  await router.isReady();
  const wrapper = mount(ServiceVersionView, {
    props: { serviceCategory, fqn, version },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, i18n] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

function newFixture(overrides: Partial<VersionFixture> = {}): VersionFixture {
  return {
    kind: 'database',
    permissionOps: ['ViewAll'],
    permissionFail: false,
    versionsFail: false,
    versionsAsStrings: false,
    snapshotOverrides: {},
    versionEntries: defaultEntries(),
    childRows: defaultChildRows(),
    childPaging: { total: 1 },
    maxVersions: null,
    holdSnapshot: false,
    holdResolution: false,
    ...overrides,
  };
}

describe('ServiceVersionView', () => {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount();
    }
    message.destroy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders the header diff, tabs, children table, tag panel, and timeline', async () => {
    const fixture = newFixture();
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-children-table"]').exists(),
      ).toBe(true);
    });

    // Header: plain displayName title, no deleted badge.
    expect(wrapper.find('h1').text()).toContain('Warehouse');
    expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(false);
    // Meta row: domain + owner + tier.
    expect(wrapper.text()).toContain('Finance');
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.find('[data-testid="Tier"]').text()).toContain('Tier1');
    // Version button: raw version string + exit tooltip.
    const versionButton = wrapper.find('[data-testid="version-button"]');
    expect(versionButton.text()).toBe('0.2');
    expect(wrapper.findComponent(Tooltip).props('title')).toBe('Exit Version History');
    // Breadcrumb: category + entity, no version segment.
    expect(wrapper.find('.ant-breadcrumb').text()).toContain('Database');
    expect(wrapper.find('.ant-breadcrumb').text()).toContain('Warehouse');

    // Description diff: removed Old, added Warehouse service.
    const description = wrapper.find('[data-testid="description-container"]');
    expect(description.text()).toContain('Old');
    expect(description.text()).toContain('Warehouse service');
    expect(
      description.find('.version-diff-text__diff-removed').exists(),
    ).toBe(true);
    expect(description.find('.version-diff-text__diff-added').exists()).toBe(true);

    // Tabs: single count tab with the paging total as the badge.
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tabs"]').text()).toContain('Databases');
    expect(wrapper.find('.ant-badge-count').text()).toBe('1');

    // Children table: pin column set, rowKey name, no antd pagination.
    const table = wrapper.find('[data-testid="service-children-table"]');
    const headers = table.find('thead').text();
    for (const header of [
      'Name',
      'Description',
      'Owners',
      'Domains',
      'Data Products',
      'Tags',
      'Tier',
      'Certification',
      'Usage',
    ]) {
      expect(headers).toContain(header);
    }
    expect(headers).not.toContain('Schedule Interval');
    expect(wrapper.findComponent(Table).props('rowKey')).toBe('name');
    expect(wrapper.findComponent(Table).props('pagination')).toBe(false);
    expect(table.text()).toContain('DB One');
    expect(table.text()).toContain('Finance, Risk');
    expect(table.text()).toContain('DP1');
    expect(table.text()).toContain('50th');
    expect(table.text()).toContain('pctile');
    // Tag cells: tier/certification split out of the tags cell.
    expect(table.findAll('[data-testid="tag-Tier.Tier1"]')).toHaveLength(1);
    expect(table.findAll('[data-testid="tag-Certification.Gold"]')).toHaveLength(1);
    expect(table.findAll('[data-testid="tag-PII.Sensitive"]')).toHaveLength(1);

    // Tag panel: one group per TagSource, tier stripped, added chip marked.
    const panel = wrapper.find('[data-testid="entity-right-panel"]');
    expect(panel.text()).toContain('Classification');
    expect(panel.text()).toContain('Glossary');
    expect(panel.text()).toContain('PII.Sensitive');
    expect(panel.text()).toContain('Glossary.Term1');
    expect(panel.text()).not.toContain('Tier.Tier1');
    const addedChip = panel.find('.service-version__tag--added');
    expect(addedChip.exists()).toBe(true);
    expect(addedChip.text()).toBe('PII.Sensitive');

    // Timeline: both versions present.
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-entry-v0.1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-entry-v0.2"]').exists()).toBe(true);
  });

  it('parses string versions end to end (server wire shape)', async () => {
    // The wire shape carries tag field values as JSON strings; the
    // string-versions path must parse both layers.
    const entries = defaultEntries();
    entries[1] = {
      ...entries[1],
      changeDescription: {
        fieldsUpdated: [
          { field: 'description', oldValue: 'Old', newValue: 'Warehouse service' },
        ],
        fieldsAdded: [
          {
            field: 'tags',
            newValue: JSON.stringify([{ tagFQN: 'PII.Sensitive', source: 'Classification' }]),
          },
        ],
      },
    };
    const fixture = newFixture({ versionsAsStrings: true, versionEntries: entries });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="version-entry-v0.1"]').exists()).toBe(true);
    });
    // The changeDescription lookup runs on the parsed entries.
    const description = wrapper.find('[data-testid="description-container"]');
    expect(description.text()).toContain('Old');
    expect(description.text()).toContain('Warehouse service');
    expect(wrapper.find('.service-version__tag--added').text()).toBe('PII.Sensitive');
  });

  it('denies with the placeholder and zero version fetches when permission is denied', async () => {
    const fixture = newFixture({ permissionOps: [] });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Warehouse Service');
    });
    expect(wrapper.text()).toContain('View');
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(false);
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('/versions'))).toBe(false);
    expect(fetchCalls.some((url) => url.includes('/limits/'))).toBe(false);
    expect(fetchCalls.some((url) => url.includes('/api/v1/databases'))).toBe(false);
    expect(fetchCalls).toHaveLength(2);
  });

  it('toasts and denies when the permission fetch fails', async () => {
    const fixture = newFixture({ permissionFail: true });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Warehouse Service');
    });
    expect(document.querySelector('.ant-message-error')).not.toBeNull();
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('/versions'))).toBe(false);
  });

  it('shows the error state and fetches nothing for an illegal kind', async () => {
    const fixture = newFixture({ kind: 'bogus' });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-version-state"]').exists()).toBe(true);
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it('shows the error state when the versions fetch fails', async () => {
    const fixture = newFixture({ versionsFail: true });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-version-state"]').exists()).toBe(true);
    });
    // The propagated server message, not the locale fallback: the view
    // surfaces the fetch error verbatim, as the previous view did.
    expect(wrapper.find('[data-testid="service-version-state"]').text()).toContain('boom');
  });

  it('renders no tabs, no domain row, and no children fetch for metadata services', async () => {
    const fixture = newFixture({ kind: 'metadata' });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-children-table"]').exists()).toBe(false);
    // The snapshot carries a domain; the header must not render it.
    expect(wrapper.text()).not.toContain('Finance');
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('/api/v1/metadata'))).toBe(false);
  });

  it('renders the deleted badge for a deleted snapshot', async () => {
    const fixture = newFixture({ snapshotOverrides: { deleted: true } });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="deleted-badge"]').text()).toBe('Deleted');
  });

  it('renders the displayName word diff in the title', async () => {
    const entries = defaultEntries();
    entries[1] = {
      ...entries[1],
      changeDescription: {
        fieldsUpdated: [
          { field: 'displayName', oldValue: 'Old Name', newValue: 'Warehouse' },
        ],
      },
    };
    const fixture = newFixture({ versionEntries: entries });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('h1').text()).toContain('Warehouse');
    });
    const title = wrapper.find('h1');
    expect(title.text()).toContain('Old Name');
    expect(title.find('.version-diff-text__diff-removed').exists()).toBe(true);
    expect(title.find('.version-diff-text__diff-added').exists()).toBe(true);
  });

  it('falls back to the name when the displayName diff is empty', async () => {
    const fixture = newFixture({
      snapshotOverrides: { displayName: undefined },
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('h1').text()).toContain('warehouse');
    });
  });

  it('renders No Tier when the snapshot has no tier tag', async () => {
    // Entries without a tags change: the panel is genuinely empty.
    const entries = defaultEntries();
    entries[1] = {
      ...entries[1],
      changeDescription: {
        fieldsUpdated: [
          { field: 'description', oldValue: 'Old', newValue: 'Warehouse service' },
        ],
      },
    };
    const fixture = newFixture({
      snapshotOverrides: { tags: [] },
      versionEntries: entries,
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="Tier"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="Tier"]').text()).toContain('No Tier');
    expect(
      wrapper.find('[data-testid="entity-right-panel"]').find('h4').exists(),
    ).toBe(false);
  });

  it('renders No Domains and No Owner for empty domains and owners', async () => {
    const fixture = newFixture({
      snapshotOverrides: { domains: [], owners: [] },
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Domains');
    });
    expect(wrapper.text()).toContain('No Owner');
  });

  it('renders the schedule-interval column only for pipelines', async () => {
    const fixture = newFixture({
      kind: 'pipeline',
      childRows: [
        {
          id: 'p1',
          name: 'pipe1',
          fullyQualifiedName: 'pg.warehouse.pipe1',
          scheduleInterval: '0 0 * * *',
        },
        { id: 'p2', name: 'pipe2', fullyQualifiedName: 'pg.warehouse.pipe2' },
      ],
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-children-table"]').exists(),
      ).toBe(true);
    });
    const table = wrapper.find('[data-testid="service-children-table"]');
    expect(table.find('thead').text()).toContain('Schedule Interval');
    expect(table.find('thead').text()).not.toContain('Usage');
    expect(table.text()).toContain('0 0 * * *');
    expect(table.text()).toContain('--');
  });

  it('renders the empty state with the category logo and no table', async () => {
    const fixture = newFixture({ childRows: [], childPaging: { total: 0 } });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Databases data available.');
    });
    expect(wrapper.find('[data-testid="service-children-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-logo"]').exists()).toBe(true);
  });

  it('renders NextPrevious without a size dropdown when a cursor exists', async () => {
    const fixture = newFixture({
      childPaging: { total: 25, after: 'c1' },
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
    });
    expect(wrapper.findComponent(NextPrevious).props('pageSize')).toBe(10);
    expect(wrapper.findComponent(NextPrevious).props('onShowSizeChange')).toBeUndefined();
    expect(
      wrapper.find('[data-testid="page-size-selection-dropdown"]').exists(),
    ).toBe(false);
  });

  it('hides NextPrevious when no cursor exists', async () => {
    const fixture = newFixture({ childPaging: { total: 1 } });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-children-table"]').exists(),
      ).toBe(true);
    });
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });

  it('refetches children with the after cursor on next-page', async () => {
    const fixture = newFixture({
      childPaging: { total: 25, after: 'c1' },
    });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('after=c1'))).toBe(true);
  });

  it('navigates to another version from the timeline', async () => {
    const fixture = newFixture();
    stubFetch(fixture);
    const { wrapper, router } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="version-selector-v0.1"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="version-selector-v0.1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.version).toBe('0.1');
  });

  it('navigates back to the service detail page from the version button', async () => {
    const fixture = newFixture();
    stubFetch(fixture);
    const { wrapper, router } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="version-button"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="version-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('service-detail');
    expect(router.currentRoute.value.params).toMatchObject({
      serviceCategory: 'databaseServices',
      fqn: 'pg.warehouse',
    });
  });

  it('navigates back to the service detail page from the timeline close', async () => {
    const fixture = newFixture();
    stubFetch(fixture);
    const { wrapper, router } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-close"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="versions-list-close"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('service-detail');
  });

  it('reloads only the snapshot when the version prop changes', async () => {
    const fixture = newFixture();
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-children-table"]').exists(),
      ).toBe(true);
    });
    const listFetchesBefore = fetchCalls.filter(
      (url) => url.includes('/versions') && !/\/versions\/[^/?]+/.test(url),
    ).length;
    const permissionFetchesBefore = fetchCalls.filter((url) =>
      url.includes('/permissions/'),
    ).length;
    await wrapper.setProps({ version: '0.1' });
    await flushPromises();
    expect(fetchCalls.some((url) => url.includes('/versions/0.1'))).toBe(true);
    expect(
      fetchCalls.filter(
        (url) => url.includes('/versions') && !/\/versions\/[^/?]+/.test(url),
      ).length,
    ).toBe(listFetchesBefore);
    expect(fetchCalls.filter((url) => url.includes('/permissions/')).length).toBe(
      permissionFetchesBefore,
    );
  });

  it('keeps the timeline visible while the snapshot loads', async () => {
    const fixture = newFixture({ holdSnapshot: true });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    });
    expect(wrapper.find('.ant-spin-spinning').exists()).toBe(true);
    expect(wrapper.find('[data-testid="description-container"]').exists()).toBe(false);
    releaseSnapshot?.();
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="description-container"]').exists()).toBe(true);
    });
  });

  it('shows only the spinner while the page loads', async () => {
    const fixture = newFixture({ holdResolution: true });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('.ant-spin-spinning').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(false);
    releaseResolution?.();
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    });
  });

  it('passes maxVersions from the limits fetch to the timeline', async () => {
    const fixture = newFixture({ maxVersions: 2 });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    });
    expect(wrapper.findComponent(ServiceVersionTimeline).props('maxVersions')).toBe(2);
  });

  it('passes -1 to the timeline when the limits fetch fails', async () => {
    const fixture = newFixture({ maxVersions: null });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    });
    expect(wrapper.findComponent(ServiceVersionTimeline).props('maxVersions')).toBe(-1);
  });

  it('renders the count tab for dashboard services', async () => {
    const fixture = newFixture({ kind: 'dashboard' });
    stubFetch(fixture);
    const { wrapper } = await mountView(fixture);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="tabs"]').text()).toContain('Dashboards');
  });
});
