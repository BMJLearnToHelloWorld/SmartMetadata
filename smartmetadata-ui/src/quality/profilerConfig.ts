/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
/**
 * Data tables for the official ProfilerConfigurationPage metricConfiguration
 * form. Both lists are the official generated enums value-by-value, in
 * declaration order — `DataType` and `MetricType` from
 * `openmetadata-ui/.../generated/configuration/profilerConfiguration.ts`
 * at pin a3012259ca (392b3efd object tree). Views must look them up here
 * instead of re-declaring them, so a data-type or metric change is a data
 * change.
 *
 * 04:5.6a (Bai 2026-11-18 18:34, option (a)): PROFILER_METRICS is the full
 * 36-value MetricType set. The product-only `variance` and `quantile`
 * entries are deleted; the 16 missing values are added. Stored configs
 * that still contain `variance`/`quantile` pass through verbatim at the
 * payload layer (official rule: unknown metrics are kept as-is) — this
 * table only governs which values the selector offers.
 */
export const PROFILER_DATA_TYPES = [
  'AGG_STATE',
  'AGGREGATEFUNCTION',
  'ARRAY',
  'BIGINT',
  'BINARY',
  'BIT',
  'BITMAP',
  'BLOB',
  'BOOLEAN',
  'BYTEA',
  'BYTEINT',
  'BYTES',
  'CIDR',
  'CHAR',
  'CLOB',
  'DATE',
  'DATETIME',
  'DATETIMERANGE',
  'DECIMAL',
  'DOUBLE',
  'ENUM',
  'ERROR',
  'FIXED',
  'FLOAT',
  'GEOGRAPHY',
  'GEOMETRY',
  'HEIRARCHY',
  'HIERARCHYID',
  'HLL',
  'HLLSKETCH',
  'IMAGE',
  'INET',
  'INT',
  'INTERVAL',
  'IPV4',
  'IPV6',
  'JSON',
  'KPI',
  'LARGEINT',
  'LONG',
  'LONGBLOB',
  'LOWCARDINALITY',
  'MACADDR',
  'MAP',
  'MEASURE',
  'MEASURE HIDDEN',
  'MEASURE VISIBLE',
  'MEDIUMBLOB',
  'MEDIUMTEXT',
  'MONEY',
  'NTEXT',
  'NULL',
  'NUMBER',
  'NUMERIC',
  'PG_LSN',
  'PG_SNAPSHOT',
  'POINT',
  'POLYGON',
  'QUANTILE_STATE',
  'RECORD',
  'ROWID',
  'SET',
  'SMALLINT',
  'SPATIAL',
  'STRING',
  'STRUCT',
  'SUPER',
  'TABLE',
  'TEXT',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPZ',
  'TINYINT',
  'TSQUERY',
  'TSVECTOR',
  'TUPLE',
  'TXID_SNAPSHOT',
  'UUID',
  'UINT',
  'UNION',
  'UNKNOWN',
  'VARBINARY',
  'VARCHAR',
  'VARIANT',
  'XML',
  'YEAR',
] as const;

export const PROFILER_METRICS = [
  'cardinalityDistribution',
  'columnCount',
  'columnNames',
  'countInSet',
  'distinctCount',
  'distinctProportion',
  'duplicateCount',
  'firstQuartile',
  'histogram',
  'iLikeCount',
  'iLikeRatio',
  'interQuartileRange',
  'likeCount',
  'likeRatio',
  'max',
  'maxLength',
  'mean',
  'median',
  'min',
  'minLength',
  'nonParametricSkew',
  'notLikeCount',
  'notRegexCount',
  'nullCount',
  'nullMissingCount',
  'nullProportion',
  'regexCount',
  'rowCount',
  'stddev',
  'sum',
  'system',
  'thirdQuartile',
  'uniqueCount',
  'uniqueProportion',
  'valueRank',
  'valuesCount',
] as const;

export function isProfilerDataType(value: unknown): value is (typeof PROFILER_DATA_TYPES)[number] {
  return typeof value === 'string' && (PROFILER_DATA_TYPES as readonly string[]).includes(value);
}

export function isProfilerMetric(value: unknown): value is (typeof PROFILER_METRICS)[number] {
  return typeof value === 'string' && (PROFILER_METRICS as readonly string[]).includes(value);
}
