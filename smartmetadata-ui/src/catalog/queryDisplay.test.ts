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
import { formatLineCount, formatQueryDate, formatQueryDuration, sqlLineCount } from './queryDisplay';

describe('formatQueryDuration', () => {
  it('renders nothing when duration is undefined', () => {
    expect(formatQueryDuration(undefined, 'Runs for')).toBeUndefined();
  });

  it('prints sub-millisecond durations as raw milliseconds', () => {
    expect(formatQueryDuration(0, 'Runs for')).toBe('Runs for 0 ms');
    expect(formatQueryDuration(0.5, 'Runs for')).toBe('Runs for 0.5 ms');
  });

  it('prints the luxon s.S remainder rule under a minute (unpadded, never rounded)', () => {
    expect(formatQueryDuration(1, 'Runs for')).toBe('Runs for 0.1 sec');
    expect(formatQueryDuration(10, 'Runs for')).toBe('Runs for 0.10 sec');
    expect(formatQueryDuration(100, 'Runs for')).toBe('Runs for 0.100 sec');
    expect(formatQueryDuration(101, 'Runs for')).toBe('Runs for 0.101 sec');
    expect(formatQueryDuration(1000, 'Runs for')).toBe('Runs for 1.0 sec');
    expect(formatQueryDuration(1010, 'Runs for')).toBe('Runs for 1.10 sec');
    expect(formatQueryDuration(1100, 'Runs for')).toBe('Runs for 1.100 sec');
    expect(formatQueryDuration(1500, 'Runs for')).toBe('Runs for 1.500 sec');
    expect(formatQueryDuration(59999, 'Runs for')).toBe('Runs for 59.999 sec');
  });

  it('prints minutes and whole seconds from one minute up', () => {
    expect(formatQueryDuration(60000, 'Runs for')).toBe('Runs for 1 min 0 sec');
    expect(formatQueryDuration(61000, 'Runs for')).toBe('Runs for 1 min 1 sec');
    expect(formatQueryDuration(61999, 'Runs for')).toBe('Runs for 1 min 1 sec');
    expect(formatQueryDuration(3661000, 'Runs for')).toBe('Runs for 61 min 1 sec');
  });
});

describe('formatQueryDate', () => {
  it('formats the pin QUERY_DATE_FORMAT shape in UTC', () => {
    expect(formatQueryDate(Date.UTC(2026, 2, 6, 18, 20), 'en-US', 'UTC')).toBe(
      'On March 06 at 6:20PM UTC+00:00',
    );
  });

  it('formats a missing date as the epoch, as the pin does', () => {
    expect(formatQueryDate(undefined, 'en-US', 'UTC')).toBe(
      'On January 01 at 12:00AM UTC+00:00',
    );
  });

  it('uses the viewer locale for the month name', () => {
    expect(formatQueryDate(Date.UTC(2026, 2, 6, 18, 20), 'zh-CN', 'UTC')).toContain('三月');
  });
});

describe('query line count', () => {
  it('counts newline-separated lines, with empty SQL as one line', () => {
    expect(sqlLineCount(undefined)).toBe(1);
    expect(sqlLineCount('select 1')).toBe(1);
    expect(sqlLineCount('a\nb\nc')).toBe(3);
    expect(sqlLineCount('a\n')).toBe(2);
  });

  it('pluralizes the line label only above one', () => {
    expect(formatLineCount(1, 'Line', 'Lines')).toBe('1 Line');
    expect(formatLineCount(2, 'Line', 'Lines')).toBe('2 Lines');
    expect(formatLineCount(0, 'Line', 'Lines')).toBe('0 Lines');
  });
});
