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
import { createTestI18n } from '@/test/i18n';
import {
  addSnowflakeSystemExcludes,
  buildInitialFilterState,
  buildPatternFromState,
  cleanSchemaTitle,
  conditionKey,
  conditionToRegex,
  FILTER_LABEL_KEYS,
  FILTER_SINGLE_LABEL_KEYS,
  getFilterSectionLabels,
  getOrderedFilterEntries,
  getScopeSummaryKey,
  getSummaryPill,
  isFilterSchemaProperty,
  parseRegexPattern,
  pluralizeFallback,
  singularizeFallback,
} from './filterPatterns';

describe('parseRegexPattern / conditionToRegex (pin FiltersConfigForm.utils)', () => {
  it('round-trips each operator through its regex form', () => {
    const cases: Array<[string, string, string]> = [
      ['^orders$', 'is', 'orders'],
      ['^.*orders.*$', 'contains', 'orders'],
      ['^orders.*$', 'startsWith', 'orders'],
      ['^.*orders$', 'endsWith', 'orders'],
      ['orders', 'startsWith', 'orders'],
      ['orders$', 'is', 'orders'],
    ];
    for (const [regex, op, value] of cases) {
      const parsed = parseRegexPattern(regex);
      expect(parsed.op).toBe(op);
      expect(parsed.value).toBe(value);
      expect(conditionToRegex(parsed)).toBe(regex);
    }
  });

  it('keeps genuinely regex patterns as regex and preserves the source', () => {
    const parsed = parseRegexPattern('^tmp_[0-9]+$');
    expect(parsed.op).toBe('regex');
    expect(parsed.value).toBe('^tmp_[0-9]+$');
    expect(conditionToRegex(parsed)).toBe('^tmp_[0-9]+$');
  });

  it('builds regexes from fresh conditions, escaping literal values', () => {
    expect(conditionToRegex({ op: 'is', value: 'a.b' })).toBe('^a\\.b$');
    expect(conditionToRegex({ op: 'startsWith', value: 'tmp_' })).toBe('^tmp_');
    expect(conditionToRegex({ op: 'endsWith', value: 'tmp' })).toBe('.*tmp$');
    expect(conditionToRegex({ op: 'contains', value: 'tmp' })).toBe('.*tmp.*');
    expect(conditionToRegex({ op: 'regex', value: '^x.*$' })).toBe('^x.*$');
  });

  it('keys conditions case-insensitively by rendered regex', () => {
    expect(conditionKey({ op: 'is', value: 'Orders' })).toBe(
      conditionKey({ op: 'is', value: 'orders' }),
    );
    expect(conditionKey({ op: 'is', value: 'orders' })).not.toBe(
      conditionKey({ op: 'contains', value: 'orders' }),
    );
  });
});

describe('buildPatternFromState / buildInitialFilterState', () => {
  it('emits includes only in restrict mode and derives restrict from stored includes', () => {
    expect(
      buildPatternFromState({
        restrict: false,
        includes: [{ op: 'is', value: 'x' }],
        excludes: [],
      }),
    ).toEqual({ excludes: [], includes: [] });
    expect(buildInitialFilterState({ includes: ['^x$'], excludes: [] }).restrict).toBe(true);
    expect(buildInitialFilterState({ includes: [], excludes: ['^y$'] }).restrict).toBe(false);
    expect(buildInitialFilterState(undefined)).toEqual({
      excludes: [],
      includes: [],
      restrict: false,
    });
  });
});

describe('isFilterSchemaProperty / getOrderedFilterEntries', () => {
  it('recognises known fields, FilterPattern javaTypes, and titled shapes', () => {
    expect(
      isFilterSchemaProperty('tableFilterPattern', { type: 'object' }),
    ).toBe(true);
    expect(
      isFilterSchemaProperty('customPattern', {
        javaType: 'org.openmetadata.schema.type.FilterPattern',
      }),
    ).toBe(true);
    expect(
      isFilterSchemaProperty('customPattern', {
        title: 'Custom Filter Pattern',
        properties: { includes: {} },
      }),
    ).toBe(true);
    expect(isFilterSchemaProperty('customPattern', { title: 'Custom Filter Pattern' })).toBe(
      false,
    );
    expect(isFilterSchemaProperty('hostPort', { type: 'string' })).toBe(false);
    expect(isFilterSchemaProperty('x', 'not-an-object')).toBe(false);
  });

  it('orders entries by enum order with unknown filter fields last in schema order', () => {
    const entries = getOrderedFilterEntries({
      tableFilterPattern: { type: 'object' },
      hostPort: { type: 'string' },
      customPattern: {
        title: 'Custom Filter Pattern',
        properties: { includes: {} },
      },
      databaseFilterPattern: { type: 'object' },
    });
    expect(entries.map(([name]) => name)).toEqual([
      'databaseFilterPattern',
      'tableFilterPattern',
      'customPattern',
    ]);
  });
});

