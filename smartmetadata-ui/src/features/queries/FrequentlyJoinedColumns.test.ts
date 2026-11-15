/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { TableJoins } from '@/types/api';
import FrequentlyJoinedColumns from './FrequentlyJoinedColumns.vue';

const JOINS: TableJoins = {
  columnJoins: [
    {
      columnName: 'customer_id',
      joinedWith: [
        { fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 9 },
        { fullyQualifiedName: 'svc.db.schema.accounts.id', joinCount: 5 },
        { fullyQualifiedName: 'svc.db.schema.orders.id', joinCount: 3 },
        { fullyQualifiedName: 'svc.db.schema.returns.id', joinCount: 1 },
      ],
    },
  ],
};

async function mountAffordance(joins: TableJoins | undefined, columnName: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/table/svc.db.schema.orders');
  await router.isReady();
  const wrapper = mount(FrequentlyJoinedColumns, {
    props: { joins, columnName },
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FrequentlyJoinedColumns', () => {
  it('shows the first 3 joined columns with the pin label and a popover trigger for the rest', async () => {
    const wrapper = await mountAffordance(JOINS, 'customer_id');
    expect(wrapper.text()).toContain('Frequently Joined Columns:');
    // Requested [Database, Table, Schema, Column] renders in positional
    // order: db.schema.customers.id (pin getPartialNameFromTableFQN with
    // the FQN separator, as the pin inline links pass it).
    expect(wrapper.text()).toContain('db.schema.customers.id');
    expect(wrapper.text()).toContain('db.schema.accounts.id');
    expect(wrapper.text()).toContain('db.schema.orders.id');
    expect(wrapper.text()).not.toContain('returns');
    expect(wrapper.text()).toContain('...');
    const links = wrapper.findAll('.frequently-joined-columns__link a');
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/asset/table/svc.db.schema.customers',
      '/asset/table/svc.db.schema.accounts',
      '/asset/table/svc.db.schema.orders',
    ]);
    wrapper.unmount();
  });

  it('renders the remaining columns in the popover with slash labels and parent-table links', async () => {
    const wrapper = await mountAffordance(JOINS, 'customer_id');
    const trigger = wrapper.find('.frequently-joined-columns button');
    await trigger.trigger('mouseenter');
    // The popover opens after the tooltip hover delay; wait past it.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await flushPromises();
    const popover = document.body.querySelector('.ant-popover-inner-content');
    expect(popover?.textContent).toContain('db/returns/id');
    const link = popover?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/asset/table/svc.db.schema.returns');
    wrapper.unmount();
  });

  it('renders nothing for a column with no joins', async () => {
    const wrapper = await mountAffordance(JOINS, 'unrelated');
    expect(wrapper.find('[data-testid="frequently-joined-columns"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('renders nothing when joins are absent', async () => {
    const wrapper = await mountAffordance(undefined, 'customer_id');
    expect(wrapper.find('[data-testid="frequently-joined-columns"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });
});
