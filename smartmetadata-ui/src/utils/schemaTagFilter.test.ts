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
import type { SchemaRow } from '@/types/api';
import {
  collectSchemaTagOptions,
  EMPTY_SCHEMA_TAG_FILTER,
  filterSchemaRowsByTags,
  hasSchemaTagFilter,
} from './schemaTagFilter';

function row(
  key: string,
  name: string,
  tags: Array<{ tagFQN: string; source?: 'Classification' | 'Glossary' }> = [],
  children?: SchemaRow[],
): SchemaRow {
  return {
    key,
    name,
    dataType: 'VARCHAR',
    tags: tags.map((tag) => ({ tagFQN: tag.tagFQN, name: tag.tagFQN.split('.').pop() ?? tag.tagFQN, source: tag.source })),
    children,
  };
}

describe('collectSchemaTagOptions', () => {
  it('collects tags from nested children, dedupes by FQN, and splits by source', () => {
    const rows = [
      row('a', 'a', [{ tagFQN: 'PII.Email', source: 'Classification' }], [
        row('a.b', 'b', [
          { tagFQN: 'PII.Email', source: 'Classification' },
          { tagFQN: 'Glossary.Contact', source: 'Glossary' },
        ]),
      ]),
      row('c', 'c', [{ tagFQN: 'PII.SSN' }]),
    ];
    expect(collectSchemaTagOptions(rows)).toEqual({
      classification: [
        { text: 'PII Email', value: 'PII.Email' },
        { text: 'PII SSN', value: 'PII.SSN' },
      ],
      glossary: [{ text: 'Glossary Contact', value: 'Glossary.Contact' }],
    });
  });

  it('returns empty groups when no row carries tags', () => {
    expect(collectSchemaTagOptions([row('a', 'a'), row('b', 'b')])).toEqual({
      classification: [],
      glossary: [],
    });
  });
});

describe('hasSchemaTagFilter', () => {
  it('is false for the empty selection and true when either group is set', () => {
    expect(hasSchemaTagFilter(EMPTY_SCHEMA_TAG_FILTER)).toBe(false);
    expect(hasSchemaTagFilter({ tags: ['PII.Email'], glossaryTerms: [] })).toBe(true);
    expect(hasSchemaTagFilter({ tags: [], glossaryTerms: ['Glossary.Contact'] })).toBe(true);
  });
});

describe('filterSchemaRowsByTags', () => {
  const rows = [
    row('email', 'email', [{ tagFQN: 'PII.Email', source: 'Classification' }]),
    row('address', 'address', [], [
      row('address.city', 'city', [{ tagFQN: 'PII.City', source: 'Classification' }]),
      row('address.zip', 'zip', [{ tagFQN: 'Glossary.Zip', source: 'Glossary' }]),
    ]),
    row('id', 'id'),
  ];

  it('returns the rows unchanged when nothing is selected', () => {
    expect(filterSchemaRowsByTags(rows, EMPTY_SCHEMA_TAG_FILTER)).toBe(rows);
  });

  it('keeps self-tagged rows and drops the rest', () => {
    const filtered = filterSchemaRowsByTags(rows, { tags: ['PII.Email'], glossaryTerms: [] });
    expect(filtered.map((item) => item.key)).toEqual(['email']);
  });

  it('keeps the ancestor path of a matching descendant and prunes siblings', () => {
    const filtered = filterSchemaRowsByTags(rows, { tags: ['PII.City'], glossaryTerms: [] });
    expect(filtered.map((item) => item.key)).toEqual(['address']);
    expect(filtered[0].children?.map((item) => item.key)).toEqual(['address.city']);
  });

  it('ORs values within one column', () => {
    const filtered = filterSchemaRowsByTags(rows, { tags: ['PII.Email', 'PII.City'], glossaryTerms: [] });
    expect(filtered.map((item) => item.key)).toEqual(['email', 'address']);
    expect(filtered[1].children?.map((item) => item.key)).toEqual(['address.city']);
  });

  it('ANDs the two columns: a row must satisfy both selections', () => {
    const filtered = filterSchemaRowsByTags(rows, { tags: ['PII.City'], glossaryTerms: ['Glossary.Zip'] });
    expect(filtered).toEqual([]);
  });

  it('matches a row tagged in both groups when both selections hit it', () => {
    const both = [
      row('email', 'email', [
        { tagFQN: 'PII.Email', source: 'Classification' },
        { tagFQN: 'Glossary.Contact', source: 'Glossary' },
      ]),
    ];
    const filtered = filterSchemaRowsByTags(both, { tags: ['PII.Email'], glossaryTerms: ['Glossary.Contact'] });
    expect(filtered.map((item) => item.key)).toEqual(['email']);
  });

  it('drops children from a self-matching row instead of leaving an expandable leaf', () => {
    const filtered = filterSchemaRowsByTags(rows, { tags: ['PII.Email'], glossaryTerms: [] });
    expect(filtered[0].children).toBeUndefined();
    const nested = filterSchemaRowsByTags(rows, { tags: ['PII.City'], glossaryTerms: [] });
    expect(nested[0].children).toHaveLength(1);
  });
});
