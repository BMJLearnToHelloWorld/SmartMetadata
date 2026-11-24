/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { customPropertyFieldDefs } from './advancedSearchFields';

describe('customPropertyFieldDefs', () => {
  it('maps a string property to a .keyword text field', () => {
    const defs = customPropertyFieldDefs('table', { name: 'owner', propertyType: 'string' });
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({
      key: 'extension.table.owner.keyword',
      label: 'owner',
      type: 'text',
      esField: 'owner.keyword',
      entityType: 'table',
    });
    expect(defs[0]?.operators).toContain('like');
  });

  it('maps number/integer/timestamp without .keyword and enum to a multiselect with list values', () => {
    const numberDefs = customPropertyFieldDefs('table', { name: 'retentionDays', propertyType: 'integer' });
    expect(numberDefs[0]?.key).toBe('extension.table.retentionDays');
    expect(numberDefs[0]?.type).toBe('number');
    expect(numberDefs[0]?.operators).toContain('between');

    const enumDefs = customPropertyFieldDefs('table', {
      name: 'sensitivity',
      propertyType: 'enum',
      config: { values: ['low', 'high'] },
    });
    expect(enumDefs[0]?.type).toBe('multiselect');
    expect(enumDefs[0]?.operators).toContain('multiselect_contains');
    expect(enumDefs[0]?.listValues).toEqual([
      { value: 'low', label: 'low' },
      { value: 'high', label: 'high' },
    ]);
  });

  it('maps entityReference to a displayName select and table-cp to one field per column', () => {
    const refDefs = customPropertyFieldDefs('table', { name: 'steward', propertyType: 'entityReference' });
    expect(refDefs[0]?.key).toBe('extension.table.steward.displayName.keyword');
    expect(refDefs[0]?.type).toBe('select');

    const tableDefs = customPropertyFieldDefs('table', {
      name: 'matrix',
      propertyType: 'table-cp',
      config: { columns: ['a', 'b'] },
    });
    expect(tableDefs.map((def) => def.key)).toEqual([
      'extension.table.matrix.rows.a',
      'extension.table.matrix.rows.b',
    ]);
    expect(tableDefs[0]?.label).toBe('matrix - a');
  });

  it('maps timeInterval and hyperlink-cp to their sub-fields', () => {
    const interval = customPropertyFieldDefs('table', { name: 'window', propertyType: 'timeInterval' });
    expect(interval.map((def) => def.key)).toEqual([
      'extension.table.window.start',
      'extension.table.window.end',
    ]);
    const link = customPropertyFieldDefs('table', { name: 'doc', propertyType: 'hyperlink-cp' });
    expect(link.map((def) => def.key)).toEqual([
      'extension.table.doc.url',
      'extension.table.doc.displayText',
    ]);
  });
});
