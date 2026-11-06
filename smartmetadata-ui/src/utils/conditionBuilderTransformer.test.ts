/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildConditionBuilderPayload,
  parseConditionBuilderPayload,
  rowsToRules,
  rulesToRows,
} from './conditionBuilderTransformer';

describe('rowsToRules', () => {
  it('trims values and drops blank rows', () => {
    expect(
      rowsToRules([
        { id: 'r1', field: 'name', values: ['  svc  ', '', 'db'] },
        { id: 'r2', field: 'tags', values: ['   '] },
        { id: 'r3', field: '', values: ['x'] },
      ]),
    ).toEqual({ name: ['svc', 'db'] });
  });

  it('writes deleted as a boolean', () => {
    expect(rowsToRules([{ id: 'r1', field: 'deleted', values: ['true'] }])).toEqual({
      deleted: true,
    });
    expect(rowsToRules([{ id: 'r1', field: 'deleted', values: ['false'] }])).toEqual({
      deleted: false,
    });
    expect(rowsToRules([{ id: 'r1', field: 'deleted', values: ['yes'] }])).toEqual({});
  });
});

describe('rulesToRows', () => {
  it('round-trips string arrays and the deleted boolean', () => {
    const rows = rulesToRows({ name: ['svc', 'db'], deleted: true });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.field === 'name')?.values).toEqual(['svc', 'db']);
    expect(rows.find((r) => r.field === 'deleted')?.values).toEqual(['true']);
  });

  it('returns no rows for null, arrays or empty objects', () => {
    expect(rulesToRows(null)).toEqual([]);
    expect(rulesToRows(undefined)).toEqual([]);
    expect(rulesToRows([] as unknown as Record<string, unknown>)).toEqual([]);
    expect(rulesToRows({})).toEqual([]);
  });
});

describe('parseConditionBuilderPayload', () => {
  it('defaults to OR with no rows for an empty payload', () => {
    expect(parseConditionBuilderPayload(null)).toEqual({ rows: [], condition: 'OR' });
    expect(parseConditionBuilderPayload({})).toEqual({ rows: [], condition: 'OR' });
  });

  it('parses config.rules and keeps the stored condition', () => {
    const { rows, condition } = parseConditionBuilderPayload({
      config: { condition: 'AND', rules: { name: ['svc'] } },
    });
    expect(condition).toBe('AND');
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('name');
  });

  it('falls back to the legacy config.include', () => {
    const { rows, condition } = parseConditionBuilderPayload({
      config: { include: { tags: ['PII'] } } as never,
    });
    expect(condition).toBe('OR');
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('tags');
  });
});

describe('buildConditionBuilderPayload', () => {
  it('builds the normalized {condition, rules} shape', () => {
    expect(
      buildConditionBuilderPayload('AND', [
        { id: 'r1', field: 'name', values: ['svc'] },
      ]),
    ).toEqual({ config: { condition: 'AND', rules: { name: ['svc'] } } });
  });
});
