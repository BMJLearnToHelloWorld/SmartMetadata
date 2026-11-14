/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type { TableProfilerConfig } from '@/quality/profilerSettings';
import type {
  CardinalityDistribution,
  ColumnProfile,
  CustomMetricValue,
  ExecutionSource,
  ProfileHistogram,
  TableProfile,
  TableSampleData,
  TopicSampleData,
} from '@/types/quality';
import { apiRequest } from './client';

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mapSampleRows(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((row) => {
    if (Array.isArray(row)) {
      return row.map(stringifyCell);
    }
    const rec = asRecord(row);
    return rec ? Object.values(rec).map(stringifyCell) : [stringifyCell(row)];
  });
}

function mapExecutionSource(value: unknown): ExecutionSource | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const source: ExecutionSource = {
    databaseName: asString(rec.databaseName) || undefined,
    schemaName: asString(rec.schemaName) || undefined,
    tableName: asString(rec.tableName) || undefined,
  };
  return source.databaseName || source.schemaName || source.tableName ? source : undefined;
}

function mapCustomMetrics(value: unknown): CustomMetricValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const metrics = value.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : '';
    return name ? [{ name, value: rec ? asNumber(rec.value) : undefined }] : [];
  });
  return metrics.length ? metrics : undefined;
}

function mapHistogram(value: unknown): ProfileHistogram | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const boundaries = Array.isArray(rec.boundaries)
    ? rec.boundaries.map(stringifyCell)
    : [];
  const frequencies = Array.isArray(rec.frequencies)
    ? rec.frequencies.flatMap((item) => {
        const n = asNumber(item);
        return n === undefined ? [] : [n];
      })
    : [];
  return boundaries.length || frequencies.length ? { boundaries, frequencies } : undefined;
}

function mapCardinalityDistribution(value: unknown): CardinalityDistribution | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  if (rec.allValuesUnique === true) {
    return { allValuesUnique: true };
  }
  const counts = Array.isArray(rec.counts)
    ? rec.counts.flatMap((item) => {
        const n = asNumber(item);
        return n === undefined ? [] : [n];
      })
    : undefined;
  const percentages = Array.isArray(rec.percentages)
    ? rec.percentages.flatMap((item) => {
        const n = asNumber(item);
        return n === undefined ? [] : [n];
      })
    : undefined;
  const categories = Array.isArray(rec.categories) ? [...rec.categories] : undefined;
  return categories || counts || percentages
    ? { categories, counts, percentages }
    : undefined;
}

function mapScalar(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : stringifyCell(value);
}

function mapColumnProfile(raw: Record<string, unknown>, fallbackName = ''): ColumnProfile | null {
  const profile = asRecord(raw.profile) ?? raw;
  const name = asString(raw.name) || fallbackName;
  if (!name && !asRecord(raw.profile)) {
    return null;
  }
  if (!name) {
    return null;
  }
  return {
    name,
    timestamp: asNumber(profile.timestamp),
    executionSource: mapExecutionSource(profile.executionSource),
    nullCount: asNumber(profile.nullCount),
    uniqueCount: asNumber(profile.uniqueCount),
    distinctCount: asNumber(profile.distinctCount),
    min: mapScalar(profile.min),
    max: mapScalar(profile.max),
    mean: mapScalar(profile.mean),
    valuesCount: asNumber(profile.valuesCount),
    countInSet: asNumber(profile.countInSet),
    likeCount: asNumber(profile.likeCount),
    iLikeCount: asNumber(profile.iLikeCount),
    notLikeCount: asNumber(profile.notLikeCount),
    regexCount: asNumber(profile.regexCount),
    notRegexCount: asNumber(profile.notRegexCount),
    maxLength: asNumber(profile.maxLength),
    minLength: asNumber(profile.minLength),
    stddev: asNumber(profile.stddev),
    sum: asNumber(profile.sum),
    nullMissingCount: asNumber(profile.nullMissingCount),
    distinctProportion: asNumber(profile.distinctProportion),
    uniqueProportion: asNumber(profile.uniqueProportion),
    nullProportion: asNumber(profile.nullProportion),
    duplicateCount: asNumber(profile.duplicateCount),
    likeRatio: asNumber(profile.likeRatio),
    iLikeRatio: asNumber(profile.iLikeRatio),
    median: asNumber(profile.median),
    firstQuartile: asNumber(profile.firstQuartile),
    thirdQuartile: asNumber(profile.thirdQuartile),
    interQuartileRange: asNumber(profile.interQuartileRange),
    nonParametricSkew: asNumber(profile.nonParametricSkew),
    histogram: mapHistogram(profile.histogram),
    cardinalityDistribution: mapCardinalityDistribution(profile.cardinalityDistribution),
    customMetrics: mapCustomMetrics(profile.customMetrics),
  };
}

