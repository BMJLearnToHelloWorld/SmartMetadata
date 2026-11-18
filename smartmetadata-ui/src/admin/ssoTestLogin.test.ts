/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { SecurityConfigurationDocument } from '@/api/system';
import {
  deepEqual,
  getChangedPaths,
  isBrowserTestLogin,
  isSafeEditPath,
  isTestLoginSettled,
  popupCandidateFor,
  requiresTestLogin,
  SAFE_EDIT_PATHS,
  STAGE_LABEL_KEYS,
  TEST_LOGIN_OIDC_SCOPE,
  TEST_LOGIN_POLL_MS,
  TEST_LOGIN_POPUP_FEATURES,
  TEST_LOGIN_POPUP_NAME,
  TEST_LOGIN_TIMEOUT_MS,
  toConnectionStepState,
} from './ssoTestLogin';

function doc(auth: Record<string, unknown>, authorizer: Record<string, unknown> = {}) {
  return { authenticationConfiguration: auth, authorizerConfiguration: authorizer };
}

describe('getChangedPaths', () => {
  it('reports the dotted leaf of a nested change', () => {
    expect(
      getChangedPaths(
        doc({ provider: 'google', oidcConfiguration: { tokenValidity: 100 } }),
        doc({ provider: 'google', oidcConfiguration: { tokenValidity: 200 } }),
      ),
    ).toEqual(['authenticationConfiguration.oidcConfiguration.tokenValidity']);
  });

  it('expands an added or removed block to all of its leaves', () => {
    expect(
      getChangedPaths(
        doc({ provider: 'google' }),
        doc({ provider: 'google', oidcConfiguration: { id: 'x', secret: 'y' } }),
      ),
    ).toEqual([
      'authenticationConfiguration.oidcConfiguration.id',
      'authenticationConfiguration.oidcConfiguration.secret',
    ]);
    expect(
      getChangedPaths(
        doc({ provider: 'google', oidcConfiguration: { id: 'x', secret: 'y' } }),
        doc({ provider: 'google' }),
      ),
    ).toEqual([
      'authenticationConfiguration.oidcConfiguration.id',
      'authenticationConfiguration.oidcConfiguration.secret',
    ]);
  });

  it('treats blank forms of the same absence as unchanged', () => {
    expect(getChangedPaths({ a: '' }, {})).toEqual([]);
    expect(getChangedPaths({ a: null }, { a: undefined })).toEqual([]);
    expect(getChangedPaths({ a: [] }, {})).toEqual([]);
    expect(getChangedPaths({ a: [] }, { a: null })).toEqual([]);
    expect(getChangedPaths({ a: '' }, { a: 'x' })).toEqual(['a']);
  });

  it('ignores object key order but not array order', () => {
    expect(getChangedPaths({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(getChangedPaths({ list: ['a', 'b'] }, { list: ['b', 'a'] })).toEqual(['list']);
    expect(getChangedPaths({ list: ['a'] }, { list: ['a', 'b'] })).toEqual(['list']);
  });

  it('compares nested structures recursively', () => {
    expect(
      getChangedPaths(
        { a: { b: { c: [1, { d: 2 }] } } },
        { a: { b: { c: [1, { d: 3 }] } } },
      ),
    ).toEqual(['a.b.c']);
  });
});

describe('deepEqual', () => {
  it('treats NaN as equal to NaN', () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual({ v: Number.NaN }, { v: Number.NaN })).toBe(true);
  });
});

describe('isSafeEditPath', () => {
  it('accepts each safe path exactly', () => {
    for (const path of SAFE_EDIT_PATHS) {
      expect(isSafeEditPath(path)).toBe(true);
    }
  });

  it('accepts children of a safe path', () => {
    expect(
      isSafeEditPath('authenticationConfiguration.jwtTeamClaimMapping.teamClaim'),
    ).toBe(true);
    expect(isSafeEditPath('authorizerConfiguration.botPrincipals.0')).toBe(true);
  });

  it('rejects paths that merely share a prefix', () => {
    expect(isSafeEditPath('authenticationConfiguration.enableSelfSignupX')).toBe(false);
    expect(isSafeEditPath('authenticationConfiguration.enableSelfSignup2')).toBe(false);
    expect(isSafeEditPath('authenticationConfiguration.provider')).toBe(false);
    expect(isSafeEditPath('authenticationConfiguration.oidcConfiguration.secret')).toBe(false);
  });
});

describe('requiresTestLogin', () => {
  it('requires a test when there is no saved configuration', () => {
    expect(requiresTestLogin(undefined, doc({ provider: 'google' }))).toBe(true);
    expect(requiresTestLogin(null, doc({ provider: 'google' }))).toBe(true);
    expect(requiresTestLogin('', doc({ provider: 'google' }))).toBe(true);
  });

  it('does not require a test when nothing changed', () => {
    const saved = doc({ provider: 'google', clientId: 'cid' });
    expect(requiresTestLogin(saved, doc({ provider: 'google', clientId: 'cid' }))).toBe(false);
  });

  it('does not require a test for a change to any single safe path', () => {
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ enableSelfSignup: false }, { enableSelfSignup: true }],
      [{ sessionExpiry: 100 }, { sessionExpiry: 200 }],
      [{ maxActiveSessionsPerUser: 1 }, { maxActiveSessionsPerUser: 2 }],
      [{ forceSecureSessionCookie: false }, { forceSecureSessionCookie: true }],
      [{ displayNameClaim: 'a' }, { displayNameClaim: 'b' }],
      [{ jwtTeamClaimMapping: {} }, { jwtTeamClaimMapping: { team: 'x' } }],
      [
        { oidcConfiguration: { tokenValidity: 100 } },
        { oidcConfiguration: { tokenValidity: 200 } },
      ],
      [
        { oidcConfiguration: { sessionExpiry: 100 } },
        { oidcConfiguration: { sessionExpiry: 200 } },
      ],
      [
        { oidcConfiguration: { maxClockSkew: 1 } },
        { oidcConfiguration: { maxClockSkew: 2 } },
      ],
      [
        { samlConfiguration: { security: { tokenValidity: 100 } } },
        { samlConfiguration: { security: { tokenValidity: 200 } } },
      ],
    ];
    for (const [before, after] of cases) {
      expect(requiresTestLogin(doc(before), doc(after))).toBe(false);
    }
    const authorizerCases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ botPrincipals: [] }, { botPrincipals: ['bot'] }],
      [{ testPrincipals: [] }, { testPrincipals: ['tester'] }],
      [{ defaultOAuthRole: 'a' }, { defaultOAuthRole: 'b' }],
      [{ allowedEmailRegistrationDomains: [] }, { allowedEmailRegistrationDomains: ['x.test'] }],
    ];
    for (const [before, after] of authorizerCases) {
      expect(requiresTestLogin(doc({}, before), doc({}, after))).toBe(false);
    }
  });

  it('requires a test for an unsafe change even beside safe ones', () => {
    expect(
      requiresTestLogin(
        doc({ provider: 'google', enableSelfSignup: false }),
        doc({ provider: 'okta', enableSelfSignup: true }),
      ),
    ).toBe(true);
  });

  it('requires a test for unsafe representatives', () => {
    const unsafe: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ provider: 'google' }, { provider: 'okta' }],
      [{ clientId: 'a' }, { clientId: 'b' }],
      [{ authority: 'a' }, { authority: 'b' }],
      [{ clientType: 'public' }, { clientType: 'confidential' }],
      [{ callbackUrl: 'a' }, { callbackUrl: 'b' }],
      [{ providerName: 'a' }, { providerName: 'b' }],
      [
        { oidcConfiguration: { secret: 'a' } },
        { oidcConfiguration: { secret: 'b' } },
      ],
      [
        { samlConfiguration: { idp: { entityId: 'a' } } },
        { samlConfiguration: { idp: { entityId: 'b' } } },
      ],
    ];
    for (const [before, after] of unsafe) {
      expect(requiresTestLogin(doc(before), doc(after))).toBe(true);
    }
  });

  it('requires a test when a block is added, and fails closed on unclassified fields', () => {
    expect(
      requiresTestLogin(
        doc({ provider: 'google' }),
        doc({ provider: 'google', oidcConfiguration: { id: 'x' } }),
      ),
    ).toBe(true);
    expect(
      requiresTestLogin(doc({ provider: 'google' }), doc({ provider: 'google', newField: 1 })),
    ).toBe(true);
  });
});

