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
  BOOST_MODE_VALUES,
  ENTITY_PATH,
  ENTITY_PATH_TO_SEARCH_INDEX,
  GLOBAL_SETTING_PROPERTIES,
  MATCH_TYPE_OPTIONS,
  MODIFIER_VALUES,
  SCORE_MODE_VALUES,
  SEARCH_ENTITY_SEGMENTS,
  boostModeOptions,
  getTermBoostField,
  getTermBoostTagQuery,
  isCompleteTermBoost,
  resolveSearchEntityType,
  scoreModeOptions,
  searchEntitySegment,
  toFieldValueBoost,
  toFieldValueBoostFormValues,
} from './searchSettingsConstants';

describe('SEARCH_ENTITY_SEGMENTS', () => {
  it('lists the 23 registry items in registry order with the ENTITY_PATH mapping', () => {
    expect(SEARCH_ENTITY_SEGMENTS).toHaveLength(23);
    expect(SEARCH_ENTITY_SEGMENTS.map((entry) => entry.segment)).toEqual([
      'tables',
      'dashboards',
      'pipelines',
      'topics',
      'glossaryTerm',
      'apiEndpoints',
      'dashboardDataModels',
      'storedProcedures',
      'containers',
      'mlmodels',
      'dataProducts',
      'query',
      'tags',
      'databases',
      'databaseSchemas',
      'domains',
      'metrics',
      'searchIndexes',
      'directories',
      'files',
      'spreadsheets',
      'worksheets',
      'column',
    ]);
    expect(SEARCH_ENTITY_SEGMENTS.map((entry) => entry.entityType)).toEqual([
      'table',
      'dashboard',
      'pipeline',
      'topic',
      'glossaryTerm',
      'apiEndpoint',
      'dashboardDataModel',
      'storedProcedure',
      'container',
      'mlmodel',
      'dataProduct',
      'query',
      'tag',
      'database',
      'databaseSchema',
      'domain',
      'metric',
      'searchIndex',
      'directory',
      'file',
      'spreadsheet',
      'worksheet',
      'tableColumn',
    ]);
    // The column segment maps to the tableColumn entity, not a column entity.
    expect(ENTITY_PATH.column).toBe('tableColumn');
    expect(ENTITY_PATH.tables).toBe('table');
    expect(ENTITY_PATH.mlmodels).toBe('mlmodel');
  });

  it('resolves both route param shapes and rejects unknown params', () => {
    expect(resolveSearchEntityType('tables')).toBe('table');
    expect(resolveSearchEntityType('column')).toBe('tableColumn');
    expect(resolveSearchEntityType('table')).toBe('table');
    expect(resolveSearchEntityType('tableColumn')).toBe('tableColumn');
    expect(resolveSearchEntityType('glossaries')).toBeUndefined();
    expect(resolveSearchEntityType('driveService')).toBeUndefined();
    expect(resolveSearchEntityType(undefined)).toBeUndefined();
    expect(resolveSearchEntityType('')).toBeUndefined();
    expect(searchEntitySegment('tableColumn')?.segment).toBe('column');
    expect(searchEntitySegment('driveService')).toBeUndefined();
  });

  it('covers the 23 entity types in the search index map', () => {
    for (const entry of SEARCH_ENTITY_SEGMENTS) {
      expect(ENTITY_PATH_TO_SEARCH_INDEX[entry.entityType]).toBeDefined();
    }
    expect(ENTITY_PATH_TO_SEARCH_INDEX.table).toBe('table');
    expect(ENTITY_PATH_TO_SEARCH_INDEX.tableColumn).toBe('tableColumn');
    expect(Object.keys(ENTITY_PATH_TO_SEARCH_INDEX)).toHaveLength(27);
  });
});

describe('GLOBAL_SETTING_PROPERTIES', () => {
  it('carries the official ranges', () => {
    expect(GLOBAL_SETTING_PROPERTIES).toEqual([
      {
        key: 'maxAggregateSize',
        labelKey: 'settings.searchPrefs.maxAggregateSize',
        min: 100,
        max: 10000,
      },
      {
        key: 'maxResultHits',
        labelKey: 'settings.searchPrefs.maxResultHits',
        min: 100,
        max: 10000,
      },
      {
        key: 'maxAnalyzedOffset',
        labelKey: 'settings.searchPrefs.maxAnalyzedOffset',
        min: 1000,
        max: 1000000,
      },
    ]);
  });
});

