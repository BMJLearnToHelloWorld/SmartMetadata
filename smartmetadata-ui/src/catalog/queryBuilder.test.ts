/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { fieldsForSearchIndex } from './advancedSearchFields';
import {
  buildQueryFilter,
  elasticSearchFormat,
  emptyQueryGroup,
  isTreeComplete,
  parseElasticsearchQuery,
  queryFilterToSql,
  sanitizeTree,
  sqlFormat,
  type QueryBuilderFieldDef,
  type QueryGroup,
  type QueryRule,
} from './queryBuilder';

const FIELDS = fieldsForSearchIndex('table');
const ALL_FIELDS = fieldsForSearchIndex('dataAsset');

function rule(field: string, operator: QueryRule['operator'], value: QueryRule['value']): QueryRule {
  return { kind: 'rule', field, operator, value };
}

function group(conjunction: 'AND' | 'OR', children: QueryGroup['children']): QueryGroup {
  return { kind: 'group', conjunction, children };
}

describe('sqlFormat', () => {
  it('renders a single rule with the ES field key and quoted value', () => {
    expect(sqlFormat(rule('ownerDisplayName', 'select_equals', 'Data Eng'), FIELDS)).toBe(
      "ownerDisplayName = 'Data Eng'",
    );
  });

  it('escapes single quotes in values', () => {
    expect(sqlFormat(rule('ownerDisplayName', 'select_equals', "O'Brien"), FIELDS)).toBe(
      "ownerDisplayName = 'O''Brien'",
    );
  });

  it('maps operators to pin sqlOps', () => {
    expect(sqlFormat(rule('description', 'match_phrase', 'orders'), FIELDS)).toBe(
      "description CONTAINS 'orders'",
    );
    expect(sqlFormat(rule('description', 'not_match_phrase', 'orders'), FIELDS)).toBe(
      "description NOT CONTAINS 'orders'",
    );
    expect(sqlFormat(rule('displayName.keyword', 'like', 'ord'), FIELDS)).toBe(
      "displayName.keyword LIKE '%ord%'",
    );
    expect(sqlFormat(rule('displayName.keyword', 'regexp', '^ord'), FIELDS)).toBe(
      "displayName.keyword REGEXP '^ord'",
    );
    expect(sqlFormat(rule('ownerDisplayName', 'select_not_equals', 'x'), FIELDS)).toBe(
      "ownerDisplayName <> 'x'",
    );
    expect(sqlFormat(rule('ownerDisplayName', 'select_any_in', ['a', 'b']), FIELDS)).toBe(
      "ownerDisplayName IN ('a', 'b')",
    );
    expect(sqlFormat(rule('description', 'is_null', null), FIELDS)).toBe('description IS NULL');
  });

  it('parenthesizes nested groups and joins with the group conjunction', () => {
    const tree = group('AND', [
      rule('ownerDisplayName', 'select_equals', 'Data Eng'),
      group('OR', [
        rule('tags.tagFQN', 'select_equals', 'PII.Sensitive'),
        rule('tier.tagFQN', 'select_equals', 'Tier.Tier1'),
      ]),
    ]);
    expect(sqlFormat(tree, FIELDS)).toBe(
      "ownerDisplayName = 'Data Eng' AND (tags.tagFQN = 'PII.Sensitive' OR tier.tagFQN = 'Tier.Tier1')",
    );
  });

  it('returns empty for an empty or unfinished tree', () => {
    expect(sqlFormat(emptyQueryGroup(), FIELDS)).toBe('');
    expect(sqlFormat(rule('ownerDisplayName', 'select_equals', ''), FIELDS)).toBe('');
    expect(sqlFormat(rule('ownerDisplayName', 'select_equals', 'x'), [])).toBe('');
  });
});

