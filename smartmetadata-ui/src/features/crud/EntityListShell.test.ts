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
import { createTestI18n } from '@/test/i18n';
import EntityListShell from './EntityListShell.vue';

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Email', dataIndex: 'email', key: 'email' },
];

async function mountShell(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const wrapper = mount(EntityListShell, {
    props: {
      title: 'Users',
      lead: 'GET /api/v1/users',
      columns,
      dataSource: [],
      tableTestId: 'admin-users-table',
      ...props,
    },
    slots,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('EntityListShell', () => {
  it('renders title, lead, empty state, and refresh', async () => {
    const wrapper = await mountShell();
    expect(wrapper.get('[data-testid="entity-list-title"]').text()).toBe('Users');
    expect(wrapper.get('[data-testid="entity-list-lead"]').text()).toContain('GET /api/v1/users');
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="entity-list-empty"]').text()).toContain('No data');
    expect(wrapper.get('[data-testid="entity-list-empty"]').text()).toContain('just give it a spin');
    expect(wrapper.find('[data-testid="admin-users-table"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="entity-list-refresh"]').text()).toBe('Refresh');
    expect(wrapper.get('[data-testid="entity-list-refresh"]').attributes('aria-label')).toBe(
      'Reload this list',
    );
  });

  it('shows rows, error, and search when provided', async () => {
    const wrapper = await mountShell({
      showSearch: true,
      searchValue: 'alice',
      searchPlaceholder: 'Search users (user index)',
      error: 'boom',
      dataSource: [{ id: 'u1', name: 'alice', email: 'alice@example.com' }],
      total: 12,
    });
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-users-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.get('[data-testid="entity-list-error"]').text()).toContain('boom');
    expect(wrapper.get('[data-testid="entity-list-count"]').text()).toBe('1 shown of 12');
    const search = wrapper.get('[data-testid="entity-list-search"]');
    expect((search.element as HTMLInputElement).value || search.html()).toContain('alice');
  });

  it('emits refresh, next, and prev from the footer chrome', async () => {
    const wrapper = await mountShell({
      showSearch: true,
      searchValue: 'q',
      hasNext: true,
      hasPrev: true,
      dataSource: [{ id: 'u1', name: 'alice' }],
    });
    expect(wrapper.find('[data-testid="entity-list-search"]').exists()).toBe(true);
    await wrapper.get('[data-testid="entity-list-refresh"]').trigger('click');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await wrapper.get('[data-testid="entity-list-prev"]').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.emitted('next')).toHaveLength(1);
    expect(wrapper.emitted('prev')).toHaveLength(1);
  });

  it('hides next/prev until a cursor or offset page exists', async () => {
    const wrapper = await mountShell({ dataSource: [{ id: '1', name: 'a' }] });
    expect(wrapper.find('[data-testid="entity-list-next"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-list-prev"]').exists()).toBe(false);
  });

  it('renders actions and filters slots', async () => {
    const wrapper = await mountShell(
      {},
      {
        actions: '<button data-testid="create-user">Create user</button>',
        filters: '<label>Admins</label>',
      },
    );
    expect(wrapper.get('[data-testid="create-user"]').text()).toBe('Create user');
    expect(wrapper.text()).toContain('Admins');
  });

  it('adds an overflow actions menu that emits view', async () => {
    const wrapper = await mountShell({
      showRowActions: true,
      dataSource: [{ id: 'u1', name: 'alice' }],
    });
    const overflow = wrapper.get('[data-testid="row-overflow-u1"]');
    await overflow.trigger('click');
    await flushPromises();
    const view = document.querySelector('[data-testid="row-overflow-view"]');
    expect(view?.textContent).toContain('View');
    expect(document.querySelector('[data-testid="row-overflow-edit"]')).toBeNull();
    expect(document.querySelector('[data-testid="row-overflow-delete"]')).toBeNull();
    (view as HTMLElement | null)?.click();
    await flushPromises();
    expect(wrapper.emitted('view')?.[0]?.[0]).toEqual({ id: 'u1', name: 'alice' });
  });

  it('emits edit and delete from the overflow menu without also emitting view', async () => {
    const wrapper = await mountShell({
      showRowActions: true,
      showEditAction: true,
      showDeleteAction: true,
      dataSource: [{ id: 'u1', name: 'alice' }],
    });
    await wrapper.get('[data-testid="row-overflow-u1"]').trigger('click');
    await flushPromises();
    const edit = [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-edit"]')].at(-1);
    const del = [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-delete"]')].at(-1);
    expect(edit?.textContent).toContain('Edit');
    expect(del?.textContent).toContain('Delete');
    edit?.click();
    await flushPromises();
    expect(wrapper.emitted('edit')?.[0]?.[0]).toEqual({ id: 'u1', name: 'alice' });
    expect(wrapper.emitted('view')).toBeUndefined();
    await wrapper.get('[data-testid="row-overflow-u1"]').trigger('click');
    await flushPromises();
    [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-delete"]')].at(-1)?.click();
    await flushPromises();
    expect(wrapper.emitted('delete')?.[0]?.[0]).toEqual({ id: 'u1', name: 'alice' });
    expect(wrapper.emitted('view')).toBeUndefined();
  });
});
