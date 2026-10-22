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
import { parseEntityLink, toEntityLink } from './entityLink';

describe('entityLink', () => {
  it('builds a table-level MessageParser link', () => {
    expect(toEntityLink('table', 'svc.db.schema.orders')).toBe('<#E::table::svc.db.schema.orders>');
  });

  it('builds a column-level MessageParser link', () => {
    expect(toEntityLink('table', 'svc.db.schema.orders', 'amount')).toBe(
      '<#E::table::svc.db.schema.orders::columns::amount>',
    );
  });

  it('rejects empty type or FQN', () => {
    expect(() => toEntityLink('', 'fqn')).toThrow(/requires/);
  });

  it('parses table and column links', () => {
    expect(parseEntityLink('<#E::table::svc.db.schema.orders>')).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
    expect(parseEntityLink('<#E::table::svc.db.schema.orders::columns::id>')).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      column: 'id',
    });
  });
});
