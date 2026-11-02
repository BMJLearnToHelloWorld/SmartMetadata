/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { authorizationHeader, clearSession, loadSession, persistSession } from '@/auth/token';
import { dispatchSessionExpired } from '@/auth/sessionEvents';

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return '/api';
}

function readErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string; code?: string };
    return parsed.message || parsed.error || `Request failed (${status})`;
  } catch {
    return body || `Request failed (${status})`;
  }
}

export interface ApiRequestOptions {
  method?: string;
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  /** Defaults to application/json when `json` is set. Use for RFC 6902 patches. */
  contentType?: string;
  /** Defaults to JSON parsing; 'text' returns the raw body (e.g. export results). */
  response?: 'json' | 'text';
  /** Internal single-retry guard for the silent-refresh path; callers never set it. */
  retried?: boolean;
}

interface RefreshResponse {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiryDuration?: number;
}

/** Raw refresh attempt: returns the new tokens, or null on any failure. Never touches session state. */
async function tryRefreshSession(accessToken: string): Promise<RefreshResponse | null> {
  try {
    const url = new URL(`${apiBaseUrl()}/v1/auth/refresh`, window.location.origin);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: authorizationHeader(accessToken) },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as RefreshResponse;
    return typeof data?.accessToken === 'string' && data.accessToken.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.json !== undefined) {
    headers['Content-Type'] = options.contentType || 'application/json';
  }
  if (options.auth !== false) {
    const session = loadSession(window.localStorage);
    if (session) {
      headers.Authorization = authorizationHeader(session.accessToken);
    }
  }

  const method = options.method ?? (options.json !== undefined ? 'POST' : 'GET');
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      // Silent refresh, mirroring official LoginAPI renewToken (GET
      // /auth/refresh on the /api/v1 base, i.e. /api/v1/auth/refresh here):
      // one attempt, only when the stored session carries a refresh token.
      // The refresh call goes through raw fetch so it can neither recurse
      // nor clear the session itself; on failure the pre-existing
      // expiry path below runs unchanged, and no empty token is stored.
      if (!options.retried) {
        const stored = loadSession(window.localStorage);
        if (stored?.refreshToken) {
          const refreshed = await tryRefreshSession(stored.accessToken);
          if (refreshed) {
            persistSession(window.localStorage, {
              ...stored,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? stored.refreshToken,
              tokenType: refreshed.tokenType ?? stored.tokenType,
              expiryDuration: refreshed.expiryDuration ?? stored.expiryDuration,
            });
            return apiRequest<T>(path, { ...options, retried: true });
          }
        }
      }
      clearSession(window.localStorage);
      dispatchSessionExpired();
    }
    throw new ApiError(response.status, text, readErrorMessage(text, response.status));
  }
  if (!text) {
    return undefined as T;
  }
  if (options.response === 'text') {
    return text as T;
  }
  return JSON.parse(text) as T;
}
