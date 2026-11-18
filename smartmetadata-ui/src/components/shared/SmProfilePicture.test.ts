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
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SmProfilePicture from './SmProfilePicture.vue';
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

function mountPicture(props: Record<string, unknown> = {}) {
  return mount(SmProfilePicture, {
    props: { name: 'alice', ...props },
    global: { plugins: [Antd] },
  });
}

describe('SmProfilePicture', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    getResourcePermissionMock.mockReset();
    clearUserProfileCache();
    getResourcePermissionMock.mockResolvedValue({ ViewBasic: true });
    apiRequestMock.mockResolvedValue({ id: 'u1', name: 'alice' });
  });

  it('renders the team branch with a transparent background and no fetch', async () => {
    const wrapper = mountPicture({ isTeam: true });
    await vi.waitFor(() => expect(getResourcePermissionMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    const avatar = wrapper.find('[data-testid="profile-avatar"]');
    expect(avatar.exists()).toBe(true);
    expect(avatar.attributes('style')).toContain('background-color: transparent');
    expect(wrapper.find('.anticon-team').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders initials with the hue variable and the mapped width size', async () => {
    const wrapper = mountPicture({ width: '24' });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const avatar = wrapper.find('[data-testid="profile-avatar"]');
    expect(avatar.text()).toBe('A');
    // 'alice': (97+108+105+99+101)*8 = 4080; 4080 % 360 = 120.
    expect(avatar.attributes('style')).toContain('--avatar-hue: 120');
    expect(avatar.attributes('style')).toContain('width: 24px');
    expect(avatar.classes()).toContain('sm-profile-picture--outlined');
    wrapper.unmount();
  });

  it('prefers the explicit size over the legacy width', async () => {
    const wrapper = mountPicture({ size: 'lg', width: '24' });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(wrapper.find('[data-testid="profile-avatar"]').attributes('style')).toContain('width: 48px');
    wrapper.unmount();
  });

  it('does not fetch the picture without view permission', async () => {
    getResourcePermissionMock.mockResolvedValue({});
    const wrapper = mountPicture({});
    await vi.waitFor(() => expect(getResourcePermissionMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="profile-avatar"]').text()).toBe('A');
    wrapper.unmount();
  });

  it('renders the fetched picture as the avatar image', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'u1',
      name: 'alice',
      profile: { images: { image512: 'https://cdn.example/pic512' } },
    });
    const wrapper = mountPicture({});
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="profile-avatar"] img').attributes('src')).toBe(
        'https://cdn.example/pic512'
      )
    );
    wrapper.unmount();
  });

  it('shows a loader while the picture loads without a URL', async () => {
    let resolveFetch!: (value: unknown) => void;
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const wrapper = mountPicture({ width: '24' });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(wrapper.find('.ant-spin').exists()).toBe(true));
    expect(wrapper.find('[data-testid="profile-avatar"]').text()).toBe('');
    resolveFetch({ id: 'u1', name: 'alice' });
    await vi.waitFor(() => expect(wrapper.find('.ant-spin').exists()).toBe(false));
    wrapper.unmount();
  });

  it('renders solid avatars with the fill color and white text', async () => {
    const wrapper = mountPicture({ avatarType: 'solid' });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const style = wrapper.find('[data-testid="profile-avatar"]').attributes('style') ?? '';
    // jsdom normalizes hsl(120, 70%, 40%) to rgb(31, 173, 31).
    expect(style).toContain('background-color: rgb(31, 173, 31)');
    expect(style).toContain('color: rgb(255, 255, 255)');
    expect(wrapper.find('[data-testid="profile-avatar"]').classes()).not.toContain(
      'sm-profile-picture--outlined'
    );
    wrapper.unmount();
  });

  it('applies the caller className and the matched-ring class', async () => {
    const wrapper = mountPicture({ className: 'caller-class', matchRingToFill: true });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const classes = wrapper.find('[data-testid="profile-avatar"]').classes();
    expect(classes).toContain('caller-class');
    expect(classes).toContain('sm-profile-picture--matched-ring');
    wrapper.unmount();
  });

  it('uses displayName for the initial when present', async () => {
    const wrapper = mountPicture({ displayName: 'Bob Builder' });
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(wrapper.find('[data-testid="profile-avatar"]').text()).toBe('B');
    wrapper.unmount();
  });
});
