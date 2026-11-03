/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateOntologyRequest,
  Ontology,
  OntologyConcept,
  OntologyProperty,
} from '@/types/ontology';
import { apiRequest } from './client';

/**
 * Official surfaces (openmetadata-ui/.../rest/ontologyAPI.ts):
 * /ontologies for the entity, /ontologyConcepts and /ontologyProperties
 * filtered by the ontology fully qualified name — the studio model
 * (hooks/governance/ontology/useOntologyStudioModel.ts) passes exactly
 * `ontology: ontology.fullyQualifiedName` plus, for concepts, the fields
 * 'conceptMappings,lifecycleStatus,owners,subClasses,superClasses'.
 */
const ONTOLOGIES_PATH = '/v1/ontologies';
const ONTOLOGY_CONCEPTS_PATH = '/v1/ontologyConcepts';
const ONTOLOGY_PROPERTIES_PATH = '/v1/ontologyProperties';

const CONCEPT_FIELDS = 'conceptMappings,lifecycleStatus,owners,subClasses,superClasses';

export interface ListOntologiesQuery {
  limit?: number;
  after?: string;
  before?: string;
}

export interface ListOntologyDefinitionsQuery {
  ontology: string;
  limit?: number;
  after?: string;
}

/** A domain/range value arrives either as a plain string or as a ref. */
function refName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value || undefined;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  return asString(record.displayName) || asString(record.name) || undefined;
}

function mapOntology(raw: Record<string, unknown>): Ontology | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    version: asNumber(raw.version),
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
    iri: asString(raw.iri) || undefined,
    namespace: asString(raw.namespace) || undefined,
    layer: asString(raw.layer) || undefined,
    publicationStatus: asString(raw.publicationStatus) || undefined,
    deleted: asBoolean(raw.deleted) ?? undefined,
  };
}

function mapOntologyConcept(raw: Record<string, unknown>): OntologyConcept | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const synonyms = Array.isArray(raw.synonyms)
    ? raw.synonyms.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    iri: asString(raw.iri) || undefined,
    conceptType: asString(raw.conceptType) || undefined,
    synonyms,
    superClasses: mapEntityRefs(raw.superClasses),
    subClasses: mapEntityRefs(raw.subClasses),
    lifecycleStatus: asString(raw.lifecycleStatus) || undefined,
    deprecated: asBoolean(raw.deprecated) ?? undefined,
    owners: mapEntityRefs(raw.owners),
  };
}

function mapOntologyProperty(raw: Record<string, unknown>): OntologyProperty | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const enumValues = Array.isArray(raw.enumValues)
    ? raw.enumValues.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    iri: asString(raw.iri) || undefined,
    kind: asString(raw.kind) || undefined,
    domain: refName(raw.domain),
    range: refName(raw.range),
    enumValues,
    unit: asString(raw.unit) || undefined,
    isIdentifier: asBoolean(raw.isIdentifier) ?? undefined,
    owners: mapEntityRefs(raw.owners),
  };
}

export function listOntologies(query: ListOntologiesQuery = {}): Promise<Paged<Ontology>> {
  return apiRequest<unknown>(ONTOLOGIES_PATH, {
    query: {
      limit: query.limit,
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapOntology));
}

export async function getOntology(id: string): Promise<Ontology> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${ONTOLOGIES_PATH}/${encodeURIComponent(id)}`,
    { query: { fields: 'owners,reviewers' } },
  );
  const mapped = mapOntology(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Ontology response was missing id and name');
  }
  return mapped;
}

export async function createOntology(body: CreateOntologyRequest): Promise<Ontology> {
  const raw = await apiRequest<Record<string, unknown>>(ONTOLOGIES_PATH, {
    method: 'POST',
    json: body,
  });
  const mapped = mapOntology(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Create ontology succeeded but the response had no ontology');
  }
  return mapped;
}

export function listOntologyConcepts(
  query: ListOntologyDefinitionsQuery,
): Promise<Paged<OntologyConcept>> {
  return apiRequest<unknown>(ONTOLOGY_CONCEPTS_PATH, {
    query: {
      ontology: query.ontology,
      limit: query.limit,
      after: query.after,
      fields: CONCEPT_FIELDS,
    },
  }).then((payload) => parsePaged(payload, mapOntologyConcept));
}

export function listOntologyProperties(
  query: ListOntologyDefinitionsQuery,
): Promise<Paged<OntologyProperty>> {
  return apiRequest<unknown>(ONTOLOGY_PROPERTIES_PATH, {
    query: {
      ontology: query.ontology,
      limit: query.limit,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapOntologyProperty));
}