describe('isBrowserTestLogin', () => {
  it.each([
    ['google', 'public', true],
    ['google', 'confidential', false],
    ['google', undefined, true],
    ['google', '', true],
    ['okta', undefined, true],
    ['custom-oidc', 'public', true],
    ['azure', 'public', true],
    ['basic', 'public', false],
    ['basic', undefined, false],
    ['ldap', 'public', false],
    ['saml', 'public', false],
    ['openmetadata', 'public', false],
    [undefined, 'public', false],
    [undefined, undefined, false],
    ['', 'public', false],
  ])('provider=%s clientType=%s -> %s', (provider, clientType, expected) => {
    expect(isBrowserTestLogin(provider, clientType)).toBe(expected);
  });
});

describe('popupCandidateFor', () => {
  it('forces the code flow for code-flow providers regardless of the stored response type', () => {
    for (const provider of ['okta', 'auth0', 'azure']) {
      const candidate = popupCandidateFor({
        authenticationConfiguration: { provider, responseType: 'id_token' },
        authorizerConfiguration: {},
      } satisfies SecurityConfigurationDocument);
      expect(candidate.responseType).toBe('code');
    }
  });

  it('uses the stored response type otherwise, defaulting to id_token', () => {
    const withType = popupCandidateFor({
      authenticationConfiguration: { provider: 'google', responseType: 'code' },
      authorizerConfiguration: {},
    });
    expect(withType.responseType).toBe('code');
    const withoutType = popupCandidateFor({
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    });
    expect(withoutType.responseType).toBe('id_token');
  });

  it('passes authority, client id, and callback through with the login scope', () => {
    const candidate = popupCandidateFor({
      authenticationConfiguration: {
        provider: 'google',
        authority: 'https://accounts.google.com',
        clientId: 'cid',
        callbackUrl: 'https://app.test/callback',
      },
      authorizerConfiguration: {},
    });
    expect(candidate).toEqual({
      authority: 'https://accounts.google.com',
      clientId: 'cid',
      callbackUrl: 'https://app.test/callback',
      responseType: 'id_token',
      scope: TEST_LOGIN_OIDC_SCOPE,
    });
  });
});

