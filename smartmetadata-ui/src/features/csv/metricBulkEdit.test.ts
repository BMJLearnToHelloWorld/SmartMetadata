/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  changedRowIndices,
  csvColumnLeaf,
  extensionToCell,
  fqnListFromCell,
  metricCsvValue,
  metricToCsvRow,
  ownersFromCell,
  ownersToCell,
  refsToCell,
  tagsToCell,
} from './metricBulkEdit';
import type { Metric } from '@/api/metrics';

const METRIC: Metric = {
  id: 'm1',
  name: 'mau',
  displayName: 'Monthly Active Users',
  description: 'MAU',
  fullyQualifiedName: 'kpi.mau',
  metricType: 'COUNTER',
  entityStatus: 'Approved',
  owners: [
    { name: 'alice', type: 'user' },
    { name: 'eng', type: 'team' },
  ],
  reviewers: [{ name: 'bob', type: 'user' }],
  domains: [{ name: 'kpi', fullyQualifiedName: 'kpi' }],
  dataProducts: [],
  relatedMetrics: [{ name: 'dau', fullyQualifiedName: 'kpi.dau' }],
  experts: [],
  tags: [
    { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
    { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary' },
  ],
  extension: { unit: 'users' },
};

describe('metricBulkEdit CSV helpers', () => {
  it('encodes owners as type:name entries joined by semicolons', () => {
    expect(ownersToCell(METRIC.owners)).toBe('user:alice;team:eng');
    expect(ownersFromCell('user:alice;team:eng')).toEqual([
      { type: 'user', name: 'alice' },
      { type: 'team', name: 'eng' },
    ]);
    expect(ownersFromCell('')).toEqual([]);
  });

  it('encodes references as FQNs joined by semicolons', () => {
    expect(refsToCell(METRIC.domains)).toBe('kpi');
    expect(fqnListFromCell('a.b;c.d')).toEqual(['a.b', 'c.d']);
  });

  it('splits tags by source for the tags and glossaryTerms columns', () => {
    expect(tagsToCell(METRIC, 'Classification')).toBe('PII.Sensitive');
    expect(tagsToCell(METRIC, 'Glossary')).toBe('Glossary.Term');
  });

  it('maps metric fields to CSV columns per the official column table', () => {
    expect(metricCsvValue(METRIC, 'name')).toBe('mau');
    expect(metricCsvValue(METRIC, 'owners')).toBe('user:alice;team:eng');
    expect(metricCsvValue(METRIC, 'glossaryTerms')).toBe('Glossary.Term');
    expect(metricCsvValue(METRIC, 'tags')).toBe('PII.Sensitive');
    expect(metricCsvValue(METRIC, 'extension')).toBe('unit=users');
    expect(metricCsvValue(METRIC, 'unknownColumn')).toBe('');
    expect(extensionToCell(undefined)).toBe('');
  });

  it('builds rows in documentation-header order', () => {
    expect(
      metricToCsvRow(METRIC, [{ name: 'name' }, { name: 'owners' }, { name: 'description' }]),
    ).toEqual(['mau', 'user:alice;team:eng', 'MAU']);
  });

  it('detects only changed rows for the changed-rows-only submit', () => {
    const initial = [
      ['a', '1'],
      ['b', '2'],
    ];
    expect(
      changedRowIndices(initial, [
        ['a', '1'],
        ['b', '3'],
      ]),
    ).toEqual([1]);
    expect(changedRowIndices(initial, initial)).toEqual([]);
  });

  it('takes the leaf segment for dotted column names', () => {
    expect(csvColumnLeaf('column.glossaryTerms')).toBe('glossaryTerms');
    expect(csvColumnLeaf('owners')).toBe('owners');
  });
});
