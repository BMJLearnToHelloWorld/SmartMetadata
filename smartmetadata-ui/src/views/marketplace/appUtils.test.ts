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
  buildSyntheticRunRecord,
  canStopAppRun,
  formatDateTimeWithTimezone,
  formatDurationToHHMMSS,
  formatJsonString,
  formatLatencyAverage,
  formatThroughput,
  getAppCronExpression,
  getAppRunFailureLogs,
  getEntityName,
  getEntityStatsData,
  getScheduleOptionsForApp,
  getStatusTypeForApplication,
  hasAppRunStats,
  isAppUnavailable,
  isCacheWarmupApplication,
  isMcpApplication,
  isRuntimeDisabled,
  kebabCase,
  resolveStatusBadgeColor,
  runRowId,
  showLogAction,
  statusBadgeIconKey,
} from './appUtils';

describe('appUtils', () => {
  it('resolves entity names as displayName || name || empty', () => {
    expect(getEntityName({ name: 'n', displayName: 'D' })).toBe('D');
    expect(getEntityName({ name: 'n' })).toBe('n');
    expect(getEntityName(undefined)).toBe('');
  });

  it('reads cron expressions only from the object schedule form', () => {
    expect(getAppCronExpression({ cronExpression: '0 0 * * *' })).toBe('0 0 * * *');
    expect(getAppCronExpression({ scheduleTimeline: 'None' })).toBeUndefined();
    expect(getAppCronExpression(undefined)).toBeUndefined();
    expect(getAppCronExpression(null)).toBeUndefined();
  });

  it('matches app names exactly for cache-warmup and MCP predicates', () => {
    expect(isCacheWarmupApplication('CacheWarmupApplication')).toBe(true);
    expect(isCacheWarmupApplication('CacheWarmup')).toBe(false);
    expect(isCacheWarmupApplication(undefined)).toBe(false);
    expect(isMcpApplication('McpApplication')).toBe(true);
    expect(isMcpApplication('MCPApplication')).toBe(false);
  });

  it('computes runtime-disabled and unavailable exactly as AppDetails', () => {
    expect(isRuntimeDisabled({ enabled: false, deleted: false })).toBe(true);
    expect(isRuntimeDisabled({ enabled: false, deleted: true })).toBe(false);
    expect(isRuntimeDisabled({ enabled: true })).toBe(false);
    expect(isRuntimeDisabled({})).toBe(false);
    expect(isAppUnavailable({ enabled: false, deleted: false })).toBe(true);
    expect(isAppUnavailable({ deleted: true })).toBe(true);
    expect(isAppUnavailable({ enabled: true })).toBe(false);
  });

  it('maps run statuses per the pin table with Stopped as the default', () => {
    expect(getStatusTypeForApplication('failed')).toBe('failure');
    expect(getStatusTypeForApplication('success')).toBe('success');
    expect(getStatusTypeForApplication('active')).toBe('success');
    expect(getStatusTypeForApplication('completed')).toBe('success');
    expect(getStatusTypeForApplication('running')).toBe('running');
    expect(getStatusTypeForApplication('started')).toBe('started');
    expect(getStatusTypeForApplication('pending')).toBe('pending');
    expect(getStatusTypeForApplication('activeError')).toBe('activeError');
    expect(getStatusTypeForApplication('stopped')).toBe('stopped');
    expect(getStatusTypeForApplication('stopInProgress')).toBe('stopped');
    expect(getStatusTypeForApplication('unknown' as never)).toBe('stopped');
  });

  it('formats latency averages with the pin branches', () => {
    expect(formatLatencyAverage(undefined, 10)).toBe('—');
    expect(formatLatencyAverage(100, undefined)).toBe('—');
    expect(formatLatencyAverage(100, 0)).toBe('—');
    expect(formatLatencyAverage(0, 10)).toBe('<1 ms');
    expect(formatLatencyAverage(5, 10)).toBe('<1 ms');
    expect(formatLatencyAverage(150, 10)).toBe('15.0 ms');
    expect(formatLatencyAverage(2500, 1)).toBe('2.50 s');
  });

  it('formats throughput with the pin branches', () => {
    expect(formatThroughput(undefined, 10)).toBe('—');
    expect(formatThroughput(100, 0)).toBe('—');
    expect(formatThroughput(0, 10)).toBe('>10.0k r/s');
    expect(formatThroughput(1000, 500)).toBe('500 r/s');
    expect(formatThroughput(1000, 50)).toBe('50.0 r/s');
    expect(formatThroughput(1000, 2500)).toBe('2.5k r/s');
  });

  it('builds entity stats rows, skipping aggregates and incomplete rows', () => {
    const rows = getEntityStatsData({
      failedRecords: { totalRecords: 1, successRecords: 1, failedRecords: 0 },
      table: {
        totalRecords: 10,
        successRecords: 8,
        failedRecords: 2,
        readerTimeMs: 80,
        vectorSuccessRecords: 4,
        vectorTimeMs: 40,
      },
      dashboard: { totalRecords: 5, successRecords: 5, failedRecords: 0 },
      broken: { totalRecords: 1 },
    });
    expect(rows.map((row) => row.name)).toEqual(['Dashboard', 'Table']);
    const table = rows.find((row) => row.name === 'Table');
    expect(table?.vectorEmbeddings).toBe(4);
    expect(table?.readerAvgMs).toBe('10.0 ms');
    expect(table?.vectorAvgMs).toBe('10.0 ms');
    const dashboard = rows.find((row) => row.name === 'Dashboard');
    expect(dashboard?.vectorEmbeddings).toBe(0);
    expect(dashboard?.readerAvgMs).toBe('—');
  });

  it('formats JSON strings recursively and returns bad input verbatim', () => {
    expect(formatJsonString('{"a": 1, "b": {"c": "x"}}')).toBe('[a]: 1\n[b]:\n  [c]: x\n');
    expect(formatJsonString('not json')).toBe('not json');
    expect(formatJsonString('{}')).toBe('');
  });

  it('derives failure logs from stackTrace, then failure, then empty', () => {
    // Pin formatJsonString iterates Object.entries of the parsed value, so
    // a plain string stackTrace renders as a per-character dump. Keep the
    // quirk: the port must match pin, not improve on it.
    expect(
      getAppRunFailureLogs({
        failureContext: { stackTrace: 'trace', failure: { message: 'm' } },
      }),
    ).toBe('[0]: t\n[1]: r\n[2]: a\n[3]: c\n[4]: e\n');
    expect(getAppRunFailureLogs({ failureContext: { failure: { message: 'm' } } })).toBe(
      '[message]: m\n',
    );
    expect(getAppRunFailureLogs({})).toBe('');
  });

  it('detects stats content per hasAppRunStats', () => {
    expect(hasAppRunStats({})).toBe(false);
    expect(hasAppRunStats({ successContext: { stats: { jobStats: { totalRecords: 1 } } } })).toBe(
      true,
    );
    expect(hasAppRunStats({ failureContext: { stats: {} } })).toBe(false);
    // Pin tests block presence (truthiness), not content: an empty block object counts.
    expect(hasAppRunStats({ failureContext: { stats: { readerStats: {} } } })).toBe(true);
    expect(
      hasAppRunStats({ successContext: { serverStats: { s1: { processedRecords: 1 } } } }),
    ).toBe(true);
    expect(hasAppRunStats({ successContext: { serverStats: {} } })).toBe(false);
  });

  it('formats durations as ms below a second and HH:MM:SS above', () => {
    expect(formatDurationToHHMMSS(500)).toBe('500 ms');
    expect(formatDurationToHHMMSS(0)).toBe('00:00:00');
    expect(formatDurationToHHMMSS(1000)).toBe('00:00:01');
    expect(formatDurationToHHMMSS(3661000)).toBe('01:01:01');
    expect(formatDurationToHHMMSS(90061000)).toBe('25:01:01');
  });

  it('formats timestamps with timezone text and handles nil', () => {
    const text = formatDateTimeWithTimezone(1700000000000, 'en-US');
    expect(text).toContain('2023');
    expect(formatDateTimeWithTimezone(undefined as never)).toBe('');
  });

  it('derives schedule options with the pin precedence', () => {
    expect(getScheduleOptionsForApp('DataInsightsReportApplication', 'internal', ['hour'])).toEqual([
      'week',
    ]);
    expect(getScheduleOptionsForApp('RdfIndexApp', 'external', ['hour'])).toEqual(['day']);
    expect(getScheduleOptionsForApp('SearchIndexingApplication', 'internal', undefined)).toBeUndefined();
    // pipelineSchedules carry schedule names (hourly/daily/...), mapped to periods.
    expect(
      getScheduleOptionsForApp('SearchIndexingApplication', 'internal', ['daily', 'weekly']),
    ).toEqual(['day', 'week']);
  });

  it('synthesizes run row ids and the current-config row', () => {
    expect(runRowId({ appId: 'a', runType: 'manual', timestamp: 5 })).toBe('a-manual-5');
    const synthetic = buildSyntheticRunRecord({
      id: 'a1',
      name: 'SearchIndexingApplication',
      appConfiguration: { batchSize: 10 },
    });
    expect(synthetic.id).toBe('a1-current-config');
    expect(synthetic.isSynthetic).toBe(true);
    expect(synthetic.config).toEqual({ batchSize: 10 });
  });

  it('applies the showLogAction disable rules', () => {
    expect(showLogAction({ id: 'x', isSynthetic: true }, false)).toBe(true);
    expect(showLogAction({ id: 'x' }, true)).toBe(false);
    expect(showLogAction({ id: 'x', status: 'success', successContext: null }, false)).toBe(true);
    expect(
      showLogAction({ id: 'x', status: 'success', successContext: { stats: {} } }, false),
    ).toBe(false);
    expect(showLogAction({ id: 'x', status: 'success' }, false)).toBe(false);
    expect(showLogAction({ id: 'x', status: 'failed' }, false)).toBe(false);
  });

  it('resolves StatusBadge icons from the label, exact then lowercased', () => {
    expect(statusBadgeIconKey('Success')).toBe('success');
    expect(statusBadgeIconKey('Failed')).toBe('failed');
    expect(statusBadgeIconKey('activeError')).toBe('activeError');
    expect(statusBadgeIconKey('Active With Error')).toBeUndefined();
    expect(statusBadgeIconKey('Stop In Progress')).toBeUndefined();
    expect(statusBadgeIconKey('')).toBeUndefined();
  });

  it('resolves StatusBadge colors with the failed alias and gray default', () => {
    expect(resolveStatusBadgeColor('success')).toBe('success');
    expect(resolveStatusBadgeColor('failed')).toBe('error');
    expect(resolveStatusBadgeColor('running')).toBe('brand');
    expect(resolveStatusBadgeColor('nope')).toBe('gray');
  });

  it('kebab-cases app names for card testids', () => {
    expect(kebabCase('SearchIndexingApplication')).toBe('search-indexing-application');
    expect(kebabCase('McpApplication')).toBe('mcp-application');
    expect(kebabCase('My App')).toBe('my-app');
  });

  it('gates the Stop action on synthetic, terminal, and supportsInterrupt', () => {
    expect(canStopAppRun({ id: 'x', status: 'running' }, true)).toBe(true);
    expect(canStopAppRun({ id: 'x', status: 'running' }, false)).toBe(false);
    expect(canStopAppRun({ id: 'x', status: 'success' }, true)).toBe(false);
    expect(canStopAppRun({ id: 'x', status: 'stopInProgress' }, true)).toBe(false);
    expect(canStopAppRun({ id: 'x', status: 'running', isSynthetic: true }, true)).toBe(false);
    expect(canStopAppRun({ id: 'x' }, true)).toBe(true);
  });
});
