/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { authorizationHeader, clearSession, loadSession } from '@/auth/token';
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
      clearSession(window.localStorage);
      dispatchSessionExpired();
    }
    throw new ApiError(response.status, text, readErrorMessage(text, response.status));
  }
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
