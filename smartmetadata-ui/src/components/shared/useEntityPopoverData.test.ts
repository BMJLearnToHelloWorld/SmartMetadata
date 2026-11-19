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
import { ApiError } from '@/api/client';
import {
  clearPopoverDataCache,
  TEAM_POPOVER_FIELDS,
  useEntityPopoverData,
  USER_POPOVER_FIELDS,
  type PopoverOwnerType,
} from './useEntityPopoverData';
import { clearUserProfileCache, getCachedUserProfile } from './userProfileCache';

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: apiRequestMock };
});

function mountHook(name: string, type: PopoverOwnerType) {
  const nameRef = ref(name);
  let result: ReturnType<typeof useEntityPopoverData> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useEntityPopoverData(() => nameRef.value, type);
        return () => h('div');
      },
    })
  );
  return { wrapper, nameRef, result: () => result! };
}

const USER_PAYLOAD = {
  id: 'u1',
  name: 'alice',
  displayName: 'Alice',
  isAdmin: true,
  teams: [{ id: 't1', name: 'team-a', displayName: 'Team A' }],
  roles: [{ id: 'r1', name: 'DataSteward' }],
  profile: { images: { image512: 'pic512', image: 'pic' } },
};

const TEAM_PAYLOAD = {
  id: 't1',
  name: 'team-a',
  displayName: 'Team A',
  description: 'About the team',
  teamType: 'Group',
  userCount: 3,
  parents: [{ id: 'p1', name: 'org', displayName: 'Org' }],
};

describe('useEntityPopoverData', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearPopoverDataCache();
    clearUserProfileCache();
  });

  it('fetches a user with the official field set and maps the payload', async () => {
    apiRequestMock.mockResolvedValue(USER_PAYLOAD);
    const { wrapper, result } = mountHook('alice', 'user');
    expect(result().loading.value).toBe(true);
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/users/name/alice', {
      query: { fields: USER_POPOVER_FIELDS },
    });
    expect(USER_POPOVER_FIELDS).toBe('teams,roles,profile');
    expect(result().data.value).toMatchObject({
      id: 'u1',
      name: 'alice',
      displayName: 'Alice',
      isAdmin: true,
      teams: [{ name: 'team-a', displayName: 'Team A' }],
      roles: [{ name: 'DataSteward' }],
    });
    wrapper.unmount();
  });

  it('mirror-writes the fetched user into the profile cache', async () => {
    apiRequestMock.mockResolvedValue(USER_PAYLOAD);
    const { wrapper, result } = mountHook('alice', 'user');
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(getCachedUserProfile('alice')?.displayName).toBe('Alice');
    wrapper.unmount();
  });

  it('fetches a team with the official field set and does not mirror-write', async () => {
    apiRequestMock.mockResolvedValue(TEAM_PAYLOAD);
    const { wrapper, result } = mountHook('team-a', 'team');
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/teams/name/team-a', {
      query: { fields: TEAM_POPOVER_FIELDS },
    });
    expect(TEAM_POPOVER_FIELDS).toBe('parents,userCount');
    expect(result().data.value).toMatchObject({
      name: 'team-a',
      description: 'About the team',
      teamType: 'Group',
      userCount: 3,
      parents: [{ name: 'org' }],
    });
    expect(getCachedUserProfile('team-a')).toBeUndefined();
    wrapper.unmount();
  });

  it('never fetches for an empty name', async () => {
    const { wrapper, result } = mountHook('', 'user');
    await vi.waitFor(() => expect(apiRequestMock).not.toHaveBeenCalled());
    expect(result().data.value).toBeUndefined();
    expect(result().loading.value).toBe(false);
    wrapper.unmount();
  });

  it('collapses every failure to no-data', async () => {
    apiRequestMock.mockRejectedValue(new Error('403'));
    const { wrapper, result } = mountHook('alice', 'user');
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(result().data.value).toBeUndefined();
    wrapper.unmount();
  });

  // PER-D9 Q1: pin exposes no error surface (useEntityPopoverData.ts
  // :46-67 returns { data, loading } only) and PopoverContent renders
  // no-data-available whenever the data is empty
  // (PopoverContent.component.tsx:36-37). Every rejection kind the
  // product request layer produces must collapse the same way: HTTP
  // errors arrive as ApiError (client.ts), network failures as the
  // raw fetch TypeError (apiRequest does not wrap them).
  it.each([
    ['a 403', new ApiError(403, '{"message":"Forbidden"}')],
    ['a 404', new ApiError(404, '{"message":"Not found"}')],
    ['a 500', new ApiError(500, '{"message":"boom"}')],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('collapses %s to no-data', async (_label, error) => {
    apiRequestMock.mockRejectedValue(error);
    const { wrapper, result } = mountHook('alice', 'user');
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(result().data.value).toBeUndefined();
    wrapper.unmount();
  });

  it('fetches the "-" sentinel and collapses its 404 to no-data', async () => {
    apiRequestMock.mockRejectedValue(new Error('404'));
    const { wrapper, result } = mountHook('-', 'user');
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(result().data.value).toBeUndefined();
    wrapper.unmount();
  });

  it('serves the cache on a second mount without refetching', async () => {
    apiRequestMock.mockResolvedValue(USER_PAYLOAD);
    const first = mountHook('alice', 'user');
    await vi.waitFor(() => expect(first.result().loading.value).toBe(false));
    first.wrapper.unmount();

    const second = mountHook('alice', 'user');
    expect(second.result().loading.value).toBe(false);
    expect(second.result().data.value?.name).toBe('alice');
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    second.wrapper.unmount();
  });

  it('dedups concurrent consumers of one key into one request', async () => {
    let resolveFetch!: (value: unknown) => void;
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const first = mountHook('alice', 'user');
    const second = mountHook('alice', 'user');
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    resolveFetch(USER_PAYLOAD);
    await vi.waitFor(() => expect(first.result().loading.value).toBe(false));
    await vi.waitFor(() => expect(second.result().loading.value).toBe(false));
    expect(first.result().data.value?.name).toBe('alice');
    expect(second.result().data.value?.name).toBe('alice');
    first.wrapper.unmount();
    second.wrapper.unmount();
  });

  it('discards a stale response when the name changes (generation guard)', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    apiRequestMock.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); })
    );
    const { wrapper, nameRef, result } = mountHook('alice', 'user');
    nameRef.value = 'bob';
    await vi.waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(2));
    resolvers[1]!({ id: 'u2', name: 'bob' });
    await vi.waitFor(() => expect(result().loading.value).toBe(false));
    expect(result().data.value?.name).toBe('bob');
    resolvers[0]!(USER_PAYLOAD);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result().data.value?.name).toBe('bob');
    wrapper.unmount();
  });

  it('discards the response after unmount', async () => {
    let resolveFetch!: (value: unknown) => void;
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const { wrapper, result } = mountHook('alice', 'user');
    wrapper.unmount();
    resolveFetch(USER_PAYLOAD);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result().data.value).toBeUndefined();
  });
});
