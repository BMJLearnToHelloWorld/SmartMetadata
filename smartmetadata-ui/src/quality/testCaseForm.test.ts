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
import type { TestCase } from '@/types/quality';
import {
  DEFAULT_TOP_DIMENSIONS,
  TEST_LEVEL,
  buildEntityLink,
  combineTags,
  cronPreset,
  customSqlTypeForLevel,
  formValuesFromTestCase,
  generateTestCaseName,
  helpForField,
  toCreateRequest,
} from './testCaseForm';

describe('testCaseForm', () => {
  it('builds a table-level entity link and payload', () => {
    const request = toCreateRequest({
      testLevel: TEST_LEVEL.TABLE,
      selectedTable: 'service.db.schema.orders',
      dimensionColumns: [],
      topDimensions: DEFAULT_TOP_DIMENSIONS,
      testTypeId: 'tableRowCountToBeBetween',
      testName: 'orders_row_count',
      tags: [{ tagFQN: 'Classification.PII', source: 'Classification' }],
      glossaryTerms: [{ tagFQN: 'Glossary.Term', source: 'Glossary' }],
      parameterValues: { minValue: '1', maxValue: '10' },
    });
    expect(request.entityLink).toBe('<#E::table::service.db.schema.orders>');
    expect(request.testDefinition).toBe('tableRowCountToBeBetween');
    expect(request.parameterValues).toEqual([
      { name: 'minValue', value: '1' },
      { name: 'maxValue', value: '10' },
    ]);
    expect(request.tags?.map((tag) => tag.tagFQN)).toEqual(['Classification.PII', 'Glossary.Term']);
    expect(request.dimensionColumns).toBeUndefined();
    expect(request.topDimensions).toBeUndefined();
  });

  it('requires a column for column-level tests and includes dimension fields only for dimension level', () => {
    expect(() =>
      buildEntityLink({ testLevel: TEST_LEVEL.COLUMN, selectedTable: 'a.b.c.t' }),
    ).toThrow(/column/i);
    expect(
      buildEntityLink({
        testLevel: TEST_LEVEL.COLUMN,
        selectedTable: 'a.b.c.t',
        selectedColumn: 'id',
      }),
    ).toBe('<#E::table::a.b.c.t::columns::id>');
    const dimensional = toCreateRequest({
      testLevel: TEST_LEVEL.COLUMN_DIMENSION,
      selectedTable: 'a.b.c.t',
      selectedColumn: 'amount',
      dimensionColumns: ['region', 'amount'],
      topDimensions: 3,
      testTypeId: 'columnValuesToBeNotNull',
      tags: [],
      glossaryTerms: [],
      parameterValues: {},
    });
    expect(dimensional.dimensionColumns).toEqual(['region', 'amount']);
    expect(dimensional.topDimensions).toBe(3);
    expect(dimensional.entityLink).toContain('::columns::amount');
  });

  it('auto-names from the table or column and test type when the name is empty', () => {
    expect(
      generateTestCaseName({
        testLevel: TEST_LEVEL.TABLE,
        selectedTable: 'service.db.schema.Orders Table',
        testTypeId: 'tableRowCountToBeBetween',
      }),
    ).toBe('orders_table_tablerowcounttobebetween');
    expect(
      generateTestCaseName({
        testLevel: TEST_LEVEL.COLUMN,
        selectedTable: 'a.b.c.t',
        selectedColumn: 'hco_id',
        testTypeId: 'columnValuesToBeNotNull',
      }),
    ).toBe('hco_id_columnvaluestobenotnull');
  });

  it('prefills edit values from an existing test case, splitting glossary tags', () => {
    const testCase = {
      id: '1',
      name: 'orders_row_count',
      displayName: 'Orders row count',
      description: 'desc',
      entityLink: '<#E::table::svc.db.sch.orders::columns::id>',
      testDefinition: { id: 'td', name: 'columnValuesToBeNotNull', type: 'testDefinition' },
      testSuites: [],
      parameterValues: [{ name: 'minValue', value: '1' }],
      dimensionColumns: ['region'],
      topDimensions: 5,
      tags: [
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
        { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary' },
      ],
    } as TestCase;
    const values = formValuesFromTestCase(testCase);
    expect(values.testLevel).toBe(TEST_LEVEL.COLUMN_DIMENSION);
    expect(values.selectedTable).toBe('svc.db.sch.orders');
    expect(values.selectedColumn).toBe('id');
    expect(values.dimensionColumns).toEqual(['region']);
    expect(values.tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive']);
    expect(values.glossaryTerms.map((tag) => tag.tagFQN)).toEqual(['Glossary.Term']);
    expect(values.parameterValues).toEqual({ minValue: '1' });
  });

  it('combines classification and glossary tags without duplicates', () => {
    expect(
      combineTags(
        [{ tagFQN: 'A', source: 'Classification' }],
        [
          { tagFQN: 'A', source: 'Classification' },
          { tagFQN: 'B', source: 'Glossary' },
        ],
      ).map((tag) => tag.tagFQN),
    ).toEqual(['A', 'B']);
  });

  it('uses official custom-SQL ids and daily cron, and serves official help for the active field', () => {
    expect(customSqlTypeForLevel(TEST_LEVEL.TABLE)).toBe('tableCustomSQLQuery');
    expect(customSqlTypeForLevel(TEST_LEVEL.COLUMN)).toBe('columnCustomSQLQuery');
    expect(cronPreset('daily', 0, 0)).toBe('0 0 * * *');
    expect(helpForField('name').title).toBe('Name');
    expect(helpForField('unknown').title).toBe('Test Level');
  });
});
