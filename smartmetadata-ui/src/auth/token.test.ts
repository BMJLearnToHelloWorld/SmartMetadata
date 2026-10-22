/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  authorizationHeader,
  clearSession,
  encodeLoginPassword,
  loadSession,
  persistSession,
  type StoredSession,
} from './token';

describe('encodeLoginPassword', () => {
  it('base64-encodes the password the way POST /v1/users/login requires', () => {
    expect(encodeLoginPassword('admin')).toBe('YWRtaW4=');
  });

  it('encodes UTF-8 bytes, not isolated UTF-16 code units', () => {
    expect(encodeLoginPassword('päss')).toBe(btoa('\x70\xc3\xa4\x73\x73'));
  });
});

describe('authorizationHeader', () => {
  it('uses the Bearer scheme JwtFilter.extractToken expects', () => {
    expect(authorizationHeader('abc.def.ghi')).toBe('Bearer abc.def.ghi');
  });
});

describe('session persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  const session: StoredSession = {
    accessToken: 'tok-1',
    refreshToken: 'ref-1',
    tokenType: 'Bearer',
    expiryDuration: 3600,
    email: 'admin@open-metadata.org',
  };

  it('round-trips a session under the versioned key', () => {
    persistSession(localStorage, session);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
    expect(loadSession(localStorage)).toEqual(session);
  });

  it('returns null for missing or corrupt storage', () => {
    expect(loadSession(localStorage)).toBeNull();
    localStorage.setItem(AUTH_STORAGE_KEY, '{not-json');
    expect(loadSession(localStorage)).toBeNull();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email: 'only' }));
    expect(loadSession(localStorage)).toBeNull();
  });

  it('clears only the session key', () => {
    persistSession(localStorage, session);
    localStorage.setItem('other', 'keep');
    clearSession(localStorage);
    expect(loadSession(localStorage)).toBeNull();
    expect(localStorage.getItem('other')).toBe('keep');
  });
});
