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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import EntityDetailShell from './EntityDetailShell.vue';

const getLearningResourcesByContext = vi.fn();

vi.mock('@/api/learningResources', () => ({
  getLearningResourcesByContext: (...args: unknown[]) => getLearningResourcesByContext(...args),
}));

async function mountShell(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
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
  beforeEach(() => {
    getLearningResourcesByContext.mockReset().mockResolvedValue({ data: [{}], total: 1 });
  });
  it('renders title, technical name, and breadcrumb back to the list', async () => {
    const { wrapper, router } = await mountShell({
      breadcrumbs: [
        { label: 'Users', to: { name: 'admin-users' } },
        { label: 'Alice Admin' },
      ],
      lead: 'GET /api/v1/users/{id}',
    });
    expect(wrapper.get('[data-testid="entity-detail-heading"]').text()).toBe('Alice Admin');
    expect(wrapper.get('[data-testid="entity-detail-sub"]').text()).toContain('alice');
    expect(wrapper.get('[data-testid="entity-detail-lead"]').text()).toContain('GET /api/v1/users/{id}');
    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-users');
  });

  it('renders Beta badge and learning icon like PageHeader (Fix1 header contract)', async () => {
    const { wrapper } = await mountShell({
      isBeta: true,
      learningPageId: 'learning-page',
    });
    expect(wrapper.get('[data-testid="entity-detail-beta"]').text()).toBe('Beta');
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(true);
    // PageHeader's contract renders the Beta badge inside the h5, so the
    // heading text contains the title plus the badge; the badge itself is
    // asserted exactly above, and the title exactly in the plain test.
    expect(wrapper.get('[data-testid="entity-detail-heading"]').text()).toContain('Alice Admin');
  });

  it('surfaces a failed breadcrumb navigation instead of failing silently', async () => {
    const { wrapper, router } = await mountShell({
      breadcrumbs: [{ label: 'Missing', to: { name: 'no-such-route' } }],
    });
    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-user');
    expect(document.body.textContent).toContain('Navigation failed; please try again');
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

  it('renders the error-action slot only when an error is present', async () => {
    // M-3: the slot is additive — present with an error, absent without
    // one, and absent entirely when the consumer provides no slot.
    const { wrapper } = await mountShell(
      { error: 'missing' },
      { 'error-action': '<button data-testid="retry-action">Retry</button>' },
    );
    expect(wrapper.find('[data-testid="entity-detail-error-action"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="retry-action"]').text()).toBe('Retry');
    wrapper.unmount();
    const cleared = await mountShell({}, { 'error-action': '<button data-testid="retry-action">Retry</button>' });
    expect(cleared.wrapper.find('[data-testid="entity-detail-error-action"]').exists()).toBe(false);
    expect(cleared.wrapper.find('[data-testid="retry-action"]').exists()).toBe(false);
    cleared.wrapper.unmount();
    const noSlot = await mountShell({ error: 'missing' });
    expect(noSlot.wrapper.find('[data-testid="entity-detail-error-action"]').exists()).toBe(false);
    noSlot.wrapper.unmount();
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

  it('renders no tab bar for an explicitly empty tab list without throwing', async () => {
    // F-1: a customized page saved with `tabs: []` yields no tabs, and
    // the shell's `v-if="tabs.length"` guard must keep the Tabs
    // component unmounted (no nav, no panes) while the header still
    // renders.
    const { wrapper } = await mountShell(
      { tabs: [], activeTab: '' },
      { overview: '<p>overview body</p>' },
    );
    expect(wrapper.find('[data-testid="entity-detail-tabs"]').exists()).toBe(false);
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('overview body');
    expect(wrapper.get('[data-testid="entity-detail-heading"]').text()).toBe('Alice Admin');
    wrapper.unmount();
  });

  it('clamps a stale activeTab to the first rendered tab instead of showing a blank pane (B-1)', async () => {
    // F-2 made tab removal real: a customization that drops the
    // view's initial tab leaves `activeTab` pointing at a pane that
    // no longer renders. The shell must fall back to the first
    // rendered tab (official `getRenderedActiveTab`), so exactly one
    // pane stays active — never a tab bar with no selected tab and
    // a blank content area.
    const { wrapper } = await mountShell(
      {
        tabs: [{ key: 'activity', label: 'Activity', testId: 'tab-activity' }],
        activeTab: 'overview',
      },
      { activity: '<p>activity body</p>' },
    );
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(true);
    const activeNav = wrapper.findAll('.ant-tabs-tab-active');
    expect(activeNav).toHaveLength(1);
    expect(activeNav[0].text()).toContain('Activity');
    const activePanes = wrapper.findAll('.ant-tabs-tabpane-active');
    expect(activePanes).toHaveLength(1);
    expect(activePanes[0].text()).toContain('activity body');
    wrapper.unmount();
  });

  it('keeps an in-list activeTab instead of forcing the first tab', async () => {
    const { wrapper } = await mountShell(
      {
        tabs: [
          { key: 'overview', label: 'Overview', testId: 'tab-overview' },
          { key: 'roles', label: 'Roles', testId: 'tab-roles' },
        ],
        activeTab: 'roles',
      },
      {
        overview: '<p>overview body</p>',
        roles: '<p>roles body</p>',
      },
    );
    const activeNav = wrapper.findAll('.ant-tabs-tab-active');
    expect(activeNav).toHaveLength(1);
    expect(activeNav[0].text()).toContain('Roles');
    const activePanes = wrapper.findAll('.ant-tabs-tabpane-active');
    expect(activePanes).toHaveLength(1);
    expect(activePanes[0].text()).toContain('roles body');
    wrapper.unmount();
  });

  it('falls back to the first tab when no activeTab is given', async () => {
    const { wrapper } = await mountShell(
      {
        tabs: [
          { key: 'overview', label: 'Overview', testId: 'tab-overview' },
          { key: 'roles', label: 'Roles', testId: 'tab-roles' },
        ],
        activeTab: '',
      },
      {
        overview: '<p>overview body</p>',
        roles: '<p>roles body</p>',
      },
    );
    const activeNav = wrapper.findAll('.ant-tabs-tab-active');
    expect(activeNav).toHaveLength(1);
    expect(activeNav[0].text()).toContain('Overview');
    expect(wrapper.findAll('.ant-tabs-tabpane-active')).toHaveLength(1);
    wrapper.unmount();
  });
});
