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
  OntologyAxiom,
  OntologyConcept,
  OntologyConceptBinding,
  OntologyPack,
  OntologyProperty,
  OntologyRelease,
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

/** Official getOntologyConceptById: GET /v1/ontologyConcepts/{id}. */
export async function getOntologyConcept(id: string): Promise<OntologyConcept> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${ONTOLOGY_CONCEPTS_PATH}/${encodeURIComponent(id)}`,
    { query: { fields: CONCEPT_FIELDS } },
  );
  const mapped = mapOntologyConcept(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Ontology concept response was missing id and name');
  }
  return mapped;
}

function mapOntologyAxiom(raw: Record<string, unknown>): OntologyAxiom | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const expressions = Array.isArray(raw.expressions)
    ? raw.expressions.filter((item): item is string => typeof item === 'string')
    : undefined;
  const ontologyRefs = mapEntityRefs(raw.ontology ? [raw.ontology] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    ontology: ontologyRefs[0],
    axiomType: asString(raw.axiomType) || undefined,
    subjectIri: asString(raw.subjectIri) || undefined,
    expressions,
    propertyIri: asString(raw.propertyIri) || undefined,
    targetIri: asString(raw.targetIri) || undefined,
    literal: asString(raw.literal) || undefined,
    owners: mapEntityRefs(raw.owners),
  };
}

/** Official listOntologyAxioms: GET /v1/ontologyAxioms?ontologyId={id}. */
export function listOntologyAxioms(
  query: { ontologyId: string; limit?: number; after?: string },
): Promise<Paged<OntologyAxiom>> {
  return apiRequest<unknown>('/v1/ontologyAxioms', {
    query: { ontologyId: query.ontologyId, limit: query.limit, after: query.after },
  }).then((payload) => parsePaged(payload, mapOntologyAxiom));
}

function mapOntologyRelease(raw: Record<string, unknown>): OntologyRelease | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const ontologyRefs = mapEntityRefs(raw.ontology ? [raw.ontology] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    ontology: ontologyRefs[0],
    semanticVersion: asString(raw.semanticVersion) || undefined,
    releaseNotes: asString(raw.releaseNotes) || undefined,
    sealedAt: asNumber(raw.sealedAt),
    sealedBy: asString(raw.sealedBy) || undefined,
    memberCount: asNumber(raw.memberCount),
    entityStatus: asString(raw.entityStatus) || undefined,
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
  };
}

/** Official listOntologyReleases: GET /v1/ontologyReleases?ontologyId={id}. */
export function listOntologyReleases(
  query: { ontologyId: string; limit?: number; after?: string },
): Promise<Paged<OntologyRelease>> {
  return apiRequest<unknown>('/v1/ontologyReleases', {
    query: { ontologyId: query.ontologyId, limit: query.limit, after: query.after },
  }).then((payload) => parsePaged(payload, mapOntologyRelease));
}

function mapOntologyPack(raw: Record<string, unknown>): OntologyPack | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const modules = Array.isArray(raw.modules)
    ? raw.modules.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec || !asString(rec.name)) {
          return [];
        }
        return [
          {
            id: asString(rec.id) || undefined,
            name: asString(rec.name),
            description: asString(rec.description) || undefined,
            format: asString(rec.format) || undefined,
            conceptCount: asNumber(rec.conceptCount),
            relationshipCount: asNumber(rec.relationshipCount),
            selectedByDefault: asBoolean(rec.selectedByDefault) ?? undefined,
          },
        ];
      })
    : [];
  return {
    id: asString(raw.id) || undefined,
    name,
    abbreviation: asString(raw.abbreviation) || undefined,
    standard: asString(raw.standard) || undefined,
    industry: asString(raw.industry) || undefined,
    layer: asString(raw.layer) || undefined,
    version: asString(raw.version) || undefined,
    description: asString(raw.description) || undefined,
    license: asString(raw.license) || undefined,
    sourceUrl: asString(raw.sourceUrl) || undefined,
    bundled: asBoolean(raw.bundled) ?? undefined,
    modules,
  };
}

/**
 * Official listOntologyPacks: GET /v1/ontologyPacks returns
 * {packs: [...], installations: [...]}; only the catalogue is mapped here
 * (install is an E2 write flow, not a browse surface).
 */
export async function listOntologyPacks(): Promise<OntologyPack[]> {
  const payload = await apiRequest<unknown>('/v1/ontologyPacks');
  const root = asRecord(payload) ?? {};
  const packs = Array.isArray(root.packs) ? root.packs : [];
  return packs.flatMap((item) => {
    const mapped = mapOntologyPack(asRecord(item) ?? {});
    return mapped ? [mapped] : [];
  });
}

export interface OntologyPackSample {
  packId?: string;
  version?: string;
  moduleIds?: string[];
  conceptCount?: number;
  relationCount?: number;
  concepts: { name: string; iri?: string }[];
}

/** Official sampleOntologyPack: GET /v1/ontologyPacks/{packId}/sample?moduleIds=. */
export async function getOntologyPackSample(
  packId: string,
  moduleIds: string[],
): Promise<OntologyPackSample> {
  const payload = await apiRequest<unknown>(
    `/v1/ontologyPacks/${encodeURIComponent(packId)}/sample`,
    { query: { moduleIds: moduleIds.join(',') } },
  );
  const root = asRecord(payload) ?? {};
  const concepts = Array.isArray(root.concepts)
    ? root.concepts.flatMap((item) => {
        const rec = asRecord(item);
        const name = rec ? asString(rec.name) || asString(rec.displayName) : '';
        return name ? [{ name, iri: asString(rec?.iri) || undefined }] : [];
      })
    : [];
  return {
    packId: asString(root.packId) || undefined,
    version: asString(root.version) || undefined,
    moduleIds: Array.isArray(root.moduleIds)
      ? root.moduleIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    conceptCount: asNumber(root.conceptCount),
    relationCount: asNumber(root.relationCount),
    concepts,
  };
}

/** Official getOntologyConceptBindings: GET /v1/ontologyConcepts/{id}/bindings. */
export async function getOntologyConceptBindings(
  id: string,
  after?: string,
): Promise<{ assets: OntologyConceptBinding[]; after?: string }> {
  const payload = await apiRequest<unknown>(
    `${ONTOLOGY_CONCEPTS_PATH}/${encodeURIComponent(id)}/bindings`,
    { query: { after } },
  );
  const root = asRecord(payload) ?? {};
  const assets = Array.isArray(root.assets)
    ? root.assets.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const assetRefs = mapEntityRefs(rec.asset ? [rec.asset] : []);
        return [
          {
            assetType: asString(rec.assetType) || undefined,
            assetId: asString(rec.assetId) || undefined,
            asset: assetRefs[0],
            columnCount: Array.isArray(rec.columns) ? rec.columns.length : undefined,
          },
        ];
      })
    : [];
  return { assets, after: asString(root.after) || undefined };
}
