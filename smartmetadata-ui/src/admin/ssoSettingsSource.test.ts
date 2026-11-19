/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import {
  getSsoEnvSourceVariables,
  getSsoManagedPaths,
  getSsoOverriddenFields,
  getSsoPointerSegments,
  isSsoManagedByDeployment,
  isSsoPathManaged,
  isSsoPointerManaged,
  isSsoWholeSettingManaged,
  pinSsoManagedFields,
  resolveSsoSecuritySources,
  toSsoJsonPointer,
  type SsoSettingSource,
} from './ssoSettingsSource';

function source(overrides: Partial<SsoSettingSource> = {}): SsoSettingSource {
  return {
    configType: 'authenticationConfiguration',
    editable: true,
    source: 'DB',
    ...overrides,
  };
}

describe('pointer encoding', () => {
  it('round-trips segments with tilde and slash escapes', () => {
    expect(toSsoJsonPointer('a~b', 'c/d')).toBe('/a~0b/c~1d');
    expect(getSsoPointerSegments('/a~0b/c~1d')).toEqual(['a~b', 'c/d']);
    expect(getSsoPointerSegments('/')).toEqual([]);
    expect(getSsoPointerSegments('')).toEqual([]);
    expect(getSsoPointerSegments('/oidcConfiguration/clientId')).toEqual([
      'oidcConfiguration',
      'clientId',
    ]);
  });
});

describe('managed predicates', () => {
  it('only ENV mode manages', () => {
    expect(isSsoManagedByDeployment(source({ source: 'ENV' }))).toBe(true);
    expect(isSsoManagedByDeployment(source({ source: 'DB' }))).toBe(false);
    expect(isSsoManagedByDeployment(source({ source: 'AUTO' }))).toBe(false);
    expect(isSsoManagedByDeployment(undefined)).toBe(false);
  });

  it('detects whole-setting management via root pointer or editable:false', () => {
    expect(
      isSsoWholeSettingManaged(
        source({ source: 'ENV', managedPaths: ['/'] }),
      ),
    ).toBe(true);
    expect(
      isSsoWholeSettingManaged(
        source({ source: 'ENV', editable: false, managedPaths: [] }),
      ),
    ).toBe(true);
    expect(
      isSsoWholeSettingManaged(
        source({ source: 'ENV', editable: false }),
      ),
    ).toBe(true);
    expect(
      isSsoWholeSettingManaged(
        source({ source: 'ENV', managedPaths: ['/provider'] }),
      ),
    ).toBe(false);
    expect(
      isSsoWholeSettingManaged(
        source({ source: 'DB', editable: false, managedPaths: [] }),
      ),
    ).toBe(false);
  });

  it('reports ["/"] for whole-managed, reported paths otherwise, [] for non-ENV', () => {
    expect(
      getSsoManagedPaths(source({ source: 'ENV', managedPaths: ['/'] })),
    ).toEqual(['/']);
    expect(
      getSsoManagedPaths(
        source({ source: 'ENV', managedPaths: ['/provider', '/clientType'] }),
      ),
    ).toEqual(['/provider', '/clientType']);
    expect(
      getSsoManagedPaths(
        source({ source: 'DB', managedPaths: ['/provider'] }),
      ),
    ).toEqual([]);
    expect(getSsoManagedPaths(undefined)).toEqual([]);
  });

  it('matches pointers by self or ancestor, with / matching everything', () => {
    expect(isSsoPointerManaged(['/provider'], '/provider')).toBe(true);
    expect(
      isSsoPointerManaged(['/oidcConfiguration'], '/oidcConfiguration/id'),
    ).toBe(true);
    expect(
      isSsoPointerManaged(['/oidcConfiguration/id'], '/oidcConfiguration'),
    ).toBe(false);
    expect(isSsoPointerManaged(['/'], '/anything/deep')).toBe(true);
    expect(isSsoPointerManaged(['/provider'], '/providerName')).toBe(false);
    expect(isSsoPointerManaged([], '/provider')).toBe(false);
    expect(
      isSsoPathManaged(
        source({ source: 'ENV', managedPaths: ['/provider'] }),
        '/provider',
      ),
    ).toBe(true);
  });
});

describe('overridden fields and env variables', () => {
  it('flattens non-ENV overridden fields with configType', () => {
    expect(
      getSsoOverriddenFields([
        source({
          source: 'DB',
          overriddenFields: [
            { path: '/provider', envVariable: 'FOO' },
            { path: '/clientId' },
          ],
        }),
        source({
          configType: 'authorizerConfiguration',
          source: 'ENV',
          overriddenFields: [{ path: '/adminEmails' }],
        }),
      ]),
    ).toEqual([
      {
        path: '/provider',
        envVariable: 'FOO',
        configType: 'authenticationConfiguration',
      },
      { path: '/clientId', configType: 'authenticationConfiguration' },
    ]);
  });

  it('dedupes env variables and uses empty string when absent', () => {
    expect(
      getSsoEnvSourceVariables([
        source({ source: 'ENV', sourceVariable: 'SSO_SOURCE' }),
        source({
          configType: 'authorizerConfiguration',
          source: 'ENV',
          sourceVariable: 'SSO_SOURCE',
        }),
        source({ configType: 'other', source: 'ENV' }),
        source({ configType: 'db-one', source: 'DB', sourceVariable: 'NO' }),
      ]),
    ).toEqual(['SSO_SOURCE', '']);
  });
});

