/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { Handle } from '@vue-flow/core';
import { createTestI18n } from '@/test/i18n';
import PortsLineageDataProductNode from './PortsLineageDataProductNode.vue';
import PortsLineagePortNode from './PortsLineagePortNode.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());

const PRODUCT = {
  id: 'dp-1',
  name: 'churn',
  displayName: 'Churn',
  fullyQualifiedName: 'marketing.churn',
};

const GLOBAL = { plugins: [Antd, createTestI18n()] };

describe('PortsLineagePortNode', () => {
  it('renders the port name with the pin test id and a source handle for inputs', () => {
    // Mounted directly (the LineageNode.test.ts pattern): the node
    // components declare only a `data` prop, so only it is passed.
    const wrapper = mount(PortsLineagePortNode, {
      props: {
        data: {
          port: { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
          isInputPort: true,
          handleId: 'svc.db.orders',
          testId: 'port-node-svc.db.orders',
        },
      },
      global: GLOBAL,
    });
    expect(wrapper.find('[data-testid="port-node-svc.db.orders"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders');
    const handle = wrapper.findComponent(Handle);
    expect(handle.exists()).toBe(true);
    expect(handle.attributes('id')).toBe('svc.db.orders');
  });

  it('renders a target handle for output ports', () => {
    const wrapper = mount(PortsLineagePortNode, {
      props: {
        data: {
          port: { id: 't2', name: 'events', type: 'table', fullyQualifiedName: 'svc.db.events' },
          isInputPort: false,
          handleId: 'svc.db.events',
          testId: 'port-node-svc.db.events',
        },
      },
      global: GLOBAL,
    });
    expect(wrapper.find('[data-testid="port-node-svc.db.events"]').exists()).toBe(true);
    expect(wrapper.findComponent(Handle).attributes('id')).toBe('svc.db.events');
  });
});

describe('PortsLineageDataProductNode', () => {
  it('renders the badge, name and both center handles with pin ids', () => {
    const wrapper = mount(PortsLineageDataProductNode, {
      props: {
        data: { dataProduct: PRODUCT, testId: 'data-product-center-node' },
      },
      global: GLOBAL,
    });
    expect(wrapper.find('[data-testid="data-product-center-node"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Product');
    expect(wrapper.text()).toContain('Churn');
    const handles = wrapper.findAllComponents(Handle);
    expect(handles).toHaveLength(2);
    expect(handles.map((handle) => handle.attributes('id')).sort()).toEqual([
      'dp-1-left',
      'dp-1-right',
    ]);
  });
});
