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
import { collectSchemaTagOptions, filterSchemaRowsByTags } from './schemaTagFilter';

function row(partial: Partial<SchemaRow> & { name: string }): SchemaRow {
  return { key: partial.name, dataType: 'VARCHAR', ...partial };
}

function tag(tagFQN: string, source: 'Classification' | 'Glossary' = 'Classification') {
  return { tagFQN, name: tagFQN.split('.').pop() ?? tagFQN, source };
}

describe('collectSchemaTagOptions (pin getAllTags)', () => {
  it('collects tags recursively, de-duplicated by FQN and grouped by source', () => {
    const rows = [
      row({
        name: 'address',
        tags: [tag('PII.Sensitive')],
        children: [row({ name: 'city', tags: [tag('Glossary.City', 'Glossary'), tag('PII.Sensitive')] })],
      }),
      row({ name: 'email', tags: [tag('PII.Email')] }),
    ];
    const options = collectSchemaTagOptions(rows);
    expect(options.classification.map((item) => item.value).sort()).toEqual([
      'PII.Email',
      'PII.Sensitive',
    ]);
    expect(options.glossary.map((item) => item.value)).toEqual(['Glossary.City']);
  });

  it('labels options with the last FQN segment in Start Case', () => {
    const options = collectSchemaTagOptions([row({ name: 'a', tags: [tag('PII.Sensitive')] })]);
    expect(options.classification).toEqual([{ text: 'Sensitive', value: 'PII.Sensitive' }]);
  });
});

describe('filterSchemaRowsByTags (pin getFilteredTagsData)', () => {
  const rows = [
    row({
      name: 'address',
      tags: [tag('PII.Sensitive')],
      children: [
        row({ name: 'city', tags: [tag('Glossary.City', 'Glossary')] }),
        row({ name: 'zip', tags: [tag('PII.Zip')] }),
      ],
    }),
    row({ name: 'email', tags: [tag('PII.Email')] }),
  ];

  it('returns the input unchanged when nothing is selected', () => {
    expect(filterSchemaRowsByTags(rows, [], [])).toBe(rows);
  });

  it('keeps a self-matching row but prunes its children to matches', () => {
    const next = filterSchemaRowsByTags(rows, ['PII.Sensitive'], []);
    expect(next.map((item) => item.name)).toEqual(['address']);
    expect(next[0].children).toEqual([]);
  });

  it('keeps the ancestor path of a matching descendant', () => {
    const next = filterSchemaRowsByTags(rows, [], ['Glossary.City']);
    expect(next.map((item) => item.name)).toEqual(['address']);
    expect(next[0].children?.map((item) => item.name)).toEqual(['city']);
  });

  it('ANDs across columns and ORs within one column', () => {
    // city carries only the glossary tag, zip only a classification tag:
    // no single child satisfies both, so the parent drops out.
    expect(filterSchemaRowsByTags(rows, ['PII.Zip'], ['Glossary.City'])).toEqual([]);
    // Two classification values OR: address (via zip) and email both stay.
    const next = filterSchemaRowsByTags(rows, ['PII.Zip', 'PII.Email'], []);
    expect(next.map((item) => item.name)).toEqual(['address', 'email']);
    expect(next[0].children?.map((item) => item.name)).toEqual(['zip']);
  });
});
