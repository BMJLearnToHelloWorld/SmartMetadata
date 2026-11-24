/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import AddLineagePopover from './AddLineagePopover.vue';

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

const HIT: SearchHit = {
  id: 'picked-id',
  name: 'customers',
  displayName: 'Customers',
  fullyQualifiedName: 'svc.db.schema.customers',
  entityType: 'table',
  owners: [],
  tags: [],
};

const CANVAS_NODES = [
  {
    id: 'center-id',
    entityType: 'table',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    isCenter: true,
    serviceName: 'svc',
    pathLabel: '',
    truncatedFqn: '',
    columns: [],
  },
  {
    id: 'raw-id',
    entityType: 'table',
    name: 'raw_orders',
    displayName: 'Raw orders',
    fullyQualifiedName: 'svc.db.schema.raw_orders',
    isCenter: false,
    serviceName: 'svc',
    pathLabel: '',
    truncatedFqn: '',
    columns: [],
  },
];

function mountPopover(props: Record<string, unknown>) {
  // SmDrawer reads the route (close-on-navigation), so mount with a router.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
  });
  return mount(AddLineagePopover, {
    props: {
      open: true,
      nodeName: 'Orders',
      nodeId: 'center-id',
      direction: 'upstream',
      canvasNodes: CANVAS_NODES,
      ...props,
    },
    global: { plugins: [router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

/** The Drawer teleports to document.body; earlier tests' portals may linger, so read the last match. */
function bodyEl(testId: string): HTMLElement {
  const all = [...document.body.querySelectorAll(`[data-testid="${testId}"]`)];
  const el = all.at(-1);
  if (!el) {
    throw new Error(`missing [data-testid="${testId}"]`);
  }
  return el as HTMLElement;
}

describe('AddLineagePopover', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    searchAssets.mockResolvedValue({ total: 1, hits: [HIT], facets: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/v1/tables/name/')) {
          return new Response(
            JSON.stringify({
              id: 'picked-id',
              displayName: 'Customers',
              columns: [
                { name: 'id', fullyQualifiedName: 'svc.db.schema.customers.id' },
                { name: 'name', fullyQualifiedName: 'svc.db.schema.customers.name' },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('entity mode: search pick resolves the id, preview shows new → current, submit emits the entity', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover({});
    const input = bodyEl('lineage-entity-search-input') as HTMLInputElement;
    input.value = 'customers';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    bodyEl('lineage-entity-option-svc.db.schema.customers').click();
    await flushPromises();
    expect(document.body.innerHTML).toContain('Add upstream lineage');
    expect(bodyEl('add-lineage-preview').textContent).toContain('Customers');
    const submit = bodyEl('add-lineage-popover-save');
    expect(submit.hasAttribute('disabled')).toBe(false);
    submit.click();
    expect(wrapper.emitted('submit')).toEqual([
      [{ entity: { id: 'picked-id', entityType: 'table', fqn: 'svc.db.schema.customers', displayName: 'Customers' } }],
    ]);
    wrapper.unmount();
  });

  it('submit stays disabled until an asset is picked', async () => {
    const wrapper = mountPopover({});
    await flushPromises();
    expect(bodyEl('add-lineage-popover-save').hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('renders as a slideout with the pin header description, cancel emits close', async () => {
    const wrapper = mountPopover({});
    await flushPromises();
    expect(document.body.innerHTML).toContain(
      'Pick the asset that feeds data into Orders. The connection is saved when you select Add.',
    );
    bodyEl('add-lineage-popover-cancel').click();
    expect(wrapper.emitted('close')).toBeTruthy();
    wrapper.unmount();
  });

  it('column mode: canvas asset pick loads its columns, submit emits the column pair target', async () => {
    const wrapper = mountPopover({ columnFqn: 'svc.db.schema.orders.id' });
    await flushPromises();
    const selects = wrapper.findAllComponents(Select);
    expect(selects).toHaveLength(1);
    expect(selects[0].props('options')).toEqual([
      expect.objectContaining({ value: 'raw-id', label: 'Raw orders' }),
    ]);
    await selects[0].vm.$emit('change', 'raw-id');
    await flushPromises();
    const afterPick = wrapper.findAllComponents(Select);
    expect(afterPick).toHaveLength(2);
    expect(afterPick[1].props('options')).toEqual([
      { value: 'svc.db.schema.customers.id', label: 'id' },
      { value: 'svc.db.schema.customers.name', label: 'name' },
    ]);
    await afterPick[1].vm.$emit('change', 'svc.db.schema.customers.id');
    await flushPromises();
    bodyEl('add-lineage-popover-save').click();
    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          entity: { id: 'raw-id', entityType: 'table', fqn: 'svc.db.schema.raw_orders', displayName: 'Raw orders' },
          columnFqn: 'svc.db.schema.customers.id',
        },
      ],
    ]);
    wrapper.unmount();
  });
});
