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
  averageIncidentTime,
  buildIncidentStatusQuery,
  formatDuration,
  latestIncidentCount,
} from './incidentMetrics';

describe('incidentMetrics', () => {
  it('builds the official New-incident status query', () => {
    const query = JSON.parse(buildIncidentStatusQuery('New', { startTs: 1, endTs: 2 }));
    expect(query.query.bool.must[0].term.testCaseResolutionStatusType).toBe('New');
    expect(query.query.bool.must[1].range.timestamp).toEqual({ lte: 2, gte: 1 });
  });

  it('reads the latest cardinality as the open/resolved count and formats empty times as --', () => {
    expect(latestIncidentCount([])).toBe(0);
    expect(
      latestIncidentCount([
        { timestamp: '10', stateId: '2' },
        { timestamp: '20', stateId: '5' },
      ]),
    ).toBe(5);
    expect(formatDuration(undefined)).toBe('--');
    expect(formatDuration(0)).toBe('--');
    expect(formatDuration(90_000)).toBe('2m');
    expect(averageIncidentTime([{ 'metrics.value': '100' }, { 'metrics.value': '300' }])).toBe(200);
  });
});
