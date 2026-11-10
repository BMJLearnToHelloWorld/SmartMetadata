/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString } from '@/api/json';
import { apiRequest } from './client';

/**
 * Official data-quality report mechanism (openmetadata-ui
 * rest/dataQualityDashboardAPI.ts + rest/dataQualityReportBatcher.ts):
 * the dashboard does NOT page test cases. It POSTs aggregation items to
 * POST /v1/dataQuality/testSuites/dataQualityReport/batch and reads the
 * flattened rows the server builds from the ES aggregation
 * (TestSuiteResource.java /dataQualityReport/batch; the row shape is
 * fixed by SearchIndexUtils.parseAggregationResults: one entry per
 * aggregation dimension holding the bucket key, plus `document_count`
 * for term leaves or the metric value for metric leaves).
 *
 * Batch contract, verified against TestSuiteResource.java:598-606:
 * at most 50 items per POST (the server 400s above that), each item
 * needs key + aggregationQuery + index, and a failed item carries
 * `error` instead of `report` without failing the batch.
 */
export interface DataQualityReportRow {
  [key: string]: string | undefined;
}

export interface DataQualityReport {
  metadata: { keys: string[]; dimensions: string[]; metrics: string[] };
  data: DataQualityReportRow[];
}

export interface DataQualityReportRequestItem {
  key: string;
  index: string;
  aggregationQuery: string;
  q?: string;
  domain?: string;
}

interface BatchResultItem {
  key: string;
  report?: DataQualityReport;
  error?: string;
}

const MAX_BATCH_SIZE = 50;

/** Aggregation queries, verbatim from official dataQualityDashboardAPI.ts. */
export const DQ_STATUS_AGGREGATION =
  'bucketName=status:aggType=terms:field=testCaseResult.testCaseStatus';
export const DQ_DIMENSION_STATUS_AGGREGATION =
  'bucketName=dimension:aggType=terms:field=dataQualityDimensionName,bucketName=status:aggType=terms:field=testCaseResult.testCaseStatus';
export const DQ_COVERED_ASSETS_AGGREGATION =
  'bucketName=entityWithTests:aggType=cardinality:field=originEntityFQN';
export const DQ_TOTAL_TABLES_AGGREGATION =
  'bucketName=count:aggType=cardinality:field=fullyQualifiedName';
/**
 * Official no-dimension query (fetchTestCaseSummaryByNoDimension): the
 * status terms aggregation with a `must_not exists` clause on the
 * dimension field, so dimension-less cases land on the No Dimension card
 * instead of vanishing from the dimension breakdown (terms aggregations
 * only bucket documents that carry the field).
 */
export const DQ_NO_DIMENSION_QUERY = JSON.stringify({
  query: {
    bool: {
      must: [{ term: { deleted: false } }],
      must_not: [{ exists: { field: 'dataQualityDimensionName' } }],
    },
  },
});

export const DQ_TEST_CASE_INDEX = 'testCase';
export const DQ_TABLE_INDEX = 'table';

function mapReport(raw: unknown): DataQualityReport | undefined {
  const rec = asRecord(raw);
  if (!rec) {
    return undefined;
  }
  const metadata = asRecord(rec.metadata);
  const rows = Array.isArray(rec.data) ? rec.data : [];
  const data: DataQualityReportRow[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const mapped: DataQualityReportRow = {};
    for (const [key, value] of Object.entries(row)) {
      const text = asString(value);
      if (text !== '') {
        mapped[key] = text;
      }
    }
    data.push(mapped);
  }
  return {
    metadata: {
      keys: Array.isArray(metadata?.keys)
        ? (metadata?.keys as unknown[]).filter((item): item is string => typeof item === 'string')
        : [],
      dimensions: Array.isArray(metadata?.dimensions)
        ? (metadata?.dimensions as unknown[]).filter((item): item is string => typeof item === 'string')
        : [],
      metrics: Array.isArray(metadata?.metrics)
        ? (metadata?.metrics as unknown[]).filter((item): item is string => typeof item === 'string')
        : [],
    },
    data,
  };
}

async function postBatch(
  items: DataQualityReportRequestItem[],
): Promise<Map<string, DataQualityReport>> {
  const body = {
    requests: items.map((item) => ({
      key: item.key,
      index: item.index,
      aggregationQuery: item.aggregationQuery,
      ...(item.q !== undefined ? { q: item.q } : {}),
      ...(item.domain !== undefined ? { domain: item.domain } : {}),
    })),
  };
  const raw = await apiRequest<unknown>('/v1/dataQuality/testSuites/dataQualityReport/batch', {
    method: 'POST',
    json: body,
  });
  const results = asRecord(raw)?.results;
  const mapped = new Map<string, DataQualityReport>();
  if (Array.isArray(results)) {
    for (const entry of results) {
      const rec = asRecord(entry);
      const key = rec ? asString(rec.key) : '';
      if (!key) {
        continue;
      }
      if (typeof rec?.error === 'string' && rec.error) {
        throw new Error(rec.error);
      }
      const report = mapReport(rec?.report);
      if (report) {
        mapped.set(key, report);
      }
    }
  }
  return mapped;
}

/**
 * One batch POST per 50 items, like the official batcher. Returns reports
 * keyed by the caller's item keys; a missing report or an item-level
 * error rejects, so callers never render a partial dashboard as complete.
 */
export async function getDataQualityReportBatch(
  items: DataQualityReportRequestItem[],
): Promise<Map<string, DataQualityReport>> {
  const merged = new Map<string, DataQualityReport>();
  for (let start = 0; start < items.length; start += MAX_BATCH_SIZE) {
    const chunk = await postBatch(items.slice(start, start + MAX_BATCH_SIZE));
    for (const [key, report] of chunk) {
      merged.set(key, report);
    }
  }
  for (const item of items) {
    if (!merged.has(item.key)) {
      throw new Error(`Data quality report item "${item.key}" returned no report`);
    }
  }
  return merged;
}

/** Parse a `document_count` / metric cell; unparseable cells count as 0, never NaN. */
export function reportCount(value: string | undefined): number {
  const parsed = asNumber(value);
  return parsed === undefined ? 0 : parsed;
}

export interface DataQualityReportQuery {
  q?: string;
  aggregationQuery: string;
  index: string;
  domain?: string;
}

/**
 * Official dataQualityDashboardAPI.getDataQualityReport: the single
 * GET /v1/dataQuality/testSuites/dataQualityReport (aggregationQuery +
 * index required, q optional). The DataQuality widget's table-count
 * query is a single GET, not a batch item — a failure there must not
 * drag the card down (the card isolates it from the count queries).
 */
export async function getDataQualityReport(query: DataQualityReportQuery): Promise<DataQualityReport> {
  const raw = await apiRequest<unknown>('/v1/dataQuality/testSuites/dataQualityReport', {
    query: {
      q: query.q,
      aggregationQuery: query.aggregationQuery,
      index: query.index,
      domain: query.domain,
    },
  });
  const report = mapReport(raw);
  if (!report) {
    throw new Error('Data quality report succeeded but the response had no report');
  }
  return report;
}
