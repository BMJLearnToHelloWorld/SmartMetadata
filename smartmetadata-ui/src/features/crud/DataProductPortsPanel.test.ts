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
  getDataProductPortsView: vi.fn(),
  removeInputPortsFromDataProduct: vi.fn(),
  removeOutputPortsFromDataProduct: vi.fn(),
}));

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: vi.fn(async () => true),
}));

import {
  addInputPortsToDataProduct,
  getDataProductInputPorts,
  getDataProductOutputPorts,
  getDataProductPortsView,
  removeInputPortsFromDataProduct,
} from '@/api/dataProducts';

const getInputMock = getDataProductInputPorts as unknown as ReturnType<typeof vi.fn>;
const getOutputMock = getDataProductOutputPorts as unknown as ReturnType<typeof vi.fn>;
const getPortsViewMock = getDataProductPortsView as unknown as ReturnType<typeof vi.fn>;
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
    getPortsViewMock.mockReset();
    addInputMock.mockReset();
    removeInputMock.mockReset();
    getInputMock.mockResolvedValue({ data: [INPUT_PORT], after: undefined, before: undefined, total: 1 });
    getOutputMock.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    getPortsViewMock.mockResolvedValue({
      inputPorts: { data: [INPUT_PORT], after: undefined, before: undefined, total: 1 },
      outputPorts: { data: [], after: undefined, before: undefined, total: 0 },
    });
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

  it('shows the Ports Lineage accordion collapsed with the pin summary and no ports-view fetch yet', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const header = wrapper.find('[data-testid="toggle-lineage-collapse"]');
    expect(header.exists()).toBe(true);
    expect(header.text()).toContain('Ports Lineage');
    expect(header.text()).toContain('(1 input, 0 output)');
    expect(getPortsViewMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="ports-lineage-view"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads the ports view lazily on first expand and renders the graph once', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="toggle-lineage-collapse"]').trigger('click');
    await flushPromises();
    expect(getPortsViewMock).toHaveBeenCalledTimes(1);
    expect(getPortsViewMock).toHaveBeenCalledWith('marketing.churn');
    expect(wrapper.find('[data-testid="ports-lineage-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="data-product-center-node"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="port-node-svc.db.orders"]').exists()).toBe(true);
    // Collapse and expand again: the loaded view is reused, not refetched.
    await wrapper.find('[data-testid="toggle-lineage-collapse"]').trigger('click');
    await wrapper.find('[data-testid="toggle-lineage-collapse"]').trigger('click');
    await flushPromises();
    expect(getPortsViewMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows the no-assets empty state when the product has no assets and no ports', async () => {
    getPortsViewMock.mockResolvedValue({
      inputPorts: { data: [], after: undefined, before: undefined, total: 0 },
      outputPorts: { data: [], after: undefined, before: undefined, total: 0 },
    });
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="toggle-lineage-collapse"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="no-ports-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-ports-placeholder"]').text()).toContain(
      'assign assets to this Data Product',
    );
    wrapper.unmount();
  });

  it('navigates to the asset detail page when a port node is clicked', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="toggle-lineage-collapse"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="port-node-svc.db.orders"]').trigger('click');
    await flushPromises();
    const router = (wrapper.vm as unknown as { $router: { currentRoute: { value: { name?: string; params: Record<string, string> } } } }).$router;
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toEqual({ entityType: 'table', fqn: 'svc.db.orders' });
    wrapper.unmount();
  });
});
