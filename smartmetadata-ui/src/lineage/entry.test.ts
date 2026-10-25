/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { lineageTargetFromHit, lineageTargetFromTypedFqn } from './entry';

describe('lineageTargetFromHit', () => {
  it('requires both entity type and FQN from a search hit', () => {
    expect(
      lineageTargetFromHit({ entityType: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ).toEqual({ entityType: 'table', fqn: 'svc.db.schema.orders' });
    expect(lineageTargetFromHit({ entityType: 'table', fullyQualifiedName: '' })).toBeNull();
    expect(lineageTargetFromHit({ entityType: '', fullyQualifiedName: 'svc.db.schema.orders' })).toBeNull();
  });
});

describe('lineageTargetFromTypedFqn', () => {
  it('trims the typed FQN form used as the fallback entry', () => {
    expect(lineageTargetFromTypedFqn(' table ', '  svc.db.schema.orders  ')).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
    expect(lineageTargetFromTypedFqn('table', '   ')).toBeNull();
  });
});
