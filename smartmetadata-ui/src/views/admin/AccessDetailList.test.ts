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
import Antd, { Table, Tooltip } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AccessDetailList from './AccessDetailList.vue';

const ITEMS = [
  {
    id: 'p1',
    name: 'DataConsumerPolicy',
    fullyQualifiedName: 'DataConsumerPolicy',
    displayName: 'Data Consumer',
    type: 'policy',
    description: 'Consumer policy',
  },
  { id: 'p2', name: 'EmptyPolicy', fullyQualifiedName: 'EmptyPolicy', type: 'policy' },
];

async function mountList(props: Partial<{ hasAccess: boolean; nameTestId: string }>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/target/:id', name: 'target', component: { template: '<div>target</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const onRemove = vi.fn();
  const wrapper = mount(AccessDetailList, {
    props: {
      items: ITEMS,
      hasAccess: true,
      linkFor: (record) => ({ name: 'target', params: { id: record.id } }),
      onRemove,
      ...props,
    },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  return { wrapper, router, onRemove };
}

describe('AccessDetailList', () => {
  it('renders name, description and actions columns without pagination', async () => {
    const { wrapper } = await mountList({ nameTestId: 'entity-name' });
    const table = wrapper.getComponent(Table);
    const columns = table.props('columns') as Array<{ key: string; width?: number }>;
    expect(columns.map((column) => column.key)).toEqual(['name', 'description', 'actions']);
    expect(columns[0]!.width).toBe(200);
    expect(columns[2]!.width).toBe(80);
    expect(table.props('pagination')).toBe(false);
    expect(table.props('rowKey')).toBe('id');
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.text()).toContain('Consumer policy');
  });

  it('carries the name testid only when the caller passes one', async () => {
    const withId = await mountList({ nameTestId: 'entity-name' });
    expect(withId.wrapper.findAll('[data-testid="entity-name"]')).toHaveLength(2);
    const withoutId = await mountList({});
    expect(withoutId.wrapper.findAll('[data-testid="entity-name"]')).toHaveLength(0);
  });

  it('navigates through the caller link constructor', async () => {
    const { wrapper, router } = await mountList({ nameTestId: 'entity-name' });
    await wrapper.findAll('[data-testid="entity-name"]')[0]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('target');
    expect(router.currentRoute.value.params.id).toBe('p1');
  });

  it('removes through the record callback and gates the button on hasAccess', async () => {
    const { wrapper, onRemove } = await mountList({ hasAccess: true });
    const tooltips = wrapper.findAllComponents(Tooltip);
    expect(tooltips[0]!.props('title')).toBe('Remove');
    await wrapper.get('[data-testid="remove-action-Data Consumer"]').trigger('click');
    expect(onRemove).toHaveBeenCalledWith(ITEMS[0]);
    const denied = await mountList({ hasAccess: false });
    const deniedTooltips = denied.wrapper.findAllComponents(Tooltip);
    expect(deniedTooltips[0]!.props('title')).toBe(
      'You do not have the necessary permissions to perform this action.',
    );
    const button = denied.wrapper.find('[data-testid="remove-action-Data Consumer"]');
    expect(button.attributes('disabled')).toBeDefined();
  });
});
