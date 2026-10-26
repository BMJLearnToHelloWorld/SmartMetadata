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
import EntityDetailShell from './EntityDetailShell.vue';

async function mountShell(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>list</div>' } },
      { path: '/admin/users/:id', name: 'admin-user', component: { template: '<div>detail</div>' } },
    ],
  });
  await router.push('/admin/users/u1');
  await router.isReady();
  const wrapper = mount(EntityDetailShell, {
    props: {
      title: 'Alice Admin',
      name: 'alice',
      fqn: 'alice',
      ...props,
    },
    slots,
    global: { plugins: [Antd, router, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('EntityDetailShell', () => {
  it('renders title, technical name, and breadcrumb back to the list', async () => {
    const { wrapper, router } = await mountShell({
      breadcrumbs: [
        { label: 'Users', to: { name: 'admin-users' } },
        { label: 'Alice Admin' },
      ],
      lead: 'GET /api/v1/users/{id}',
    });
    expect(wrapper.get('[data-testid="entity-detail-title"]').text()).toBe('Alice Admin');
    expect(wrapper.get('[data-testid="entity-detail-subtitle"]').text()).toContain('alice');
    expect(wrapper.get('[data-testid="entity-detail-lead"]').text()).toContain('GET /api/v1/users/{id}');
    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-users');
  });

  it('shows a deleted badge and an error alert', async () => {
    const { wrapper } = await mountShell({
      deleted: true,
      error: 'missing',
    });
    expect(wrapper.get('[data-testid="entity-detail-deleted"]').text()).toBe('Deleted');
    expect(wrapper.get('[data-testid="entity-detail-error"]').text()).toContain('missing');
  });

  it('shows the empty state when the entity is missing and there is no error', async () => {
    const { wrapper } = await mountShell({
      empty: true,
      title: 'Users',
      name: '',
      fqn: '',
    });
    expect(wrapper.find('[data-testid="entity-detail-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="entity-detail-empty"]').text()).toContain('No data');
    expect(wrapper.get('[data-testid="entity-detail-empty"]').text()).toContain('just give it a spin');
  });

  it('renders named tab slots and actions', async () => {
    const { wrapper } = await mountShell(
      {
        tabs: [
          { key: 'overview', label: 'Overview', testId: 'tab-overview' },
          { key: 'roles', label: 'Roles', testId: 'tab-roles' },
        ],
        activeTab: 'overview',
      },
      {
        actions: '<button data-testid="edit-user">Edit</button>',
        overview: '<p>overview body</p>',
        roles: '<p>roles body</p>',
      },
    );
    expect(wrapper.get('[data-testid="edit-user"]').text()).toBe('Edit');
    expect(wrapper.find('[data-testid="entity-detail-tabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('overview body');
    expect(wrapper.text()).toContain('roles body');
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Roles');
  });
});
