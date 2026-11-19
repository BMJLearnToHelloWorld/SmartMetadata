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
import { formatReleaseDate, getSimplifiedVersion, getVersionReleaseTimestamp } from './version';

describe('version display helpers (pin utils/Version/Version.ts:26-49)', () => {
  it('drops a trailing 12-digit build segment, keeps clean releases', () => {
    expect(getSimplifiedVersion('1.13.202609250000')).toBe('1.13');
    expect(getSimplifiedVersion('1.5.0.202601020304')).toBe('1.5.0');
    expect(getSimplifiedVersion('1.5.0')).toBe('1.5.0');
    expect(getSimplifiedVersion('1.5.0-SNAPSHOT')).toBe('1.5.0-SNAPSHOT');
    expect(getSimplifiedVersion(undefined)).toBe('');
    expect(getSimplifiedVersion('')).toBe('');
  });

  it('parses the build segment YYYYMMDDHHMM in the local zone', () => {
    const timestamp = getVersionReleaseTimestamp('1.13.202609250930');
    expect(timestamp).toBe(new Date(2026, 8, 25, 9, 30).getTime());
    expect(getVersionReleaseTimestamp('1.5.0')).toBeUndefined();
    expect(getVersionReleaseTimestamp('1.5.0-SNAPSHOT')).toBeUndefined();
    expect(getVersionReleaseTimestamp(undefined)).toBeUndefined();
  });

  it('rejects impossible build fields instead of rolling them over', () => {
    expect(getVersionReleaseTimestamp('1.13.202613250000')).toBeUndefined();
    expect(getVersionReleaseTimestamp('1.13.202602300000')).toBeUndefined();
    expect(getVersionReleaseTimestamp('1.13.202609252500')).toBeUndefined();
  });

  it('formats the release date as DATE_MED in the viewer locale', () => {
    expect(formatReleaseDate(new Date(2026, 8, 25, 9, 30).getTime(), 'en-US')).toBe('Sep 25, 2026');
  });
});
