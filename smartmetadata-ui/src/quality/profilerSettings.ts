/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
/**
 * Per-table profiler settings: the pin ProfilerSettingsModal's form shape
 * and conversions, implemented fresh for the fork's modal. The modal edits
 * exactly the surface the pin modal edits (sample type/value, sample data
 * count, profile query, exclude/include columns, partitioning); it does
 * not edit computeTableMetrics/computeColumnMetrics/randomizedSample,
 * and the save replaces the stored config with the converted form, as
 * the pin's does.
 *
 * Data tables (metric options, interval types/units, per-interval column
 * types) mirror the pin's profiler constants; a change is a data change.
 */

export type ProfileSampleType = 'PERCENTAGE' | 'ROWS';

export type PartitionIntervalType =
  | 'INGESTION-TIME'
  | 'TIME-UNIT'
  | 'INTEGER-RANGE'
  | 'COLUMN-VALUE';

export type PartitionIntervalUnit = 'YEAR' | 'MONTH' | 'DAY' | 'HOUR';

export interface ColumnProfilerConfig {
  columnName?: string;
  metrics?: string[];
}

export interface TableProfilerConfig {
  profileSampleConfig?: {
    sampleConfigType: 'STATIC' | 'DYNAMIC';
    config?: {
      profileSample?: number;
      profileSampleType?: ProfileSampleType;
      samplingMethodType?: string;
    };
  };
  sampleDataCount?: number;
  profileQuery?: string;
  excludeColumns?: string[];
  includeColumns?: ColumnProfilerConfig[];
  partitioning?: {
    enablePartitioning?: boolean;
    partitionColumnName?: string;
    partitionIntervalType?: PartitionIntervalType;
    partitionInterval?: number;
    partitionIntervalUnit?: PartitionIntervalUnit;
    partitionIntegerRangeStart?: number;
    partitionIntegerRangeEnd?: number;
    partitionValues?: unknown[];
  };
  computeTableMetrics?: boolean;
  computeColumnMetrics?: boolean;
  randomizedSample?: boolean;
}

export interface ProfilerSettingsValues {
  profileSampleType?: ProfileSampleType;
  profileSamplePercentage: number | null;
  profileSampleRows?: number;
  sampleDataCount?: number;
  profileQuery: string;
  excludeColumns: string[];
  includeColumns: ColumnProfilerConfig[];
  enablePartitioning: boolean;
  partitionIntervalType?: PartitionIntervalType;
  partitionColumnName?: string;
  partitionIntegerRangeStart?: number;
  partitionIntegerRangeEnd?: number;
  partitionInterval?: number;
  partitionIntervalUnit?: PartitionIntervalUnit;
  partitionValues: { value: string }[];
}

/** The pin's metric options for the include-columns metric select. */
export const PROFILER_SETTINGS_METRICS = [
  'valuesCount',
  'valuesPercentage',
  'validCount',
  'duplicateCount',
  'nullCount',
  'nullProportion',
  'missingPercentage',
  'missingCount',
  'uniqueCount',
  'uniqueProportion',
  'distinctCount',
  'distinctProportion',
  'min',
  'max',
  'minLength',
  'maxLength',
  'mean',
  'sum',
  'stddev',
  'variance',
  'median',
  'histogram',
  'customMetricsProfile',
] as const;

/** The 'all' sentinel: the whole column set, or every metric. */
export const PROFILER_ALL = 'all';

/** Minimum profile sample: a 0 sample means "no sampling" downstream. */
export const MIN_PROFILE_SAMPLE = 1;

export const PROFILE_SAMPLE_OPTIONS: { value: ProfileSampleType; labelKey: string }[] = [
  { value: 'PERCENTAGE', labelKey: 'profilerSettings.percentage' },
  { value: 'ROWS', labelKey: 'profilerSettings.rowCount' },
];

export const INTERVAL_TYPE_OPTIONS: PartitionIntervalType[] = [
  'INGESTION-TIME',
  'TIME-UNIT',
  'INTEGER-RANGE',
  'COLUMN-VALUE',
];

