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
  checkIfJoinsAvailable,
  getFrequentlyJoinedWithColumns,
  getJoinsFromTableJoins,
  getPartialNameFromTableFQN,
  getTableFQNFromColumnFQN,
  mapTableJoins,
} from './tableJoins';

describe('getTableFQNFromColumnFQN', () => {
  it('keeps the first four FQN parts', () => {
    expect(getTableFQNFromColumnFQN('svc.db.schema.orders.id')).toBe('svc.db.schema.orders');
    expect(getTableFQNFromColumnFQN('svc.db.schema.orders')).toBe('svc.db.schema.orders');
  });

  it('keeps quoted segments whole', () => {
    expect(getTableFQNFromColumnFQN('svc."my.db".schema.orders.id')).toBe(
      'svc."my.db".schema.orders',
    );
  });
});

describe('getPartialNameFromTableFQN', () => {
  it('emits requested parts in positional order, not request order', () => {
    expect(
      getPartialNameFromTableFQN('svc.db.schema.orders.id', ['database', 'table', 'schema', 'column'], '.'),
    ).toBe('db.schema.orders.id');
    expect(getPartialNameFromTableFQN('svc.db.schema.orders', ['database', 'table'], '.')).toBe(
      'db.orders',
    );
    expect(getPartialNameFromTableFQN('svc.db.schema.orders.id', ['database', 'table', 'column'], '.')).toBe(
      'db.orders.id',
    );
  });

  it('drops parts the FQN is too short to hold and empties', () => {
    expect(getPartialNameFromTableFQN('svc.db', ['database', 'table'], '.')).toBe('db');
    expect(getPartialNameFromTableFQN('', ['database', 'table'], '.')).toBe('');
  });

  it('defaults to the pin `/` separator, as the column popover renders', () => {
    expect(
      getPartialNameFromTableFQN('svc.db.schema.customers.id', ['database', 'table', 'column']),
    ).toBe('db/customers/id');
    expect(getPartialNameFromTableFQN('svc.db.schema.orders', ['database', 'table'])).toBe(
      'db/orders',
    );
  });
});

describe('getJoinsFromTableJoins', () => {
  it('rolls column joins up to tables, groups, sums, and sorts descending', () => {
    const joined = getJoinsFromTableJoins({
      columnJoins: [
        {
          columnName: 'id',
          joinedWith: [
            { fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 3 },
            { fullyQualifiedName: 'svc.db.schema.orders.id', joinCount: 1 },
          ],
        },
        {
          columnName: 'customer_id',
          joinedWith: [{ fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 4 }],
        },
      ],
      directTableJoins: [{ fullyQualifiedName: 'svc.db.schema.orders', joinCount: 10 }],
    });
    expect(joined).toEqual([
      { fullyQualifiedName: 'svc.db.schema.orders', joinCount: 11, name: 'db.orders' },
      { fullyQualifiedName: 'svc.db.schema.customers', joinCount: 7, name: 'db.customers' },
    ]);
  });

  it('returns an empty list without joins', () => {
    expect(getJoinsFromTableJoins(undefined)).toEqual([]);
    expect(getJoinsFromTableJoins({})).toEqual([]);
  });
});

describe('column join helpers', () => {
  const columnJoins = [
    {
      columnName: 'id',
      joinedWith: [
        { fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 3 },
        { fullyQualifiedName: 'svc.db.schema.orders.id', joinCount: 1 },
      ],
    },
  ];

  it('reports availability by exact column name match', () => {
    expect(checkIfJoinsAvailable('id', columnJoins)).toBe(true);
    expect(checkIfJoinsAvailable('other', columnJoins)).toBe(false);
    expect(checkIfJoinsAvailable('id', undefined)).toBe(false);
    expect(checkIfJoinsAvailable('id', [])).toBe(false);
  });

  it('returns the matching entry joinedWith list or an empty list', () => {
    expect(getFrequentlyJoinedWithColumns('id', columnJoins)).toHaveLength(2);
    expect(getFrequentlyJoinedWithColumns('other', columnJoins)).toEqual([]);
    expect(getFrequentlyJoinedWithColumns('id', undefined)).toEqual([]);
  });
});

describe('mapTableJoins', () => {
  it('maps the TableJoins payload and drops entries without an FQN', () => {
    expect(
      mapTableJoins({
        columnJoins: [
          {
            columnName: 'id',
            joinedWith: [
              { fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 3 },
              { joinCount: 9 },
            ],
          },
        ],
        directTableJoins: [{ fullyQualifiedName: 'svc.db.schema.orders', joinCount: 2 }],
        dayCount: 30,
      }),
    ).toEqual({
      columnJoins: [
        {
          columnName: 'id',
          joinedWith: [{ fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 3 }],
        },
      ],
      directTableJoins: [{ fullyQualifiedName: 'svc.db.schema.orders', joinCount: 2 }],
      dayCount: 30,
      startDate: undefined,
    });
    expect(mapTableJoins(null)).toBeUndefined();
    expect(mapTableJoins([])).toBeUndefined();
  });
});
