/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import type {
  CreateRelationshipTypeRequest,
  RelationshipCardinality,
  RelationshipCategory,
  RelationshipCharacteristic,
  RelationshipPaletteKey,
  RelationshipType,
} from '@/api/relationshipTypes';
import type { EntityRef } from '@/types/api';

/**
 * Pure form mapping + validation for glossary-term relation types,
 * mirroring official RelationshipTypeForm.utils.ts and
 * RelationshipTypeForm.validation.ts exactly in rule, adapted to Vue
 * types: cardinality presets derive from source/target maxima, the
 * request trims identity strings, and owners/reviewers pass through
 * untouched (the official form does not edit them either).
 */
export type CardinalityPreset = 'CUSTOM' | 'MANY_TO_MANY' | 'MANY_TO_ONE' | 'ONE_TO_MANY' | 'ONE_TO_ONE';

export interface RelationshipTypeFormValues {
  cardinalityPreset: CardinalityPreset;
  category?: RelationshipCategory;
  characteristics: RelationshipCharacteristic[];
  cardinality?: RelationshipCardinality;
  crossGlossaryAllowed?: boolean;
  description?: string;
  displayName?: string;
  name: string;
  paletteKey?: RelationshipPaletteKey;
  rdfPredicate: string;
  inverse?: string;
  iri?: string;
  owners?: EntityRef[];
  reviewers?: EntityRef[];
}

export const DEFAULT_RELATIONSHIP_TYPE_FORM: RelationshipTypeFormValues = {
  cardinalityPreset: 'MANY_TO_MANY',
  category: 'CUSTOM',
  characteristics: [],
  crossGlossaryAllowed: true,
  description: '',
  displayName: '',
  name: '',
  paletteKey: 'VIOLET',
  rdfPredicate: '',
};

export function deriveCardinalityPreset(cardinality: RelationshipCardinality | undefined): CardinalityPreset {
  const sourceMax = cardinality?.sourceMax;
  const targetMax = cardinality?.targetMax;
  if (sourceMax === undefined && targetMax === undefined) {
    return 'MANY_TO_MANY';
  }
  if (sourceMax === 1 && targetMax === 1) {
    return 'ONE_TO_ONE';
  }
  if (sourceMax === undefined && targetMax === 1) {
    return 'ONE_TO_MANY';
  }
  if (sourceMax === 1 && targetMax === undefined) {
    return 'MANY_TO_ONE';
  }
  return 'CUSTOM';
}

export function cardinalityForPreset(form: RelationshipTypeFormValues): RelationshipCardinality | undefined {
  switch (form.cardinalityPreset) {
    case 'ONE_TO_ONE':
      return { sourceMax: 1, targetMax: 1 };
    case 'ONE_TO_MANY':
      return { targetMax: 1 };
    case 'MANY_TO_ONE':
      return { sourceMax: 1 };
    case 'CUSTOM':
      return form.cardinality;
    case 'MANY_TO_MANY':
      return undefined;
  }
}

export function toRelationshipTypeForm(type: RelationshipType): RelationshipTypeFormValues {
  return {
    cardinality: type.cardinality,
    cardinalityPreset: deriveCardinalityPreset(type.cardinality),
    category: type.category,
    characteristics: type.characteristics ?? [],
    crossGlossaryAllowed: type.crossGlossaryAllowed,
    description: type.description,
    displayName: type.displayName,
    inverse: type.inverse,
    iri: type.iri,
    name: type.name,
    owners: type.owners,
    paletteKey: type.paletteKey,
    rdfPredicate: type.rdfPredicate ?? '',
    reviewers: type.reviewers,
  };
}

export function toRelationshipTypeRequest(form: RelationshipTypeFormValues): CreateRelationshipTypeRequest {
  return {
    cardinality: cardinalityForPreset(form),
    category: form.category,
    characteristics: form.characteristics,
    crossGlossaryAllowed: form.crossGlossaryAllowed,
    description: (form.description ?? '').trim(),
    displayName: (form.displayName ?? '').trim(),
    inverse: form.inverse?.trim() || undefined,
    iri: form.iri?.trim() || undefined,
    name: form.name.trim(),
    owners: form.owners,
    paletteKey: form.paletteKey,
    rdfPredicate: form.rdfPredicate.trim(),
    reviewers: form.reviewers,
  };
}

const ENTITY_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const ABSOLUTE_IRI_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:.+/;

export type RelationshipTypeFormErrors = Partial<Record<'name' | 'displayName' | 'rdfPredicate' | 'characteristics', string>>;

/**
 * Validation mirrors official validateRelationshipTypeForm. The `t`
 * argument is the caller's translator so messages stay in the product
 * locale files; the keys are the product's relation-settings keys.
 */
export function validateRelationshipTypeForm(
  form: RelationshipTypeFormValues,
  editing: RelationshipType | undefined,
  relationshipTypes: RelationshipType[],
  t: (key: string, params?: Record<string, unknown>) => string,
): RelationshipTypeFormErrors {
  const errors: RelationshipTypeFormErrors = {};
  if (!ENTITY_NAME_PATTERN.test(form.name)) {
    errors.name = t('settings.glossaryTermRelations.mustStartWithLetterAlphanumeric');
  }
  if (!(form.displayName ?? '').trim()) {
    errors.displayName = t('crud.fieldRequired', {
      field: t('crud.displayName'),
    });
  }
  if (!ABSOLUTE_IRI_PATTERN.test(form.rdfPredicate.trim())) {
    errors.rdfPredicate = t('settings.glossaryTermRelations.invalidUrl');
  } else {
    const duplicate = relationshipTypes.find(
      (type) => type.id !== editing?.id && type.rdfPredicate === form.rdfPredicate.trim(),
    );
    if (duplicate) {
      errors.rdfPredicate = t('settings.glossaryTermRelations.rdfPredicateAlreadyUsed', {
        name: duplicate.displayName ?? duplicate.name,
      });
    }
  }
  const characteristics = new Set(form.characteristics ?? []);
  const cardinality = cardinalityForPreset(form);
  if (characteristics.has('SYMMETRIC') && characteristics.has('ASYMMETRIC')) {
    errors.characteristics = t('settings.glossaryTermRelations.incompatibleCharacteristics');
  } else if (characteristics.has('FUNCTIONAL') && cardinality?.sourceMax !== 1) {
    errors.characteristics = t('settings.glossaryTermRelations.functionalCardinality');
  } else if (characteristics.has('INVERSE_FUNCTIONAL') && cardinality?.targetMax !== 1) {
    errors.characteristics = t('settings.glossaryTermRelations.inverseFunctionalCardinality');
  }
  return errors;
}
