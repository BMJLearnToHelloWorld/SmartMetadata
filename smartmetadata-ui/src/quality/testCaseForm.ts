/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Official TestCaseFormDrawer / TestCaseFormBody / transformTestCaseFormData
 * helpers, ported as Vue-facing pure functions. Do not copy CCL React/CSS.
 */
import { parseEntityLink, toEntityLink } from '@/quality/entityLink';
import type { CreateTestCaseRequest, TestCase, TestParameterValue } from '@/types/quality';
import type { TagRef } from '@/types/api';

export const TEST_LEVEL = {
  TABLE: 'table',
  COLUMN: 'column',
  COLUMN_DIMENSION: 'column-dimension',
} as const;

export type TestLevel = (typeof TEST_LEVEL)[keyof typeof TEST_LEVEL];

/** Official tableCustomSQLQuery id used by the 自定义查询 control. */
export const TABLE_CUSTOM_SQL_QUERY = 'tableCustomSQLQuery';
export const COLUMN_CUSTOM_SQL_QUERY = 'columnCustomSQLQuery';

/** Official Top Dimensions default (TestCaseForm.md / live form). */
export const DEFAULT_TOP_DIMENSIONS = 5;
export const MIN_TOP_DIMENSIONS = 1;
export const MAX_TOP_DIMENSIONS = 50;

export const TEST_CASE_TYPES = ['table', 'column', 'unspecified'] as const;

export type TagLabelPayload = {
  tagFQN: string;
  source?: 'Classification' | 'Glossary';
  name?: string;
  labelType?: string;
  state?: string;
};

export interface TestCaseFormValues {
  testLevel: TestLevel;
  selectedTable?: string;
  selectedColumn?: string;
  dimensionColumns: string[];
  topDimensions: number;
  testTypeId?: string;
  testName?: string;
  displayName?: string;
  description?: string;
  tags: TagLabelPayload[];
  glossaryTerms: TagLabelPayload[];
  parameterValues: Record<string, string>;
  computePassedFailedRowCount?: boolean;
}

export function createEmptyTestCaseForm(level: TestLevel = TEST_LEVEL.TABLE): TestCaseFormValues {
  return {
    testLevel: level,
    dimensionColumns: [],
    topDimensions: DEFAULT_TOP_DIMENSIONS,
    tags: [],
    glossaryTerms: [],
    parameterValues: {},
  };
}

export function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Official auto-name: `{table|column}_{testType}` when the name field is left empty.
 */
export function generateTestCaseName(values: Pick<TestCaseFormValues, 'testLevel' | 'selectedTable' | 'selectedColumn' | 'testTypeId'>): string {
  const typePart = slugPart(values.testTypeId?.split('.').pop() ?? values.testTypeId ?? 'test');
  if (values.testLevel === TEST_LEVEL.TABLE) {
    const table = values.selectedTable?.split('.').pop() ?? values.selectedTable ?? 'table';
    return `${slugPart(table)}_${typePart}`;
  }
  const column = values.selectedColumn ?? 'column';
  return `${slugPart(column)}_${typePart}`;
}

export function customSqlTypeForLevel(level: TestLevel): string {
  return level === TEST_LEVEL.TABLE ? TABLE_CUSTOM_SQL_QUERY : COLUMN_CUSTOM_SQL_QUERY;
}

export function entityTypeForLevel(level: TestLevel): 'TABLE' | 'COLUMN' {
  return level === TEST_LEVEL.TABLE ? 'TABLE' : 'COLUMN';
}

export function buildEntityLink(values: Pick<TestCaseFormValues, 'testLevel' | 'selectedTable' | 'selectedColumn'>): string {
  const table = values.selectedTable?.trim() ?? '';
  if (!table) {
    throw new Error('Entity link requires a table');
  }
  if (values.testLevel === TEST_LEVEL.TABLE) {
    return toEntityLink('table', table);
  }
  if (!values.selectedColumn?.trim()) {
    throw new Error('Column-level tests require a column');
  }
  return toEntityLink('table', table, values.selectedColumn);
}

export function toParameterList(values: Record<string, string>): TestParameterValue[] {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => ({ name, value }));
}

