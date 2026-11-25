/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { LineageGraphNode } from '@/lineage/graphModel';
import LineageSearchSelect from './LineageSearchSelect.vue';

function node(partial: Partial<LineageGraphNode> & { id: string }): LineageGraphNode {
  return {
    entityType: 'table',
    name: partial.id,
    displayName: partial.id,
    fullyQualifiedName: `svc.db.sch.${partial.id}`,
    isCenter: false,
    serviceName: 'svc',
    pathLabel: '',
    truncatedFqn: partial.id,
    columns: [],
    ...partial,
  };
}

const NODES = [
  node({ id: 'orders', columns: [{ fqn: 'svc.db.sch.orders.id', name: 'id' }] }),
  node({ id: 'customers' }),
];

function mountSearch(nodes: LineageGraphNode[] = NODES) {
  return mount(LineageSearchSelect, {
    props: { nodes },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

async function openDropdown(wrapper: ReturnType<typeof mountSearch>) {
  // antd Select opens on mousedown, not click.
  const selector = wrapper.find('[data-testid="lineage-search-select"] .ant-select-selector');
  selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

function pickOption(text: string): void {
  const option = optionByText(text);
  expect(option).toBeDefined();
  // antd selects the option on mousedown.
  option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function optionByText(text: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((el) =>
    el.textContent?.includes(text),
  );
}

describe('LineageSearchSelect (pin LineageSearchSelect)', () => {
  it('offers nodes and their columns, columns labelled node › column', async () => {
    const wrapper = mountSearch();
    await openDropdown(wrapper);
    const options = [...document.querySelectorAll('.ant-select-item-option')].map((el) =>
      el.textContent?.trim(),
    );
    expect(options).toEqual(['orders', 'orders › id', 'customers']);
    wrapper.unmount();
  });

  it('emits select-node for a node option', async () => {
    const wrapper = mountSearch();
    await openDropdown(wrapper);
    pickOption('customers');
    await flushPromises();
    expect(wrapper.emitted('select-node')).toEqual([[NODES[1]]]);
    expect(wrapper.emitted('select-column')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits select-column with the column FQN for a column option', async () => {
    const wrapper = mountSearch();
    await openDropdown(wrapper);
    pickOption('orders › id');
    await flushPromises();
    expect(wrapper.emitted('select-column')).toEqual([['svc.db.sch.orders.id']]);
    expect(wrapper.emitted('select-node')).toBeUndefined();
    wrapper.unmount();
  });
});
