/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Official incident-metrics widgets (dataQualityDashboardAPI.ts
 * fetchCountOfIncidentStatusTypeByDays / fetchIncidentTimeMetrics).
 */
import {
  getDataQualityReportBatch,
  type DataQualityReportRequestItem,
  type DataQualityReportRow,
} from '@/api/dataQualityReports';

export const DQ_INCIDENT_STATUS_INDEX = 'testCaseResolutionStatus';
export const DQ_INCIDENT_STATUS_AGGREGATION =
  'bucketName=byDay:aggType=date_histogram:field=timestamp&calendar_interval=day,bucketName=newIncidents:aggType=cardinality:field=stateId';
export const DQ_INCIDENT_TIME_AGGREGATION =
  'bucketName=byDay:aggType=date_histogram:field=timestamp&calendar_interval=day,bucketName=metrics:aggType=nested:path=metrics,bucketName=byName:aggType=terms:field=metrics.name.keyword,bucketName=avgValue:aggType=avg:field=metrics.value';

export const INCIDENT_TIME_METRICS = {
  TIME_TO_RESPONSE: 'timeToResponse',
  TIME_TO_RESOLUTION: 'timeToResolution',
} as const;

export interface IncidentMetricRange {
  startTs: number;
  endTs: number;
}

export interface IncidentStatusPoint {
  timestamp: number;
  count: number;
}

export interface IncidentTimePoint {
  timestamp: number;
  value: number;
}

export function buildIncidentStatusQuery(status: string, range: IncidentMetricRange): string {
  return JSON.stringify({
    query: {
      bool: {
        must: [
          { term: { testCaseResolutionStatusType: status } },
          { range: { timestamp: { lte: range.endTs, gte: range.startTs } } },
        ],
      },
    },
  });
}

export function buildIncidentTimeQuery(metricName: string, range: IncidentMetricRange): string {
  return JSON.stringify({
    query: {
      bool: {
        must: [
          { range: { timestamp: { lte: range.endTs, gte: range.startTs } } },
          {
            nested: {
              path: 'metrics',
              query: { bool: { must: [{ match: { 'metrics.name.keyword': metricName } }] } },
            },
          },
        ],
      },
    },
  });
}

function numericField(value: string | undefined): number {
  // Official report rows are stringly-typed; reportCount/asNumber only
  // accepts already-numeric values, so cardinality like "5" must be parsed here.
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function latestIncidentCount(rows: DataQualityReportRow[]): number {
  if (!rows.length) {
    return 0;
  }
  const sorted = [...rows].sort((a, b) => Number(a.timestamp ?? a.byDay ?? 0) - Number(b.timestamp ?? b.byDay ?? 0));
  const last = sorted[sorted.length - 1];
  return numericField(last.stateId ?? last.newIncidents ?? last.document_count);
}

export function averageIncidentTime(rows: DataQualityReportRow[]): number | undefined {
  const values = rows
    .map((row) => Number(row['metrics.value'] ?? row.avgValue ?? row.value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) {
    return '--';
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export async function loadIncidentMetrics(range: IncidentMetricRange): Promise<{
  open: number;
  resolved: number;
  responseTime: string;
  resolutionTime: string;
}> {
  const items: DataQualityReportRequestItem[] = [
    {
      key: 'open',
      index: DQ_INCIDENT_STATUS_INDEX,
      aggregationQuery: DQ_INCIDENT_STATUS_AGGREGATION,
      q: buildIncidentStatusQuery('New', range),
    },
    {
      key: 'resolved',
      index: DQ_INCIDENT_STATUS_INDEX,
      aggregationQuery: DQ_INCIDENT_STATUS_AGGREGATION,
      q: buildIncidentStatusQuery('Resolved', range),
    },
    {
      key: 'response',
      index: DQ_INCIDENT_STATUS_INDEX,
      aggregationQuery: DQ_INCIDENT_TIME_AGGREGATION,
      q: buildIncidentTimeQuery(INCIDENT_TIME_METRICS.TIME_TO_RESPONSE, range),
    },
    {
      key: 'resolution',
      index: DQ_INCIDENT_STATUS_INDEX,
      aggregationQuery: DQ_INCIDENT_TIME_AGGREGATION,
      q: buildIncidentTimeQuery(INCIDENT_TIME_METRICS.TIME_TO_RESOLUTION, range),
    },
  ];
  const reports = await getDataQualityReportBatch(items);
  return {
    open: latestIncidentCount(reports.get('open')?.data ?? []),
    resolved: latestIncidentCount(reports.get('resolved')?.data ?? []),
    responseTime: formatDuration(averageIncidentTime(reports.get('response')?.data ?? [])),
    resolutionTime: formatDuration(averageIncidentTime(reports.get('resolution')?.data ?? [])),
  };
}
