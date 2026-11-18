/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchSsoRoles } from './ssoRoles';
import {
  adoptDeploymentConfig,
  applySecurityConfiguration,
  getSettingsSource,
} from './system';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SSO API additions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs the whole document for applySecurityConfiguration', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(input), init });
        return jsonResponse({
          authenticationConfiguration: { provider: 'google' },
        });
      }),
    );
    const candidate = {
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: { adminEmails: ['a@x.com'] },
    };
    const result = await applySecurityConfiguration(candidate);
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe('/api/v1/system/security/config');
    expect(seen[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(seen[0].init?.body))).toEqual(candidate);
    expect(result).toEqual({
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    });
  });

  it('reads the full settings-source list with defensive mapping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          settings: [
            {
              configType: 'authenticationConfiguration',
              editable: false,
              source: 'ENV',
              sourceVariable: 'SSO_SOURCE',
              managedPaths: ['/provider', 42],
              overriddenFields: [
                { path: '/provider', envVariable: 'FOO' },
                { path: '' },
                'junk',
              ],
            },
            {
              configType: 'authorizerConfiguration',
              editable: true,
              source: 'WEIRD',
              lastReloadError: 'boom',
            },
            { editable: true, source: 'DB' },
          ],
        }),
      ),
    );
    const sources = await getSettingsSource();
    expect(sources).toEqual([
      {
        configType: 'authenticationConfiguration',
        editable: false,
        source: 'ENV',
        sourceVariable: 'SSO_SOURCE',
        managedPaths: ['/provider'],
        overriddenFields: [{ path: '/provider', envVariable: 'FOO' }],
      },
      {
        configType: 'authorizerConfiguration',
        editable: true,
        source: 'DB',
        lastReloadError: 'boom',
        managedPaths: [],
      },
    ]);
  });

  it('adopts deployment values with the paths body', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(input), init });
        return jsonResponse({
          configType: 'authenticationConfiguration',
          editable: true,
          source: 'DB',
        });
      }),
    );
    const result = await adoptDeploymentConfig('authenticationConfiguration', [
      '/provider',
    ]);
    expect(new URL(seen[0].url).pathname).toBe(
      '/api/v1/system/settings/source/authenticationConfiguration/adopt',
    );
    expect(seen[0].init?.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init?.body))).toEqual({
      paths: ['/provider'],
    });
    expect(result.configType).toBe('authenticationConfiguration');
  });

  it('throws when the adopt response carries no setting source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(
      adoptDeploymentConfig('authenticationConfiguration'),
    ).rejects.toThrow('no setting source');
  });

  it('searches roles with pin query shape and returns the data array', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return jsonResponse({
          data: [
            { name: 'admin', displayName: 'Admin' },
            { name: 'dataSteward' },
            { displayName: 'Nameless' },
          ],
          paging: { total: 3 },
        });
      }),
    );
    const roles = await searchSsoRoles('');
    const url = new URL(seen[0]);
    expect(url.pathname).toBe('/api/v1/roles/search');
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.has('fields')).toBe(false);
    expect(roles).toEqual([
      { name: 'admin', displayName: 'Admin' },
      { name: 'dataSteward' },
    ]);

    await searchSsoRoles('adm');
    expect(new URL(seen[1]).searchParams.get('q')).toBe('adm');
  });
});
