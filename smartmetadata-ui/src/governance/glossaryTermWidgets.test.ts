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
  filterSavableReferences,
  findDuplicateSynonym,
  groupRelatedTerms,
  normalizeSynonyms,
  toRelationRows,
  toTermRelations,
  validateReference,
} from './glossaryTermWidgets';

describe('findDuplicateSynonym', () => {
  it('rejects a case-insensitive duplicate and returns the existing value', () => {
    expect(findDuplicateSynonym(['test', 'Finance'], 'Test')).toBe('test');
    expect(findDuplicateSynonym(['test'], 'billing')).toBeUndefined();
    expect(findDuplicateSynonym(['test'], '  ')).toBeUndefined();
  });
});

describe('normalizeSynonyms', () => {
  it('drops empty strings only', () => {
    expect(normalizeSynonyms(['a', '', 'b'])).toEqual(['a', 'b']);
  });
});

describe('validateReference / filterSavableReferences', () => {
  it('requires a name and an http(s) parsable endpoint', () => {
    expect(validateReference({ name: '', endpoint: 'https://example.com' })).toBe('nameRequired');
    expect(validateReference({ name: 'Docs', endpoint: '' })).toBe('endpointRequired');
    expect(validateReference({ name: 'Docs', endpoint: 'ftp://example.com' })).toBe('urlScheme');
    expect(validateReference({ name: 'Docs', endpoint: 'https://exa mple.com' })).toBe('urlParsable');
    expect(validateReference({ name: 'Docs', endpoint: 'https://example.com/x' })).toBeUndefined();
  });

  it('drops rows missing a name or endpoint and trims the rest', () => {
    expect(
      filterSavableReferences([
        { name: ' Docs ', endpoint: ' https://example.com ' },
        { name: '', endpoint: 'https://example.com' },
        { name: 'No endpoint', endpoint: '' },
      ]),
    ).toEqual([{ name: 'Docs', endpoint: 'https://example.com' }]);
  });
});

describe('groupRelatedTerms / toTermRelations / toRelationRows', () => {
  const relations = [
    { name: 'A', fullyQualifiedName: 'g.A', relationType: 'relatedTo' },
    { name: 'B', fullyQualifiedName: 'g.B', relationType: 'isA' },
    { name: 'C', fullyQualifiedName: 'g.C', relationType: 'relatedTo' },
    { name: 'D', fullyQualifiedName: 'g.D' },
  ];

  it('groups by relation type in first-seen order, defaulting to relatedTo', () => {
    expect(groupRelatedTerms(relations)).toEqual([
      {
        relationType: 'relatedTo',
        terms: [relations[0], relations[2], relations[3]],
      },
      { relationType: 'isA', terms: [relations[1]] },
    ]);
  });

  it('round-trips groups through the save shape', () => {
    const rows = toRelationRows(relations);
    expect(rows.map((row) => row.relationType)).toEqual(['relatedTo', 'isA']);
    expect(toTermRelations(rows)).toEqual([
      { relationType: 'relatedTo', term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.A', name: 'A', displayName: undefined } },
      { relationType: 'relatedTo', term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.C', name: 'C', displayName: undefined } },
      { relationType: 'relatedTo', term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.D', name: 'D', displayName: undefined } },
      { relationType: 'isA', term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.B', name: 'B', displayName: undefined } },
    ]);
  });
});
