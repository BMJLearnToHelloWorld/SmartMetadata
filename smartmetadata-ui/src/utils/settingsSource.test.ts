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
import {
  WHOLE_SETTING_PATH,
  areAllPathsManaged,
  findSettingSource,
  getEnvSourceVariables,
  getManagedPaths,
  getOverriddenFields,
  getPointerSegments,
  isManagedByDeployment,
  isPathManaged,
  isPointerManaged,
  isWholeSettingManaged,
  pinManagedFields,
  toJsonPointer,
  type SettingSource,
} from './settingsSource';

function source(overrides: Partial<SettingSource> = {}): SettingSource {
  return {
    configType: 'emailConfiguration',
    editable: true,
    source: 'DB',
    ...overrides,
  };
}

describe('settingsSource predicates (official settingsSource.utils.ts)', () => {
  it('treats only ENV mode as managed', () => {
    expect(isManagedByDeployment(source({ source: 'ENV' }))).toBe(true);
    expect(isManagedByDeployment(source({ source: 'AUTO' }))).toBe(false);
    expect(isManagedByDeployment(source({ source: 'DB' }))).toBe(false);
    expect(isManagedByDeployment(undefined)).toBe(false);
  });

  it('reports the whole setting managed only for the root pointer or editable:false without a list', () => {
    expect(
      isWholeSettingManaged(source({ source: 'ENV', managedPaths: ['/'] })),
    ).toBe(true);
    expect(
      isWholeSettingManaged(source({ source: 'ENV', editable: false, managedPaths: [] })),
    ).toBe(true);
    expect(
      isWholeSettingManaged(source({ source: 'ENV', editable: false })),
    ).toBe(true);
    expect(
      isWholeSettingManaged(
        source({ source: 'ENV', editable: false, managedPaths: ['/smtpHost'] }),
      ),
    ).toBe(false);
    expect(
      isWholeSettingManaged(source({ source: 'ENV', managedPaths: ['/smtpHost'] })),
    ).toBe(false);
    expect(
      isWholeSettingManaged(source({ source: 'DB', editable: false, managedPaths: [] })),
    ).toBe(false);
  });

  it('collapses whole-setting management to the root pointer', () => {
    expect(getManagedPaths(source({ source: 'ENV', managedPaths: ['/'] }))).toEqual(['/']);
    expect(getManagedPaths(source({ source: 'ENV', managedPaths: ['/a', '/b'] }))).toEqual([
      '/a',
      '/b',
    ]);
    expect(getManagedPaths(source({ source: 'DB', managedPaths: ['/a'] }))).toEqual([]);
    expect(getManagedPaths(undefined)).toEqual([]);
  });

  it('matches a pointer against itself or an enclosing managed pointer', () => {
    expect(isPointerManaged(['/email'], '/email')).toBe(true);
    expect(isPointerManaged(['/email'], '/email/smtpHost')).toBe(true);
    expect(isPointerManaged(['/email'], '/emailOther')).toBe(false);
    expect(isPointerManaged(['/email/smtp'], '/email')).toBe(false);
    expect(isPointerManaged([WHOLE_SETTING_PATH], '/anything/deep')).toBe(true);
    expect(isPointerManaged([], '/email')).toBe(false);
  });

  it('resolves path management through the source and requires a non-empty list for all-paths', () => {
    const env = source({ source: 'ENV', managedPaths: ['/a'] });
    expect(isPathManaged(env, '/a/b')).toBe(true);
    expect(isPathManaged(env, '/c')).toBe(false);
    expect(isPathManaged(source({ source: 'DB', managedPaths: ['/a'] }), '/a')).toBe(false);
    expect(areAllPathsManaged(env, ['/a', '/a/b'])).toBe(true);
    expect(areAllPathsManaged(env, ['/a', '/c'])).toBe(false);
    expect(areAllPathsManaged(env, [])).toBe(false);
  });

  it('round-trips JSON pointers with RFC 6901 escaping', () => {
    expect(toJsonPointer('a/b', 'c~d')).toBe('/a~1b/c~0d');
    expect(getPointerSegments('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
    expect(getPointerSegments('/')).toEqual([]);
    expect(getPointerSegments('')).toEqual([]);
    expect(toJsonPointer()).toBe('');
  });

  it('finds a source by config type', () => {
    const sources = [source({ configType: 'a' }), source({ configType: 'b' })];
    expect(findSettingSource(sources, 'b')).toBe(sources[1]);
    expect(findSettingSource(sources, 'missing')).toBeUndefined();
  });

  it('collects overridden fields only from non-ENV sources, tagged with config type', () => {
    const sources = [
      source({
        configType: 'a',
        source: 'AUTO',
        overriddenFields: [{ path: '/x', envVariable: 'X_VAR' }, { path: '/y' }],
      }),
      source({
        configType: 'b',
        source: 'ENV',
        overriddenFields: [{ path: '/z' }],
      }),
    ];
    expect(getOverriddenFields(sources)).toEqual([
      { path: '/x', envVariable: 'X_VAR', configType: 'a' },
      { path: '/y', configType: 'a' },
    ]);
  });

  it('dedupes env source variables and keeps the empty variable', () => {
    const sources = [
      source({ source: 'ENV', sourceVariable: 'SHARED_VAR' }),
      source({ configType: 'b', source: 'ENV', sourceVariable: 'SHARED_VAR' }),
      source({ configType: 'c', source: 'ENV' }),
      source({ configType: 'd', source: 'DB', sourceVariable: 'IGNORED' }),
    ];
    expect(getEnvSourceVariables(sources)).toEqual(['SHARED_VAR', '']);
  });

  it('pins managed fields to saved values and removes fields with nothing saved', () => {
    const candidate = { smtpHost: 'new', port: 25, extra: 'keep' };
    const saved = { smtpHost: 'old', port: 587 };
    const pinned = pinManagedFields(candidate, saved, ['/smtpHost', '/missing']);
    expect(pinned).toEqual({ smtpHost: 'old', port: 25, extra: 'keep' });
    expect(pinned).not.toBe(candidate);
    expect(candidate.smtpHost).toBe('new');
  });

  it('returns the saved document wholesale for the whole-setting pointer', () => {
    const pinned = pinManagedFields({ a: 1 }, { b: 2 }, ['/']);
    expect(pinned).toEqual({ b: 2 });
  });

  it('honours rootKey and nested pointers', () => {
    const candidate = { auth: { provider: 'new', other: 1 } };
    const saved = { auth: { provider: 'old' } };
    expect(pinManagedFields(candidate, saved, ['/provider'], 'auth')).toEqual({
      auth: { provider: 'old', other: 1 },
    });
  });
});
