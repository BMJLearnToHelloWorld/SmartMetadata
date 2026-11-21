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
import { schemaRowKeys, searchSchemaRows, updateNestedSchemaRows } from './schemaColumns';

function row(partial: Partial<SchemaRow> & { name: string }): SchemaRow {
  return {
    key: partial.name,
    dataType: 'VARCHAR',
    ...partial,
  };
}

describe('updateNestedSchemaRows (pin updateColumnInNestedStructure)', () => {
  it('replaces the row matched by FQN at the top level', () => {
    const rows = [
      row({ name: 'email', fullyQualifiedName: 't.email', description: 'old' }),
      row({ name: 'name', fullyQualifiedName: 't.name' }),
    ];
    const next = updateNestedSchemaRows(rows, 't.email', { description: 'new' });
    expect(next[0].description).toBe('new');
    expect(next[1]).toBe(rows[1]);
    expect(rows[0].description).toBe('old');
  });

  it('replaces a nested STRUCT child without touching its siblings', () => {
    const rows = [
      row({
        name: 'address',
        fullyQualifiedName: 't.address',
        children: [
          row({ name: 'city', fullyQualifiedName: 't.address.city', description: 'old' }),
          row({ name: 'zip', fullyQualifiedName: 't.address.zip' }),
        ],
      }),
    ];
    const next = updateNestedSchemaRows(rows, 't.address.city', { description: 'new' });
    expect(next[0].children?.[0].description).toBe('new');
    expect(next[0].children?.[1]).toBe(rows[0].children?.[1]);
  });

  it('leaves the tree untouched when no FQN matches', () => {
    const rows = [row({ name: 'email', fullyQualifiedName: 't.email' })];
    expect(updateNestedSchemaRows(rows, 't.missing', { description: 'x' })).toEqual(rows);
  });

  it('drops stale children only when the patch explicitly carries none', () => {
    const rows = [
      row({
        name: 'address',
        fullyQualifiedName: 't.address',
        children: [row({ name: 'city', fullyQualifiedName: 't.address.city' })],
      }),
    ];
    const cleared = updateNestedSchemaRows(rows, 't.address', { children: undefined });
    expect(cleared[0].children).toBeUndefined();
    const kept = updateNestedSchemaRows(rows, 't.address', { description: 'd' });
    expect(kept[0].children).toHaveLength(1);
  });
});

describe('searchSchemaRows (pin searchInFields)', () => {
  const rows = [
    row({
      name: 'address',
      fullyQualifiedName: 't.address',
      description: 'Postal address',
      children: [
        row({ name: 'city', fullyQualifiedName: 't.address.city', dataType: 'VARCHAR' }),
        row({ name: 'zip', fullyQualifiedName: 't.address.zip', dataType: 'INT' }),
      ],
    }),
    row({ name: 'email', fullyQualifiedName: 't.email', description: 'Contact email' }),
  ];

  it('returns the input unchanged for a blank query', () => {
    expect(searchSchemaRows(rows, '  ')).toBe(rows);
  });

  it('matches name, description and data type case-insensitively', () => {
    expect(searchSchemaRows(rows, 'EMAIL').map((item) => item.name)).toEqual(['email']);
    expect(searchSchemaRows(rows, 'postal').map((item) => item.name)).toEqual(['address']);
    expect(searchSchemaRows(rows, 'int').map((item) => item.name)).toEqual(['address']);
  });

  it('keeps a matching ancestor path with only the matching children', () => {
    const next = searchSchemaRows(rows, 'city');
    expect(next.map((item) => item.name)).toEqual(['address']);
    expect(next[0].children?.map((item) => item.name)).toEqual(['city']);
  });

  it('keeps a self-matching row whole, including non-matching children', () => {
    const next = searchSchemaRows(rows, 'address');
    expect(next[0].children).toHaveLength(2);
  });
});

describe('schemaRowKeys', () => {
  it('collects every row key at every depth', () => {
    const rows = [
      row({
        name: 'address',
        children: [row({ name: 'city', key: 'address.city' })],
      }),
    ];
    expect(schemaRowKeys(rows)).toEqual(['address', 'address.city']);
  });
});
