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
import { getSsoProviderSchema } from './ssoSchemas';
import { resolveSsoUiSchema, type SsoUiSchemaResolution } from './ssoUiSchema';
import {
  buildSsoClientErrorMap,
  clearSsoFieldError,
  computeSsoDomPresentIds,
  createSsoFormScrollHandler,
  findSsoChangedFields,
  getSsoErrorText,
  getSsoFieldErrors,
  hasSsoFieldErrors,
  hasSsoFieldValidationErrors,
  mergeSsoDisplayErrors,
  parseSsoErrorBody,
  parseSsoValidationErrors,
  resolveSsoErrorDetails,
  splitSsoValidationErrors,
  toSsoRjsfError,
  transformSsoValidationErrors,
  validateSsoFormData,
  type SsoErrorSchema,
  type SsoRjsfError,
} from './ssoValidation';

/**
 * Pin en-us.json templates for the three rewritten messages. The product
 * i18n keys added by the integration line must carry these exact English
 * values; the tests below lock the composition (template + params), not
 * the locale files.
 */
const EN_TEMPLATES: Record<string, string> = {
  'message.field-text-is-required': '{{fieldText}} is required.',
  'message.value-must-be-greater-than':
    '{{field}} must be greater than {{minimum}}',
  'message.value-must-be-less-than-or-equal':
    '{{field}} must be less than or equal to {{maximum}}',
};