describe('labels', () => {
  it('resolves locale labels for known fields and falls back to the cleaned title', () => {
    const t = (key: string): string => `t:${key}`;
    expect(getFilterSectionLabels('tableFilterPattern', 'Default Table Filter Pattern', t)).toEqual(
      { label: 't:forms.filter.labels.tables', singleLabel: 't:forms.filter.labels.table' },
    );
    expect(getFilterSectionLabels('customPattern', 'Custom Filter Pattern', t)).toEqual({
      label: 'Customs',
      singleLabel: 'Custom',
    });
    expect(cleanSchemaTitle('Default Table Filter Pattern', 'tableFilterPattern')).toBe('Table');
    expect(cleanSchemaTitle('', 'tableFilterPattern')).toBe('Table');
    expect(pluralizeFallback('Category')).toBe('Categories');
    expect(pluralizeFallback('Class')).toBe('Class');
    expect(singularizeFallback('Categories')).toBe('Category');
    expect(singularizeFallback('Tables')).toBe('Table');
  });

  it('resolves locale labels for the five unlisted fields instead of pluralizing the translated title (M-W1)', () => {
    const t = (key: string): string => `t:${key}`;
    expect(getFilterSectionLabels('apiEndpointFilterPattern', 'API 端点', t)).toEqual({
      label: 't:forms.filter.labels.apiEndpoints',
      singleLabel: 't:forms.filter.labels.apiEndpoint',
    });
    expect(getFilterSectionLabels('modelFilterPattern', '模型', t)).toEqual({
      label: 't:forms.filter.labels.models',
      singleLabel: 't:forms.filter.labels.model',
    });
    expect(getFilterSectionLabels('serverFilterPattern', '服务器', t)).toEqual({
      label: 't:forms.filter.labels.servers',
      singleLabel: 't:forms.filter.labels.server',
    });
    expect(getFilterSectionLabels('glossaryFilterPattern', '术语表', t)).toEqual({
      label: 't:forms.filter.labels.glossaries',
      singleLabel: 't:forms.filter.labels.glossary',
    });
    expect(getFilterSectionLabels('domainFilterPattern', '域', t)).toEqual({
      label: 't:forms.filter.labels.domains',
      singleLabel: 't:forms.filter.labels.domain',
    });
  });

  it('renders ZH labels for unlisted fields with no suffixed s and agreeing title/singleLabel', () => {
    const i18n = createTestI18n('zh-CN');
    const t = (key: string): string => i18n.global.t(key);
    expect(getFilterSectionLabels('apiEndpointFilterPattern', 'API端点', t)).toEqual({
      label: 'API端点',
      singleLabel: 'API端点',
    });
    expect(getFilterSectionLabels('modelFilterPattern', '模型', t)).toEqual({
      label: '模型',
      singleLabel: '模型',
    });
    expect(getFilterSectionLabels('serverFilterPattern', '服务器', t)).toEqual({
      label: '服务器',
      singleLabel: '服务器',
    });
    expect(getFilterSectionLabels('glossaryFilterPattern', '术语库', t)).toEqual({
      label: '术语库',
      singleLabel: '术语库',
    });
    expect(getFilterSectionLabels('domainFilterPattern', '域', t)).toEqual({
      label: '域',
      singleLabel: '域',
    });
  });

  it('resolves every mapped label key in both catalogs', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const i18n = createTestI18n(locale);
      const t = (key: string): string => i18n.global.t(key);
      for (const [field, key] of [
        ...Object.entries(FILTER_LABEL_KEYS),
        ...Object.entries(FILTER_SINGLE_LABEL_KEYS),
      ]) {
        expect(key, field).toBeDefined();
        if (key !== undefined) {
          expect(t(key)).not.toBe(key);
        }
      }
    }
  });
});

describe('summary pill and scope summary', () => {
  it('reports scanning-all, exclude counts and include counts', () => {
    expect(getSummaryPill({ restrict: false, includes: [], excludes: [] })).toEqual({
      textKey: 'forms.filter.scanningAll',
      tone: 'success',
      values: {},
    });
    expect(
      getSummaryPill({ restrict: false, includes: [], excludes: [{ op: 'is', value: 'x' }] }),
    ).toEqual({
      textKey: 'forms.filter.excludeRuleCount',
      tone: 'info',
      values: { count: 1 },
    });
    expect(
      getSummaryPill({
        restrict: true,
        includes: [
          { op: 'is', value: 'x' },
          { op: 'is', value: 'y' },
        ],
        excludes: [],
      }),
    ).toEqual({
      textKey: 'forms.filter.includeRulesCount',
      tone: 'info',
      values: { count: 2 },
    });
  });

  it('selects the scope summary by restrict/exclude combination', () => {
    expect(getScopeSummaryKey({ restrict: false, includes: [], excludes: [] })).toBe(
      'forms.filter.allSummary',
    );
    expect(
      getScopeSummaryKey({ restrict: false, includes: [], excludes: [{ op: 'is', value: 'x' }] }),
    ).toBe('forms.filter.excludeSummary');
    expect(
      getScopeSummaryKey({ restrict: true, includes: [{ op: 'is', value: 'x' }], excludes: [] }),
    ).toBe('forms.filter.includeSummary');
    expect(
      getScopeSummaryKey({
        restrict: true,
        includes: [{ op: 'is', value: 'x' }],
        excludes: [{ op: 'is', value: 'y' }],
      }),
    ).toBe('forms.filter.includeExcludeSummary');
  });
});

describe('addSnowflakeSystemExcludes', () => {
  it('adds the sample-data exclude once, only for Snowflake database patterns', () => {
    expect(addSnowflakeSystemExcludes('Snowflake', 'databaseFilterPattern', [])).toEqual([
      '^snowflake_sample_data$',
    ]);
    expect(
      addSnowflakeSystemExcludes('Snowflake', 'databaseFilterPattern', ['^snowflake_sample_data$']),
    ).toEqual(['^snowflake_sample_data$']);
    expect(addSnowflakeSystemExcludes('Snowflake', 'tableFilterPattern', [])).toEqual([]);
    expect(addSnowflakeSystemExcludes('Mysql', 'databaseFilterPattern', [])).toEqual([]);
  });
});