export async function getTableSampleData(id: string): Promise<TableSampleData> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tables/${encodeURIComponent(id)}/sampleData`);
  const sample = asRecord(raw.sampleData) ?? raw;
  const columns = Array.isArray(sample.columns)
    ? sample.columns.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    columns,
    rows: mapSampleRows(sample.rows),
  };
}

export async function getTopicSampleData(id: string): Promise<TopicSampleData> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/topics/${encodeURIComponent(id)}/sampleData`);
  const sample = asRecord(raw.sampleData) ?? raw;
  const messages = Array.isArray(sample.messages)
    ? sample.messages.map(stringifyCell)
    : [];
  return { messages };
}

function mapTableProfileFields(profile: Record<string, unknown>): Omit<TableProfile, 'columns'> {
  return {
    timestamp: asNumber(profile.timestamp),
    rowCount: asNumber(profile.rowCount),
    columnCount: asNumber(profile.columnCount),
    sizeInByte: asNumber(profile.sizeInByte),
    createDateTime: asString(profile.createDateTime) || undefined,
    profileSample: asNumber(profile.profileSample),
    profileSampleType: asString(profile.profileSampleType) || undefined,
    executionSource: mapExecutionSource(profile.executionSource),
    customMetrics: mapCustomMetrics(profile.customMetrics),
  };
}

function mapTableProfile(raw: Record<string, unknown>): TableProfile | null {
  const profile = asRecord(raw.profile) ?? raw;
  const fields = mapTableProfileFields(profile);
  const timestamp = fields.timestamp ?? asNumber(raw.timestamp);
  const rowCount = fields.rowCount ?? asNumber(raw.rowCount);
  const columnCount = fields.columnCount ?? asNumber(raw.columnCount);
  if (timestamp === undefined && rowCount === undefined && columnCount === undefined) {
    return null;
  }
  return { ...fields, timestamp, rowCount, columnCount, columns: [] };
}

export async function getTableProfilerConfig(id: string): Promise<TableProfilerConfig | null> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/tables/${encodeURIComponent(id)}/tableProfilerConfig`,
  );
  const config = asRecord(raw.tableProfilerConfig);
  return config ? (config as unknown as TableProfilerConfig) : null;
}

export async function putTableProfilerConfig(
  id: string,
  config: TableProfilerConfig,
): Promise<void> {
  await apiRequest(`/v1/tables/${encodeURIComponent(id)}/tableProfilerConfig`, {
    method: 'PUT',
    json: config,
  });
}

export async function listTableProfiles(
  fqn: string,
  startTs: number,
  endTs: number,
): Promise<TableProfile[]> {
  const raw = await apiRequest<unknown>(`/v1/tables/${encodeURIComponent(fqn)}/tableProfile`, {
    query: { startTs, endTs },
  });
  return parsePaged(raw, mapTableProfile).data;
}

export async function getLatestTableProfile(fqn: string): Promise<TableProfile> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/tables/${encodeURIComponent(fqn)}/tableProfile/latest`,
    { query: { includeColumnProfile: true } },
  );
  const profile = asRecord(raw.profile) ?? {};
  const columns = Array.isArray(raw.columns)
    ? raw.columns.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const mapped = mapColumnProfile(rec);
        return mapped ? [mapped] : [];
      })
    : [];
  return {
    ...mapTableProfileFields(profile),
    columns,
  };
}
