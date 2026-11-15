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
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { TableJoins } from '@/types/api';
import FrequentlyJoinedTables from './FrequentlyJoinedTables.vue';

function joinsWith(count: number): TableJoins {
  return {
    directTableJoins: Array.from({ length: count }, (_, index) => ({
      fullyQualifiedName: `svc.db.schema.table${index}`,
      joinCount: count - index,
    })),
  };
}

async function mountWidget(joins?: TableJoins) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/table/svc.db.schema.orders');
  await router.isReady();
  const wrapper = mount(FrequentlyJoinedTables, {
    props: { joins },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('FrequentlyJoinedTables', () => {
  it('shows the top 5 joined tables with counts, sorted by join count', async () => {
    const wrapper = await mountWidget(joinsWith(7));
    expect(wrapper.text()).toContain('Frequently Joined Tables');
    const rows = wrapper.findAll('[data-testid="related-tables-data"]');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.text()).toContain('db.table0');
    expect(rows[0]?.text()).toContain('7');
    expect(rows[0]?.find('a').attributes('href')).toContain('svc.db.schema.table0');
    expect(wrapper.find('[data-testid="read-button"]').text()).toContain('+ 2 More');
    wrapper.unmount();
  });

  it('expands to all tables and collapses back', async () => {
    const wrapper = await mountWidget(joinsWith(7));
    const toggle = wrapper.find('[data-testid="read-button"]');
    await toggle.trigger('click');
    expect(wrapper.findAll('[data-testid="related-tables-data"]')).toHaveLength(7);
    expect(wrapper.find('[data-testid="read-button"]').text()).toContain('Less');
    await wrapper.find('[data-testid="read-button"]').trigger('click');
    expect(wrapper.findAll('[data-testid="related-tables-data"]')).toHaveLength(5);
    wrapper.unmount();
  });

  it('renders nothing when there are no joins', async () => {
    const wrapper = await mountWidget({ columnJoins: [], directTableJoins: [] });
    expect(wrapper.text()).toBe('');
    expect(wrapper.find('[data-testid="related-tables-data"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders nothing when joins are absent', async () => {
    const wrapper = await mountWidget(undefined);
    expect(wrapper.find('.frequently-joined-tables').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });
});