describe('elasticSearchFormat', () => {
  it('builds bool.must for AND and bool.should for OR', () => {
    const tree = group('OR', [
      rule('ownerDisplayName', 'select_equals', 'a'),
      rule('ownerDisplayName', 'select_equals', 'b'),
    ]);
    expect(elasticSearchFormat(tree, FIELDS)).toEqual({
      query: {
        bool: {
          should: [{ term: { ownerDisplayName: 'a' } }, { term: { ownerDisplayName: 'b' } }],
        },
      },
    });
  });

  it('maps like to wildcard and is_null to a negated exists', () => {
    expect(
      elasticSearchFormat(rule('displayName.keyword', 'like', 'ord'), FIELDS),
    ).toEqual({
      query: { wildcard: { 'displayName.keyword': { value: '*ord*' } } },
    });
    expect(elasticSearchFormat(rule('description', 'is_null', null), FIELDS)).toEqual({
      query: { bool: { must_not: { exists: { field: 'description' } } } },
    });
    expect(
      elasticSearchFormat(rule('ownerDisplayName', 'select_not_any_in', ['a', 'b']), FIELDS),
    ).toEqual({
      query: { bool: { must_not: { terms: { ownerDisplayName: ['a', 'b'] } } } },
    });
  });

  it('expands multiselect rules per option (pin De Morgan for not_contains)', () => {
    const contains: QueryGroup = {
      kind: 'group',
      conjunction: 'AND',
      children: [],
    };
    void contains;
    const enumField: QueryBuilderFieldDef = {
      key: 'extension.table.retention.keyword',
      label: 'Retention',
      type: 'multiselect',
      operators: ['multiselect_contains', 'multiselect_not_contains', 'multiselect_equals'],
      entityType: 'table',
      esField: 'retention.keyword',
    };
    const fields = [...FIELDS, enumField];
    expect(
      elasticSearchFormat(rule(enumField.key, 'multiselect_contains', ['a', 'b']), fields),
    ).toEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { 'retention.keyword': 'a' } }, { term: { 'retention.keyword': 'b' } }] } },
            { term: { entityType: 'table' } },
          ],
        },
      },
    });
    expect(
      elasticSearchFormat(rule(enumField.key, 'multiselect_not_contains', ['a', 'b']), fields),
    ).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                must: [
                  { bool: { must_not: { term: { 'retention.keyword': 'a' } } } },
                  { bool: { must_not: { term: { 'retention.keyword': 'b' } } } },
                ],
              },
            },
            { term: { entityType: 'table' } },
          ],
        },
      },
    });
  });

  it('returns undefined for an empty tree', () => {
    expect(elasticSearchFormat(emptyQueryGroup(), FIELDS)).toBeUndefined();
    expect(buildQueryFilter(emptyQueryGroup(), FIELDS)).toBeUndefined();
  });
});