export function combineTags(tags: TagLabelPayload[], glossaryTerms: TagLabelPayload[]): TagLabelPayload[] {
  const merged = [...tags, ...glossaryTerms];
  const seen = new Set<string>();
  return merged.filter((tag) => {
    const key = tag.tagFQN;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function toCreateRequest(values: TestCaseFormValues): CreateTestCaseRequest {
  const name = values.testName?.trim() || generateTestCaseName(values);
  const tags = combineTags(values.tags, values.glossaryTerms);
  const isDimensional = values.testLevel === TEST_LEVEL.COLUMN_DIMENSION;
  return {
    name,
    displayName: values.displayName?.trim() || name,
    testDefinition: values.testTypeId?.trim() || '',
    entityLink: buildEntityLink(values),
    description: values.description?.trim() || undefined,
    parameterValues: toParameterList(values.parameterValues),
    tags: tags.length ? tags : undefined,
    dimensionColumns: isDimensional ? values.dimensionColumns.filter(Boolean) : undefined,
    topDimensions: isDimensional ? values.topDimensions : undefined,
    computePassedFailedRowCount: values.computePassedFailedRowCount,
  };
}

export function formValuesFromTestCase(testCase: TestCase): TestCaseFormValues {
  const parsed = testCase.entityLink ? parseEntityLink(testCase.entityLink) : null;
  const table = parsed?.fqn || testCase.entityFQN || '';
  const column = parsed?.column;
  const isDimensional = Boolean(testCase.dimensionColumns?.length);
  const tags = (testCase.tags ?? []).filter((tag) => tag.source !== 'Glossary');
  const glossaryTerms = (testCase.tags ?? []).filter((tag) => tag.source === 'Glossary');
  const parameterValues: Record<string, string> = {};
  for (const param of testCase.parameterValues) {
    if (param.value !== undefined) {
      parameterValues[param.name] = param.value;
    }
  }
  return {
    testLevel: isDimensional ? TEST_LEVEL.COLUMN_DIMENSION : column ? TEST_LEVEL.COLUMN : TEST_LEVEL.TABLE,
    selectedTable: table,
    selectedColumn: column,
    dimensionColumns: testCase.dimensionColumns ?? [],
    topDimensions: testCase.topDimensions ?? DEFAULT_TOP_DIMENSIONS,
    testTypeId: testCase.testDefinition?.fullyQualifiedName || testCase.testDefinition?.name,
    testName: testCase.name,
    displayName: testCase.displayName,
    description: testCase.description,
    tags: tags.map(toTagPayload),
    glossaryTerms: glossaryTerms.map(toTagPayload),
    parameterValues,
  };
}

function toTagPayload(tag: TagRef): TagLabelPayload {
  return {
    tagFQN: tag.tagFQN || tag.name || '',
    name: tag.name,
    source: tag.source,
    labelType: 'Manual',
    state: 'Confirmed',
  };
}

export function tableFqnFromEntity(testCase: TestCase): string {
  const parsed = testCase.entityLink ? parseEntityLink(testCase.entityLink) : null;
  if (parsed?.fqn) {
    return parsed.fqn;
  }
  const entity = testCase.entityFQN ?? '';
  return entity;
}

export function columnFromEntity(testCase: TestCase): string | undefined {
  return testCase.entityLink ? parseEntityLink(testCase.entityLink)?.column : undefined;
}

export function cronPreset(kind: 'hourly' | 'daily' | 'weekly' | 'monthly', hour = 0, minute = 0): string {
  const h = Math.min(23, Math.max(0, hour));
  const m = Math.min(59, Math.max(0, minute));
  if (kind === 'hourly') {
    return `${m} * * * *`;
  }
  if (kind === 'weekly') {
    return `${m} ${h} * * 0`;
  }
  if (kind === 'monthly') {
    return `${m} ${h} 1 * *`;
  }
  return `${m} ${h} * * *`;
}

export function describeCron(cron: string | undefined, scheduled: boolean): string {
  if (!scheduled || !cron) {
    return '';
  }
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) {
    return cron;
  }
  const [minute, hour, day, , weekday] = parts;
  if (hour === '*' && day === '*') {
    return `every hour at minute ${minute}`;
  }
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (day === '1' && weekday === '*') {
    return `at ${time}, day 1 of every month`;
  }
  if (weekday !== '*' && day === '*') {
    return `at ${time}, every week`;
  }
  return `at ${time}, every day`;
}

/** Official help sections (TestCaseForm.md), keyed by the form's active field. */
export const TEST_CASE_HELP: Record<string, { title: string; body: string }> = {
  testLevel: {
    title: 'Test Level',
    body: 'Select the level at which you want to apply the test case. Table Level tests validate entire table properties such as row count, freshness, or custom SQL queries. Column Level tests validate specific column properties such as values, uniqueness, or data types. Dimension Level tests validate column properties segmented by one or more dimension columns.',
  },
  table: {
    title: 'Table',
    body: 'Select the table on which you want to create the test case. You can search for tables by name. The selected table will be the target for your data quality tests. For column-level tests, you will need to select a specific column after choosing the table.',
  },
  column: {
    title: 'Column',
    body: "When creating column-level tests, select the specific column you want to test. The available columns are based on the selected table's schema.",
  },
  dimensionColumns: {
    title: 'Dimension Columns',
    body: 'Select one or more columns that will serve as dimensions for grouping test results. The selected column being tested cannot be used as a dimension. Dimension columns are typically categorical or low-cardinality columns.',
  },
  topDimensions: {
    title: 'Top Dimensions',
    body: 'Controls how many top dimension values are shown individually in the test results. Values beyond this limit are grouped into an Others bucket. Default 5, minimum 1, maximum 50.',
  },
  testType: {
    title: 'Test Type',
    body: 'Choose the type of test to apply based on your data quality requirements. Available test types depend on whether you selected table-level or column-level testing.',
  },
  name: {
    title: 'Name',
    body: 'Provide a unique name for your test case. The name should be descriptive and follow these guidelines: must start with a letter; can contain letters, numbers, and underscores; cannot contain spaces or special characters; maximum length of 256 characters; must be unique within the test suite.',
  },
};

export function helpForField(fieldId: string): { title: string; body: string } {
  return TEST_CASE_HELP[fieldId] ?? TEST_CASE_HELP.testLevel;
}
