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
import {
  fetchAuthConfig,
  getSecurityConfig,
  getSettingsSource,
  listSettings,
  mapSsoAuthConfiguration,
  parseSecurityValidationErrors,
  patchSecurityConfiguration,
  updateSetting,
} from './system';

describe('system API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads GET /v1/system/config/auth without requiring a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toEqual(expect.objectContaining({ Accept: 'application/json' }));
        expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
        return new Response(JSON.stringify({ provider: 'google', providerName: 'Google', authority: 'https://accounts.google.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const auth = await fetchAuthConfig();
    expect(auth.provider).toBe('google');
    expect(auth.authority).toBe('https://accounts.google.com');
  });

  it('lists settings and PUTs loginConfiguration with schema wire names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/system/settings') && (init?.method ?? 'GET') === 'GET') {
          return new Response(
            JSON.stringify({
              data: [{ config_type: 'loginConfiguration', config_value: { maxLoginFailAttempts: 3 } }],
              paging: { total: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        expect(init?.method).toBe('PUT');
        expect(JSON.parse(String(init?.body))).toEqual({
          config_type: 'loginConfiguration',
          config_value: { maxLoginFailAttempts: 5, accessBlockTime: 600, jwtTokenExpiryTime: 3600 },
        });
        return new Response(
          JSON.stringify({
            config_type: 'loginConfiguration',
            config_value: { maxLoginFailAttempts: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const listed = await listSettings();
    expect(listed.data[0].configType).toBe('loginConfiguration');
    const saved = await updateSetting('loginConfiguration', {
      maxLoginFailAttempts: 5,
      accessBlockTime: 600,
      jwtTokenExpiryTime: 3600,
    });
    expect(saved.configType).toBe('loginConfiguration');
  });
});

describe('system SSO API', () => {
  it('maps the security config authentication object, ignoring unknown fields', () => {
    expect(
      mapSsoAuthConfiguration({
        provider: 'google',
        clientId: 'cid',
        enableSelfSignup: true,
        unknownField: 'ignored',
      }),
    ).toEqual({
      provider: 'google',
      providerName: undefined,
      clientType: undefined,
      authority: undefined,
      clientId: 'cid',
      callbackUrl: undefined,
      enableSelfSignup: true,
    });
  });

  it('loads GET /v1/system/security/config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ authenticationConfiguration: { provider: 'okta', clientId: 'cid' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const config = await getSecurityConfig();
    expect(config.authenticationConfiguration?.provider).toBe('okta');
  });

  it('patches the whole security document with the JSON Patch content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/config');
        expect(String(input)).not.toContain('/v1/system/settings/');
        expect(init?.method).toBe('PATCH');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
        expect(String(init?.body)).toContain('/authenticationConfiguration/provider');
        return new Response(null, { status: 204 });
      }),
    );
    await patchSecurityConfiguration([
      { op: 'replace', path: '/authenticationConfiguration/provider', value: 'google' },
    ]);
  });

  it('maps the settings source auth entry to editable and managed paths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            settings: [
              {
                configType: 'authenticationConfiguration',
                source: 'ENV',
                editable: true,
                managedPaths: ['/provider'],
              },
              { configType: 'authorizerConfiguration', source: 'DB', editable: true, managedPaths: [] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const source = await getSettingsSource();
    expect(source.authenticationEditable).toBe(true);
    expect(source.authenticationManagedPaths).toEqual(['/provider']);
  });

  it('treats editable false as wholesale deployment ownership', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            settings: [{ configType: 'authenticationConfiguration', source: 'ENV', editable: false }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const source = await getSettingsSource();
    expect(source.authenticationEditable).toBe(false);
    expect(source.authenticationManagedPaths).toEqual([]);
  });

  it('parses field errors from a 400 validation body, and null otherwise', () => {
    expect(
      parseSecurityValidationErrors(
        JSON.stringify({
          status: 'failed',
          errors: [
            { field: 'provider', message: 'Provider is required' },
            { field: 'clientId', error: 'Client ID is required' },
          ],
        }),
      ),
    ).toBe('provider: Provider is required\nclientId: Client ID is required');
    expect(parseSecurityValidationErrors('not json')).toBeNull();
    expect(parseSecurityValidationErrors(JSON.stringify({ status: 'failed', errors: [] }))).toBeNull();
  });
});