describe('parseElasticsearchQuery round-trip', () => {
  const tree = group('AND', [
    rule('ownerDisplayName', 'select_equals', 'Data Eng'),
    group('OR', [
      rule('tags.tagFQN', 'select_equals', 'PII.Sensitive'),
      rule('tier.tagFQN', 'select_equals', 'Tier.Tier1'),
    ]),
    rule('displayName.keyword', 'like', 'ord'),
    rule('description', 'is_not_null', null),
  ]);

  it('parses what elasticSearchFormat emits', () => {
    const filter = buildQueryFilter(tree, FIELDS);
    expect(filter).toBeTruthy();
    const parsed = parseElasticsearchQuery(filter as string, FIELDS);
    expect(parsed).toEqual(tree);
    expect(buildQueryFilter(parsed as QueryGroup, FIELDS)).toBe(filter);
    expect(queryFilterToSql(filter as string, FIELDS)).toBe(sqlFormat(tree, FIELDS));
  });

  it('parses the curated-assets saved-filter shapes', () => {
    const parsed = parseElasticsearchQuery(
      '{"query":{"bool":{"must":[{"term":{"tier.tagFQN":"Tier.Tier1"}},{"bool":{"should":[{"term":{"entityType":"table"}},{"term":{"entityType":"dashboard"}}]}}]}}}',
      ALL_FIELDS,
    );
    expect(parsed).toEqual(
      group('AND', [
        rule('tier.tagFQN', 'select_equals', 'Tier.Tier1'),
        group('OR', [
          rule('entityType.keyword', 'select_equals', 'table'),
          rule('entityType.keyword', 'select_equals', 'dashboard'),
        ]),
      ]),
    );
  });

  it('parses the empty-filter strings and unknown shapes as null, never rewriting them', () => {
    expect(parseElasticsearchQuery('{"query":{"bool":{"must":[]}}}', FIELDS)).toBeNull();
    expect(parseElasticsearchQuery('{}', FIELDS)).toBeNull();
    expect(parseElasticsearchQuery('not json', FIELDS)).toBeNull();
    expect(parseElasticsearchQuery('{"query":{"match_all":{}}}', FIELDS)).toBeNull();
    expect(parseElasticsearchQuery('{"query":{"term":{"noSuchField":"x"}}}', FIELDS)).toBeNull();
  });

  it('parses between ranges and negated leaves', () => {
    const numberField: QueryBuilderFieldDef = {
      key: 'extension.table.retentionDays',
      label: 'Retention',
      type: 'number',
      operators: ['equal', 'not_equal', 'between', 'not_between', 'is_null', 'is_not_null'],
      entityType: 'table',
      esField: 'retentionDays',
    };
    const fields = [...FIELDS, numberField];
    const parsed = parseElasticsearchQuery(
      '{"query":{"bool":{"must":[{"bool":{"must":[{"range":{"retentionDays":{"gte":7,"lte":30}}},{"term":{"entityType":"table"}}]}}]}}}',
      fields,
    );
    expect(parsed).toEqual(
      group('AND', [rule(numberField.key, 'between', [7, 30])]),
    );
  });

  it('round-trips a date between range as quoted SQL and string range bounds', () => {
    const dateField: QueryBuilderFieldDef = {
      key: 'extension.table.reviewDate',
      label: 'Review date',
      type: 'date',
      operators: ['equal', 'not_equal', 'between', 'not_between', 'is_null', 'is_not_null'],
      entityType: 'table',
      esField: 'reviewDate',
    };
    const fields = [...FIELDS, dateField];
    const tree = group('AND', [rule(dateField.key, 'between', ['2026-01-01', '2026-12-31'])]);
    expect(isTreeComplete(tree, fields)).toBe(true);
    expect(sqlFormat(tree, fields)).toBe("reviewDate BETWEEN '2026-01-01' AND '2026-12-31'");
    expect(elasticSearchFormat(tree, fields)).toEqual({
      query: { bool: { must: [{ bool: { must: [{ range: { reviewDate: { gte: '2026-01-01', lte: '2026-12-31' } } }, { term: { entityType: 'table' } }] } }] } },
    });
    const filter = buildQueryFilter(tree, fields);
    expect(parseElasticsearchQuery(filter as string, fields)).toEqual(tree);
  });

  it('round-trips an extension multiselect rule through its entity-type wrap', () => {
    const enumField: QueryBuilderFieldDef = {
      key: 'extension.table.retention.keyword',
      label: 'Retention',
      type: 'multiselect',
      operators: ['multiselect_contains', 'multiselect_not_contains', 'multiselect_equals'],
      entityType: 'table',
      esField: 'retention.keyword',
    };
    const fields = [...FIELDS, enumField];
    const tree = group('AND', [rule(enumField.key, 'multiselect_contains', ['a', 'b'])]);
    const filter = buildQueryFilter(tree, fields);
    const parsed = parseElasticsearchQuery(filter as string, fields);
    expect(parsed).toEqual(
      group('AND', [
        group('OR', [
          rule(enumField.key, 'multiselect_contains', ['a']),
          rule(enumField.key, 'multiselect_contains', ['b']),
        ]),
      ]),
    );
    expect(queryFilterToSql(filter as string, fields)).toBe(
      "(retention.keyword IN ('a') OR retention.keyword IN ('b'))",
    );
  });
});

