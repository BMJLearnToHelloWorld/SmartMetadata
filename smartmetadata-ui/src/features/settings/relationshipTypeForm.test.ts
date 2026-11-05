/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { RelationshipType } from '@/api/relationshipTypes';
import {
  cardinalityForPreset,
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
    ).toBeDefined();
    expect(
      validateRelationshipTypeForm(form(), EXISTING, [EXISTING], t).rdfPredicate,
    ).toBeUndefined();
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
