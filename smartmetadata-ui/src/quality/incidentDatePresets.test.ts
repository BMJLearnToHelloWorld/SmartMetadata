/**
 * Copyright 2026 SmartMetadata authors.
 */
import { describe, expect, it } from 'vitest';
import { INCIDENT_DATE_PRESETS, rangeForPreset } from './incidentDatePresets';

describe('incidentDatePresets', () => {
  it('matches official profiler filter lengths including yesterday and 60 days', () => {
    expect(INCIDENT_DATE_PRESETS.map((item) => item.days)).toEqual([1, 3, 7, 14, 30, 60]);
  });

  it('uses official now-minus-days through now (not start/end of calendar day)', () => {
    const now = Date.UTC(2026, 10, 27, 15, 4, 0);
    const range = rangeForPreset(3, now);
    expect(range.endTs).toBe(now);
    const expectedStart = new Date(now);
    expectedStart.setDate(expectedStart.getDate() - 3);
    expect(range.startTs).toBe(expectedStart.getTime());
  });
});
