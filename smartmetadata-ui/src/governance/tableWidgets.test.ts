/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  aliasDisplayName,
  buildTableConstraints,
  createTableConstraintObject,
  flattenColumnNames,
  mapTableAliases,
  mapTableConstraints,
  mapTablePartition,
  referredTableFqn,
  toConstraintFormValues,
} from './tableWidgets';

describe('mapTableConstraints', () => {
  it('keeps the six pin constraint types and drops unknown ones', () => {
    expect(
      mapTableConstraints([
        { constraintType: 'PRIMARY_KEY', columns: ['id'] },
        { constraintType: 'FOREIGN_KEY', columns: ['user_id'], referredColumns: ['svc.db.schema.users.id'], relationshipType: 'MANY_TO_ONE' },
        { constraintType: 'CHECK', columns: ['x'] },
        { constraintType: 'UNIQUE', columns: ['email'] },
        { constraintType: 'NOT_NULL', columns: ['name'] },
        'junk',
        null,
      ]),
    ).toEqual([
      { constraintType: 'PRIMARY_KEY', columns: ['id'], referredColumns: undefined, relationshipType: undefined },
      {
        constraintType: 'FOREIGN_KEY',
        columns: ['user_id'],
        referredColumns: ['svc.db.schema.users.id'],
        relationshipType: 'MANY_TO_ONE',
      },
      { constraintType: 'UNIQUE', columns: ['email'], referredColumns: undefined, relationshipType: undefined },
    ]);
  });

  it('drops an invalid relationship type but keeps the constraint', () => {
    expect(
      mapTableConstraints([
        { constraintType: 'FOREIGN_KEY', columns: ['a'], relationshipType: 'BOGUS' },
      ]),
    ).toEqual([
      { constraintType: 'FOREIGN_KEY', columns: ['a'], referredColumns: undefined, relationshipType: undefined },
    ]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(mapTableConstraints(undefined)).toEqual([]);
    expect(mapTableConstraints({})).toEqual([]);
  });
});

describe('mapTablePartition', () => {
  it('keeps named columns and drops unnamed rows', () => {
    expect(
      mapTablePartition({
        columns: [
          { columnName: 'column1', interval: 'hourly', intervalType: 'COLUMN_VALUE' },
          { columnName: '', intervalType: 'TIME_UNIT' },
          { intervalType: 'TIME_UNIT' },
          { columnName: 'column2' },
        ],
      }),
    ).toEqual({
      columns: [
        { columnName: 'column1', interval: 'hourly', intervalType: 'COLUMN_VALUE' },
        { columnName: 'column2', interval: undefined, intervalType: undefined },
      ],
    });
  });

  it('returns undefined when there is no partition or no named column', () => {
    expect(mapTablePartition(undefined)).toBeUndefined();
    expect(mapTablePartition({ columns: [] })).toBeUndefined();
    expect(mapTablePartition({ columns: [{ columnName: '' }] })).toBeUndefined();
  });
});

describe('mapTableAliases / aliasDisplayName', () => {
  it('keeps non-empty alias FQNs', () => {
    expect(mapTableAliases(['svc.db.schema.orders', '', 'legacy', null])).toEqual([
      'svc.db.schema.orders',
      'legacy',
    ]);
  });

  it('takes the last FQN segment, quote-aware', () => {
    expect(aliasDisplayName('svc.db.schema.orders')).toBe('orders');
    expect(aliasDisplayName('svc."my.db".schema.orders')).toBe('orders');
    expect(aliasDisplayName('svc.db.schema."my.table"')).toBe('my.table');
    expect(aliasDisplayName('orders')).toBe('orders');
    expect(aliasDisplayName('')).toBe('');
  });
});

describe('referredTableFqn', () => {
  it('takes the first four FQN segments', () => {
    expect(referredTableFqn('svc.db.schema.users.id')).toBe('svc.db.schema.users');
  });

  it('returns undefined for short values so no dead link renders', () => {
    expect(referredTableFqn('users.id')).toBeUndefined();
    expect(referredTableFqn('')).toBeUndefined();
  });
});

describe('createTableConstraintObject / toConstraintFormValues / buildTableConstraints', () => {
  it('an empty key list saves as nothing', () => {
    expect(createTableConstraintObject([], 'PRIMARY_KEY')).toEqual([]);
    expect(createTableConstraintObject(undefined, 'UNIQUE')).toEqual([]);
    expect(createTableConstraintObject(['id'], 'PRIMARY_KEY')).toEqual([
      { columns: ['id'], constraintType: 'PRIMARY_KEY' },
    ]);
  });

  it('round-trips constraints through the modal form values', () => {
    const saved = [
      { constraintType: 'PRIMARY_KEY', columns: ['id'] },
      { constraintType: 'UNIQUE', columns: ['email'] },
      {
        constraintType: 'FOREIGN_KEY',
        columns: ['user_id'],
        referredColumns: ['svc.db.schema.users.id'],
        relationshipType: 'MANY_TO_ONE',
      },
    ];
    const form = toConstraintFormValues(saved);
    expect(form.constraintType).toBe('PRIMARY_KEY');
    expect(form.primaryConstraints).toEqual(['id']);
    expect(form.uniqueConstraints).toEqual(['email']);
    expect(form.foreignConstraints).toEqual([
      {
        columns: 'user_id',
        relationshipType: 'MANY_TO_ONE',
        referredColumns: 'svc.db.schema.users.id',
      },
    ]);
    expect(buildTableConstraints(form)).toEqual(saved);
  });

  it('an empty form still carries one empty foreign row and builds nothing', () => {
    const form = toConstraintFormValues([]);
    expect(form.foreignConstraints).toEqual([
      { columns: undefined, relationshipType: undefined, referredColumns: undefined },
    ]);
    expect(buildTableConstraints(form)).toEqual([]);
  });

  it('drops incomplete foreign rows on save', () => {
    expect(
      buildTableConstraints({
        constraintType: 'FOREIGN_KEY',
        primaryConstraints: undefined,
        uniqueConstraints: undefined,
        sortConstraints: undefined,
        distConstraints: undefined,
        clusterConstraints: undefined,
        foreignConstraints: [
          { columns: 'a', relationshipType: 'MANY_TO_ONE', referredColumns: 'svc.db.schema.t.c' },
          { columns: 'b', relationshipType: undefined, referredColumns: 'svc.db.schema.t.c' },
          { columns: undefined, relationshipType: 'MANY_TO_ONE', referredColumns: 'svc.db.schema.t.c' },
        ],
      }),
    ).toEqual([
      {
        columns: ['a'],
        relationshipType: 'MANY_TO_ONE',
        referredColumns: ['svc.db.schema.t.c'],
        constraintType: 'FOREIGN_KEY',
      },
    ]);
  });
});

describe('flattenColumnNames', () => {
  it('descends into nested STRUCT children', () => {
    expect(
      flattenColumnNames([
        { key: 'a', name: 'a', dataType: 'int', indexPath: [0] },
        {
          key: 'b',
          name: 'b',
          dataType: 'struct',
          indexPath: [1],
          children: [
            { key: 'b.c', name: 'c', dataType: 'string', indexPath: [1, 0] },
            { key: 'b.d', name: 'd', dataType: 'string', indexPath: [1, 1] },
          ],
        },
      ]),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});
