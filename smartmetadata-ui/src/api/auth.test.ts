/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmRegistration, requestPasswordResetLink, resetUserPassword, signupUser } from './auth';

function lastCall() {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), body: JSON.parse(String(call[1]?.body ?? '{}')) as Record<string, unknown> };
}

describe('auth API (Stage 9)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('200', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('signs up via POST /v1/users/signup without an auth header', async () => {
    await signupUser({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.org', password: 'Admin123!' });
    const call = lastCall();
    expect(call.url).toContain('/api/v1/users/signup');
    expect(call.body).toMatchObject({ firstName: 'Ada', email: 'ada@example.org' });
  });

  it('requests a reset link via POST /v1/users/generatePasswordResetLink', async () => {
    await requestPasswordResetLink('ada@example.org');
    expect(lastCall().url).toContain('/api/v1/users/generatePasswordResetLink');
    expect(lastCall().body).toEqual({ email: 'ada@example.org' });
  });

  it('confirms registration via PUT /v1/users/registrationConfirmation with the token query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PUT');
        return new Response(JSON.stringify({ id: 'u1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await confirmRegistration('reg-token-1');
    const call = lastCall();
    expect(call.url).toContain('/api/v1/users/registrationConfirmation');
    expect(call.url).toContain('token=reg-token-1');
  });

  it('resets via POST /v1/users/password/reset with token, username and both passwords', async () => {
    await resetUserPassword({ token: 'tok-1', username: 'ada', password: 'Admin123!', confirmPassword: 'Admin123!' });
    const call = lastCall();
    expect(call.url).toContain('/api/v1/users/password/reset');
    expect(call.body).toMatchObject({ token: 'tok-1', username: 'ada', confirmPassword: 'Admin123!' });
  });
});
