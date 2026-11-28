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
import { bytesToSize } from '@/components/shared/fileNode';
import type { TableProfile } from '@/types/quality';

/** Official constants.ts PAGE_SIZE_LARGE, used by ColumnProfileTable. */
export const PAGE_SIZE_LARGE = 50;

/** Official ColumnProfileTable search debounce (Searchbar typingInterval). */
export const COLUMN_PROFILE_SEARCH_INTERVAL_MS = 500;

export interface ColumnTagRef {
  tagFQN: string;
  source?: string;
}

export interface ColumnCustomMetricDef {
  name: string;
  expression?: string;
}

export interface ColumnProfileStats {
  nullProportion?: number;
  uniqueProportion?: number;
  distinctProportion?: number;
  valuesCount?: number;
  nullCount?: number;
  uniqueCount?: number;
  distinctCount?: number;
  min?: string;
  max?: string;
  mean?: string;
  sum?: number;
  median?: number;
  firstQuartile?: number;
  thirdQuartile?: number;
  interQuartileRange?: number;
}

export interface ColumnProfileRecord {
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  dataType?: string;
  dataTypeDisplay?: string;
  description?: string;
  tags?: ColumnTagRef[];
  customMetrics?: ColumnCustomMetricDef[];
  profile?: ColumnProfileStats;
  children?: ColumnProfileRecord[];
}

export interface OverallTableSummaryItem {
  title: string;
  key: string;
  value: string;
  extra?: string;
}

/**
 * Official TablePureUtils.pruneEmptyChildren: drop empty children arrays
 * recursively so expand chevrons only appear when a descendant remains.
 */
export function pruneEmptyChildren(columns: ColumnProfileRecord[]): ColumnProfileRecord[] {
  return columns.map((column) => {
    if (!column.children || column.children.length === 0) {
      const { children: _dropped, ...rest } = column;
      return rest;
    }
    const prunedChildren = pruneEmptyChildren(column.children);
    if (prunedChildren.length === 0) {
      const { children: _dropped, ...rest } = column;
      return rest;
    }
    return { ...column, children: prunedChildren };
  });
}

/**
 * Official NumberUtils.calculatePercentage. Column Profile passes the
 * stored 0-1 proportion as the numerator and `1` as the denominator,
 * with precision 2 and format true, so 0.25 becomes "25%".
 */
export function calculatePercentage(
  numerator: number,
  denominator: number,
  precision = 1,
  format = false,
): number | string {
  if (denominator === 0) {
    return format ? '0%' : 0;
  }
  const factor = 10 ** precision;
  const percentageValue = Math.round((numerator / denominator) * 100 * factor) / factor;
  if (format) {
    return `${parseFloat(percentageValue.toFixed(precision))}%`;
  }
  return percentageValue;
}

export function formatProportion(value: number | undefined | null): string {
  if (value === undefined || value === null) {
    return '--';
  }
  return String(calculatePercentage(value, 1, 2, true));
}

