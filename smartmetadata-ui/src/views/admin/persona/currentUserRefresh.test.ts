/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { AdminUser } from '@/types/admin';
import type { LoginUser } from '@/types/api';
import {
  fetchCurrentUserAfterPersonaCreate,
  fetchCurrentUserForPersonaDetail,
} from './currentUserRefresh';

function setupAuth(user: LoginUser | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  store.user = user;
  return store;
}

describe('currentUserRefresh', () => {
  it('detail variant reads personas + defaultPersona and forces defaultPersona from the fetch', async () => {
    const store = setupAuth({
      id: 'u1',
      name: 'alice',
      isAdmin: true,
      defaultPersona: { id: 'p-old', name: 'Old', type: 'persona' },
    } as LoginUser);
    const fetchUser = vi.fn(async (): Promise<AdminUser> => {
      return { id: 'u1', name: 'alice', personas: [] } as unknown as AdminUser;
    });
    await fetchCurrentUserForPersonaDetail(store, fetchUser);
    expect(fetchUser).toHaveBeenCalledWith('u1', {
      fields: ['personas', 'defaultPersona'],
      include: 'all',
    });
    // The forced defaultPersona key clears a removed default instead of
    // letting the stale one linger; other fields are preserved.
    expect(store.user?.defaultPersona).toBeUndefined();
    expect(store.user?.isAdmin).toBe(true);
    expect(store.user?.name).toBe('alice');
  });

  it('detail variant is a silent no-op without a current user', async () => {
    const store = setupAuth(null);
    const fetchUser = vi.fn();
    await fetchCurrentUserForPersonaDetail(store, fetchUser);
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it('detail variant swallows fetch failures and keeps the stored user', async () => {
    const store = setupAuth({ id: 'u1', name: 'alice' } as LoginUser);
    const fetchUser = vi.fn(async (): Promise<AdminUser> => {
      throw new Error('boom');
    });
    await fetchCurrentUserForPersonaDetail(store, fetchUser);
    expect(store.user).toEqual({ id: 'u1', name: 'alice' });
  });

  it('create variant reads personas only and merges with a plain spread', async () => {
    const store = setupAuth({
      id: 'u1',
      name: 'alice',
      defaultPersona: { id: 'p-old', name: 'Old', type: 'persona' },
    } as LoginUser);
    const fetchUser = vi.fn(async (): Promise<AdminUser> => {
      return {
        id: 'u1',
        name: 'alice',
        personas: [{ id: 'p1', name: 'Analyst', type: 'persona' }],
      } as unknown as AdminUser;
    });
    await fetchCurrentUserAfterPersonaCreate(store, fetchUser);
    expect(fetchUser).toHaveBeenCalledWith('u1', { fields: ['personas'], include: 'all' });
    expect(store.user?.personas).toHaveLength(1);
    // No forced defaultPersona key: the stored default survives.
    expect(store.user?.defaultPersona).toEqual({ id: 'p-old', name: 'Old', type: 'persona' });
  });

  it('create variant swallows fetch failures', async () => {
    const store = setupAuth({ id: 'u1', name: 'alice' } as LoginUser);
    const fetchUser = vi.fn(async (): Promise<AdminUser> => {
      throw new Error('boom');
    });
    await fetchCurrentUserAfterPersonaCreate(store, fetchUser);
    expect(store.user).toEqual({ id: 'u1', name: 'alice' });
  });
});
