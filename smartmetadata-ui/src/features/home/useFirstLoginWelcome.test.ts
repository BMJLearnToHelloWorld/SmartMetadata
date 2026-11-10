/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { useAuthStore } from '@/stores/auth';
import { useTourStore } from '@/stores/tour';
import { useWelcomeStore } from '@/stores/welcome';
import {
  LOGGED_IN_USER_STORAGE_KEY,
  useFirstLoginWelcome,
} from './useFirstLoginWelcome';

const patchUser = vi.fn();

vi.mock('@/api/users', () => ({
  patchUser: (...args: unknown[]) => patchUser(...args),
}));

const Probe = defineComponent({
  setup() {
    return useFirstLoginWelcome();
  },
  template: '<div>{{ showWelcome }}</div>',
});

function mountProbe() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(Probe, { global: { plugins: [pinia] } });
  return { wrapper, auth: useAuthStore(), tour: useTourStore(), welcome: useWelcomeStore() };
}

describe('useFirstLoginWelcome', () => {
  beforeEach(() => {
    patchUser.mockReset();
    patchUser.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows the welcome for a first-time user and records them as returning', async () => {
    const { wrapper, auth } = mountProbe();
    auth.user = { id: 'u-1', name: 'new-user', isFirstTimeUser: true };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('true');
    expect(auth.user.isFirstTimeUser).toBe(false);
    expect(patchUser).toHaveBeenCalledTimes(1);
    expect(patchUser).toHaveBeenCalledWith('u-1', [
      { op: 'add', path: '/isFirstTimeUser', value: false },
    ]);
  });

  it('hides the welcome for a returning user and never patches', async () => {
    const { wrapper, auth } = mountProbe();
    auth.user = { id: 'u-1', name: 'old-user', isFirstTimeUser: false };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('false');
    expect(patchUser).not.toHaveBeenCalled();
  });

  it('hides the welcome for a user the legacy browser list already saw', async () => {
    window.localStorage.setItem(LOGGED_IN_USER_STORAGE_KEY, 'other-user,legacy-user');
    const { wrapper, auth } = mountProbe();
    auth.user = { id: 'u-1', name: 'legacy-user', isFirstTimeUser: true };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('false');
    // ...but still records them on the server, so the list stops mattering.
    expect(patchUser).toHaveBeenCalledTimes(1);
  });

  it('hides the welcome while the tour runs and while the welcome store is off', async () => {
    const { wrapper, auth, tour, welcome } = mountProbe();
    auth.user = { id: 'u-1', name: 'new-user', isFirstTimeUser: true };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('true');
    tour.active = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('false');
    tour.active = false;
    welcome.setIsWelcomeVisible(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('false');
  });

  it('closeWelcome dismisses it for this mount', async () => {
    const { wrapper, auth } = mountProbe();
    auth.user = { id: 'u-1', name: 'new-user', isFirstTimeUser: true };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('true');
    (wrapper.vm as unknown as { closeWelcome: () => void }).closeWelcome();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('false');
  });

  it('swallows a failed returning-user patch: the welcome still showed', async () => {
    patchUser.mockRejectedValue(new Error('boom'));
    const { wrapper, auth } = mountProbe();
    auth.user = { id: 'u-1', name: 'new-user', isFirstTimeUser: true };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('true');
    expect(patchUser).toHaveBeenCalledTimes(1);
  });
});
