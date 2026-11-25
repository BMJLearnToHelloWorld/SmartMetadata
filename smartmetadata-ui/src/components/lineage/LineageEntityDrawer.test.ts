/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LineageEntityDrawer from './LineageEntityDrawer.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const SUMMARY = {
  description: 'Orders table',
  service: { name: 'mysql', displayName: 'MySQL' },
  domains: [{ name: 'sales', displayName: 'Sales' }],
  tags: [{ tagFQN: 'PII.Sensitive' }],
  owners: [{ name: 'alice', displayName: 'Alice' }],
  dataProducts: [{ name: 'dp', displayName: 'Data Product' }],
};

function mountDrawer(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/asset/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  return mount(LineageEntityDrawer, {
    attachTo: document.body,
    props: {
      open: true,
      entityType: 'table',
      fqn: 'svc.db.sch.orders',
      displayName: 'orders',
      ...props,
    },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

// The antd Drawer teleports to document.body, so every assertion reads
// the body, not the wrapper root.
function bodyText(): string {
  return document.body.textContent ?? '';
}

describe('LineageEntityDrawer (pin LineageOverlays)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(SUMMARY);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the 576px drawer with the entity name as a detail link', async () => {
    const wrapper = mountDrawer();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="lineage-entity-panel"]')).not.toBeNull();
    const contentWrapper = document.body.querySelector(
      '.ant-drawer-content-wrapper',
    ) as HTMLElement | null;
    expect(contentWrapper?.style.width).toBe('576px');
    const link = document.body.querySelector(
      '[data-testid="entity-link"]',
    ) as HTMLElement | null;
    expect(link?.textContent).toBe('orders');
    expect(link?.getAttribute('href')).toContain('/asset/table/svc.db.sch.orders');
    wrapper.unmount();
  });

  it('fetches the entity summary from the detail endpoint and renders it', async () => {
    const wrapper = mountDrawer();
    await flushPromises();
    expect(apiRequest).toHaveBeenCalledWith(
      '/v1/tables/name/svc.db.sch.orders',
      expect.objectContaining({ query: expect.objectContaining({ fields: expect.any(String) }) }),
    );
    expect(bodyText()).toContain('Orders table');
    expect(bodyText()).toContain('MySQL');
    expect(bodyText()).toContain('Sales');
    expect(bodyText()).toContain('PII.Sensitive');
    expect(bodyText()).toContain('Alice');
    wrapper.unmount();
  });

  it('still renders the name and link when the summary fetch fails', async () => {
    apiRequest.mockRejectedValueOnce(new Error('boom'));
    const wrapper = mountDrawer();
    await flushPromises();
    const link = document.body.querySelector(
      '[data-testid="entity-link"]',
    ) as HTMLElement | null;
    expect(link?.textContent).toBe('orders');
    expect(bodyText()).toContain('svc.db.sch.orders');
    wrapper.unmount();
  });

  it('renders nothing open when closed', () => {
    const wrapper = mountDrawer({ open: false });
    expect(document.body.querySelector('[data-testid="lineage-entity-panel"]')).toBeNull();
    wrapper.unmount();
  });
});
