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
  getSecurityConfigurationDocument,
  getTestLoginResult,
  listSettings,
  mapSsoAuthConfiguration,
  mapTestLoginResult,
  mapTestLoginSession,
  parseSecurityValidationResponse,
  patchSecurityConfiguration,
  startTestLogin,
  submitTestLoginCredentials,
  testLoginValidateToken,
  updateSetting,
  validateSecurityConfiguration,
  getEntityRules,
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

  it('loads the full security document verbatim, with a missing section as an empty object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            authenticationConfiguration: {
              provider: 'okta',
              oidcConfiguration: { discoveryUri: 'https://okta.example/.well-known' },
              jwtTokenExpiry: 3600,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const first = await getSecurityConfigurationDocument();
    expect(first).toEqual({
      authenticationConfiguration: {
        provider: 'okta',
        oidcConfiguration: { discoveryUri: 'https://okta.example/.well-known' },
        jwtTokenExpiry: 3600,
      },
      authorizerConfiguration: {},
    });
    (first.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).discoveryUri =
      'mutated';
    const second = await getSecurityConfigurationDocument();
    expect(
      (second.authenticationConfiguration.oidcConfiguration as Record<string, unknown>)
        .discoveryUri,
    ).toBe('https://okta.example/.well-known');
  });

  it('validates the full candidate document, authorizer section included', async () => {
    const candidate = {
      authenticationConfiguration: { provider: 'google', clientId: 'cid' },
      authorizerConfiguration: { defaultOAuthRole: 'DataConsumer' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/validate');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual(candidate);
        return new Response(JSON.stringify({ status: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const response = await validateSecurityConfiguration(candidate);
    expect(response).toStrictEqual({ status: 'success' });
  });

  it('passes a 200 failed validation through with its structured errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: 'failed',
            errors: [
              { field: 'authenticationConfiguration.clientId', error: 'Client ID is required' },
              { field: '', error: 'Something is wrong' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const response = await validateSecurityConfiguration({
      authenticationConfiguration: {},
      authorizerConfiguration: {},
    });
    expect(response).toEqual({
      status: 'failed',
      errors: [
        { field: 'authenticationConfiguration.clientId', error: 'Client ID is required' },
        { field: '', error: 'Something is wrong' },
      ],
    });
  });

  it('fails closed on an unrecognized validation status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ status: 'weird' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const response = await validateSecurityConfiguration({
      authenticationConfiguration: {},
      authorizerConfiguration: {},
    });
    expect(response).toStrictEqual({ status: 'failed' });
  });

  it('parses the real wire shape and never reads a message key', () => {
    expect(
      parseSecurityValidationResponse(
        JSON.stringify({
          status: 'failed',
          errors: [
            { field: 'authenticationConfiguration.clientId', error: 'Client ID is required' },
            { field: 'general', error: 'General failure' },
          ],
        }),
      ),
    ).toEqual([
      { field: 'authenticationConfiguration.clientId', error: 'Client ID is required' },
      { field: 'general', error: 'General failure' },
    ]);
    expect(
      parseSecurityValidationResponse({
        status: 'failed',
        errors: [{ field: 'provider', message: 'Provider is required' }],
      }),
    ).toEqual([{ field: 'provider', error: '' }]);
    expect(
      parseSecurityValidationResponse({
        status: 'failed',
        errors: [{ message: 'Only a message' }],
      }),
    ).toEqual([]);
  });

  it('yields no errors for missing, non-array, or unparsable bodies', () => {
    expect(parseSecurityValidationResponse(JSON.stringify({ status: 'failed' }))).toEqual([]);
    expect(
      parseSecurityValidationResponse(JSON.stringify({ status: 'failed', errors: 'nope' })),
    ).toEqual([]);
    expect(parseSecurityValidationResponse('not json')).toEqual([]);
    expect(parseSecurityValidationResponse(null)).toEqual([]);
    expect(parseSecurityValidationResponse(42)).toEqual([]);
    expect(parseSecurityValidationResponse(JSON.stringify({ status: 'failed', errors: [] }))).toEqual(
      [],
    );
  });

  it('reads only string fields and errors, preserving blank and general fields', () => {
    expect(
      parseSecurityValidationResponse({
        errors: [
          { field: 42, error: true },
          { field: '', error: 'blank field kept' },
          { field: 'general', error: 'general kept' },
        ],
      }),
    ).toEqual([
      { field: '', error: 'blank field kept' },
      { field: 'general', error: 'general kept' },
    ]);
  });

  it('validates a token against a candidate via POST test-login/validate-token', async () => {
    const candidate = {
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/test-login/validate-token');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          securityConfiguration: candidate,
          idToken: 'id-token',
        });
        return new Response(
          JSON.stringify({
            status: 'success',
            protocol: 'oidc',
            resolvedEmail: 'admin@example.test',
            stages: [{ stage: 'STARTED', status: 'passed' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const result = await testLoginValidateToken({ securityConfiguration: candidate, idToken: 'id-token' });
    expect(result.status).toBe('success');
    expect(result.protocol).toBe('oidc');
    expect(result.resolvedEmail).toBe('admin@example.test');
    expect(result.stages).toEqual([{ stage: 'STARTED', status: 'passed', message: undefined }]);
  });

  it('starts a server test login via POST test-login/start', async () => {
    const candidate = {
      authenticationConfiguration: { provider: 'saml' },
      authorizerConfiguration: {},
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/test-login/start');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ securityConfiguration: candidate });
        return new Response(
          JSON.stringify({
            testSessionId: 'sess-1',
            protocol: 'saml',
            authorizationUrl: 'https://idp.example/authorize',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const session = await startTestLogin({ securityConfiguration: candidate });
    expect(session.testSessionId).toBe('sess-1');
    expect(session.protocol).toBe('saml');
    expect(session.authorizationUrl).toBe('https://idp.example/authorize');
  });

  it('reads a test result via GET with the session id encoded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/test-login/result/a%2Fb%3Fc');
        expect(init?.method ?? 'GET').toBe('GET');
        return new Response(JSON.stringify({ status: 'pending' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const result = await getTestLoginResult('a/b?c');
    expect(result.status).toBe('pending');
  });

  it('submits credentials via POST test-login/credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/system/security/test-login/credentials');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          testSessionId: 'sess-2',
          email: 'admin@example.test',
          password: 'secret',
        });
        return new Response(JSON.stringify({ status: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const result = await submitTestLoginCredentials({
      testSessionId: 'sess-2',
      email: 'admin@example.test',
      password: 'secret',
    });
    expect(result.status).toBe('success');
  });

  it('fails a test result closed on an unknown status and drops illegal stages', () => {
    expect(
      mapTestLoginResult({
        status: 'weird',
        protocol: 'kerberos',
        stages: [
          { stage: 'STARTED', status: 'passed' },
          { stage: 'NOPE', status: 'passed' },
          { stage: 'REDIRECTED', status: 'weird' },
          { stage: 'TOKEN_RECEIVED', status: 'failed', message: 'bad token' },
        ],
        mappedRoles: ['DataConsumer', 42, 'DataSteward'],
        errors: ['oops', 7],
      }),
    ).toEqual({
      status: 'failed',
      stages: [
        { stage: 'STARTED', status: 'passed', message: undefined },
        { stage: 'TOKEN_RECEIVED', status: 'failed', message: 'bad token' },
      ],
      stage: undefined,
      protocol: undefined,
      resolvedPrincipal: undefined,
      resolvedEmail: undefined,
      mappedRoles: ['DataConsumer', 'DataSteward'],
      mappedTeams: undefined,
      domainCheck: undefined,
      errors: ['oops'],
    });
  });

  it('maps a test session defensively', () => {
    expect(mapTestLoginSession({})).toEqual({
      testSessionId: '',
      protocol: undefined,
      authorizationUrl: undefined,
      requiresCredentials: undefined,
      expiresAt: undefined,
    });
    expect(
      mapTestLoginSession({
        testSessionId: 'sess-9',
        protocol: 'ldap',
        authorizationUrl: '',
        requiresCredentials: 'yes',
        expiresAt: 'soon',
      }),
    ).toEqual({
      testSessionId: 'sess-9',
      protocol: 'ldap',
      authorizationUrl: undefined,
      requiresCredentials: undefined,
      expiresAt: undefined,
    });
  });
});

describe('getEntityRules official by-type settings', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('GETs /v1/system/settings/entityRulesSettings/{entityType} in lowercase', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('/api/v1/system/settings/entityRulesSettings/table');
        return new Response(
          JSON.stringify([
            {
              name: 'Ownership Rule',
              description: 'Multiple users or single team ownership',
              rule: '{"multipleUsersOrSingleTeamOwnership":true}',
              enabled: true,
              ignoredEntities: [],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const rules = await getEntityRules('TABLE');
    expect(rules).toEqual([
      {
        name: 'Ownership Rule',
        description: 'Multiple users or single team ownership',
        rule: '{"multipleUsersOrSingleTeamOwnership":true}',
        enabled: true,
        ignoredEntities: [],
        entityType: undefined,
        inherited: undefined,
        jsonTree: undefined,
        provider: undefined,
      },
    ]);
  });
});
