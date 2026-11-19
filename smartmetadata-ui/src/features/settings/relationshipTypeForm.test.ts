/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { RelationshipType } from '@/api/relationshipTypes';
import {
  cardinalityForPreset,
  DEFAULT_RELATIONSHIP_TYPE_FORM,
  deriveCardinalityPreset,
  toRelationshipTypeForm,
  toRelationshipTypeRequest,
  validateRelationshipTypeForm,
  type RelationshipTypeFormValues,
} from './relationshipTypeForm';

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

function form(overrides: Partial<RelationshipTypeFormValues> = {}): RelationshipTypeFormValues {
  return {
    cardinalityPreset: 'MANY_TO_MANY',
    category: 'CUSTOM',
    characteristics: [],
    crossGlossaryAllowed: true,
    description: 'd',
    displayName: 'Is A',
    name: 'isA',
    paletteKey: 'VIOLET',
    rdfPredicate: 'http://example.test/isA',
    ...overrides,
  };
}

const EXISTING: RelationshipType = {
  id: 'r1',
  name: 'isA',
  displayName: 'Is A',
  rdfPredicate: 'http://example.test/isA',
  characteristics: [],
};

describe('relationshipTypeForm', () => {
  it('derives presets from cardinality and back', () => {
    expect(deriveCardinalityPreset(undefined)).toBe('MANY_TO_MANY');
    expect(deriveCardinalityPreset({ sourceMax: 1, targetMax: 1 })).toBe('ONE_TO_ONE');
    expect(deriveCardinalityPreset({ targetMax: 1 })).toBe('ONE_TO_MANY');
    expect(deriveCardinalityPreset({ sourceMax: 1 })).toBe('MANY_TO_ONE');
    expect(deriveCardinalityPreset({ sourceMax: 2 })).toBe('CUSTOM');
    expect(cardinalityForPreset(form({ cardinalityPreset: 'ONE_TO_ONE' }))).toEqual({
      sourceMax: 1,
      targetMax: 1,
    });
    expect(cardinalityForPreset(form())).toBeUndefined();
  });

  it('round-trips a type through the form', () => {
    const values = toRelationshipTypeForm({
      ...EXISTING,
      cardinality: { sourceMax: 1, targetMax: 1 },
      category: 'CORE',
    });
    expect(values.cardinalityPreset).toBe('ONE_TO_ONE');
    expect(toRelationshipTypeRequest(values).cardinality).toEqual({ sourceMax: 1, targetMax: 1 });
  });

  it('carries the six unedited fields through the form untouched', () => {
    const request = toRelationshipTypeRequest(
      toRelationshipTypeForm({
        ...EXISTING,
        description: 'd',
        iri: 'http://example.test/isA',
        category: 'CUSTOM',
        characteristics: ['TRANSITIVE'],
        cardinality: { sourceMax: 1 },
        crossGlossaryAllowed: true,
        paletteKey: 'VIOLET',
        systemDefined: false,
        inverse: 'relatedTo',
        owners: [{ id: 'u1', name: 'admin', type: 'user' }],
        reviewers: [],
        disjointWith: ['otherType'],
        domain: [
          {
            iri: 'http://example.test/Domain',
            term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
          },
        ],
        entityStatus: 'In Review',
        propertyChain: ['a', 'b'],
        range: [],
        replacedBy: 'newType',
      }),
    );
    expect(request).toEqual({
      cardinality: { sourceMax: 1 },
      category: 'CUSTOM',
      characteristics: ['TRANSITIVE'],
      crossGlossaryAllowed: true,
      description: 'd',
      disjointWith: ['otherType'],
      displayName: 'Is A',
      domain: [
        {
          iri: 'http://example.test/Domain',
          term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
        },
      ],
      entityStatus: 'In Review',
      inverse: 'relatedTo',
      iri: 'http://example.test/isA',
      name: 'isA',
      owners: [{ id: 'u1', name: 'admin', type: 'user' }],
      paletteKey: 'VIOLET',
      propertyChain: ['a', 'b'],
      range: [],
      rdfPredicate: 'http://example.test/isA',
      replacedBy: 'newType',
      reviewers: [],
    });
  });

  it('trims only description, displayName, name and rdfPredicate', () => {
    const request = toRelationshipTypeRequest(
      form({
        description: '  d  ',
        displayName: '  Is A  ',
        name: '  isA  ',
        rdfPredicate: '  http://example.test/isA  ',
        inverse: ' relatedTo ',
        iri: ' http://example.test/isA ',
        replacedBy: ' newType ',
      }),
    );
    expect(request.description).toBe('d');
    expect(request.displayName).toBe('Is A');
    expect(request.name).toBe('isA');
    expect(request.rdfPredicate).toBe('http://example.test/isA');
    expect(request.inverse).toBe(' relatedTo ');
    expect(request.iri).toBe(' http://example.test/isA ');
    expect(request.replacedBy).toBe(' newType ');
  });

  it('turns an empty inverse or iri into undefined', () => {
    expect(toRelationshipTypeRequest(form({ inverse: '' })).inverse).toBeUndefined();
    expect(toRelationshipTypeRequest(form({ iri: '' })).iri).toBeUndefined();
  });

  it('omits the six unedited fields from a fresh create request', () => {
    const serialized = JSON.parse(
      JSON.stringify(toRelationshipTypeRequest({ ...DEFAULT_RELATIONSHIP_TYPE_FORM })),
    ) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('disjointWith');
    expect(serialized).not.toHaveProperty('domain');
    expect(serialized).not.toHaveProperty('entityStatus');
    expect(serialized).not.toHaveProperty('propertyChain');
    expect(serialized).not.toHaveProperty('range');
    expect(serialized).not.toHaveProperty('replacedBy');
  });

  it('rejects a bad name, a missing display name and a non-IRI predicate', () => {
    const errors = validateRelationshipTypeForm(
      form({ name: '1bad', displayName: ' ', rdfPredicate: 'not-a-iri' }),
      undefined,
      [],
      t,
    );
    expect(errors.name).toBeDefined();
    expect(errors.displayName).toBeDefined();
    expect(errors.rdfPredicate).toBeDefined();
  });

  it('rejects a duplicate predicate from another type, but not its own', () => {
    expect(
      validateRelationshipTypeForm(form(), undefined, [EXISTING], t).rdfPredicate,
    ).toBe('settings.glossaryTermRelations.rdfPredicateAlreadyUsed:{"name":"Is A"}');
    expect(
      validateRelationshipTypeForm(form(), EXISTING, [EXISTING], t).rdfPredicate,
    ).toBeUndefined();
  });

  it('tests the IRI pattern against the untrimmed predicate', () => {
    // A predicate that only passes once trimmed fails official's
    // pattern, which runs on the raw value.
    expect(
      validateRelationshipTypeForm(
        form({ rdfPredicate: ' http://example.test/isA ' }),
        undefined,
        [],
        t,
      ).rdfPredicate,
    ).toBe('settings.glossaryTermRelations.invalidUrl');
  });

  it('lets the duplicate check overwrite the pattern error', () => {
    // Raw value fails the pattern AND its trimmed form duplicates a
    // stored predicate: the duplicate message wins, per official's
    // independent second check.
    expect(
      validateRelationshipTypeForm(
        form({ rdfPredicate: ' http://example.test/isA ' }),
        undefined,
        [EXISTING],
        t,
      ).rdfPredicate,
    ).toBe('settings.glossaryTermRelations.rdfPredicateAlreadyUsed:{"name":"Is A"}');
  });

  it('carries the stored displayName with no name fallback in the duplicate message', () => {
    const unnamed: RelationshipType = {
      id: 'r9',
      name: 'nameless',
      rdfPredicate: 'http://example.test/isA',
      characteristics: [],
    };
    expect(
      validateRelationshipTypeForm(form(), undefined, [unnamed], t).rdfPredicate,
    ).toBe('settings.glossaryTermRelations.rdfPredicateAlreadyUsed:{}');
  });

  it('rejects opposing symmetry and functional cardinality violations', () => {
    expect(
      validateRelationshipTypeForm(
        form({ characteristics: ['SYMMETRIC', 'ASYMMETRIC'] }),
        undefined,
        [],
        t,
      ).characteristics,
    ).toBeDefined();
    expect(
      validateRelationshipTypeForm(
        form({ characteristics: ['FUNCTIONAL'] }),
        undefined,
        [],
        t,
      ).characteristics,
    ).toBeDefined();
    expect(
      validateRelationshipTypeForm(
        form({ characteristics: ['FUNCTIONAL'], cardinalityPreset: 'MANY_TO_ONE' }),
        undefined,
        [],
        t,
      ).characteristics,
    ).toBeUndefined();
  });
});
