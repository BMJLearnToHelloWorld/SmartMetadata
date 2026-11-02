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

/** IdP profile of a signed-in user who has no catalog account yet (official newUser). */
export interface NewUserProfile {
  name: string;
  email: string;
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<StoredSession | null>(null);
  const user = ref<LoginUser | null>(null);
  const newUser = ref<NewUserProfile | null>(null);

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
    newUser.value = null;
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
      newUser.value = null;
    }
  }

  /**
   * SAML/OIDC callback login (Stage 9, extended in R7): the IdP has already
   * redirected back to this console carrying an id_token (official
   * SamlCallback reads it from the URL hash first, then the query). That
   * token is stored as the session access token exactly as the official
   * setOidcToken does, then the profile is loaded.
   *
   * R7: a 404 profile with self-signup not explicitly disabled mirrors
   * official AuthProvider (404 -> setNewUserProfile -> SIGNUP): the
   * session is kept (the IdP token authenticates the create-user call),
   * newUser is set, and 'needs-signup' is returned instead of throwing.
   * Any other profile failure drops the session, as before.
   */
  async function loginWithOidc(
    idToken: string,
    email: string,
    options: { enableSelfSignup?: boolean } = {},
  ): Promise<'authenticated' | 'needs-signup'> {
    const next: StoredSession = {
      accessToken: idToken,
      tokenType: 'Bearer',
      email: email || undefined,
    };
    persistSession(window.localStorage, next);
    session.value = next;
    try {
      await refreshUser();
      newUser.value = null;
      return 'authenticated';
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        options.enableSelfSignup !== false
      ) {
        newUser.value = { name: '', email };
        user.value = null;
        return 'needs-signup';
      }
      clearSession(window.localStorage);
      session.value = null;
      user.value = null;
      newUser.value = null;
      throw new Error('SAML login succeeded at the IdP but the user profile could not be loaded');
    }
  }

  function clearNewUser(): void {
    newUser.value = null;
  }

  function forgetLocalSession(): void {
    clearSession(window.localStorage);
    session.value = null;
    user.value = null;
    newUser.value = null;
  }

  return {
    session,
    user,
    newUser,
    isAuthenticated,
    displayName,
    hydrate,
    refreshUser,
    login,
    loginWithOidc,
    logout,
    clearNewUser,
    forgetLocalSession,
  };
});
