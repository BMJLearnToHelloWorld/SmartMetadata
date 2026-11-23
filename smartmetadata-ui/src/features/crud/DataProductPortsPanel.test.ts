/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataProductPortsPanel from './DataProductPortsPanel.vue';

vi.mock('@/api/dataProducts', () => ({
  addInputPortsToDataProduct: vi.fn(),
  addOutputPortsToDataProduct: vi.fn(),
  getDataProductInputPorts: vi.fn(),
  getDataProductOutputPorts: vi.fn(),
  removeInputPortsFromDataProduct: vi.fn(),
  removeOutputPortsFromDataProduct: vi.fn(),
}));

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: vi.fn(async () => true),
}));

import {
  addInputPortsToDataProduct,
  getDataProductInputPorts,
  getDataProductOutputPorts,
  removeInputPortsFromDataProduct,
} from '@/api/dataProducts';

const getInputMock = getDataProductInputPorts as unknown as ReturnType<typeof vi.fn>;
const getOutputMock = getDataProductOutputPorts as unknown as ReturnType<typeof vi.fn>;
const addInputMock = addInputPortsToDataProduct as unknown as ReturnType<typeof vi.fn>;
const removeInputMock = removeInputPortsFromDataProduct as unknown as ReturnType<typeof vi.fn>;

const INPUT_PORT = { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' };

function mountPanel(canEdit = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  return mount(DataProductPortsPanel, {
    props: { fqn: 'marketing.churn', productName: 'Churn', canEdit },
    global: {
      plugins: [Antd, router, createTestI18n()],
      stubs: {
        // The picker itself is AddAssetsModal's own test surface; the
        // panel test drives its confirm/cancel contract through a stub.
        AddAssetsModal: {
          template:
            '<button data-testid="stub-add-confirm" @click="$emit(\'confirm\', [{ id: \'t2\', name: \'events\', type: \'table\', fullyQualifiedName: \'svc.db.events\' }])">stub-confirm</button>',
        },
      },
    },
  });
}

describe('DataProductPortsPanel (Q-TAB-4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getInputMock.mockReset();
    getOutputMock.mockReset();
    addInputMock.mockReset();
    removeInputMock.mockReset();
    getInputMock.mockResolvedValue({ data: [INPUT_PORT], after: undefined, before: undefined, total: 1 });
    getOutputMock.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    addInputMock.mockResolvedValue({ id: 'p1', name: 'churn' });
    removeInputMock.mockResolvedValue({ id: 'p1', name: 'churn' });
  });

  it('lists input ports with counts and the empty output state', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(getInputMock).toHaveBeenCalledWith('marketing.churn');
    expect(getOutputMock).toHaveBeenCalledWith('marketing.churn');
    expect(wrapper.find('[data-testid="input-ports-heading"]').text()).toContain('Input ports (1)');
    expect(wrapper.find('[data-testid="output-ports-heading"]').text()).toContain('Output ports (0)');
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.text()).toContain('No output ports returned for this data product.');
    wrapper.unmount();
  });

  it('adds an input port through the picker and reloads', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="add-input-ports"]').trigger('click');
    await wrapper.find('[data-testid="stub-add-confirm"]').trigger('click');
    await flushPromises();
    expect(addInputMock).toHaveBeenCalledWith('marketing.churn', [
      { id: 't2', name: 'events', type: 'table', fullyQualifiedName: 'svc.db.events' },
    ]);
    expect(getInputMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('removes an input port after confirmation and reloads', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="remove-input-port-t1"]').trigger('click');
    await flushPromises();
    expect(removeInputMock).toHaveBeenCalledWith('marketing.churn', [INPUT_PORT]);
    expect(getInputMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('disables add and remove when the viewer cannot edit', async () => {
    const wrapper = mountPanel(false);
    await flushPromises();
    expect(wrapper.find('[data-testid="add-input-ports"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="add-output-ports"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="remove-input-port-t1"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