export const INTERVAL_UNIT_OPTIONS: PartitionIntervalUnit[] = ['YEAR', 'MONTH', 'DAY', 'HOUR'];

/** Column data types each interval type accepts for its partition column. */
export const SUPPORTED_COLUMN_DATA_TYPE_FOR_INTERVAL: Record<
  PartitionIntervalType,
  readonly string[]
> = {
  'INGESTION-TIME': ['TIMESTAMP', 'DATE', 'DATETIME', 'TIMESTAMPZ'],
  'TIME-UNIT': ['TIMESTAMP', 'DATE', 'DATETIME', 'TIMESTAMPZ'],
  'INTEGER-RANGE': ['INT', 'BIGINT'],
  'COLUMN-VALUE': ['VARCHAR', 'STRING'],
};

export const DEFAULT_INCLUDE_PROFILE: ColumnProfilerConfig[] = [
  { columnName: undefined, metrics: [PROFILER_ALL] },
];

export const DEFAULT_SETTINGS_VALUES: ProfilerSettingsValues = {
  profileSampleType: 'PERCENTAGE',
  profileSamplePercentage: 100,
  sampleDataCount: 50,
  profileQuery: '',
  excludeColumns: [],
  includeColumns: DEFAULT_INCLUDE_PROFILE,
  enablePartitioning: false,
  partitionValues: [],
};

export function cloneSettingsValues(
  values: ProfilerSettingsValues,
): ProfilerSettingsValues {
  return {
    ...values,
    excludeColumns: [...values.excludeColumns],
    includeColumns: values.includeColumns.map((column) => ({
      ...column,
      metrics: column.metrics ? [...column.metrics] : undefined,
    })),
    partitionValues: values.partitionValues.map((entry) => ({ ...entry })),
  };
}

function isDefaultIncludeProfile(columns: ColumnProfilerConfig[]): boolean {
  return (
    columns.length === 1 &&
    columns[0]?.columnName === undefined &&
    columns[0]?.metrics?.length === 1 &&
    columns[0].metrics[0] === PROFILER_ALL
  );
}

export function toFormValues(config: TableProfilerConfig): ProfilerSettingsValues {
  const sample = config.profileSampleConfig?.config;
  const partitioning = config.partitioning;
  return {
    profileSampleType: sample?.profileSampleType,
    profileSamplePercentage:
      sample?.profileSampleType === 'PERCENTAGE' ? (sample.profileSample ?? null) : null,
    profileSampleRows:
      sample?.profileSampleType === 'ROWS' ? sample.profileSample : undefined,
    sampleDataCount: config.sampleDataCount ?? DEFAULT_SETTINGS_VALUES.sampleDataCount,
    profileQuery: config.profileQuery ?? '',
    excludeColumns: config.excludeColumns ?? [],
    includeColumns: config.includeColumns?.length
      ? config.includeColumns.map((column) => ({
          ...column,
          metrics: column.metrics?.length ? column.metrics : [PROFILER_ALL],
        }))
      : DEFAULT_INCLUDE_PROFILE,
    enablePartitioning: partitioning?.enablePartitioning ?? false,
    partitionIntervalType: partitioning?.partitionIntervalType,
    partitionColumnName: partitioning?.partitionColumnName,
    partitionIntegerRangeStart: partitioning?.partitionIntegerRangeStart,
    partitionIntegerRangeEnd: partitioning?.partitionIntegerRangeEnd,
    partitionInterval: partitioning?.partitionInterval,
    partitionIntervalUnit: partitioning?.partitionIntervalUnit,
    partitionValues: (partitioning?.partitionValues ?? []).map((value) => ({
      value: String(value),
    })),
  };
}

