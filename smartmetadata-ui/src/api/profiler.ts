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
import type { ColumnProfile, TableProfile, TableSampleData, TopicSampleData } from '@/types/quality';
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
    nullCount: asNumber(profile.nullCount),
    uniqueCount: asNumber(profile.uniqueCount),
    distinctCount: asNumber(profile.distinctCount),
    min: profile.min === undefined || profile.min === null ? undefined : stringifyCell(profile.min),
    max: profile.max === undefined || profile.max === null ? undefined : stringifyCell(profile.max),
    mean: profile.mean === undefined || profile.mean === null ? undefined : stringifyCell(profile.mean),
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

function mapTableProfile(raw: Record<string, unknown>): TableProfile | null {
  const profile = asRecord(raw.profile) ?? raw;
  const timestamp = asNumber(profile.timestamp) ?? asNumber(raw.timestamp);
  const rowCount = asNumber(profile.rowCount) ?? asNumber(raw.rowCount);
  const columnCount = asNumber(profile.columnCount) ?? asNumber(raw.columnCount);
  if (timestamp === undefined && rowCount === undefined && columnCount === undefined) {
    return null;
  }
  return { timestamp, rowCount, columnCount, columns: [] };
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
    timestamp: asNumber(profile.timestamp),
    rowCount: asNumber(profile.rowCount),
    columnCount: asNumber(profile.columnCount),
    columns,
  };
}
