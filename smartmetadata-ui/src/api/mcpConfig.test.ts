/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { getMcpConfig, mapMCPConfiguration, updateMcpConfig } from './mcpConfig';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

function lastInit(): RequestInit {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return (call[1] ?? {}) as RequestInit;
}

describe('mcpConfig API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps the generated MCPConfiguration shape, dropping unknown fields', () => {
    expect(
      mapMCPConfiguration({
        baseUrl: 'https://example.com',
        allowedOrigins: ['https://a.example', 42],
        maxResponseChars: 100000,
        enabled: true,
        connectTimeout: 5,
        unknownField: 'dropped',
      }),
    ).toEqual({
      baseUrl: 'https://example.com',
      allowedOrigins: ['https://a.example'],
      maxResponseChars: 100000,
      enabled: true,
      connectTimeout: 5,
    });
    expect(mapMCPConfiguration(null)).toEqual({});
  });

  it('gets the config from the dedicated endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ baseUrl: 'https://example.com' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const config = await getMcpConfig();
    expect(config.baseUrl).toBe('https://example.com');
    expect(lastFetch()).toContain('/api/v1/system/mcp/config');
    expect(lastInit().method ?? 'GET').toBe('GET');
  });

  it('puts the whole config back to the dedicated endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ baseUrl: 'https://example.com', enabled: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const saved = await updateMcpConfig({ baseUrl: 'https://example.com', enabled: false });
    expect(saved.enabled).toBe(false);
    expect(lastFetch()).toContain('/api/v1/system/mcp/config');
    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(String(lastInit().body))).toEqual({
      baseUrl: 'https://example.com',
      enabled: false,
    });
  });
});
