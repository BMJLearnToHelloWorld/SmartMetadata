/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createTestI18n } from '@/test/i18n';
import AssetContractTab from './AssetContractTab.vue';

const getContractByEntityId = vi.fn();

vi.mock('@/api/dataContracts', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataContracts')>('@/api/dataContracts');
  return {
    ...actual,
    getContractByEntityId: (...args: unknown[]) => getContractByEntityId(...args),
    createContract: vi.fn(),
    updateContract: vi.fn(),
    deleteContractById: vi.fn(),
  };
});

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getResourcePermission: vi.fn(async () => ({ Create: true })),
    getEntityPermissionByFqn: vi.fn(async () => ({ EditAll: true, Delete: true })),
  }),
}));

describe('AssetContractTab official wizard wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getContractByEntityId.mockReset();
  });

  it('opens ADD without passing an inherited parent contract', async () => {
    getContractByEntityId.mockResolvedValue({
      id: 'c1',
      name: 'parent_contract',
      inherited: true,
      fullyQualifiedName: 'dp.orders.contract',
    });
    const wrapper = mount(AssetContractTab, {
      props: { entityId: 't1', entityType: 'table', entityName: 'orders', entityFqn: 'svc.db.schema.orders' },
      global: { plugins: [createPinia(), Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-contract-detail"]').exists()).toBe(true);
    await wrapper.get('[data-testid="contract-edit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-contract-wizard"]').exists()).toBe(true);
    const wizard = wrapper.getComponent({ name: 'AddDataContract' });
    expect(wizard.props('contract')).toBeUndefined();
    wrapper.unmount();
  });
});
