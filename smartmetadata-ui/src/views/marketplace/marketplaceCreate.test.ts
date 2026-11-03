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
import type { AdminUser } from '@/types/admin';
import {
  buildDataProductCreateBody,
  buildDomainCreateBody,
  buildEntityStyle,
  buildOwnerRefs,
} from './marketplaceCreate';

const USERS: AdminUser[] = [
  {
    id: 'u1',
    name: 'alice',
    displayName: 'Alice',
    teams: [],
  },
  { id: 'u2', name: 'bob', teams: [] },
];

const FIELDS = { ownerNames: ['alice'], expertNames: ['bob', ' carol '], iconURL: 'https://example.com/icon.svg', color: '#005587' };

describe('marketplaceCreate', () => {
  it('resolves owner names to user references, falling back to a type-only ref', () => {
    expect(buildOwnerRefs(['alice', 'nobody'], USERS)).toEqual([
      { id: 'u1', name: 'alice', type: 'user', displayName: 'Alice' },
      { id: undefined, name: 'nobody', type: 'user', displayName: undefined },
    ]);
  });

  it('sends style only when icon or color is filled in', () => {
    expect(buildEntityStyle('', '')).toBeUndefined();
    expect(buildEntityStyle('https://example.com/icon.svg', '')).toEqual({ iconURL: 'https://example.com/icon.svg', color: undefined });
    expect(buildEntityStyle('', '#005587')).toEqual({ iconURL: undefined, color: '#005587' });
  });

  it('builds a data-product body with owners, trimmed experts, and style', () => {
    const body = buildDataProductCreateBody(
      { name: 'churn', description: 'Churn signals', domains: ['sales'] },
      FIELDS,
      USERS,
    );
    expect(body).toMatchObject({
      name: 'churn',
      description: 'Churn signals',
      domains: ['sales'],
      owners: [{ id: 'u1', name: 'alice', type: 'user' }],
      experts: ['bob', 'carol'],
      style: { iconURL: 'https://example.com/icon.svg', color: '#005587' },
    });
  });

  it('omits owners, experts, and style when the create fields are empty', () => {
    const body = buildDomainCreateBody(
      { name: 'sales', description: 'Sales domain', domainType: 'Source-aligned' },
      { ownerNames: [], expertNames: [], iconURL: '  ', color: '' },
      USERS,
    );
    expect(body.owners).toBeUndefined();
    expect(body.experts).toBeUndefined();
    expect(body.style).toBeUndefined();
    expect(body).toMatchObject({ name: 'sales', domainType: 'Source-aligned' });
  });
});
