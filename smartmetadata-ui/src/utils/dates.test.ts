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
import { formatMediumDate } from './dates';

describe('formatMediumDate', () => {
  it('formats epoch millis as DATE_MED ("Nov 22, 2026")', () => {
    expect(formatMediumDate(Date.UTC(2026, 10, 22, 12), 'en-US')).toBe('Nov 22, 2026');
  });

  it('formats an ISO day label without a timezone shift', () => {
    expect(formatMediumDate('2026-11-22', 'en-US')).toBe('Nov 22, 2026');
    expect(formatMediumDate('2026-01-05', 'en-US')).toBe('Jan 5, 2026');
  });

  it('returns empty for a non-date or non-finite input', () => {
    expect(formatMediumDate('Nov 22, 2026', 'en-US')).toBe('');
    expect(formatMediumDate(Number.NaN, 'en-US')).toBe('');
  });
});