describe('mode and modifier enums', () => {
  it('keeps the generated enum declaration orders', () => {
    expect([...BOOST_MODE_VALUES]).toEqual(['avg', 'max', 'min', 'multiply', 'replace', 'sum']);
    expect([...SCORE_MODE_VALUES]).toEqual(['avg', 'first', 'max', 'min', 'multiply', 'sum']);
    expect([...MODIFIER_VALUES]).toEqual([
      'ln',
      'ln1p',
      'ln2p',
      'log',
      'log1p',
      'log2p',
      'none',
      'reciprocal',
      'sqrt',
      'square',
    ]);
  });

  it('labels modes with startCase and modifiers with the raw value', () => {
    expect(boostModeOptions).toEqual([
      { value: 'avg', label: 'Avg' },
      { value: 'max', label: 'Max' },
      { value: 'min', label: 'Min' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'replace', label: 'Replace' },
      { value: 'sum', label: 'Sum' },
    ]);
    expect(scoreModeOptions[1]).toEqual({ value: 'first', label: 'First' });
    expect(MATCH_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      'exact',
      'phrase',
      'fuzzy',
      'standard',
    ]);
  });
});

describe('getTermBoostField', () => {
  it('routes Certification and Tier tags to their dedicated fields', () => {
    expect(getTermBoostField('Certification.Gold')).toBe('certification.tagLabel.tagFQN');
    expect(getTermBoostField('Tier.Tier1')).toBe('tier.tagFQN');
    expect(getTermBoostField('PII.Sensitive')).toBe('tags.tagFQN');
    expect(getTermBoostField('MyTag')).toBe('tags.tagFQN');
  });
});

describe('getTermBoostTagQuery', () => {
  it('builds the wildcard query with the disabled:false term filter', () => {
    const { query, queryFilter } = getTermBoostTagQuery('PII');
    expect(query).toBe('*PII*');
    expect(JSON.parse(queryFilter)).toEqual({
      query: { bool: { must: [{ term: { disabled: 'false' } }] } },
    });
  });

  it('escapes ES reserved characters and FQN-encodes the result', () => {
    const { query } = getTermBoostTagQuery('a+b');
    expect(query).toBe('*a%5C%2Bb*');
  });
});

describe('field value boost form mapping', () => {
  it('seeds defaults for a new boost', () => {
    expect(toFieldValueBoostFormValues()).toEqual({
      field: null,
      factor: 0,
      modifier: 'none',
      missing: '0',
      gte: '',
      lte: '',
      gt: '',
      lt: '',
    });
  });

  it('round-trips a stored boost through strings', () => {
    expect(
      toFieldValueBoostFormValues({
        field: 'totalVotes',
        factor: 2.5,
        modifier: 'ln',
        missing: 3,
        condition: { range: { gte: 1, lt: 10 } },
      }),
    ).toEqual({
      field: 'totalVotes',
      factor: 2.5,
      modifier: 'ln',
      missing: '3',
      gte: '1',
      lte: '',
      gt: '',
      lt: '10',
    });
  });

  it('omits empty bounds instead of sending them as 0', () => {
    expect(
      toFieldValueBoost({
        field: 'totalVotes',
        factor: 1,
        modifier: 'none',
        missing: '0',
        gte: '5',
        lte: '',
        gt: '',
        lt: '',
      }),
    ).toEqual({
      field: 'totalVotes',
      factor: 1,
      modifier: 'none',
      missing: 0,
      condition: { range: { gte: 5 } },
    });
  });

  it('converts an empty missing value to 0', () => {
    const boost = toFieldValueBoost({
      field: 'totalVotes',
      factor: 1,
      modifier: null,
      missing: '',
      gte: '',
      lte: '',
      gt: '',
      lt: '',
    });
    expect(boost.missing).toBe(0);
    expect(boost.modifier).toBe('none');
    expect(boost.condition).toEqual({ range: {} });
  });
});

describe('isCompleteTermBoost', () => {
  it('drops empty values and zero boosts', () => {
    expect(isCompleteTermBoost({ field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 2 })).toBe(
      true,
    );
    expect(isCompleteTermBoost({ field: '', value: '', boost: 2 })).toBe(false);
    expect(isCompleteTermBoost({ field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 0 })).toBe(
      false,
    );
    expect(isCompleteTermBoost({ field: 'tags.tagFQN', value: 'PII.Sensitive' })).toBe(false);
  });
});