describe('pinSsoManagedFields', () => {
  /**
   * Doc shapes for the pin tests. pinSsoManagedFields infers a single T
   * from both the candidate and the saved doc, so both locals share one
   * type per test; the optional clientId keeps the pinned result's
   * property visible even when the saved doc omits it (the pin removes
   * unsaved fields, so the saved shape is legitimately narrower).
   */
  interface PinnedSsoDoc {
    authenticationConfiguration: { provider: string; clientId?: string };
    authorizerConfiguration: { adminEmails: string[] };
  }
  interface PinnedAuthOnlyDoc {
    authenticationConfiguration: { provider: string; clientId?: string };
  }

  it('copies saved values into the candidate and removes unsaved fields', () => {
    const candidate: PinnedSsoDoc = {
      authenticationConfiguration: { provider: 'google', clientId: 'new' },
      authorizerConfiguration: { adminEmails: ['new@x.com'] },
    };
    const saved: PinnedSsoDoc = {
      authenticationConfiguration: { provider: 'okta' },
      authorizerConfiguration: { adminEmails: ['old@x.com'] },
    };
    const pinned = pinSsoManagedFields(
      candidate,
      saved,
      ['/provider'],
      'authenticationConfiguration',
    );
    expect(pinned.authenticationConfiguration.provider).toBe('okta');
    expect(pinned.authenticationConfiguration.clientId).toBe('new');
    expect(pinned.authorizerConfiguration.adminEmails).toEqual(['new@x.com']);
    // The candidate is never mutated.
    expect(candidate.authenticationConfiguration.provider).toBe('google');

    const removed = pinSsoManagedFields(
      { authenticationConfiguration: { clientId: 'new' } },
      { authenticationConfiguration: {} },
      ['/clientId'],
      'authenticationConfiguration',
    );
    expect(removed.authenticationConfiguration).not.toHaveProperty('clientId');
  });

  it('replaces the whole document for a root pointer without rootKey', () => {
    const candidate: Record<string, number> = { a: 1 };
    const saved: Record<string, number> = { b: 2 };
    expect(pinSsoManagedFields(candidate, saved, ['/'])).toEqual({ b: 2 });
    expect(pinSsoManagedFields(candidate, saved, [''])).toEqual({ b: 2 });
  });

  it('clones reactive inputs instead of throwing a DataCloneError', () => {
    const candidate: PinnedAuthOnlyDoc = reactive({
      authenticationConfiguration: { provider: 'google', clientId: 'new' },
    });
    const saved: PinnedAuthOnlyDoc = reactive({
      authenticationConfiguration: { provider: 'okta' },
    });
    const pinned = pinSsoManagedFields(
      candidate,
      saved,
      ['/provider'],
      'authenticationConfiguration',
    );
    expect(pinned.authenticationConfiguration.provider).toBe('okta');
    expect(pinned.authenticationConfiguration.clientId).toBe('new');
    expect(candidate.authenticationConfiguration.provider).toBe('google');
    // The pinned tree is plain: mutating it never touches the reactive input.
    pinned.authenticationConfiguration.clientId = 'pinned';
    expect(candidate.authenticationConfiguration.clientId).toBe('new');
  });

  it('pins nested pointers and deep-clones saved values', () => {
    const saved = {
      authenticationConfiguration: { oidcConfiguration: { id: 'saved' } },
    };
    const pinned = pinSsoManagedFields(
      { authenticationConfiguration: { oidcConfiguration: { id: 'new' } } },
      saved,
      ['/oidcConfiguration/id'],
      'authenticationConfiguration',
    );
    expect(
      pinned.authenticationConfiguration.oidcConfiguration.id,
    ).toBe('saved');
    pinned.authenticationConfiguration.oidcConfiguration.id = 'mutated';
    expect(saved.authenticationConfiguration.oidcConfiguration.id).toBe('saved');
  });

  it('pins both sections when called per section, like the save path', () => {
    const candidate = {
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: { botDomain: 'new.example' },
    };
    const saved = {
      authenticationConfiguration: { provider: 'okta' },
      authorizerConfiguration: { botDomain: 'old.example' },
    };
    const once = pinSsoManagedFields(
      candidate,
      saved,
      ['/provider'],
      'authenticationConfiguration',
    );
    const twice = pinSsoManagedFields(
      once,
      saved,
      ['/botDomain'],
      'authorizerConfiguration',
    );
    expect(twice.authenticationConfiguration.provider).toBe('okta');
    expect(twice.authorizerConfiguration.botDomain).toBe('old.example');
  });
});

describe('resolveSsoSecuritySources', () => {
  it('computes the three predicates over the two sections', () => {
    const resolved = resolveSsoSecuritySources([
      source({
        source: 'ENV',
        managedPaths: ['/provider', '/enableSelfSignup'],
      }),
      source({
        configType: 'authorizerConfiguration',
        source: 'ENV',
        managedPaths: ['/'],
      }),
    ]);
    expect(resolved.managedPaths).toEqual({
      authenticationConfiguration: ['/provider', '/enableSelfSignup'],
      authorizerConfiguration: ['/'],
    });
    expect(resolved.isReadOnly).toBe(false);
    expect(resolved.isProviderManaged).toBe(true);
    expect(resolved.isSelfSignupManaged).toBe(true);
  });

  it('is read-only only when both sections are whole-managed', () => {
    const resolved = resolveSsoSecuritySources([
      source({ source: 'ENV', managedPaths: ['/'] }),
      source({
        configType: 'authorizerConfiguration',
        source: 'ENV',
        editable: false,
      }),
    ]);
    expect(resolved.isReadOnly).toBe(true);
    expect(resolved.isProviderManaged).toBe(true);
  });

  it('renders as DB-only when sources are absent (failure unlock)', () => {
    const resolved = resolveSsoSecuritySources([]);
    expect(resolved).toEqual({
      managedPaths: {
        authenticationConfiguration: [],
        authorizerConfiguration: [],
      },
      isReadOnly: false,
      isProviderManaged: false,
      isSelfSignupManaged: false,
    });
  });
});
