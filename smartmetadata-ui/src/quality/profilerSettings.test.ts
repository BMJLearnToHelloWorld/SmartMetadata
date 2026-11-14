/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_VALUES,
  PROFILER_SETTINGS_METRICS,
  cloneSettingsValues,
  collapseMetricSelection,
  partitionColumnsFor,
  resetPartitionFields,
  toFormValues,
  toProfilerConfig,
  type ProfilerSettingsValues,
  type TableProfilerConfig,
} from './profilerSettings';

describe('profilerSettings', () => {
  it('maps a stored config to form values', () => {
    const values = toFormValues({
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 25, profileSampleType: 'PERCENTAGE' },
      },
      sampleDataCount: 10,
      profileQuery: 'SELECT * FROM t',
      excludeColumns: ['secret'],
      includeColumns: [{ columnName: 'id', metrics: ['mean', 'min'] }, { columnName: 'name' }],
      partitioning: {
        enablePartitioning: true,
        partitionColumnName: 'created_at',
        partitionIntervalType: 'TIME-UNIT',
        partitionInterval: 3,
        partitionIntervalUnit: 'DAY',
      },
    });
    expect(values.profileSampleType).toBe('PERCENTAGE');
    expect(values.profileSamplePercentage).toBe(25);
    expect(values.profileSampleRows).toBeUndefined();
    expect(values.sampleDataCount).toBe(10);
    expect(values.profileQuery).toBe('SELECT * FROM t');
    expect(values.excludeColumns).toEqual(['secret']);
    expect(values.includeColumns).toEqual([
      { columnName: 'id', metrics: ['mean', 'min'] },
      { columnName: 'name', metrics: ['all'] },
    ]);
    expect(values.enablePartitioning).toBe(true);
    expect(values.partitionColumnName).toBe('created_at');
    expect(values.partitionInterval).toBe(3);
    expect(values.partitionIntervalUnit).toBe('DAY');
  });

  it('maps rows sample config and defaults the sample data count', () => {
    const values = toFormValues({
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 100, profileSampleType: 'ROWS' },
      },
    });
    expect(values.profileSampleType).toBe('ROWS');
    expect(values.profileSampleRows).toBe(100);
    expect(values.profileSamplePercentage).toBeNull();
    expect(values.sampleDataCount).toBe(50);
    expect(values.includeColumns).toEqual([{ columnName: undefined, metrics: ['all'] }]);
    expect(values.enablePartitioning).toBe(false);
  });

  it('maps partition values to form rows', () => {
    const values = toFormValues({
      partitioning: {
        enablePartitioning: true,
        partitionColumnName: 'name',
        partitionIntervalType: 'COLUMN-VALUE',
        partitionValues: ['a', 7],
      },
    });
    expect(values.partitionValues).toEqual([{ value: 'a' }, { value: '7' }]);
  });

  it('converts form values to a STATIC-only config', () => {
    const config = toProfilerConfig({
      ...DEFAULT_SETTINGS_VALUES,
      profileSampleType: 'ROWS',
      profileSampleRows: 100,
      profileSamplePercentage: null,
      sampleDataCount: 20,
      profileQuery: 'SELECT 1',
      excludeColumns: ['secret'],
      includeColumns: [{ columnName: 'id', metrics: ['mean'] }],
      enablePartitioning: true,
      partitionIntervalType: 'INTEGER-RANGE',
      partitionColumnName: 'id',
      partitionIntegerRangeStart: 1,
      partitionIntegerRangeEnd: 100,
    });
    expect(config).toEqual({
      excludeColumns: ['secret'],
      profileQuery: 'SELECT 1',
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 100, profileSampleType: 'ROWS' },
      },
      includeColumns: [{ columnName: 'id', metrics: ['mean'] }],
      partitioning: {
        enablePartitioning: true,
        partitionColumnName: 'id',
        partitionIntegerRangeStart: 1,
        partitionIntegerRangeEnd: 100,
        partitionInterval: undefined,
        partitionIntervalType: 'INTEGER-RANGE',
        partitionIntervalUnit: undefined,
        partitionValues: undefined,
      },
      sampleDataCount: 20,
    });
  });

  it('omits the default include profile and drops nameless rows', () => {
    const config = toProfilerConfig({ ...DEFAULT_SETTINGS_VALUES });
    expect(config.includeColumns).toBeUndefined();
    const withRows = toProfilerConfig({
      ...DEFAULT_SETTINGS_VALUES,
      includeColumns: [
        { columnName: undefined, metrics: ['all'] },
        { columnName: 'id', metrics: ['all'] },
      ],
    });
    expect(withRows.includeColumns).toEqual([{ columnName: 'id' }]);
  });

  it('keeps partition values only for COLUMN-VALUE and drops blanks', () => {
    const config = toProfilerConfig({
      ...DEFAULT_SETTINGS_VALUES,
      enablePartitioning: true,
      partitionIntervalType: 'COLUMN-VALUE',
      partitionColumnName: 'name',
      partitionValues: [{ value: 'a' }, { value: '' }, { value: 'b' }],
    });
    expect(config.partitioning?.partitionValues).toEqual(['a', 'b']);
    const timed = toProfilerConfig({
      ...DEFAULT_SETTINGS_VALUES,
      enablePartitioning: true,
      partitionIntervalType: 'TIME-UNIT',
      partitionColumnName: 'created_at',
      partitionValues: [{ value: 'a' }],
    });
    expect(timed.partitioning?.partitionValues).toBeUndefined();
  });

  it('omits partitioning when disabled and the sample config when valueless', () => {
    const config = toProfilerConfig({
      ...DEFAULT_SETTINGS_VALUES,
      profileSampleType: undefined,
      profileSamplePercentage: null,
      enablePartitioning: false,
    });
    expect(config.partitioning).toBeUndefined();
    expect(config.profileSampleConfig).toBeUndefined();
  });

  it('round-trips a stored config through the form', () => {
    const stored: TableProfilerConfig = {
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 25, profileSampleType: 'PERCENTAGE' },
      },
      sampleDataCount: 10,
      excludeColumns: ['secret'],
      includeColumns: [{ columnName: 'id', metrics: ['mean'] }],
      partitioning: {
        enablePartitioning: true,
        partitionColumnName: 'created_at',
        partitionIntervalType: 'TIME-UNIT',
        partitionInterval: 3,
        partitionIntervalUnit: 'DAY',
      },
    };
    expect(toProfilerConfig(toFormValues(stored))).toEqual(stored);
  });

  it('collapses metric selection around the all sentinel', () => {
    expect(collapseMetricSelection(['all'], ['mean'])).toEqual(['all']);
    expect(collapseMetricSelection(['all', 'mean'], ['all'])).toEqual(['mean']);
    expect(collapseMetricSelection(['mean', 'min'], ['mean'])).toEqual(['mean', 'min']);
    expect(collapseMetricSelection(['all'], ['all'])).toEqual(['all']);
  });

  it('collapses a full manual metric selection to all', () => {
    const everyMetric = [...PROFILER_SETTINGS_METRICS];
    expect(collapseMetricSelection(everyMetric, ['mean'])).toEqual(['all']);
    expect(collapseMetricSelection(everyMetric.slice(0, -1), [])).toEqual(
      everyMetric.slice(0, -1),
    );
  });

  it('resets partition fields without touching the interval type', () => {
    const values: ProfilerSettingsValues = {
      ...cloneSettingsValues(DEFAULT_SETTINGS_VALUES),
      partitionIntervalType: 'TIME-UNIT',
      partitionColumnName: 'created_at',
      partitionIntegerRangeStart: 1,
      partitionIntegerRangeEnd: 100,
      partitionInterval: 3,
      partitionIntervalUnit: 'DAY',
      partitionValues: [{ value: 'a' }],
    };
    resetPartitionFields(values);
    expect(values.partitionIntervalType).toBe('TIME-UNIT');
    expect(values.partitionColumnName).toBeUndefined();
    expect(values.partitionIntegerRangeStart).toBeUndefined();
    expect(values.partitionIntegerRangeEnd).toBeUndefined();
    expect(values.partitionInterval).toBeUndefined();
    expect(values.partitionIntervalUnit).toBeUndefined();
    expect(values.partitionValues).toEqual([{ value: '' }]);
  });

  it('filters partition columns by interval type', () => {
    const columns = [
      { name: 'created_at', dataType: 'TIMESTAMP' },
      { name: 'id', dataType: 'INT' },
      { name: 'name', dataType: 'VARCHAR' },
    ];
    expect(partitionColumnsFor(columns, 'TIME-UNIT').map((c) => c.name)).toEqual(['created_at']);
    expect(partitionColumnsFor(columns, 'INTEGER-RANGE').map((c) => c.name)).toEqual(['id']);
    expect(partitionColumnsFor(columns, 'COLUMN-VALUE').map((c) => c.name)).toEqual(['name']);
    expect(partitionColumnsFor(columns, undefined)).toEqual([]);
  });
});
