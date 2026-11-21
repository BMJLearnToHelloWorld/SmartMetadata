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
import type { SettingSource } from '@/utils/settingsSource';
import {
  resolveSsoSecuritySources,
} from './ssoSecuritySources';

function source(overrides: Partial<SettingSource> = {}): SettingSource {
  return {
    configType: 'authenticationConfiguration',
    editable: true,
    source: 'DB',
    ...overrides,
  };
}

describe('resolveSsoSecuritySources (pin useSecuritySettingsSource)', () => {
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
