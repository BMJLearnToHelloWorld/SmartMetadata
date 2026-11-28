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

// Local @codemirror/language collect noise is not a product gap; stub the
// official YAML SchemaEditor surface the VIEW card mounts.
vi.mock('@/utils/codeMirrorUtils', () => ({
  CSMode: { YAML: 'yaml', JAVASCRIPT: 'javascript' },
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: {
    name: 'SmCodeEditor',
    props: ['value', 'variant', 'mode', 'readOnly', 'className', 'editorClass'],
    template: '<pre data-testid="contract-yaml-editor-stub">{{ value }}</pre>',
  },
}));


const getContractByEntityId = vi.fn();

vi.mock('@/api/dataContracts', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataContracts')>('@/api/dataContracts');
  return {
    ...actual,
    getContractByEntityId: (...args: unknown[]) => getContractByEntityId(...args),
    createContract: vi.fn(),
    updateContract: vi.fn(),
    deleteContractById: vi.fn(),
    getContractResultByResultId: vi.fn(),
    exportContractToODCSYaml: vi.fn(),
    validateContractById: vi.fn(),
    validateContractByEntityId: vi.fn(),
    getAllContractResults: vi.fn(),
  };
});

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getResourcePermission: vi.fn(async () => ({ Create: true })),
    getEntityPermissionById: vi.fn(async () => ({ EditAll: true, Delete: true })),
    getEntityPermissionByFqn: vi.fn(async () => ({ EditAll: true, Delete: true })),
  }),
}));


async function clickTestId(wrapper: ReturnType<typeof mount>, testId: string): Promise<void> {
  const inWrapper = wrapper.find(`[data-testid="${testId}"]`);
  if (inWrapper.exists()) {
    await inWrapper.trigger('click');
    return;
  }
  const node = document.body.querySelector(`[data-testid="${testId}"]`);
  if (!node) {
    throw new Error(`Unable to get [data-testid="${testId}"] in wrapper or document.body`);
  }
  (node as HTMLElement).click();
}

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
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-contract-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="contract-title"]').text()).toBe('parent_contract');
    await clickTestId(wrapper, 'manage-contract-actions');
    await flushPromises();
    await clickTestId(wrapper, 'contract-edit-button');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-contract-wizard"]').exists()).toBe(true);
    const wizard = wrapper.getComponent({ name: 'AddDataContract' });
    expect(wizard.props('contract')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows the official empty-state add menu when there is no contract and Create is granted', async () => {
    getContractByEntityId.mockResolvedValue(null);
    const wrapper = mount(AssetContractTab, {
      props: { entityId: 't1', entityType: 'table', entityName: 'orders' },
      global: { plugins: [createPinia(), Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    await clickTestId(wrapper, 'add-contract-button');
    await flushPromises();
    await clickTestId(wrapper, 'create-contract-button');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-contract-wizard"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
