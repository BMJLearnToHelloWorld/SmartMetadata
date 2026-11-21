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
import { splitFqn, unquoteFqnPart } from './fqn';

describe('splitFqn', () => {
  it('splits on unquoted dots', () => {
    expect(splitFqn('svc.db.schema.orders.id')).toEqual(['svc', 'db', 'schema', 'orders', 'id']);
    expect(splitFqn('orders')).toEqual(['orders']);
  });

  it('keeps double-quoted segments whole, quotes included', () => {
    expect(splitFqn('svc."my.db".schema.orders')).toEqual(['svc', '"my.db"', 'schema', 'orders']);
  });

  it('drops empty segments', () => {
    expect(splitFqn('')).toEqual([]);
    expect(splitFqn('svc..orders')).toEqual(['svc', 'orders']);
  });
});

describe('unquoteFqnPart', () => {
  it('strips one pair of surrounding quotes', () => {
    expect(unquoteFqnPart('"my.db"')).toBe('my.db');
    expect(unquoteFqnPart('orders')).toBe('orders');
  });

  it('leaves a lone quote alone', () => {
    expect(unquoteFqnPart('"orders')).toBe('"orders');
    expect(unquoteFqnPart('"')).toBe('"');
    expect(unquoteFqnPart('')).toBe('');
  });
});
