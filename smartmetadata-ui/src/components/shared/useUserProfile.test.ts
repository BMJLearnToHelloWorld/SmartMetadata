/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserProfile } from './useUserProfile';
import {
  clearUserProfileCache,
  getCachedUserProfile,
  setCachedUserProfile,
} from './userProfileCache';

const { apiRequestMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    readonly status: number;
    constructor(status: number) {
      super(`Request failed (${status})`);
      this.status = status;
    }
  }
  return { apiRequestMock: vi.fn(), FakeApiError };
});
vi.mock('@/api/client', () => ({ apiRequest: apiRequestMock, ApiError: FakeApiError }));

function mountHook(options: { permission: boolean; name: string; isTeam?: boolean }) {
  const permissionRef = ref(options.permission);
  const nameRef = ref(options.name);
  let result: ReturnType<typeof useUserProfile> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useUserProfile({
          permission: () => permissionRef.value,
          name: () => nameRef.value,
          isTeam: options.isTeam,
        });
        return () => h('div');
      },
    })
  );
  return { wrapper, permissionRef, nameRef, result: () => result! };
}

describe('useUserProfile', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearUserProfileCache();
  });

  it('does not fetch without permission', async () => {
    apiRequestMock.mockResolvedValue({ id: 'u1', name: 'alice' });
    const { wrapper, result } = mountHook({ permission: false, name: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(result().isLoading.value).toBe(false);
    wrapper.unmount();
  });

  it('does not fetch for an empty name', async () => {
    const { wrapper } = mountHook({ permission: true, name: '' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not fetch for teams', async () => {
    const { wrapper, result } = mountHook({ permission: true, name: 'team-a', isTeam: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(result().profilePic.value).toBeNull();
    expect(result().isLoading.value).toBe(false);
    wrapper.unmount();
  });

  it('fetches with fields=profile and resolves the 6x picture', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'u1',
      name: 'alice',
      profile: { images: { image: 'base', image512: 'pic512' } },
    });
    const { wrapper, result } = mountHook({ permission: true, name: 'alice' });
    expect(result().isLoading.value).toBe(true);
    await vi.waitFor(() => expect(result().isLoading.value).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/users/name/alice', {
      query: { fields: 'profile' },
    });
    expect(result().profilePic.value).toBe('pic512');
    expect(getCachedUserProfile('alice')?.id).toBe('u1');
    wrapper.unmount();
  });

  it('serves a cached user without fetching', async () => {
    setCachedUserProfile('alice', {
      id: 'u1',
      name: 'alice',
      teams: [],
      roles: [],
      profile: { images: { image: 'base' } },
    });
    const { wrapper, result } = mountHook({ permission: true, name: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(result().profilePic.value).toBe('base');
    expect(result().isLoading.value).toBe(false);
    wrapper.unmount();
  });

  it('dedups concurrent hooks for one name into one request', async () => {
    let resolveFetch!: (value: unknown) => void;
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const first = mountHook({ permission: true, name: 'alice' });
    const second = mountHook({ permission: true, name: 'alice' });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    resolveFetch({ id: 'u1', name: 'alice' });
    await vi.waitFor(() => expect(first.result().isLoading.value).toBe(false));
    await vi.waitFor(() => expect(second.result().isLoading.value).toBe(false));
    first.wrapper.unmount();
    second.wrapper.unmount();
  });

  it('caches a placeholder on a cacheable error status', async () => {
    apiRequestMock.mockRejectedValue(new FakeApiError(404));
    const { wrapper, result } = mountHook({ permission: true, name: 'ghost' });
    await vi.waitFor(() => expect(result().isLoading.value).toBe(false));
    expect(getCachedUserProfile('ghost')).toMatchObject({ id: 'ghost', name: 'ghost', email: '' });
    // Official effect resolves with `?? ''` (useUserProfile.ts:86-90), so a
    // placeholder user settles the picture to '' — the avatar renders
    // `src={profileURL || undefined}`, i.e. no image, initials only.
    expect(result().profilePic.value).toBe('');
    wrapper.unmount();
  });

  it('caches a placeholder on a status-less network failure', async () => {
    apiRequestMock.mockRejectedValue(new Error('network down'));
    const { wrapper, result } = mountHook({ permission: true, name: 'ghost' });
    await vi.waitFor(() => expect(result().isLoading.value).toBe(false));
    expect(getCachedUserProfile('ghost')).toBeDefined();
    wrapper.unmount();
  });

  it('does not cache a placeholder on a non-cacheable status', async () => {
    apiRequestMock.mockRejectedValue(new FakeApiError(502));
    const { wrapper, result } = mountHook({ permission: true, name: 'ghost' });
    await vi.waitFor(() => expect(result().isLoading.value).toBe(false));
    expect(getCachedUserProfile('ghost')).toBeUndefined();
    wrapper.unmount();
  });

  it('fetches when permission arrives late', async () => {
    apiRequestMock.mockResolvedValue({ id: 'u1', name: 'alice' });
    const { wrapper, permissionRef, result } = mountHook({ permission: false, name: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiRequestMock).not.toHaveBeenCalled();
    permissionRef.value = true;
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(result().isLoading.value).toBe(false));
    wrapper.unmount();
  });
});
