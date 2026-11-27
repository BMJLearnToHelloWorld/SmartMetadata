/**
 * Copyright 2026 SmartMetadata authors.
 */
import { describe, expect, it } from 'vitest';
import {
  DATABASE_SERVICE_TYPES,
  dimensionPatch,
  formValuesFromDefinition,
  toCreateTestDefinitionRequest,
  validatorClassFor,
} from './testDefinitionForm';
import type { TestDefinition } from '@/types/quality';

describe('testDefinitionForm', () => {
  it('omits Dbt and QueryLog from supported service options (official TestDefinitionFormBody)', () => {
    expect(DATABASE_SERVICE_TYPES).not.toContain('Dbt');
    expect(DATABASE_SERVICE_TYPES).not.toContain('QueryLog');
    expect(DATABASE_SERVICE_TYPES).toContain('Mysql');
    expect(DATABASE_SERVICE_TYPES).toContain('Snowflake');
  });

  it('sets the official SQL validator class from entity type', () => {
    expect(validatorClassFor('TABLE', 'SELECT 1 FROM {{ table_name }}')).toBe(
      'TableRuleLibrarySqlExpressionValidator',
    );
    expect(validatorClassFor('COLUMN', 'SELECT {{ column_name }} FROM {{ table_name }}')).toBe(
      'ColumnRuleLibrarySqlExpressionValidator',
    );
    expect(validatorClassFor('TABLE', '  ')).toBeUndefined();
  });

  it('builds a create payload with official fields', () => {
    const body = toCreateTestDefinitionRequest({
      name: 'custom_range',
      displayName: 'Custom range',
      description: 'Check a range',
      sqlExpression: 'SELECT COUNT(*) FROM {{ table_name }} WHERE {{ column_name }} < {{ minValue }}',
      entityType: 'COLUMN',
      testPlatforms: ['OpenMetadata'],
      dataQualityDimension: 'Accuracy',
      supportedServices: ['Mysql'],
      supportedDataTypes: ['INT', 'BIGINT'],
      parameterDefinition: [{ name: 'minValue', displayName: 'Min', dataType: 'INT', required: true }],
      enabled: true,
    });
    expect(body).toMatchObject({
      name: 'custom_range',
      entityType: 'COLUMN',
      dataQualityDimension: 'Accuracy',
      supportedServices: ['Mysql'],
      supportedDataTypes: ['INT', 'BIGINT'],
      sqlExpression: 'SELECT COUNT(*) FROM {{ table_name }} WHERE {{ column_name }} < {{ minValue }}',
      validatorClass: 'ColumnRuleLibrarySqlExpressionValidator',
    });
    expect(body.parameterDefinition?.[0]).toMatchObject({ name: 'minValue', dataType: 'INT', required: true });
  });

  it('round-trips definition values and builds a dimension-only patch for system providers', () => {
    const definition = {
      id: 'td1',
      name: 'tableRowCountToBeBetween',
      testPlatforms: ['OpenMetadata'],
      parameterDefinition: [],
      provider: 'system',
      dataQualityDimension: 'Completeness',
    } as TestDefinition;
    const values = formValuesFromDefinition(definition);
    expect(values.name).toBe('tableRowCountToBeBetween');
    expect(dimensionPatch('Completeness', 'Accuracy')).toEqual([{ op: 'replace', path: '/dataQualityDimension', value: 'Accuracy' }]);
    expect(dimensionPatch(undefined, 'Accuracy')).toEqual([{ op: 'add', path: '/dataQualityDimension', value: 'Accuracy' }]);
    expect(dimensionPatch('Completeness', undefined)).toEqual([{ op: 'remove', path: '/dataQualityDimension' }]);
  });
});
