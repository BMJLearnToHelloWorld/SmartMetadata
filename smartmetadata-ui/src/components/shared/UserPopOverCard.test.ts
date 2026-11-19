/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import UserPopOverCard from './UserPopOverCard.vue';
import { clearPopoverDataCache } from './useEntityPopoverData';
import { clearUserProfileCache } from './userProfileCache';

const apiRequestMock = vi.hoisted(() => vi.fn());
const getResourcePermissionMock = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({
  apiRequest: apiRequestMock,
  ApiError: class FakeApiError extends Error {
    readonly status: number;
    constructor(status: number) {
      super(`Request failed (${status})`);
      this.status = status;
    }
  },
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission: getResourcePermissionMock }),
}));

// Local messages: the card references NEW keys the integration line has
// not written yet. Asserting rendered copy pins the exact key names.
function createCardI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        message: { 'no-data-available': 'No data available.' },
        label: {
          'no-description': 'No description',
          'team-plural': 'Teams',
          'role-plural': 'Roles',
          user: 'User',
          'user-plural': 'Users',
          parent: 'Parent',
        },
      },
    },
  });
}

function createCardRouter(): Router {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/users/:fqn', component: stub },
      { path: '/settings/members/teams', component: stub },
      { path: '/settings/members/teams/:fqn', component: stub },
      { path: '/custom', component: stub },
    ],
  });
}

const USER_PAYLOAD = {
  id: 'u1',
  name: 'alice',
  displayName: 'Alice A',
  isAdmin: true,
  teams: [
    { id: 't1', name: 'team-a', displayName: 'Team A' },
    { id: 't2', name: 'team-deleted', displayName: 'Deleted Team', deleted: true },
  ],
  roles: [{ id: 'r1', name: 'DataSteward', displayName: 'Data Steward' }],
};

const TEAM_PAYLOAD = {
  id: 't1',
  name: 'team-a',
  displayName: 'Team A',
  description: 'About **the team**',
  teamType: 'Group',
  userCount: 3,
  parents: [{ id: 'p1', name: 'org', displayName: 'Org' }],
};

async function mountCard(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {}
) {
  const router = createCardRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(UserPopOverCard, {
    props: { userName: 'alice', ...props },
    slots,
    global: { plugins: [router, Antd, createCardI18n()] },
    attachTo: document.body,
  });
  return { wrapper, router };
}

async function openCard(wrapper: VueWrapper) {
  await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
  await vi.waitFor(() => expect(wrapper.find('[data-testid="user-popover-card"]').exists()).toBe(true));
}

