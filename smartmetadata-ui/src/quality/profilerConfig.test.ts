/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { PROFILER_DATA_TYPES, PROFILER_METRICS, isProfilerDataType, isProfilerMetric } from './profilerConfig';

/**
 * Official generated enums, value-by-value in declaration order
 * (`openmetadata-ui/.../generated/configuration/profilerConfiguration.ts`,
 * pin a3012259ca, 392b3efd object tree). The product tables must equal
 * these arrays exactly — 04:5.6a acceptance is a value-by-value
 * comparison, not a subset check.
 */
const OFFICIAL_DATA_TYPES = [
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
];

const OFFICIAL_METRIC_TYPES = [
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
];

describe('profilerConfig', () => {
  it('matches the official DataType enum value-by-value, in declaration order', () => {
    expect([...PROFILER_DATA_TYPES]).toEqual(OFFICIAL_DATA_TYPES);
    expect(new Set(PROFILER_DATA_TYPES).size).toBe(PROFILER_DATA_TYPES.length);
  });

  it('matches the official MetricType enum value-by-value, in declaration order (04:5.6a)', () => {
    expect([...PROFILER_METRICS]).toEqual(OFFICIAL_METRIC_TYPES);
    expect(new Set(PROFILER_METRICS).size).toBe(PROFILER_METRICS.length);
  });

  it('offers neither product-only metric (04:5.6a deletion)', () => {
    expect(PROFILER_METRICS).not.toContain('variance');
    expect(PROFILER_METRICS).not.toContain('quantile');
    expect(isProfilerMetric('variance')).toBe(false);
    expect(isProfilerMetric('quantile')).toBe(false);
  });

  it('validates values against the tables', () => {
    expect(isProfilerDataType('VARCHAR')).toBe(true);
    expect(isProfilerDataType('GEOMETRY')).toBe(true);
    expect(isProfilerDataType('MEASURE HIDDEN')).toBe(true);
    expect(isProfilerDataType('NUMBER')).toBe(true);
    expect(isProfilerDataType('p99')).toBe(false);
    expect(isProfilerMetric('mean')).toBe(true);
    expect(isProfilerMetric('valueRank')).toBe(true);
    expect(isProfilerMetric('p99')).toBe(false);
  });
});
