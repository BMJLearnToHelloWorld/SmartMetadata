/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RuntimeConfig } from './config.js';

export class RestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = 'RestError';
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
}

function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || `Request failed (${status})`;
  } catch {
    return body || `Request failed (${status})`;
  }
}

export class RestClient {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.jwt}`,
    };
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const method = options.method ?? (options.json !== undefined ? 'POST' : 'GET');
    const response = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new RestError(response.status, text, errorMessage(text, response.status));
    }
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  getByFqn<T>(collectionPath: string, fqn: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(`${collectionPath}/${encodeURIComponent(fqn)}`, { query });
  }
}
