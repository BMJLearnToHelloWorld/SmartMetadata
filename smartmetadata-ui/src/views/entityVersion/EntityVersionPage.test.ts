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
import { computed } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail } from '@/types/api';

const permissionState = vi.hoisted(() => ({
  hasViewAccess: true,
  isLoading: false,
  error: null as unknown,
}));

vi.mock('@/composables/useEntityPermissions', () => ({
  DEFAULT_ENTITY_PERMISSION: {
    Create: false,
    Delete: false,
    ViewAll: false,
    ViewBasic: false,
    EditAll: false,
  },
  useEntityPermissions: () => ({
    permissions: computed(() => ({
      ViewAll: permissionState.hasViewAccess,
      ViewBasic: permissionState.hasViewAccess,
      ViewCustomFields: true,
    })),
    isLoading: computed(() => permissionState.isLoading),
    error: computed(() => permissionState.error),
    hasViewAccess: computed(() => permissionState.hasViewAccess),
  }),
}));

const fetchAssetDetail = vi.fn();
const listEntityVersions = vi.fn();
const getEntityVersion = vi.fn();

vi.mock('@/api/entities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/entities')>();
  return {
    ...actual,
    fetchAssetDetail: (...args: unknown[]) => fetchAssetDetail(...args),
    listEntityVersions: (...args: unknown[]) => listEntityVersions(...args),
    getEntityVersion: (...args: unknown[]) => getEntityVersion(...args),
  };
});

vi.mock('@/views/AssetDetailView.vue', () => ({
  default: {
    name: 'AssetDetailView',
    props: ['entityType', 'fqn'],
    template: '<div data-testid="fallback-asset-detail">{{ entityType }} {{ fqn }}</div>',
  },
}));

vi.mock('@/views/entityVersion/DataProductVersionMount.vue', () => ({
  default: {
    name: 'DataProductVersionMount',
    props: ['fqn'],
    template: '<div data-testid="data-product-version-mount">{{ fqn }}</div>',
  },
}));

import EntityVersionPage from './EntityVersionPage.vue';

function tableDetail(): AssetDetail {
  return {
    entityType: 'table',
    id: 'tbl-1',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [{ key: 'id', name: 'id', dataType: 'INT' }],
    schemaLabel: 'Schema',
    version: 0.2,
  };
}

async function mountPage(path: string, props: { entityType: string; fqn: string; version: string; tab?: string }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/:entityType/:fqn/versions/:version/:tab?',
        name: 'asset-version-detail',
        component: EntityVersionPage,
        props: true,
      },
      {
        path: '/:entityType/:fqn/:tab?',
        name: 'asset-detail',
        component: { template: '<div data-testid="entity-details" />' },
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(EntityVersionPage, {
    props,
    global: {
      plugins: [router, Antd, createTestI18n()],
      stubs: {
        ServiceVersionTimeline: {
          props: ['versions', 'currentVersion'],
          emits: ['select', 'close'],
          template:
            '<aside data-testid="versions-list-container"><button data-testid="pick-version" @click="$emit(\'select\', \'0.1\')">0.1</button></aside>',
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('EntityVersionPage', () => {
  beforeEach(() => {
    permissionState.hasViewAccess = true;
    permissionState.isLoading = false;
    permissionState.error = null;
    fetchAssetDetail.mockReset();
    listEntityVersions.mockReset();
    getEntityVersion.mockReset();
    fetchAssetDetail.mockResolvedValue(tableDetail());
    listEntityVersions.mockResolvedValue([{ version: '0.2' }, { version: '0.1' }]);
    getEntityVersion.mockResolvedValue(tableDetail());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows PermissionPlaceholder and does not fetch versions when view access is denied', async () => {
    permissionState.hasViewAccess = false;
    const { wrapper } = await mountPage('/table/svc.db.schema.orders/versions/0.2', {
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      version: '0.2',
    });
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(fetchAssetDetail).not.toHaveBeenCalled();
    expect(listEntityVersions).not.toHaveBeenCalled();
    expect(getEntityVersion).not.toHaveBeenCalled();
  });

  it('loads the current entity with include=all, then the version list and snapshot', async () => {
    const { wrapper } = await mountPage('/table/svc.db.schema.orders/versions/0.2', {
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      version: '0.2',
    });
    expect(fetchAssetDetail).toHaveBeenCalledWith('table', 'svc.db.schema.orders', { include: 'all' });
    expect(listEntityVersions).toHaveBeenCalledWith('table', 'tbl-1');
    expect(getEntityVersion).toHaveBeenCalledWith('table', 'tbl-1', '0.2');
    expect(wrapper.find('[data-testid="version-button"]').text()).toContain('0.2');
    expect(wrapper.find('[data-testid="entity-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-versions-table"]').exists()).toBe(false);
  });

  it('navigates with getVersionPath when the tab or selected version changes', async () => {
    const { wrapper, router } = await mountPage('/table/svc.db.schema.orders/versions/0.2', {
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      version: '0.2',
    });
    await wrapper.find('[data-testid="pick-version"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/table/svc.db.schema.orders/versions/0.1');
  });

  it('exits version history to the official entity details path', async () => {
    const { wrapper, router } = await mountPage('/table/svc.db.schema.orders/versions/0.2', {
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      version: '0.2',
    });
    await wrapper.find('[data-testid="version-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/table/svc.db.schema.orders');
  });

  it('mounts the regular data-product page for dataProduct and does not parent-fetch versions', async () => {
    const { wrapper } = await mountPage('/dataProduct/sales.finance/versions/0.1', {
      entityType: 'dataProduct',
      fqn: 'sales.finance',
      version: '0.1',
    });
    expect(wrapper.find('[data-testid="data-product-version-mount"]').text()).toContain('sales.finance');
    expect(fetchAssetDetail).not.toHaveBeenCalled();
    expect(getEntityVersion).not.toHaveBeenCalled();
  });

  it('falls back to the regular entity detail for types official does not version this way', async () => {
    const { wrapper } = await mountPage('/query/svc.q1/versions/0.1', {
      entityType: 'query',
      fqn: 'svc.q1',
      version: '0.1',
    });
    expect(wrapper.find('[data-testid="fallback-asset-detail"]').text()).toContain('query');
    expect(wrapper.find('[data-testid="fallback-asset-detail"]').text()).toContain('svc.q1');
    expect(getEntityVersion).not.toHaveBeenCalled();
  });
});
