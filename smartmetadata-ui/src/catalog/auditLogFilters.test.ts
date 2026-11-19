/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_LOG_ENTITY_TYPE_OPTIONS,
  AUDIT_LOG_TIME_FILTER_RANGE,
  auditLogCustomRangeLabel,
  auditLogDayRangeBounds,
  auditLogPresetRange,
  auditLogUserSearchQueryFilter,
  buildParamsFromFilters,
  type AuditLogActiveFilter,
} from './auditLogFilters';

describe('auditLogFilters', () => {
  it('exposes exactly the pin time presets, with no all tier', () => {
    expect(AUDIT_LOG_TIME_FILTER_RANGE.map((row) => row.key)).toEqual(['yesterday', 'last7days', 'last30days']);
    expect(AUDIT_LOG_TIME_FILTER_RANGE.map((row) => row.days)).toEqual([1, 7, 30]);
  });

  it('computes rolling preset windows ending at now', () => {
    const now = 1700000000000;
    const range = auditLogPresetRange(7, now);
    expect(range.endTs).toBe(now);
    expect(range.startTs).toBe(now - 7 * 86400000);
  });

  it('computes natural-day bounds for custom ranges', () => {
    const start = dayjs('2026-11-10').startOf('day').valueOf();
    const end = dayjs('2026-11-12').startOf('day').valueOf();
    const bounds = auditLogDayRangeBounds(start, end);
    expect(bounds.startTs).toBe(start);
    expect(bounds.endTs).toBe(dayjs('2026-11-13').startOf('day').valueOf() - 1);
    expect(auditLogCustomRangeLabel(start, end)).toBe('2026-11-10 -> 2026-11-12');
  });

  it('builds params per category, with time requiring both values', () => {
    const filters: AuditLogActiveFilter[] = [
      { category: 'time', value: { key: 'last7days', label: 'Last 7 days', startTs: 100, endTs: 200 } },
      { category: 'user', value: { key: 'alice', label: 'Alice' } },
      { category: 'entityType', value: { key: 'table', label: 'Table' } },
    ];
    expect(buildParamsFromFilters(filters)).toEqual({
      startTs: 100,
      endTs: 200,
      userName: 'alice',
      actorType: 'USER',
      entityType: 'table',
    });
    expect(
      buildParamsFromFilters([{ category: 'time', value: { key: 'x', label: 'x', startTs: 100 } }]),
    ).toEqual({});
  });

  it('lets a later user/bot filter overwrite an earlier one, pin order', () => {
    const filters: AuditLogActiveFilter[] = [
      { category: 'user', value: { key: 'alice', label: 'Alice' } },
      { category: 'bot', value: { key: 'ingest-bot', label: 'Ingest Bot' } },
    ];
    expect(buildParamsFromFilters(filters)).toEqual({ userName: 'ingest-bot', actorType: 'BOT' });
  });

  it('carries the 43 pin entity types in order', () => {
    expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS).toHaveLength(43);
    expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS.map((row) => row.value)).toEqual([
      'table',
      'topic',
      'dashboard',
      'pipeline',
      'mlmodel',
      'container',
      'searchIndex',
      'storedProcedure',
      'dashboardDataModel',
      'chart',
      'database',
      'databaseSchema',
      'query',
      'apiCollection',
      'apiEndpoint',
      'metric',
      'glossary',
      'glossaryTerm',
      'classification',
      'tag',
      'domain',
      'dataProduct',
      'user',
      'team',
      'bot',
      'persona',
      'role',
      'policy',
      'databaseService',
      'messagingService',
      'dashboardService',
      'pipelineService',
      'mlmodelService',
      'storageService',
      'searchService',
      'apiService',
      'metadataService',
      'ingestionPipeline',
      'testSuite',
      'testCase',
      'eventsubscription',
      'app',
      'kpi',
    ]);
    expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS[4]).toEqual({ label: 'ML Model', value: 'mlmodel' });
    expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS[41]).toEqual({ label: 'Application', value: 'app' });
  });

  it('builds the isBot term filter with a string value', () => {
    expect(JSON.parse(auditLogUserSearchQueryFilter(false))).toEqual({
      query: { bool: { must: [{ term: { isBot: 'false' } }] } },
    });
    expect(JSON.parse(auditLogUserSearchQueryFilter(true)).query.bool.must[0].term.isBot).toBe('true');
  });
});
