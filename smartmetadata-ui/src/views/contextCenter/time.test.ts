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
import { formatDateString, formatEpoch, formatRelativeTime } from './time';

const NOW = new Date('2026-11-08T12:00:00.000Z').getTime();

describe('formatEpoch', () => {
  it('returns empty when absent', () => {
    expect(formatEpoch()).toBe('');
    expect(formatEpoch(0)).toBe('');
  });

  it('formats an epoch as a locale date-time', () => {
    expect(formatEpoch(NOW)).toBe(new Date(NOW).toLocaleString());
  });
});

describe('formatDateString', () => {
  it('returns empty when absent or unparsable', () => {
    expect(formatDateString()).toBe('');
    expect(formatDateString('')).toBe('');
    expect(formatDateString('not-a-date')).toBe('');
  });

  it('formats an ISO date as a locale date', () => {
    expect(formatDateString('2026-09-01')).toBe(
      new Date(Date.parse('2026-09-01')).toLocaleDateString(),
    );
  });
});

describe('formatRelativeTime', () => {
  it('returns empty when absent', () => {
    expect(formatRelativeTime()).toBe('');
    expect(formatRelativeTime(0)).toBe('');
  });

  it('renders minutes, hours and days', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('1m ago');
    expect(formatRelativeTime(NOW - 2 * 3_600_000, NOW)).toBe('2h ago');
    expect(formatRelativeTime(NOW - 3 * 86_400_000, NOW)).toBe('3d ago');
  });

  it('falls back to the locale date for old or future stamps', () => {
    const old = NOW - 31 * 86_400_000;
    expect(formatRelativeTime(old, NOW)).toBe(new Date(old).toLocaleDateString());
    const future = NOW + 60_000;
    expect(formatRelativeTime(future, NOW)).toBe(new Date(future).toLocaleDateString());
  });
});