describe('UserPopOverCard', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    getResourcePermissionMock.mockReset();
    clearPopoverDataCache();
    clearUserProfileCache();
    getResourcePermissionMock.mockResolvedValue({ ViewBasic: true });
    apiRequestMock.mockImplementation((path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'alice' });
      }
      if (path.startsWith('/v1/users/name/')) {
        return Promise.resolve(USER_PAYLOAD);
      }
      if (path.startsWith('/v1/teams/name/')) {
        return Promise.resolve(TEAM_PAYLOAD);
      }
      return Promise.reject(new Error('404'));
    });
  });

  it('renders the default trigger link with the avatar and the user path', async () => {
    const { wrapper } = await mountCard();
    const link = wrapper.find('[data-testid="alice"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/users/alice');
    expect(link.find('[data-testid="profile-avatar"]').exists()).toBe(true);
    expect(link.find('.user-popover-card__truncate').exists()).toBe(false);
    expect(link.classes()).toContain('user-popover-card__assignee--spaced');
    wrapper.unmount();
  });

  it('shows the display name when showUserName is set', async () => {
    const { wrapper } = await mountCard({ showUserName: true, displayName: 'Alice A' });
    expect(wrapper.find('.user-popover-card__truncate').text()).toBe('Alice A');
    expect(wrapper.find('[data-testid="alice"]').classes()).not.toContain(
      'user-popover-card__assignee--spaced'
    );
    wrapper.unmount();
  });

  it('falls back to userName when showUserName is set without displayName', async () => {
    const { wrapper } = await mountCard({ showUserName: true });
    expect(wrapper.find('.user-popover-card__truncate').text()).toBe('alice');
    wrapper.unmount();
  });

  it('hides the avatar when showUserProfile is false', async () => {
    const { wrapper } = await mountCard({ showUserProfile: false });
    expect(wrapper.find('[data-testid="alice"]').find('[data-testid="profile-avatar"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('honors the caller-provided `to` location', async () => {
    const { wrapper } = await mountCard({ to: '/custom' });
    expect(wrapper.find('[data-testid="alice"]').attributes('href')).toBe('/custom');
    wrapper.unmount();
  });

  it('renders children as the trigger instead of the default link', async () => {
    const { wrapper } = await mountCard({}, { default: '<button type="button">child trigger</button>' });
    expect(wrapper.find('button').text()).toBe('child trigger');
    expect(wrapper.find('[data-testid="alice"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('discards undeclared HTML attributes', async () => {
    const router = createCardRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(UserPopOverCard, {
      props: { userName: 'alice' },
      attrs: { id: 'leaked-id', 'data-foo': 'bar', title: 'leaked' },
      global: { plugins: [router, Antd, createCardI18n()] },
    });
    expect(wrapper.find('#leaked-id').exists()).toBe(false);
    expect(wrapper.find('[data-foo="bar"]').exists()).toBe(false);
    expect(wrapper.find('[title="leaked"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('intercepts the trigger click when onTitleClick is present', async () => {
    const onTitleClick = vi.fn();
    const { wrapper, router } = await mountCard({ onTitleClick });
    await wrapper.find('[data-testid="alice"]').trigger('click');
    expect(onTitleClick).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/');
    wrapper.unmount();
  });

  it('navigates on trigger click without onTitleClick', async () => {
    const { wrapper, router } = await mountCard();
    await wrapper.find('[data-testid="alice"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/users/alice'));
    wrapper.unmount();
  });

  it('renders the user card: title, non-deleted teams, admin chip first, roles', async () => {
    const { wrapper } = await mountCard();
    await openCard(wrapper);
    await vi.waitFor(() => expect(wrapper.find('[data-testid="user-name"]').text()).toBe('Alice A'));
    const card = wrapper.find('[data-testid="user-popover-card"]');
    expect(card.find('.user-popover-card__muted').text()).toBe('alice');
    expect(card.text()).toContain('Teams');
    expect(card.text()).toContain('Team A');
    expect(card.text()).not.toContain('Deleted Team');
    expect(card.text()).toContain('Roles');
    const chips = card.findAll('.user-popover-card__chip').map((chip) => chip.text());
    expect(chips).toEqual(['Team A', 'Admin', 'Data Steward']);
    wrapper.unmount();
  });

  it('hides the roles section entirely when the user has no roles, even as admin', async () => {
    apiRequestMock.mockImplementation((_path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'alice' });
      }
      return Promise.resolve({ ...USER_PAYLOAD, roles: [], teams: [] });
    });
    const { wrapper } = await mountCard();
    await openCard(wrapper);
    await vi.waitFor(() => expect(wrapper.find('[data-testid="user-name"]').text()).toBe('Alice A'));
    expect(wrapper.find('[data-testid="user-popover-card"]').text()).not.toContain('Roles');
    expect(wrapper.find('[data-testid="user-popover-card"]').text()).not.toContain('Admin');
    wrapper.unmount();
  });

  it('collapses a failed user fetch to no-data and shows the prop name in the title', async () => {
    apiRequestMock.mockImplementation((_path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'alice' });
      }
      return Promise.reject(new Error('404'));
    });
    const { wrapper } = await mountCard();
    await openCard(wrapper);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="user-popover-card"]').text()).toContain('No data available.')
    );
    expect(wrapper.find('[data-testid="user-name"]').text()).toBe('');
    expect(wrapper.find('[data-testid="user-popover-card"]').text()).toContain('alice');
    wrapper.unmount();
  });

  it('navigates the user title to the fetched name, or intercepts with onTitleClick', async () => {
    const onTitleClick = vi.fn();
    const intercepted = await mountCard({ onTitleClick });
    await openCard(intercepted.wrapper);
    await vi.waitFor(() =>
      expect(intercepted.wrapper.find('[data-testid="user-name"]').text()).toBe('Alice A')
    );
    await intercepted.wrapper.find('.user-popover-card__title-button').trigger('click');
    expect(onTitleClick).toHaveBeenCalledTimes(1);
    expect(intercepted.router.currentRoute.value.path).toBe('/');
    intercepted.wrapper.unmount();

    const plain = await mountCard();
    await openCard(plain.wrapper);
    await vi.waitFor(() => expect(plain.wrapper.find('[data-testid="user-name"]').text()).toBe('Alice A'));
    await plain.wrapper.find('.user-popover-card__title-button').trigger('click');
    await vi.waitFor(() => expect(plain.router.currentRoute.value.path).toBe('/users/alice'));
    plain.wrapper.unmount();
  });

  it('renders the team card: title, description, type, count, parents', async () => {
    const { wrapper } = await mountCard({ userName: 'team-a', type: 'team' });
    const link = wrapper.find('[data-testid="team-a"]');
    expect(link.attributes('href')).toBe('/settings/members/teams/team-a');
    await openCard(wrapper);
    await vi.waitFor(() => expect(wrapper.find('[data-testid="team-name"]').text()).toBe('Team A'));
    const card = wrapper.find('[data-testid="user-popover-card"]');
    expect(card.find('.user-popover-card__muted').text()).toBe('team-a');
    expect(card.text()).toContain('About the team');
    expect(card.find('[data-testid="team-type"]').text()).toBe('Group');
    expect(card.find('[data-testid="team-user-count"]').text()).toBe('3 Users');
    const parents = card.find('[data-testid="team-parents"]');
    expect(parents.text()).toContain('Parent');
    const parentLink = parents.find('a');
    expect(parentLink.text()).toBe('Org');
    expect(parentLink.attributes('href')).toBe('/settings/members/teams/org');
    wrapper.unmount();
  });

  it('uses the singular user label for a one-user team and no-description fallback', async () => {
    apiRequestMock.mockImplementation((_path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'team-a' });
      }
      return Promise.resolve({ ...TEAM_PAYLOAD, userCount: 1, description: undefined, parents: [] });
    });
    const { wrapper } = await mountCard({ userName: 'team-a', type: 'team' });
    await openCard(wrapper);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="team-user-count"]').text()).toBe('1 User')
    );
    expect(wrapper.find('[data-testid="user-popover-card"]').text()).toContain('No description');
    expect(wrapper.find('[data-testid="team-parents"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('collapses a failed team fetch to no-data', async () => {
    apiRequestMock.mockImplementation((_path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'team-a' });
      }
      return Promise.reject(new Error('500'));
    });
    const { wrapper } = await mountCard({ userName: 'team-a', type: 'team' });
    await openCard(wrapper);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="user-popover-card"]').text()).toContain('No data available.')
    );
    expect(wrapper.find('[data-testid="team-popover-content"]').exists()).toBe(false);
    // The team title falls back to the prop name when nothing loaded.
    expect(wrapper.find('[data-testid="team-name"]').text()).toBe('team-a');
    wrapper.unmount();
  });

  it('team title navigation ignores onTitleClick and always navigates', async () => {
    const onTitleClick = vi.fn();
    const { wrapper, router } = await mountCard({ userName: 'team-a', type: 'team', onTitleClick });
    await openCard(wrapper);
    await vi.waitFor(() => expect(wrapper.find('[data-testid="team-name"]').text()).toBe('Team A'));
    await wrapper.find('.user-popover-card__title-button').trigger('click');
    expect(onTitleClick).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.path).toBe('/settings/members/teams/team-a')
    );
    wrapper.unmount();
  });

  it('renders the /users/ default link for an empty name and collapses to no-data', async () => {
    const { wrapper } = await mountCard({ userName: '' });
    expect(wrapper.find('a').attributes('href')).toBe('/users/');
    await openCard(wrapper);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="user-popover-card"]').text()).toContain('No data available.')
    );
    expect(apiRequestMock.mock.calls.filter(([_path, options]) => options?.query?.fields !== 'profile')).toHaveLength(0);
    wrapper.unmount();
  });

  it('shows a loader while the popover payload is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    apiRequestMock.mockImplementation((_path: string, options?: { query?: Record<string, unknown> }) => {
      if (options?.query?.fields === 'profile') {
        return Promise.resolve({ id: 'u1', name: 'alice' });
      }
      return new Promise((resolve) => { resolveFetch = resolve; });
    });
    const { wrapper } = await mountCard();
    await openCard(wrapper);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="user-popover-card"] .ant-spin').exists()).toBe(true)
    );
    resolveFetch(USER_PAYLOAD);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="user-popover-card"] .ant-spin').exists()).toBe(false)
    );
    wrapper.unmount();
  });
});