export function toProfilerConfig(data: ProfilerSettingsValues): TableProfilerConfig {
  const profileSample =
    data.profileSampleType === 'PERCENTAGE'
      ? data.profileSamplePercentage
      : data.profileSampleRows;
  return {
    excludeColumns: data.excludeColumns.length ? data.excludeColumns : undefined,
    profileQuery: data.profileQuery || undefined,
    profileSampleConfig:
      data.profileSampleType != null && profileSample != null
        ? {
            sampleConfigType: 'STATIC',
            config: {
              profileSample,
              profileSampleType: data.profileSampleType,
            },
          }
        : undefined,
    includeColumns: !isDefaultIncludeProfile(data.includeColumns)
      ? data.includeColumns.reduce<ColumnProfilerConfig[]>((columns, column) => {
          if (column.columnName !== undefined) {
            columns.push(
              column.metrics?.[0] === PROFILER_ALL
                ? { columnName: column.columnName }
                : column,
            );
          }
          return columns;
        }, [])
      : undefined,
    partitioning: data.enablePartitioning
      ? {
          enablePartitioning: true,
          partitionColumnName: data.partitionColumnName,
          partitionIntegerRangeStart: data.partitionIntegerRangeStart,
          partitionIntegerRangeEnd: data.partitionIntegerRangeEnd,
          partitionInterval: data.partitionInterval,
          partitionIntervalType: data.partitionIntervalType,
          partitionIntervalUnit: data.partitionIntervalUnit,
          partitionValues:
            data.partitionIntervalType === 'COLUMN-VALUE'
              ? data.partitionValues.reduce<string[]>((values, { value }) => {
                  if (value.length > 0) {
                    values.push(value);
                  }
                  return values;
                }, [])
              : undefined,
        }
      : undefined,
    sampleDataCount: data.sampleDataCount,
  };
}

/**
 * Collapse a metric multi-select value around the 'all' sentinel: picking
 * 'all' drops the individual metrics; picking any metric drops 'all';
 * picking every metric by hand collapses to 'all' (the pin's tree cascade
 * treats a full manual selection as the 'all' choice), so the saved
 * payload carries the sentinel instead of all 23 names.
 */
export function collapseMetricSelection(next: string[], previous: string[]): string[] {
  const hadAll = previous.includes(PROFILER_ALL);
  const hasAll = next.includes(PROFILER_ALL);
  if (hasAll && !hadAll) {
    return [PROFILER_ALL];
  }
  const selected =
    hasAll && hadAll && next.length > 1
      ? next.filter((metric) => metric !== PROFILER_ALL)
      : next;
  if (
    selected.length === PROFILER_SETTINGS_METRICS.length &&
    PROFILER_SETTINGS_METRICS.every((metric) => selected.includes(metric))
  ) {
    return [PROFILER_ALL];
  }
  return selected;
}

/**
 * Clear the partition fields that belong to a previous interval type or
 * to a disabled partitioning section (the pin's resetPartitionFields):
 * the column, range, interval, unit, and values. The interval type
 * itself is left alone — the caller sets or clears it. Values reset to
 * one empty row, the pin's shape, so switching to COLUMN-VALUE offers a
 * row to fill. Without the reset, stale values survive into saved
 * payloads and reappear when the section is re-enabled or the type is
 * switched back.
 */
export function resetPartitionFields(values: ProfilerSettingsValues): void {
  values.partitionColumnName = undefined;
  values.partitionIntegerRangeStart = undefined;
  values.partitionIntegerRangeEnd = undefined;
  values.partitionInterval = undefined;
  values.partitionIntervalUnit = undefined;
  values.partitionValues = [{ value: '' }];
}

/** Columns eligible as the partition column for an interval type. */
export function partitionColumnsFor(
  columns: { name: string; dataType: string }[],
  intervalType?: PartitionIntervalType,
): { name: string; dataType: string }[] {
  if (!intervalType) {
    return [];
  }
  const supported = SUPPORTED_COLUMN_DATA_TYPE_FOR_INTERVAL[intervalType];
  return columns.filter((column) => supported.includes(column.dataType.toUpperCase()));
}
