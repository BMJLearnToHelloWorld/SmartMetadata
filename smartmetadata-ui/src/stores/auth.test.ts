/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth';

describe('auth store loginWithOidc (R7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns needs-signup and keeps the session when the profile lookup 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/api/v1/users/loggedInUser')
          ? new Response('not found', { status: 404 })
          : new Response('not found', { status: 404 }),
      ),
    );
    const auth = useAuthStore();
    const outcome = await auth.loginWithOidc('oidc-token-1', 'ada@example.org', {});
    expect(outcome).toBe('needs-signup');
    expect(auth.newUser).toEqual({ name: '', email: 'ada@example.org' });
    expect(localStorage.getItem('sm.auth.v1')).toContain('oidc-token-1');
  });

  it('drops the session when self-signup is explicitly disabled on a 404 profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
    const auth = useAuthStore();
    await expect(
      auth.loginWithOidc('oidc-token-1', 'ada@example.org', { enableSelfSignup: false }),
    ).rejects.toThrow();
    expect(auth.newUser).toBeNull();
    expect(localStorage.getItem('sm.auth.v1')).toBeNull();
  });

  it('drops the session on a non-404 profile failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    );
    const auth = useAuthStore();
    await expect(auth.loginWithOidc('oidc-token-1', 'ada@example.org', {})).rejects.toThrow();
    expect(localStorage.getItem('sm.auth.v1')).toBeNull();
  });
});
