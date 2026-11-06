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
import { convertMillisecondsToHumanReadableFormat } from './workflowDateTime';

describe('convertMillisecondsToHumanReadableFormat', () => {
  it('returns 0s for zero and for sub-second durations', () => {
    expect(convertMillisecondsToHumanReadableFormat(0)).toBe('0s');
    expect(convertMillisecondsToHumanReadableFormat(500)).toBe('0s');
  });

  it('formats seconds, minutes and hours with the official suffixes', () => {
    expect(convertMillisecondsToHumanReadableFormat(1000)).toBe('1s');
    expect(convertMillisecondsToHumanReadableFormat(90_000)).toBe('1m 30s');
    expect(convertMillisecondsToHumanReadableFormat(3_661_000)).toBe('1h 1m 1s');
  });

  it('formats days, months and years with the luxon divisors', () => {
    expect(convertMillisecondsToHumanReadableFormat(90_061_000)).toBe('1d 1h 1m 1s');
    expect(convertMillisecondsToHumanReadableFormat(30 * 86_400_000)).toBe('1M');
    // 365 days is 12 months of 30 days plus 5 days.
    expect(convertMillisecondsToHumanReadableFormat(365 * 86_400_000)).toBe('1Y 5d');
  });

  it('limits the parts to the requested length', () => {
    expect(convertMillisecondsToHumanReadableFormat(3_661_000, 1)).toBe('1h');
  });

  it('prefixes negatives', () => {
    expect(convertMillisecondsToHumanReadableFormat(-5_000)).toBe('-5s');
  });

  it('shows milliseconds only when asked', () => {
    expect(convertMillisecondsToHumanReadableFormat(1500, undefined, true)).toBe(
      '1s 500ms',
    );
  });
});