function formatEn(key: string, params: Record<string, unknown>): string {
  let text = EN_TEMPLATES[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{{${name}}}`, String(value));
  }
  return text;
}

function transform(
  errors: SsoRjsfError[],
  presentIds: Set<string>,
): SsoRjsfError[] {
  return transformSsoValidationErrors(errors, {
    isElementPresent: (id) => presentIds.has(id),
    formatMessage: formatEn,
  });
}

describe('parseSsoValidationErrors', () => {
  it('nests dot paths and overwrites later errors for the same field', () => {
    const parsed = parseSsoValidationErrors([
      { field: 'authenticationConfiguration.clientId', error: 'first' },
      { field: 'authenticationConfiguration.clientId', error: 'second' },
      {
        field: 'authenticationConfiguration.oidcConfiguration.secret',
        error: 'Client secret is required',
      },
    ]);
    expect(parsed).toEqual({
      authenticationConfiguration: {
        clientId: { __errors: ['second'] },
        oidcConfiguration: {
          secret: { __errors: ['Client secret is required'] },
        },
      },
    });
  });

  it('keeps non-section keys such as general in the ref shape', () => {
    expect(
      parseSsoValidationErrors([
        { field: 'general', error: 'Validation failed: boom' },
      ]),
    ).toEqual({ general: { __errors: ['Validation failed: boom'] } });
  });

  it('attaches object-level errors to the object node', () => {
    expect(
      parseSsoValidationErrors([
        {
          field: 'authenticationConfiguration.oidcConfiguration',
          error: 'OIDC flow validation failed: boom',
        },
      ]),
    ).toEqual({
      authenticationConfiguration: {
        oidcConfiguration: { __errors: ['OIDC flow validation failed: boom'] },
      },
    });
  });
});

describe('clearSsoFieldError', () => {
  it('deletes the leaf and the first empty ancestor only', () => {
    const errors: SsoErrorSchema = parseSsoValidationErrors([
      { field: 'authenticationConfiguration.clientId', error: 'x' },
    ]);
    clearSsoFieldError(errors, 'root/authenticationConfiguration/clientId');
    // The first empty ancestor (authenticationConfiguration) is deleted,
    // then cleanup stops — the root itself keeps no empty shell either
    // because the deleted node was the only child.
    expect(errors).toEqual({});
  });

  it('leaves an empty shell when a deeper ancestor chain empties', () => {
    const errors: SsoErrorSchema = {
      authenticationConfiguration: {
        oidcConfiguration: { secret: { __errors: ['x'] } },
      },
    };
    clearSsoFieldError(
      errors,
      'root/authenticationConfiguration/oidcConfiguration/secret',
    );
    // oidcConfiguration empties and is deleted; the walk breaks, so the
    // now-empty authenticationConfiguration shell remains (pin behavior).
    expect(errors).toEqual({ authenticationConfiguration: {} });
  });

  it('is a no-op for missing paths and empty schemas', () => {
    const errors: SsoErrorSchema = parseSsoValidationErrors([
      { field: 'authenticationConfiguration.clientId', error: 'x' },
    ]);
    clearSsoFieldError(errors, 'root/authenticationConfiguration/authority');
    clearSsoFieldError(errors, 'root/authorizerConfiguration/adminEmails');
    expect(errors).toEqual({
      authenticationConfiguration: { clientId: { __errors: ['x'] } },
    });
    const empty: SsoErrorSchema = {};
    clearSsoFieldError(empty, 'root/authenticationConfiguration/clientId');
    expect(empty).toEqual({});
  });
});

describe('findSsoChangedFields', () => {
  it('reports scalar and nested changes with root/ paths', () => {
    expect(
      findSsoChangedFields(
        { a: { b: 1, c: 2 }, d: 'x' },
        { a: { b: 1, c: 3 }, d: 'x' },
      ),
    ).toEqual(['root/a/c']);
  });

  it('compares arrays whole and reports added scalar keys', () => {
    expect(
      findSsoChangedFields({ arr: ['a'] }, { arr: ['a', 'b'] }),
    ).toEqual(['root/arr']);
    expect(findSsoChangedFields({}, { added: 'x' })).toEqual(['root/added']);
    expect(findSsoChangedFields({ removed: 'x' }, {})).toEqual(['root/removed']);
  });

  it('yields no paths for a newly added object block', () => {
    expect(
      findSsoChangedFields(
        { authenticationConfiguration: { provider: 'google' } },
        {
          authenticationConfiguration: {
            provider: 'google',
            oidcConfiguration: { id: 'x' },
          },
        },
      ),
    ).toEqual([]);
  });

  it('returns [] for falsy or non-object inputs', () => {
    expect(findSsoChangedFields(undefined, {})).toEqual([]);
    expect(findSsoChangedFields({}, null)).toEqual([]);
    expect(findSsoChangedFields([1], [2])).toEqual([]);
    expect(findSsoChangedFields('a', 'b')).toEqual([]);
  });
});

describe('splitSsoValidationErrors', () => {
  it('splits on trimmed field emptiness and keeps both lists', () => {
    const { fieldErrors, genericErrors } = splitSsoValidationErrors([
      { field: 'authenticationConfiguration.clientId', error: 'field one' },
      { field: '', error: 'generic one' },
      { field: '   ', error: 'generic two' },
      { field: 'general', error: 'general one' },
    ]);
    expect(fieldErrors.map((e) => e.error)).toEqual(['field one', 'general one']);
    expect(genericErrors.map((e) => e.error)).toEqual([
      'generic one',
      'generic two',
    ]);
  });
});

describe('transformSsoValidationErrors', () => {
  const allPresent = (ids: string[]) => new Set(ids);

  it('rewrites required errors with startCase(missingProperty)', () => {
    const cases: Array<[string, string, string]> = [
      ['.authenticationConfiguration', 'providerName', 'Provider Name is required.'],
      ['.authenticationConfiguration', 'clientId', 'Client Id is required.'],
      ['.authenticationConfiguration', 'publicKeyUrls', 'Public Key Urls is required.'],
      ['.authenticationConfiguration', 'callbackUrl', 'Callback Url is required.'],
      ['.authenticationConfiguration', 'oidcConfiguration', 'Oidc Configuration is required.'],
      ['.authenticationConfiguration', 'ldapConfiguration', 'Ldap Configuration is required.'],
      ['.authenticationConfiguration', 'samlConfiguration', 'Saml Configuration is required.'],
      ['.authenticationConfiguration.ldapConfiguration', 'dnAdminPrincipal', 'Dn Admin Principal is required.'],
      ['.authenticationConfiguration.ldapConfiguration', 'userBaseDN', 'User Base DN is required.'],
      ['.authenticationConfiguration.ldapConfiguration', 'mailAttributeName', 'Mail Attribute Name is required.'],
      ['.authenticationConfiguration.samlConfiguration', 'idp', 'Idp is required.'],
      ['.authenticationConfiguration.samlConfiguration', 'sp', 'Sp is required.'],
      ['.authenticationConfiguration.samlConfiguration.idp', 'ssoLoginUrl', 'Sso Login Url is required.'],
      ['.authenticationConfiguration.samlConfiguration.sp', 'acs', 'Acs is required.'],
      ['.authenticationConfiguration.oidcConfiguration', 'id', 'Id is required.'],
      ['.authenticationConfiguration.oidcConfiguration', 'secret', 'Secret is required.'],
      ['.authenticationConfiguration.oidcConfiguration', 'discoveryUri', 'Discovery Uri is required.'],
      ['.authorizerConfiguration', 'className', 'Class Name is required.'],
      ['.authorizerConfiguration', 'enableSecureSocketConnection', 'Enable Secure Socket Connection is required.'],
    ];
    for (const [property, missingProperty, message] of cases) {
      const id = 'root' + property.replaceAll('.', '/');
      const [result] = transform(
        [{ property, params: { missingProperty }, name: 'required' }],
        allPresent([id]),
      );
      expect(result?.message, `${property} ${missingProperty}`).toBe(message);
    }
  });

  it('rewrites minimum errors, naming the full dotted path for nested fields', () => {
    const [root] = transform(
      [
        {
          property: '.authenticationConfiguration.sessionExpiry',
          params: { limit: 3600 },
          name: 'minimum',
        },
      ],
      allPresent(['root/authenticationConfiguration/sessionExpiry']),
    );
    expect(root?.message).toBe(
      'Authentication Configuration Session Expiry must be greater than 3600',
    );

    const [nested] = transform(
      [
        {
          property: '.authenticationConfiguration.oidcConfiguration.tokenValidity',
          params: { limit: 1 },
          name: 'minimum',
        },
      ],
      allPresent([
        'root/authenticationConfiguration/oidcConfiguration/tokenValidity',
      ]),
    );
    expect(nested?.message).toBe(
      'Authentication Configuration Oidc Configuration Token Validity must be greater than 1',
    );
  });

  it('rewrites maximum errors (ported, unreachable for SSO schemas)', () => {
    const [result] = transform(
      [
        {
          property: '.authenticationConfiguration.sessionExpiry',
          params: { limit: 100 },
          name: 'maximum',
        },
      ],
      allPresent(['root/authenticationConfiguration/sessionExpiry']),
    );
    expect(result?.message).toBe(
      'Authentication Configuration Session Expiry must be less than or equal to 100',
    );
  });

  it('drops type/format/enum/pattern and other keywords', () => {
    const present = allPresent(['root/authenticationConfiguration/sessionExpiry']);
    for (const name of ['type', 'format', 'enum', 'pattern', 'additionalProperties', 'const']) {
      expect(
        transform(
          [
            {
              property: '.authenticationConfiguration.sessionExpiry',
              params: {},
              name,
            },
          ],
          present,
        ),
      ).toEqual([]);
    }
  });

  it('drops errors whose DOM id is absent', () => {
    expect(
      transform(
        [{ property: '.authenticationConfiguration', params: { missingProperty: 'providerName' }, name: 'required' }],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('drops rewritten kinds when params is missing', () => {
    expect(
      transform(
        [{ property: '.authenticationConfiguration', name: 'required' }],
        allPresent(['root/authenticationConfiguration']),
      ),
    ).toEqual([]);
  });

  it('derives ids from non-dot properties with the root/ prefix', () => {
    const [result] = transform(
      [
        {
          property: 'authenticationConfiguration',
          params: { missingProperty: 'providerName' },
          name: 'required',
        },
      ],
      allPresent(['root/authenticationConfiguration']),
    );
    expect(result?.message).toBe('Provider Name is required.');
  });
});

describe('buildSsoClientErrorMap and mergeSsoDisplayErrors', () => {
  it('attaches required errors to the missing field and minimum to its own path', () => {
    const map = buildSsoClientErrorMap([
      {
        property: '.authenticationConfiguration',
        params: { missingProperty: 'providerName' },
        name: 'required',
        message: 'Provider Name is required.',
      },
      {
        property: '.authenticationConfiguration.sessionExpiry',
        params: { limit: 3600 },
        name: 'minimum',
        message: 'Session Expiry must be greater than 3600',
      },
    ]);
    expect([...map.entries()]).toEqual([
      ['root/authenticationConfiguration/providerName', ['Provider Name is required.']],
      [
        'root/authenticationConfiguration/sessionExpiry',
        ['Session Expiry must be greater than 3600'],
      ],
    ]);
  });

  it('merges client-first and dedupes', () => {
    expect(
      mergeSsoDisplayErrors(['a', 'b'], ['b', 'c']),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('AJV adapter', () => {
  const presentAll: SsoRjsfError[] = [];
  void presentAll;

  function clientMessages(
    provider: string,
    data: unknown,
    presentIds: Set<string>,
  ): Map<string, string[]> {
    const schema = getSsoProviderSchema(provider);
    const ajvErrors = validateSsoFormData(schema, data);
    const transformed = transformSsoValidationErrors(
      ajvErrors.map(toSsoRjsfError),
      {
        isElementPresent: (id) => presentIds.has(id),
        formatMessage: formatEn,
      },
    );
    return buildSsoClientErrorMap(transformed);
  }

  it('reports a missing providerName for a new config', () => {
    const map = clientMessages(
      'google',
      { authenticationConfiguration: { provider: 'google' } },
      new Set(['root/authenticationConfiguration']),
    );
    expect(map.get('root/authenticationConfiguration/providerName')).toEqual([
      'Provider Name is required.',
    ]);
  });

  it('reports allOf conditional required keys for public OIDC clients', () => {
    const map = clientMessages(
      'google',
      {
        authenticationConfiguration: {
          provider: 'google',
          providerName: 'x',
          clientType: 'public',
        },
      },
      new Set(['root/authenticationConfiguration']),
    );
    expect(map.get('root/authenticationConfiguration/clientId')).toEqual([
      'Client Id is required.',
    ]);
    expect(map.get('root/authenticationConfiguration/authority')).toEqual([
      'Authority is required.',
    ]);
    expect(map.get('root/authenticationConfiguration/callbackUrl')).toEqual([
      'Callback Url is required.',
    ]);
    expect(map.get('root/authenticationConfiguration/publicKeyUrls')).toEqual([
      'Public Key Urls is required.',
    ]);
  });

  it('reports nested LDAP required keys', () => {
    const map = clientMessages(
      'ldap',
      {
        authenticationConfiguration: {
          provider: 'ldap',
          providerName: 'x',
          ldapConfiguration: {},
        },
      },
      new Set(['root/authenticationConfiguration/ldapConfiguration']),
    );
    expect(map.get('root/authenticationConfiguration/ldapConfiguration/host')).toEqual([
      'Host is required.',
    ]);
    expect(
      map.get('root/authenticationConfiguration/ldapConfiguration/userBaseDN'),
    ).toEqual(['User Base DN is required.']);
  });

  it('enforces minimum boundaries and drops type/enum errors', () => {
    const below = clientMessages(
      'google',
      {
        authenticationConfiguration: {
          provider: 'google',
          providerName: 'x',
          sessionExpiry: 3599,
        },
      },
      new Set(['root/authenticationConfiguration/sessionExpiry']),
    );
    expect(below.get('root/authenticationConfiguration/sessionExpiry')).toEqual([
      'Authentication Configuration Session Expiry must be greater than 3600',
    ]);

    const atLimit = clientMessages(
      'google',
      {
        authenticationConfiguration: {
          provider: 'google',
          providerName: 'x',
          sessionExpiry: 3600,
        },
      },
      new Set(['root/authenticationConfiguration/sessionExpiry']),
    );
    expect(atLimit.get('root/authenticationConfiguration/sessionExpiry')).toBeUndefined();

    const wrongType = clientMessages(
      'google',
      {
        authenticationConfiguration: {
          provider: 'google',
          providerName: 'x',
          sessionExpiry: 'abc',
        },
      },
      new Set(['root/authenticationConfiguration/sessionExpiry']),
    );
    expect(wrongType.size).toBe(0);

    const badEnum = clientMessages(
      'google',
      {
        authenticationConfiguration: {
          provider: 'google',
          providerName: 'x',
          tokenValidationAlgorithm: 'NOPE',
        },
      },
      new Set(['root/authenticationConfiguration/tokenValidationAlgorithm']),
    );
    expect(badEnum.size).toBe(0);
  });

  it('never produces maximum errors for SSO schemas', () => {
    const schema = getSsoProviderSchema('google');
    const errors = validateSsoFormData(schema, {
      authenticationConfiguration: {
        provider: 'google',
        providerName: 'x',
        sessionExpiry: 999999999,
        maxActiveSessionsPerUser: 999999,
      },
    });
    expect(errors.some((e) => e.keyword === 'maximum')).toBe(false);
  });
});

describe('getSsoFieldErrors and hasSsoFieldErrors', () => {
  it('looks up nested and object-level errors', () => {
    const errors = parseSsoValidationErrors([
      {
        field: 'authenticationConfiguration.oidcConfiguration',
        error: 'object-level',
      },
      {
        field: 'authenticationConfiguration.oidcConfiguration.secret',
        error: 'leaf-level',
      },
    ]);
    expect(
      getSsoFieldErrors(errors, [
        'authenticationConfiguration',
        'oidcConfiguration',
      ]),
    ).toEqual(['object-level']);
    expect(
      getSsoFieldErrors(errors, [
        'authenticationConfiguration',
        'oidcConfiguration',
        'secret',
      ]),
    ).toEqual(['leaf-level']);
    expect(
      getSsoFieldErrors(errors, ['authenticationConfiguration', 'nope']),
    ).toEqual([]);
  });

  it('counts a general-only ref as having field errors', () => {
    expect(
      hasSsoFieldErrors(
        parseSsoValidationErrors([{ field: 'general', error: 'x' }]),
      ),
    ).toBe(true);
    expect(hasSsoFieldErrors({})).toBe(false);
  });
});

describe('scroll handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('scrolls the nearest scrollable ancestor to the first error', () => {
    document.body.innerHTML =
      '<div class="resizable-first-panel"><div class="overflow-y-auto">' +
      '<div class="form-field-error">first</div>' +
      '<div class="form-field-error">second</div></div></div>';
    const container = document.querySelector('.overflow-y-auto')!;
    const firstError = document.querySelector('.form-field-error')!;
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;
    vi.spyOn(firstError, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(container, 'scrollTop', { value: 50, configurable: true });

    createSsoFormScrollHandler()();
    vi.advanceTimersByTime(100);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 350, behavior: 'smooth' });
  });

  it('clamps the scroll target at zero', () => {
    document.body.innerHTML =
      '<div class="resizable-first-panel"><div class="overflow-y-auto">' +
      '<div class="form-field-error">first</div></div></div>';
    const container = document.querySelector('.overflow-y-auto')!;
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;
    createSsoFormScrollHandler()();
    vi.advanceTimersByTime(100);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('falls back to scrollIntoView without a scrollable ancestor', () => {
    document.body.innerHTML = '<div class="form-field-error">first</div>';
    const firstError = document.querySelector('.form-field-error')!;
    const scrollIntoView = vi.fn();
    firstError.scrollIntoView = scrollIntoView;
    createSsoFormScrollHandler()();
    vi.advanceTimersByTime(100);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  });

  it('does nothing when no error element matches', () => {
    document.body.innerHTML = '<div>clean</div>';
    expect(() => {
      createSsoFormScrollHandler()();
      vi.advanceTimersByTime(100);
    }).not.toThrow();
  });

  it('does nothing when the document is gone (torn-down jsdom)', () => {
    // jsdom teardown can delete the `document` global before the 100ms
    // timer fires; the handler must no-op instead of throwing an
    // unhandled ReferenceError.
    vi.stubGlobal('document', undefined);
    try {
      expect(() => {
        createSsoFormScrollHandler()();
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('hasSsoFieldValidationErrors', () => {
  it('detects an errors array in a JSON body', () => {
    expect(
      hasSsoFieldValidationErrors({
        status: 400,
        body: JSON.stringify({ status: 'failed', errors: [] }),
      }),
    ).toBe(true);
  });

  it('rejects non-array errors, missing keys, bad JSON and non-objects', () => {
    expect(
      hasSsoFieldValidationErrors({
        status: 400,
        body: JSON.stringify({ errors: 'nope' }),
      }),
    ).toBe(false);
    expect(
      hasSsoFieldValidationErrors({
        status: 400,
        body: JSON.stringify({ message: 'x' }),
      }),
    ).toBe(false);
    expect(
      hasSsoFieldValidationErrors({ status: 400, body: 'not json{' }),
    ).toBe(false);
    expect(hasSsoFieldValidationErrors(null)).toBe(false);
    expect(hasSsoFieldValidationErrors({ status: 400 })).toBe(false);
  });
});

describe('resolveSsoErrorDetails', () => {
  const FALLBACK = 'An unexpected error occurred.';

  it('renders strings verbatim without suppression', () => {
    expect(resolveSsoErrorDetails('boom', FALLBACK)).toEqual({
      message: 'boom',
      kind: 'error',
      suppressed: false,
    });
  });

  it('walks the message chain in order', () => {
    const check = (body: string) =>
      resolveSsoErrorDetails({ status: 400, body }, FALLBACK).message;
    expect(check(JSON.stringify({ message: 'm', responseMessage: 'r' }))).toBe('m');
    expect(check(JSON.stringify({ message: '', responseMessage: 'r' }))).toBe('r');
    expect(check(JSON.stringify({}))).toBe(FALLBACK);
    expect(check('plain text failure')).toBe('plain text failure');
    expect(check(JSON.stringify('json string'))).toBe('json string');
    expect(check('123')).toBe(FALLBACK);
    expect(check('')).toBe(FALLBACK);
  });

  it('downgrades rule violations to warnings on the exact enum value', () => {
    expect(
      resolveSsoErrorDetails(
        {
          status: 400,
          body: JSON.stringify({ message: 'm', errorType: 'RULE_VIOLATION' }),
        },
        FALLBACK,
      ).kind,
    ).toBe('warning');
    expect(
      resolveSsoErrorDetails(
        {
          status: 400,
          body: JSON.stringify({ message: 'm', errorType: 'rule-violation' }),
        },
        FALLBACK,
      ).kind,
    ).toBe('error');
  });

  it('suppresses 401 always and 403 only for GET, unless principal domain', () => {
    const check = (status: number, body: string, method?: string) =>
      resolveSsoErrorDetails({ status, body }, FALLBACK, method).suppressed;
    const msg = JSON.stringify({ message: 'nope' });
    expect(check(401, msg, 'POST')).toBe(true);
    expect(check(401, msg, 'GET')).toBe(true);
    expect(check(403, msg, 'GET')).toBe(true);
    expect(check(403, msg, 'get')).toBe(true);
    expect(check(403, msg, 'POST')).toBe(false);
    expect(check(403, msg)).toBe(false);
    expect(check(400, msg, 'GET')).toBe(false);
    expect(
      check(
        401,
        JSON.stringify({ message: 'violates principal domain policy' }),
        'GET',
      ),
    ).toBe(false);
  });

  it('falls back for anything else', () => {
    expect(resolveSsoErrorDetails(null, FALLBACK)).toEqual({
      message: FALLBACK,
      kind: 'error',
      suppressed: false,
    });
    expect(resolveSsoErrorDetails(new Error('boom'), FALLBACK)).toEqual({
      message: FALLBACK,
      kind: 'error',
      suppressed: false,
    });
  });
});

describe('parseSsoErrorBody', () => {
  it('keeps only well-formed issues', () => {
    expect(
      parseSsoErrorBody(
        JSON.stringify({
          errors: [
            { field: 'a.b', error: 'x' },
            { field: 'a.c' },
            { error: 'y' },
            'junk',
          ],
        }),
      ),
    ).toEqual([{ field: 'a.b', error: 'x' }]);
    expect(parseSsoErrorBody('not json')).toEqual([]);
    expect(parseSsoErrorBody(JSON.stringify({ errors: 'nope' }))).toEqual([]);
  });
});

describe('getSsoErrorText', () => {
  it('returns strings verbatim and falls back for anything else', () => {
    expect(getSsoErrorText('plain failure', 'fallback')).toBe('plain failure');
    expect(getSsoErrorText(undefined, 'fallback')).toBe('fallback');
    expect(getSsoErrorText({ status: 500 }, 'fallback')).toBe('fallback');
    expect(getSsoErrorText(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('follows the message chain without toast resolution', () => {
    expect(
      getSsoErrorText(
        { status: 401, body: JSON.stringify({ message: 'denied' }) },
        'fallback',
      ),
    ).toBe('denied');
    expect(
      getSsoErrorText(
        { status: 500, body: JSON.stringify({ responseMessage: 'oops' }) },
        'fallback',
      ),
    ).toBe('oops');
    expect(getSsoErrorText({ status: 500, body: '"quoted"' }, 'fallback')).toBe(
      'quoted',
    );
    expect(getSsoErrorText({ status: 500, body: 'raw text' }, 'fallback')).toBe(
      'raw text',
    );
    expect(
      getSsoErrorText({ status: 500, body: JSON.stringify({}) }, 'fallback'),
    ).toBe('fallback');
    expect(
      getSsoErrorText({ status: 500, body: JSON.stringify([1, 2]) }, 'fallback'),
    ).toBe('fallback');
  });
});

describe('computeSsoDomPresentIds', () => {
  it('includes visible fields and prunes hidden normal fields for confidential google', () => {
    const schema = getSsoProviderSchema('google', false);
    const resolution = resolveSsoUiSchema({
      provider: 'google',
      hasExistingConfig: false,
      hasSavedData: false,
      clientType: 'confidential',
    });
    const ids = computeSsoDomPresentIds(schema, resolution);
    expect(ids.has('root/authenticationConfiguration')).toBe(true);
    expect(ids.has('root/authorizerConfiguration')).toBe(true);
    expect(ids.has('root/authenticationConfiguration/authority')).toBe(true);
    expect(ids.has('root/authenticationConfiguration/clientType')).toBe(true);
    expect(ids.has('root/authenticationConfiguration/oidcConfiguration')).toBe(
      true,
    );
    expect(ids.has('root/authenticationConfiguration/oidcConfiguration/id')).toBe(
      true,
    );
    // Hidden normal fields are filtered out entirely.
    expect(ids.has('root/authenticationConfiguration/provider')).toBe(false);
    expect(ids.has('root/authenticationConfiguration/clientId')).toBe(false);
    expect(ids.has('root/authenticationConfiguration/callbackUrl')).toBe(false);
    expect(ids.has('root/authenticationConfiguration/responseType')).toBe(false);
    expect(ids.has('root/authorizerConfiguration/className')).toBe(false);
    expect(ids.has('root/authorizerConfiguration/testPrincipals')).toBe(false);
  });

  it('prunes the whole oidc subtree for public clients', () => {
    const schema = getSsoProviderSchema('google', false);
    const resolution = resolveSsoUiSchema({
      provider: 'google',
      hasExistingConfig: false,
      hasSavedData: false,
      clientType: 'public',
    });
    const ids = computeSsoDomPresentIds(schema, resolution);
    expect(ids.has('root/authenticationConfiguration/oidcConfiguration')).toBe(
      false,
    );
    expect(ids.has('root/authenticationConfiguration/oidcConfiguration/id')).toBe(
      false,
    );
    expect(ids.has('root/authenticationConfiguration/clientId')).toBe(true);
    expect(ids.has('root/authenticationConfiguration/callbackUrl')).toBe(true);
  });

  it('keeps hidden advanced fields present', () => {
    const schema = getSsoProviderSchema('google', false);
    const resolution = resolveSsoUiSchema({
      provider: 'google',
      hasExistingConfig: false,
      hasSavedData: false,
      clientType: 'confidential',
    });
    if (!('authenticationConfiguration' in resolution)) {
      throw new Error('expected a resolved ui schema');
    }
    const oidc = resolution.authenticationConfiguration.children
      ?.oidcConfiguration;
    if (!oidc?.children) {
      throw new Error('expected oidc children');
    }
    // maxClockSkew is advanced; hiding it must NOT remove its id, because
    // hidden advanced fields still render inside the accordion. The
    // resolution children are readonly, so rebuild the tree with the
    // override instead of mutating it.
    const patchedResolution: SsoUiSchemaResolution = {
      authenticationConfiguration: {
        ...resolution.authenticationConfiguration,
        children: {
          ...resolution.authenticationConfiguration.children,
          oidcConfiguration: {
            ...oidc,
            children: {
              ...oidc.children,
              maxClockSkew: { 'ui:widget': 'hidden' },
            },
          },
        },
      },
      authorizerConfiguration: resolution.authorizerConfiguration,
    };
    const ids = computeSsoDomPresentIds(schema, patchedResolution);
    expect(
      ids.has('root/authenticationConfiguration/oidcConfiguration/maxClockSkew'),
    ).toBe(true);
  });

  it('excludes schema-removed fields for saml', () => {
    const schema = getSsoProviderSchema('saml', false);
    const resolution = resolveSsoUiSchema({
      provider: 'saml',
      hasExistingConfig: false,
      hasSavedData: false,
      clientType: 'public',
    });
    const ids = computeSsoDomPresentIds(schema, resolution);
    expect(ids.has('root/authenticationConfiguration/clientId')).toBe(false);
    expect(ids.has('root/authenticationConfiguration/authority')).toBe(false);
    expect(ids.has('root/authenticationConfiguration/samlConfiguration')).toBe(
      true,
    );
    expect(
      ids.has('root/authenticationConfiguration/samlConfiguration/idp/entityId'),
    ).toBe(true);
  });
});
