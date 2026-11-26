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
import type { CustomPropertyDef } from '@/types/collaboration';
import type { SchemaRow } from '@/types/api';
import {
  buildUpdatedExtension,
  customPropertyTypeNameFor,
  filterPreviewCustomProperties,
  findColumnExtension,
  isCustomPropertyValueEmpty,
  pruneUpdatedExtension,
  summarizeCustomPropertyValue,
} from './previewCustomProperties';

const t = (key: string, params?: Record<string, string | number>): string => {
  if (key === 'label.count-row-plural') {
    return `${params?.count} rows`;
  }
  if (key === 'label.count-line-plural') {
    return `${params?.count} lines`;
  }
  return key;
};

const defs: CustomPropertyDef[] = [
  { name: 'sensitivity', displayName: 'Sensitivity', propertyType: 'string' },
  { name: 'retentionDays', displayName: 'Retention days', propertyType: 'integer' },
  { name: 'owner', displayName: 'Owner', propertyType: 'entityReference' },
];

describe('customPropertyTypeNameFor', () => {
  it('maps tableColumn to the column type (pin getTypeByFQN equivalent)', () => {
    expect(customPropertyTypeNameFor('tableColumn')).toBe('column');
    expect(customPropertyTypeNameFor('table')).toBe('table');
    expect(customPropertyTypeNameFor('glossaryTerm')).toBe('glossaryTerm');
  });
});

describe('filterPreviewCustomProperties', () => {
  it('matches name, displayName, and property-type name (pin :120-150)', () => {
    expect(filterPreviewCustomProperties(defs, 'sens').map((def) => def.name)).toEqual([
      'sensitivity',
    ]);
    expect(filterPreviewCustomProperties(defs, 'RETENTION').map((def) => def.name)).toEqual([
      'retentionDays',
    ]);
    expect(filterPreviewCustomProperties(defs, 'entityreference').map((def) => def.name)).toEqual([
      'owner',
    ]);
    expect(filterPreviewCustomProperties(defs, 'integer').map((def) => def.name)).toEqual([
      'retentionDays',
    ]);
  });

  it('returns everything on a blank query and nothing on a miss', () => {
    expect(filterPreviewCustomProperties(defs, '  ')).toBe(defs);
    expect(filterPreviewCustomProperties(defs, 'zzz')).toEqual([]);
  });
});

describe('isCustomPropertyValueEmpty', () => {
  it('treats nil, empty string, and empty objects as empty (pin isPropertyValueEmpty)', () => {
    expect(isCustomPropertyValueEmpty('string', undefined)).toBe(true);
    expect(isCustomPropertyValueEmpty('string', null)).toBe(true);
    expect(isCustomPropertyValueEmpty('string', '')).toBe(true);
    expect(isCustomPropertyValueEmpty('string', {})).toBe(true);
    expect(isCustomPropertyValueEmpty('string', [])).toBe(true);
    expect(isCustomPropertyValueEmpty('string', 'x')).toBe(false);
    expect(isCustomPropertyValueEmpty('string', 0)).toBe(false);
    expect(isCustomPropertyValueEmpty('string', false)).toBe(false);
  });

  it('judges table properties by their rows and hyperlinks by their URL', () => {
    expect(isCustomPropertyValueEmpty('table-cp', { rows: [] })).toBe(true);
    expect(isCustomPropertyValueEmpty('table-cp', { rows: [{ a: 1 }] })).toBe(false);
    expect(isCustomPropertyValueEmpty('hyperlink-cp', { displayText: 'x' })).toBe(true);
    expect(isCustomPropertyValueEmpty('hyperlink-cp', { url: 'https://example.test' })).toBe(false);
  });
});

