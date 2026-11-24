/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { EntityRef } from '@/types/api';
import PortsLineageView from './PortsLineageView.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());

const PRODUCT = {
  id: 'dp-1',
  name: 'churn',
  displayName: 'Churn',
  fullyQualifiedName: 'marketing.churn',
  domains: [],
  owners: [],
  reviewers: [],
  experts: [],
  tags: [],
};

const INPUT: EntityRef = {
  id: 't1',
  name: 'orders',
  type: 'table',
  fullyQualifiedName: 'svc.db.orders',
};
const OUTPUT: EntityRef = {
  id: 't2',
  name: 'events',
  type: 'table',
  fullyQualifiedName: 'svc.db.events',
};

function mountView(props: Record<string, unknown> = {}) {
  return mount(PortsLineageView, {
    props: {
      dataProduct: PRODUCT,
      inputPorts: [INPUT],
      outputPorts: [OUTPUT],
      assetCount: 2,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('PortsLineageView', () => {
  it('renders the center node, port nodes and edges from the ports view', () => {
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="ports-lineage-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="data-product-center-node"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="port-node-svc.db.orders"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="port-node-svc.db.events"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vue-flow-edge-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-fullscreen-btn"]').exists()).toBe(true);
  });

  it('defaults to the pin 350px height and honours the accordion 250px height', () => {
    expect(mountView().find('[data-testid="ports-lineage-view"]').attributes('style')).toContain(
      '350px',
    );
    expect(
      mountView({ height: 250 }).find('[data-testid="ports-lineage-view"]').attributes('style'),
    ).toContain('250px');
  });

  it('shows the no-assets message when the product has no assets at all', () => {
    const wrapper = mountView({ inputPorts: [], outputPorts: [], assetCount: 0 });
    expect(wrapper.find('[data-testid="ports-lineage-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="no-ports-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-ports-placeholder"]').text()).toContain(
      'assign assets to this Data Product',
    );
  });

  it('shows the no-ports message when the product has assets but no ports', () => {
    const wrapper = mountView({ inputPorts: [], outputPorts: [], assetCount: 3 });
    expect(wrapper.find('[data-testid="no-ports-placeholder"]').text()).toContain(
      'No ports available to display lineage',
    );
  });

  it('applies the fullscreen surface and emits toggle-fullscreen from the button', async () => {
    const wrapper = mountView({ isFullScreen: true });
    expect(wrapper.find('[data-testid="ports-lineage-view"]').classes()).toContain(
      'ports-lineage-view--fullscreen',
    );
    expect(wrapper.find('[data-testid="toggle-fullscreen-btn"]').text()).toContain(
      'Exit full screen',
    );
    await wrapper.find('[data-testid="toggle-fullscreen-btn"]').trigger('click');
    expect(wrapper.emitted('toggle-fullscreen')).toHaveLength(1);
  });

  it('emits port-click with the port when a port node is clicked', async () => {
    const wrapper = mountView();
    await wrapper.find('[data-testid="port-node-svc.db.orders"]').trigger('click');
    expect(wrapper.emitted('port-click')).toHaveLength(1);
    expect(wrapper.emitted('port-click')?.[0]).toEqual([INPUT]);
  });
});
