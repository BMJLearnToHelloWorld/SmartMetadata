/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { fetchLoggedInUser, loginWithPassword, logoutOnServer } from '@/api/auth';
import { ApiError } from '@/api/client';
import { clearSession, encodeLoginPassword, loadSession, persistSession, type StoredSession } from '@/auth/token';
import type { LoginUser } from '@/types/api';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<StoredSession | null>(null);
  const user = ref<LoginUser | null>(null);

  const isAuthenticated = computed(() => Boolean(session.value?.accessToken));
  const displayName = computed(
    () => user.value?.displayName || user.value?.name || session.value?.email || '',
  );

  function hydrate(): void {
    session.value = loadSession(window.localStorage);
  }

  async function refreshUser(): Promise<void> {
    if (!session.value) {
      user.value = null;
      return;
    }
    user.value = await fetchLoggedInUser();
  }

  async function login(email: string, password: string): Promise<void> {
    const jwt = await loginWithPassword(email, encodeLoginPassword(password));
    if (!jwt.accessToken) {
      throw new Error('Login succeeded but the server returned no accessToken');
    }
    const next: StoredSession = {
      accessToken: jwt.accessToken,
      refreshToken: jwt.refreshToken,
      tokenType: jwt.tokenType || 'Bearer',
      expiryDuration: jwt.expiryDuration,
      email,
    };
    persistSession(window.localStorage, next);
    session.value = next;
    try {
      await refreshUser();
    } catch {
      // JWT is already stored; the profile call is not required to enter the app.
    }
  }

  async function logout(): Promise<void> {
    const current = session.value;
    try {
      if (current?.accessToken) {
        await logoutOnServer(current.accessToken, current.refreshToken);
      }
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    } finally {
      clearSession(window.localStorage);
      session.value = null;
      user.value = null;
    }
  }

  function forgetLocalSession(): void {
    clearSession(window.localStorage);
    session.value = null;
    user.value = null;
  }

  return {
    session,
    user,
    isAuthenticated,
    displayName,
    hydrate,
    refreshUser,
    login,
    logout,
    forgetLocalSession,
  };
});