describe('sanitizeTree / isTreeComplete', () => {
  it('drops rules whose field is not in the current tab and empties the tree', () => {
    const tree = group('AND', [
      rule('database.displayName.keyword', 'select_equals', 'analytics'),
      rule('ownerDisplayName', 'select_equals', 'a'),
    ]);
    // database.* is a table-tab field; the chart tab has no such field.
    expect(sanitizeTree(tree, fieldsForSearchIndex('chart'))).toEqual(
      group('AND', [rule('ownerDisplayName', 'select_equals', 'a')]),
    );
    expect(sanitizeTree(rule('database.displayName.keyword', 'select_equals', 'x'), fieldsForSearchIndex('chart'))).toBeNull();
  });

  it('treats a half-filled between pair as incomplete and renders nothing for it', () => {
    const numberField: QueryBuilderFieldDef = {
      key: 'extension.table.retentionDays',
      label: 'Retention',
      type: 'number',
      operators: ['equal', 'not_equal', 'between', 'not_between', 'is_null', 'is_not_null'],
      entityType: 'table',
      esField: 'retentionDays',
    };
    const fields = [...FIELDS, numberField];
    const partial = group('AND', [rule(numberField.key, 'between', [7, null])]);
    expect(isTreeComplete(partial, fields)).toBe(false);
    expect(sqlFormat(partial, fields)).toBe('');
    expect(elasticSearchFormat(partial, fields)).toBeUndefined();
    expect(sanitizeTree(partial, fields)).toBeNull();
  });

  it('reports unfinished rules and empty groups as incomplete', () => {
    expect(isTreeComplete(emptyQueryGroup(), FIELDS)).toBe(false);
    expect(isTreeComplete(rule('ownerDisplayName', 'select_equals', ''), FIELDS)).toBe(false);
    expect(isTreeComplete(rule('ownerDisplayName', 'select_equals', 'a'), FIELDS)).toBe(true);
    expect(
      isTreeComplete(
        group('AND', [rule('ownerDisplayName', 'select_equals', 'a'), rule('tier.tagFQN', 'select_equals', '')]),
        FIELDS,
      ),
    ).toBe(false);
  });
});

describe('fieldsForSearchIndex', () => {
  it('gives the table tab its database/schema/table-type fields plus column fields', () => {
    const keys = fieldsForSearchIndex('table').map((item) => item.key);
    expect(keys).toContain('database.displayName.keyword');
    expect(keys).toContain('databaseSchema.displayName.keyword');
    expect(keys).toContain('tableType');
    expect(keys).toContain('columnDescriptionStatus');
    expect(keys).toContain('columns.name.keyword');
    expect(keys).toContain('columns.tags.tagFQN');
    expect(keys).toContain('service.displayName.keyword');
  });

  it('gives the dataAsset tab the union without duplicates', () => {
    const keys = fieldsForSearchIndex('dataAsset').map((item) => item.key);
    expect(keys).toContain('glossary.name.keyword');
    expect(keys).toContain('tasks.displayName.keyword');
    expect(keys).toContain('mlFeatures.name');
    expect(keys).toContain('columns.name.keyword');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives the chart tab common fields only (no service, no column)', () => {
    const keys = fieldsForSearchIndex('chart').map((item) => item.key);
    expect(keys).not.toContain('service.displayName.keyword');
    expect(keys).not.toContain('columns.name.keyword');
    expect(keys).toContain('ownerDisplayName');
  });

  it('gives the glossaryTerm tab its glossary field but no service field', () => {
    const keys = fieldsForSearchIndex('glossaryTerm').map((item) => item.key);
    expect(keys).toContain('glossary.name.keyword');
    expect(keys).not.toContain('service.displayName.keyword');
  });

  it('restricts entityStatus to the pin list-value operators (equals / not-equals)', () => {
    const field = fieldsForSearchIndex('table').find((item) => item.key === 'entityStatus');
    expect(field?.operators).toEqual(['select_equals', 'select_not_equals']);
  });
});
