/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Versioned so a later session shape can migrate without colliding. */
export const AUTH_STORAGE_KEY = 'sm.auth.v1';

export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiryDuration?: number;
  email?: string;
}

/**
 * POST /api/v1/users/login requires LoginRequest.password as standard Base64
 * of the password bytes (UTF-8). See UserResource.loginUserWithPassword.
 */
export function encodeLoginPassword(plain: string): string {
  const bytes = new TextEncoder().encode(plain);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** JwtFilter.TOKEN_PREFIX is "Bearer"; extractToken splits on the first space. */
export function authorizationHeader(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export function persistSession(storage: Storage, session: StoredSession): void {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(storage: Storage): StoredSession | null {
  const raw = storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed || typeof parsed.accessToken !== 'string' || parsed.accessToken.length === 0) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      tokenType: parsed.tokenType || 'Bearer',
      expiryDuration: parsed.expiryDuration,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

export function clearSession(storage: Storage): void {
  storage.removeItem(AUTH_STORAGE_KEY);
}
