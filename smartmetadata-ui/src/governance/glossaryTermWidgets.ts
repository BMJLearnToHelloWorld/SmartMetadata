/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from '@/types/api';
import type { TermReference } from '@/types/governance';

/**
 * Glossary-term widget pure helpers (D-2 batch 5a). Pin sources
 * (upstream pin a3012259ca,
 * `openmetadata-ui/src/main/resources/ui/src/`):
 *
 * - Synonyms: `components/Glossary/GlossaryTerms/tabs/GlossaryTermSynonyms.tsx`
 *   (`MAX_VISIBLE_SYNONYMS = 6`, case-insensitive duplicate rejection).
 * - RelatedTerms: `components/Glossary/GlossaryTerms/tabs/RelatedTerms.tsx`
 *   (`MAX_VISIBLE_BADGES = 5`, group by `relationType`, fallback
 *   `DEFAULT_GLOSSARY_TERM_RELATION_TYPES_FALLBACK` = only `relatedTo`).
 * - References: `components/Glossary/GlossaryTerms/tabs/GlossaryTermReferences.tsx`
 *   + `components/Glossary/GlossaryTerms/GlossaryTermReferencesModal.component.tsx`
 *   + `utils/GlossaryPureUtils.ts:351` (`validateReferenceURL`).
 */

/** Pin `MAX_VISIBLE_SYNONYMS` (`constants/Glossary.contant.ts:38`). */
export const MAX_VISIBLE_SYNONYMS = 6;

/** Pin `MAX_VISIBLE_BADGES` (`RelatedTerms.tsx`). */
export const MAX_VISIBLE_RELATED_BADGES = 5;

/** Pin `DEFAULT_RELATIONSHIP_TYPE` fallback (only `relatedTo`). */
export const DEFAULT_RELATED_TO = { name: 'relatedTo', displayName: 'Related To' } as const;

/**
 * Case-insensitive duplicate check (pin `findDuplicate`): "Test" is
 * rejected when "test" already exists. Returns the existing value so
 * the editor can highlight it.
 */
export function findDuplicateSynonym(synonyms: string[], value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return synonyms.find((synonym) => synonym.toLowerCase() === normalized);
}

/** Saved synonyms drop empty strings (pin `savedSynonyms`). */
export function normalizeSynonyms(synonyms: string[]): string[] {
  return synonyms.filter((synonym) => synonym.length > 0);
}

export type ReferenceError = 'nameRequired' | 'endpointRequired' | 'urlScheme' | 'urlParsable';

export function validateReferenceURL(endpoint: string): boolean {
  return endpoint.startsWith('http://') || endpoint.startsWith('https://');
}

function isParsableURL(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * One reference row's validation (pin modal `validateEndpoint` + name
 * rule): name required; endpoint required, must start with http(s),
 * and must parse as a URL.
 */
export function validateReference(reference: TermReference): ReferenceError | undefined {
  if (!reference.name?.trim()) {
    return 'nameRequired';
  }
  const endpoint = reference.endpoint?.trim() ?? '';
  if (!endpoint) {
    return 'endpointRequired';
  }
  if (!validateReferenceURL(endpoint)) {
    return 'urlScheme';
  }
  if (!isParsableURL(endpoint)) {
    return 'urlParsable';
  }
  return undefined;
}

/**
 * Rows the modal may save (pin `handleReferencesSave`): only rows with
 * both a name and an endpoint survive, trimmed.
 */
export function filterSavableReferences(references: TermReference[]): TermReference[] {
  return references
    .filter((ref) => ref.name?.trim() && ref.endpoint?.trim())
    .map((ref) => ({ name: ref.name?.trim(), endpoint: ref.endpoint?.trim() }));
}

export interface TermRelationInput {
  relationType: string;
  term: {
    id?: string;
    type: string;
    fullyQualifiedName: string;
    name: string;
    displayName?: string;
  };
}

export interface RelatedTermGroup {
  relationType: string;
  terms: EntityRef[];
}

/**
 * Groups related terms by `relationType` (pin `groupBy(termRelations,
 * 'relationType')`), preserving first-seen group order; a missing
 * relation type reads as `relatedTo` (pin's default).
 */
export function groupRelatedTerms(relations: EntityRef[]): RelatedTermGroup[] {
  const groups: RelatedTermGroup[] = [];
  for (const relation of relations) {
    const relationType = relation.relationType || 'relatedTo';
    const group = groups.find((item) => item.relationType === relationType);
    if (group) {
      group.terms.push(relation);
    } else {
      groups.push({ relationType, terms: [relation] });
    }
  }
  return groups;
}

/**
 * Editor rows → the `TermRelation[]` save shape (pin `handleSave`):
 * each picked term carries its entity reference; a term picked without
 * a loaded entity (by FQN only) is sent as a bare `glossaryTerm`
 * reference, exactly as pin does.
 */
export function toTermRelations(
  rows: Array<{ relationType: string; terms: EntityRef[] }>,
): TermRelationInput[] {
  return rows.flatMap((row) =>
    row.terms.map((term) => ({
      relationType: row.relationType,
      term: {
        id: term.id,
        type: 'glossaryTerm',
        fullyQualifiedName: term.fullyQualifiedName || term.name,
        name: term.name,
        displayName: term.displayName,
      },
    })),
  );
}

/** Saved related terms back to editor rows (pin `handleStartEditing`). */
export function toRelationRows(relations: EntityRef[]): Array<{
  id: string;
  relationType: string;
  terms: EntityRef[];
}> {
  return groupRelatedTerms(relations).map((group, index) => ({
    id: String(index),
    relationType: group.relationType,
    terms: group.terms,
  }));
}