export function formatNumberWithComma(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function entityDisplayName(record: Pick<ColumnProfileRecord, 'name' | 'displayName'>): string {
  return record.displayName || record.name;
}

/** Official Luxon DateTime.DATE_MED in UTC, or '--' when missing. */
export function formatDateMedUtc(value: string | undefined): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Official Luxon DateTime.DATETIME_MED in local time. */
export function formatDateTimeMed(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) {
    return undefined;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Official TableProfilerProvider.getProfileSampleValue.
 */
export function getProfileSampleValue(
  profile: Pick<TableProfile, 'profileSample' | 'profileSampleType'> | undefined,
  labels: { row: string; rowPlural: string },
): string {
  if (profile?.profileSampleType === 'Percentage') {
    return `${profile.profileSample ?? 100}%`;
  }
  if (profile?.profileSampleType === 'Rows') {
    const type = profile.profileSampleType ?? '';
    const unit = type.toString().length > 1 ? labels.rowPlural : labels.row;
    return `${profile.profileSample} ${unit} `;
  }
  return '100%';
}

/**
 * Official TableProfilerProvider.overallSummary: five cards built from
 * tableProfiler.profile (row count, column count, sample, size, created date).
 */
export function buildOverallSummary(
  profile: TableProfile | null | undefined,
  t: (key: string, values?: Record<string, string>) => string,
  columnFallback = 0,
): OverallTableSummaryItem[] {
  return [
    {
      title: t('label.entity-count', { entity: t('label.row') }),
      key: 'row-count',
      value: formatNumberWithComma(profile?.rowCount ?? 0),
    },
    {
      title: t('label.column-entity', { entity: t('label.count') }),
      key: 'column-count',
      value: formatNumberWithComma(profile?.columnCount ?? columnFallback),
    },
    {
      title: t('label.profile-sample-type', { type: '' }),
      key: 'profile-sample-type',
      value: getProfileSampleValue(profile ?? undefined, {
        row: t('label.row'),
        rowPlural: t('label.row-plural'),
      }),
    },
    {
      title: t('label.size'),
      key: 'size',
      value: bytesToSize(profile?.sizeInByte ?? 0),
    },
    {
      title: t('label.created-date'),
      key: 'created-date',
      value: formatDateMedUtc(profile?.createDateTime),
      extra: formatDateTimeMed(profile?.timestamp)
        ? `${t('label.last-updated')}: ${formatDateTimeMed(profile?.timestamp)}`
        : undefined,
    },
  ];
}

export interface FlatColumnRow {
  id: string;
  record: ColumnProfileRecord;
  depth: number;
  hasChildren: boolean;
}

export function flattenColumnRows(
  rows: ColumnProfileRecord[],
  expandedKeys: Set<string>,
  depth = 0,
): FlatColumnRow[] {
  const result: FlatColumnRow[] = [];
  for (const row of rows) {
    const children = pruneEmptyChildren(row.children ?? []);
    const hasChildren = children.length > 0;
    const id = row.fullyQualifiedName ?? row.name;
    result.push({ id, record: row, depth, hasChildren });
    if (hasChildren && expandedKeys.has(id)) {
      result.push(...flattenColumnRows(children, expandedKeys, depth + 1));
    }
  }
  return result;
}

type SortDirection = 'ascend' | 'descend';

export function sortColumnRecords(
  data: ColumnProfileRecord[],
  column: string | undefined,
  direction: SortDirection | undefined,
): ColumnProfileRecord[] {
  if (!column) {
    return data;
  }
  const comparators: Record<string, (a: ColumnProfileRecord, b: ColumnProfileRecord) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    dataType: (a, b) => (a.dataType ?? '').localeCompare(b.dataType ?? ''),
    nullProportion: (a, b) => (a.profile?.nullProportion || 0) - (b.profile?.nullProportion || 0),
    uniqueProportion: (a, b) => (a.profile?.uniqueProportion || 0) - (b.profile?.uniqueProportion || 0),
    distinctProportion: (a, b) =>
      (a.profile?.distinctProportion || 0) - (b.profile?.distinctProportion || 0),
    valuesCount: (a, b) => (a.profile?.valuesCount || 0) - (b.profile?.valuesCount || 0),
  };
  const comparator = comparators[column];
  const sorted = comparator ? [...data].sort(comparator) : [...data];
  return direction === 'descend' ? sorted.reverse() : sorted;
}

function mapTags(value: unknown): ColumnTagRef[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value.flatMap((item) => {
    const rec = asRecord(item);
    const tagFQN = rec ? asString(rec.tagFQN) || asString(rec.tagFQN) : '';
    const fqn = rec ? asString(rec.tagFQN) || asString(rec.fullyQualifiedName) : '';
    return fqn ? [{ tagFQN: fqn, source: rec ? asString(rec.source) || undefined : undefined }] : [];
  });
  return tags.length ? tags : undefined;
}

function mapCustomMetricDefs(value: unknown): ColumnCustomMetricDef[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const metrics = value.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : '';
    return name ? [{ name, expression: rec ? asString(rec.expression) || undefined : undefined }] : [];
  });
  return metrics.length ? metrics : undefined;
}

function mapStats(raw: Record<string, unknown> | undefined): ColumnProfileStats | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    nullProportion: asNumber(raw.nullProportion),
    uniqueProportion: asNumber(raw.uniqueProportion),
    distinctProportion: asNumber(raw.distinctProportion),
    valuesCount: asNumber(raw.valuesCount),
    nullCount: asNumber(raw.nullCount),
    uniqueCount: asNumber(raw.uniqueCount),
    distinctCount: asNumber(raw.distinctCount),
    min: raw.min === undefined || raw.min === null ? undefined : String(raw.min),
    max: raw.max === undefined || raw.max === null ? undefined : String(raw.max),
    mean: raw.mean === undefined || raw.mean === null ? undefined : String(raw.mean),
    sum: asNumber(raw.sum),
    median: asNumber(raw.median),
    firstQuartile: asNumber(raw.firstQuartile),
    thirdQuartile: asNumber(raw.thirdQuartile),
    interQuartileRange: asNumber(raw.interQuartileRange),
  };
}

/** Map official GET /tables/name/{fqn}/columns?fields=profile rows. */
export function mapColumnProfileRecord(raw: unknown): ColumnProfileRecord | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const name = asString(rec.name);
  if (!name) {
    return null;
  }
  const children = Array.isArray(rec.children)
    ? rec.children.flatMap((child) => {
        const mapped = mapColumnProfileRecord(child);
        return mapped ? [mapped] : [];
      })
    : undefined;
  const profileRec = asRecord(rec.profile);
  return {
    name,
    displayName: asString(rec.displayName) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    dataType: asString(rec.dataType) || undefined,
    dataTypeDisplay: asString(rec.dataTypeDisplay) || undefined,
    description: asString(rec.description) || undefined,
    tags: mapTags(rec.tags),
    customMetrics: mapCustomMetricDefs(rec.customMetrics),
    profile: mapStats(profileRec),
    children,
  };
}