describe('stage labels and step states', () => {
  it('covers all ten stages with unique label keys', () => {
    const keys = Object.values(STAGE_LABEL_KEYS);
    expect(keys).toHaveLength(10);
    expect(new Set(keys).size).toBe(10);
    for (const key of keys) {
      expect(key.startsWith('sso.testLogin.stages.')).toBe(true);
    }
    expect(STAGE_LABEL_KEYS.STARTED).toBe('sso.testLogin.stages.started');
    expect(STAGE_LABEL_KEYS.DOMAIN_CHECKED).toBe('sso.testLogin.stages.domainChecked');
  });

  it('maps stage statuses onto step states, settling pending as skipped', () => {
    expect(toConnectionStepState('pending', false)).toBe('queued');
    expect(toConnectionStepState('pending', true)).toBe('skipped');
    expect(toConnectionStepState('running', true)).toBe('running');
    expect(toConnectionStepState('passed', true)).toBe('passed');
    expect(toConnectionStepState('failed', true)).toBe('failed');
    expect(toConnectionStepState('skipped', false)).toBe('skipped');
  });

  it('treats only a non-pending result as settled', () => {
    expect(isTestLoginSettled(undefined)).toBe(false);
    expect(isTestLoginSettled({ status: 'pending' })).toBe(false);
    expect(isTestLoginSettled({ status: 'success' })).toBe(true);
    expect(isTestLoginSettled({ status: 'failed' })).toBe(true);
  });
});

describe('test login constants', () => {
  it('uses the pin popup, poll, and timeout values', () => {
    expect(TEST_LOGIN_POPUP_NAME).toBe('omSsoTestLogin');
    expect(TEST_LOGIN_POPUP_FEATURES).toBe('width=520,height=680');
    expect(TEST_LOGIN_POLL_MS).toBe(2000);
    expect(TEST_LOGIN_TIMEOUT_MS).toBe(3 * 60 * 1000);
    expect(TEST_LOGIN_OIDC_SCOPE).toBe('openid email profile');
  });
});