describe('summarizeCustomPropertyValue', () => {
  it('renders scalars as plain strings', () => {
    expect(summarizeCustomPropertyValue('string', 'high', t)).toBe('high');
    expect(summarizeCustomPropertyValue('integer', 30, t)).toBe('30');
    expect(summarizeCustomPropertyValue('boolean', true, t)).toBe('true');
  });

  it('collapses entity references to names and enums to a joined list', () => {
    expect(
      summarizeCustomPropertyValue(
        'entityReference',
        { displayName: 'Orders', name: 'orders' },
        t,
      ),
    ).toBe('Orders');
    expect(
      summarizeCustomPropertyValue(
        'entityReferenceList',
        [{ name: 'a' }, { displayName: 'Bee', name: 'b' }],
        t,
      ),
    ).toBe('a, Bee');
    expect(summarizeCustomPropertyValue('enum', ['a', 'b'], t)).toBe('a, b');
  });

  it('shows hyperlink display text, table row counts, and SQL line counts', () => {
    expect(
      summarizeCustomPropertyValue('hyperlink-cp', { url: 'https://example.test', displayText: 'Docs' }, t),
    ).toBe('Docs');
    expect(
      summarizeCustomPropertyValue('hyperlink-cp', { url: 'https://example.test' }, t),
    ).toBe('https://example.test');
    expect(summarizeCustomPropertyValue('table-cp', { rows: [{}, {}] }, t)).toBe('2 rows');
    expect(summarizeCustomPropertyValue('sqlQuery', 'select 1\nfrom t', t)).toBe('2 lines');
  });
});

describe('buildUpdatedExtension', () => {
  it('merges one edited value and prunes empties (pin buildUpdatedExtension)', () => {
    expect(buildUpdatedExtension({ a: 'x' }, 'b', 'string', 'y')).toEqual({ a: 'x', b: 'y' });
    expect(buildUpdatedExtension({ a: 'x', b: 'y' }, 'b', 'string', '')).toEqual({ a: 'x' });
    expect(buildUpdatedExtension({ a: 'x' }, 'a', 'string', undefined)).toBeUndefined();
    expect(buildUpdatedExtension(undefined, 'a', 'string', 'x')).toEqual({ a: 'x' });
  });

  it('coerces numerics and wraps enums like pin resolveSavedValue', () => {
    expect(buildUpdatedExtension({}, 'n', 'integer', '30')).toEqual({ n: 30 });
    expect(buildUpdatedExtension({}, 'e', 'enum', 'a')).toEqual({ e: ['a'] });
    expect(buildUpdatedExtension({}, 'e', 'enum', ['a', '', 'b'])).toEqual({ e: ['a', 'b'] });
    expect(buildUpdatedExtension({}, 't', 'table-cp', { rows: [] })).toBeUndefined();
  });
});

describe('pruneUpdatedExtension', () => {
  it('drops empty entries from a whole-record save and reports an empty extension', () => {
    expect(pruneUpdatedExtension({ a: 'x', b: '', c: null, d: {} })).toEqual({ a: 'x' });
    expect(pruneUpdatedExtension({ a: '' })).toBeUndefined();
    expect(pruneUpdatedExtension({ a: 0, b: false })).toEqual({ a: 0, b: false });
  });
});

describe('findColumnExtension', () => {
  const rows: SchemaRow[] = [
    { key: 'a', name: 'a', dataType: 'int', fullyQualifiedName: 't.a' },
    {
      key: 's',
      name: 's',
      dataType: 'struct',
      fullyQualifiedName: 't.s',
      children: [
        {
          key: 's.b',
          name: 'b',
          dataType: 'varchar',
          fullyQualifiedName: 't.s.b',
          extension: { sensitivity: 'high' },
        },
      ],
    },
  ];

  it('finds a nested column extension by FQN and misses unknown columns', () => {
    expect(findColumnExtension(rows, 't.s.b')).toEqual({ sensitivity: 'high' });
    expect(findColumnExtension(rows, 't.a')).toBeUndefined();
    expect(findColumnExtension(rows, 't.zzz')).toBeUndefined();
  });
});
