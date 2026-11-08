/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLimitByResource, getLimitConfig } from './limits';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getLimitConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the limit config from /v1/limits/config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          enable: true,
          limits: {
            config: {
              version: '2.0',
              plan: 'enterprise',
              installationType: 'self-hosted',
              deployment: 'docker',
              companyName: 'Acme',
              domain: 'acme.example',
              instances: 1,
              featureLimits: [
                {
                  name: 'metric',
                  maxVersions: 10,
                  versionHistory: 5,
                  limits: { softLimit: 100, hardLimit: 200 },
                  disableFields: [],
                },
              ],
            },
          },
        }),
      ),
    );
    const config = await getLimitConfig();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/api/v1/limits/config');
    expect(config.enable).toBe(true);
    expect(config.limits.config.featureLimits[0]).toMatchObject({
      name: 'metric',
      limits: { softLimit: 100, hardLimit: 200 },
    });
  });

  it('defaults enable to false on a partial payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const config = await getLimitConfig();
    expect(config.enable).toBe(false);
    expect(config.limits.config.featureLimits).toEqual([]);
  });
});

describe('getLimitByResource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the per-resource limit from /v1/limits/features/{resource}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          featureLimitStatuses: [
            {
              name: 'metric',
              limitReached: true,
              currentCount: 200,
              configuredLimit: {
                name: 'metric',
                limits: { softLimit: 100, hardLimit: 200 },
              },
            },
          ],
        }),
      ),
    );
    const limit = await getLimitByResource('metric');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/v1/limits/features/metric',
    );
    expect(limit.featureLimitStatuses[0]).toMatchObject({
      name: 'metric',
      limitReached: true,
      currentCount: 200,
      configuredLimit: { limits: { hardLimit: 200 } },
    });
  });

  it('defaults to no statuses on a partial payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(getLimitByResource('metric')).resolves.toEqual({ featureLimitStatuses: [] });
  });
});
