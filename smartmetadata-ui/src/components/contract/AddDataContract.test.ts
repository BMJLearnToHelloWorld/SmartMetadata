/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AddDataContract from './AddDataContract.vue';

const createContract = vi.fn();
const updateContract = vi.fn();

vi.mock('@/api/dataContracts', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataContracts')>('@/api/dataContracts');
  return {
    ...actual,
    createContract: (...args: unknown[]) => createContract(...args),
    updateContract: (...args: unknown[]) => updateContract(...args),
  };
});

describe('AddDataContract official wizard', () => {
  beforeEach(() => {
    createContract.mockReset().mockResolvedValue({ id: 'c1', name: 'Orders' });
    updateContract.mockReset().mockResolvedValue({ id: 'c1', name: 'Orders' });
  });

  it('renders official table tabs and keeps Save disabled until a user edit', async () => {
    const wrapper = mount(AddDataContract, {
      props: { entityId: 'table-1', entityType: 'table', entityName: 'orders' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="add-contract-card"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="save-contract-btn"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Contract Details');
    expect(wrapper.text()).toContain('Semantics');
    expect(wrapper.text()).toContain('Quality');
    expect(wrapper.text()).toContain('SLA');
    const semanticsTab = wrapper.findAll('.ant-tabs-tab').find((tab) => tab.text().includes('Semantics'));
    expect(semanticsTab).toBeTruthy();
    await semanticsTab!.trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="save-contract-btn"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('creates without injecting semantics:[] after visiting Semantics then editing the title', async () => {
    const wrapper = mount(AddDataContract, {
      props: { entityId: 'table-1', entityType: 'table' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const semanticsTab = wrapper.findAll('.ant-tabs-tab').find((tab) => tab.text().includes('Semantics'));
    await semanticsTab?.trigger('click');
    await flushPromises();
    const name = wrapper.get('[data-testid="contract-name"]');
    await name.setValue('New Contract Title');
    await flushPromises();
    expect(wrapper.get('[data-testid="save-contract-btn"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="save-contract-btn"]').trigger('click');
    await flushPromises();
    expect(createContract).toHaveBeenCalledTimes(1);
    const payload = createContract.mock.calls[0][0] as { name?: string; semantics?: unknown; entityStatus?: string };
    expect(payload.name).toBe('New Contract Title');
    expect(payload.semantics).toBeUndefined();
    expect(payload.entityStatus).toBe('Draft');
    wrapper.unmount();
  });
});
