/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
/**
 * Data table for the official ProfilerConfigurationPage metricConfiguration
 * form. Previously these two lists were hard-coded arrays inside
 * ProfilerConfigurationView; views must look them up here instead of
 * re-declaring them, so a data-type or metric change is a data change.
 */
export const PROFILER_DATA_TYPES = [
  'NUMBER',
  'INT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'TINYINT',
  'SMALLINT',
  'BIGINT',
  'BYTEINT',
  'STRING',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'BINARY',
  'VARBINARY',
  'TIMESTAMP',
  'TIMESTAMPZ',
  'DATE',
  'DATETIME',
  'TIME',
  'BOOLEAN',
  'ARRAY',
  'MAP',
  'STRUCT',
  'JSON',
  'UUID',
] as const;

export const PROFILER_METRICS = [
  'columnCount',
  'rowCount',
  'columnNames',
  'valuesCount',
  'nullCount',
  'nullProportion',
  'uniqueCount',
  'uniqueProportion',
  'distinctCount',
  'distinctProportion',
  'min',
  'max',
  'minLength',
  'maxLength',
  'mean',
  'median',
  'sum',
  'stddev',
  'variance',
  'histogram',
  'quantile',
  'interQuartileRange',
] as const;

export function isProfilerDataType(value: unknown): value is (typeof PROFILER_DATA_TYPES)[number] {
  return typeof value === 'string' && (PROFILER_DATA_TYPES as readonly string[]).includes(value);
}

export function isProfilerMetric(value: unknown): value is (typeof PROFILER_METRICS)[number] {
  return typeof value === 'string' && (PROFILER_METRICS as readonly string[]).includes(value);
}
