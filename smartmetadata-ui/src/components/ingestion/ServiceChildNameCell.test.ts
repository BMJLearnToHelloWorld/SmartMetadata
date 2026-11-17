/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import ServiceChildNameCell from './ServiceChildNameCell.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/entity/:fqn', name: 'entity', component: { template: '<div />' } }],
});

function mountCell(props: Record<string, unknown>) {
  return mount(ServiceChildNameCell, {
    props: { name: 'orders', ...props },
    global: { plugins: [router] },
  });
}

describe('ServiceChildNameCell (official DisplayName)', () => {
  it('renders the name alone when there is no displayName', () => {
    const wrapper = mountCell({ to: { name: 'entity', params: { fqn: 'svc.orders' } } });
    expect(wrapper.find('[data-testid="column-display-name"]').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(true);
    expect(wrapper.text()).toBe('orders');
    wrapper.unmount();
  });

  it('renders name and displayName on two linked lines', () => {
    const wrapper = mountCell({
      displayName: 'Orders Table',
      to: { name: 'entity', params: { fqn: 'svc.orders' } },
      testId: 'service-child-c1',
    });
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].text()).toBe('orders');
    expect(links[1].text()).toBe('Orders Table');
    expect(links[1].attributes('data-testid')).toBe('column-display-name');
    expect(links[0].attributes('data-testid')).toBe('service-child-c1');
    wrapper.unmount();
  });

  it('renders plain spans without a detail link', () => {
    const wrapper = mountCell({ displayName: 'Orders Table' });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.text()).toContain('Orders Table');
    wrapper.unmount();
  });
});
