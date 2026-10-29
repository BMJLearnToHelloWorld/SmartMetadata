/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { RestClient, RestError } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';

const config: RuntimeConfig = {
  apiUrl: 'http://localhost:8585/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RestClient', () => {
  it('sends Authorization Bearer and Accept on GET', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hits: { hits: [] } }));
    const client = new RestClient(config, fetchImpl);
    await client.request('/v1/search/query', { query: { q: 'orders', index: 'dataAsset' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://localhost:8585/api/v1/search/query?q=orders&index=dataAsset',
    );
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer bot-token');
    expect(headers.get('Accept')).toBe('application/json');
    expect(init.method).toBe('GET');
  });

  it('POSTs JSON and percent-encodes FQN path segments', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c1' }));
    const client = new RestClient(config, fetchImpl);
    await client.request('/v1/conversations', {
      method: 'POST',
      json: { message: 'hello', about: '<#E::table::svc.db.schema.orders>' },
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({ message: 'hello', about: '<#E::table::svc.db.schema.orders>' }),
    );
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');

    fetchImpl.mockResolvedValueOnce(jsonResponse({ name: 'orders' }));
    await client.getByFqn('/v1/tables/name', 'svc.db."Sales Schema".orders', {
      fields: 'owners,tags,columns,domains',
    });
    const [tableUrl] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(tableUrl).toContain(`/v1/tables/name/${encodeURIComponent('svc.db."Sales Schema".orders')}`);
    expect(tableUrl).toContain('fields=owners%2Ctags%2Ccolumns%2Cdomains');
  });

  it('maps a 401 body to RestError and does not invent a token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: 'Expired token' }, 401),
    );
    const client = new RestClient(config, fetchImpl);
    await expect(client.request('/v1/tables/name/x')).rejects.toMatchObject({
      name: 'RestError',
      status: 401,
      message: 'Expired token',
    } satisfies Partial<RestError>);
  });

  it('honors contentType override for JSON Patch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new RestClient(config, fetchImpl);
    await client.request('/v1/glossaries/name/Finance', {
      method: 'PATCH',
      json: [{ op: 'replace', path: '/description', value: 'x' }],
      contentType: 'application/json-patch+json',
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json-patch+json');
  });
});
