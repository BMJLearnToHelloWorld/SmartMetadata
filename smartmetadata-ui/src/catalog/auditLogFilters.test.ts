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
  AUDIT_LOG_TIME_PRESETS,
  auditLogFiltersActive,
  auditLogQuery,
  auditLogTimeRange,
} from './auditLogFilters';

describe('auditLogFilters', () => {
  it('exposes the official time presets yesterday / last7 / last30', () => {
    expect(AUDIT_LOG_TIME_PRESETS.map((row) => row.days)).toEqual([undefined, 1, 7, 30]);
  });

  it('computes the time window from the preset', () => {
    const now = 1700000000000;
    expect(auditLogTimeRange('last7', now)).toEqual({ startTs: now - 7 * 86400000, endTs: now });
    expect(auditLogTimeRange('all', now)).toEqual({});
  });

  it('builds the query, trimming free text and dropping blanks', () => {
    const query = auditLogQuery(
      { timePreset: 'yesterday', userName: ' admin ', entityType: '', eventType: 'CREATE', q: '  ' },
      1700000000000,
    );
    expect(query).toMatchObject({ userName: 'admin', eventType: 'CREATE', startTs: 1700000000000 - 86400000 });
    expect(query.entityType).toBeUndefined();
    expect(query.q).toBeUndefined();
  });

  it('reports filter activity', () => {
    expect(auditLogFiltersActive({ timePreset: 'all' })).toBe(false);
    expect(auditLogFiltersActive({ timePreset: 'last7' })).toBe(true);
    expect(auditLogFiltersActive({ timePreset: 'all', actorType: 'BOT' })).toBe(true);
  });
});
