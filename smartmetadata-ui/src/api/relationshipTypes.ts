/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import { apiRequest } from './client';

export type RelationshipCategory = 'CORE' | 'OWL_SKOS' | 'CUSTOM';
export type RelationshipCharacteristic =
  | 'SYMMETRIC'
  | 'TRANSITIVE'
  | 'FUNCTIONAL'
  | 'INVERSE_FUNCTIONAL'
  | 'REFLEXIVE'
  | 'IRREFLEXIVE'
  | 'ASYMMETRIC';
export type RelationshipPaletteKey =
  | 'BLUE'
  | 'INDIGO'
  | 'VIOLET'
  | 'GREEN'
  | 'AMBER'
  | 'GRAY'
  | 'PINK'
  | 'PURPLE'
  | 'TEAL'
  | 'ROSE';

export interface RelationshipCardinality {
  sourceMax?: number;
  targetMax?: number;
}

/**
 * RelationshipType entity, mirroring the official generated schema
 * (openmetadata-spec/.../entity/data/relationshipType.json): only the
 * fields the settings page reads or writes are carried. `inverse` is
 * kept as a reference name string in the form layer (official
 * toRelationshipTypeForm maps the EntityReference to its FQN/name).
 */
export interface RelationshipType {
  id: string;
  name: string;
  fullyQualifiedName?: string;
  displayName?: string;
  description?: string;
  iri?: string;
  rdfPredicate?: string;
  category?: RelationshipCategory;
  characteristics: RelationshipCharacteristic[];
  cardinality?: RelationshipCardinality;
  crossGlossaryAllowed?: boolean;
  paletteKey?: RelationshipPaletteKey;
  systemDefined?: boolean;
  inverse?: string;
  owners?: EntityRef[];
  reviewers?: EntityRef[];
}

export interface CreateRelationshipTypeRequest {
  name: string;
  displayName: string;
  // Required by the official create schema (even when blank, the field
  // is present as an empty string — the official request does the same).
  description: string;
  iri?: string;
  rdfPredicate: string;
  category?: RelationshipCategory;
  characteristics?: RelationshipCharacteristic[];
  cardinality?: RelationshipCardinality;
  crossGlossaryAllowed?: boolean;
  paletteKey?: RelationshipPaletteKey;
  inverse?: string;
  owners?: EntityRef[];
  reviewers?: EntityRef[];
}

function asCategory(value: string): RelationshipCategory | undefined {
  return value === 'CORE' || value === 'OWL_SKOS' || value === 'CUSTOM' ? value : undefined;
}

function asCharacteristic(value: string): RelationshipCharacteristic | undefined {
  const allowed: RelationshipCharacteristic[] = [
    'SYMMETRIC',
    'TRANSITIVE',
    'FUNCTIONAL',
    'INVERSE_FUNCTIONAL',
    'REFLEXIVE',
    'IRREFLEXIVE',
    'ASYMMETRIC',
  ];
  return (allowed as string[]).includes(value) ? (value as RelationshipCharacteristic) : undefined;
}

function asPalette(value: string): RelationshipPaletteKey | undefined {
  const allowed: RelationshipPaletteKey[] = [
    'BLUE',
    'INDIGO',
    'VIOLET',
    'GREEN',
    'AMBER',
    'GRAY',
    'PINK',
    'PURPLE',
    'TEAL',
    'ROSE',
  ];
  return (allowed as string[]).includes(value) ? (value as RelationshipPaletteKey) : undefined;
}

export function mapRelationshipType(raw: Record<string, unknown>): RelationshipType | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) {
    return null;
  }
  const cardinality = asRecord(raw.cardinality);
  return {
    id,
    name,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    iri: asString(raw.iri) || undefined,
    rdfPredicate: asString(raw.rdfPredicate) || undefined,
    category: asCategory(asString(raw.category)),
    characteristics: Array.isArray(raw.characteristics)
      ? raw.characteristics.flatMap((item) =>
          typeof item === 'string' ? [asCharacteristic(item)] : [],
        ).filter((item): item is RelationshipCharacteristic => item !== undefined)
      : [],
    cardinality: cardinality
      ? {
          sourceMax: asNumber(cardinality.sourceMax),
          targetMax: asNumber(cardinality.targetMax),
        }
      : undefined,
    crossGlossaryAllowed: asBoolean(raw.crossGlossaryAllowed),
    paletteKey: asPalette(asString(raw.paletteKey)),
    systemDefined: asBoolean(raw.systemDefined),
    inverse: asString(asRecord(raw.inverse)?.fullyQualifiedName || asRecord(raw.inverse)?.name) || undefined,
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
  };
}

/** Official ontologyAPI listRelationshipTypes: GET /v1/relationshipTypes. */
export function listRelationshipTypes(query: { limit?: number; after?: string } = {}): Promise<Paged<RelationshipType>> {
  return apiRequest<unknown>('/v1/relationshipTypes', {
    query: { limit: query.limit ?? 1000, after: query.after },
  }).then((payload) => parsePaged(payload, mapRelationshipType));
}

/** Official ontologyAPI: fetch-all loop at limit 1000 (settings page). */
export async function listAllRelationshipTypes(): Promise<RelationshipType[]> {
  const all: RelationshipType[] = [];
  let after: string | undefined;
  do {
    const page = await listRelationshipTypes({ limit: 1000, after });
    all.push(...page.data);
    after = page.after;
  } while (after);
  return all;
}

/** Official ontologyAPI createRelationshipType: POST /v1/relationshipTypes. */
export async function createRelationshipType(body: CreateRelationshipTypeRequest): Promise<RelationshipType> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/relationshipTypes', {
    method: 'POST',
    json: body,
  });
  const mapped = mapRelationshipType(raw);
  if (!mapped) {
    throw new Error('Create relationship type succeeded but the response had no type');
  }
  return mapped;
}

/** Official ontologyAPI updateRelationshipType: PUT /v1/relationshipTypes. */
export async function updateRelationshipType(body: CreateRelationshipTypeRequest): Promise<RelationshipType> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/relationshipTypes', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapRelationshipType(raw);
  if (!mapped) {
    throw new Error('Update relationship type succeeded but the response had no type');
  }
  return mapped;
}

/** Official ontologyAPI deleteRelationshipType: DELETE /v1/relationshipTypes/{id}. */
export async function deleteRelationshipType(id: string, hardDelete = false): Promise<void> {
  await apiRequest<unknown>(`/v1/relationshipTypes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete },
  });
}

/**
 * Official glossaryAPI getRelationTypeUsageCounts:
 * GET /v1/glossaryTerms/relationTypes/usage, reduced to a name→count map.
 */
export async function getRelationTypeUsageCounts(): Promise<Record<string, number>> {
  const raw = await apiRequest<unknown>('/v1/glossaryTerms/relationTypes/usage');
  const rows = Array.isArray(raw) ? raw : Array.isArray(asRecord(raw)?.data) ? (asRecord(raw)!.data as unknown[]) : [];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const rec = asRecord(row);
    const usageName = asString(asRecord(rec?.relationshipType)?.name);
    if (usageName) {
      counts[usageName] = asNumber(rec?.count) ?? 0;
    }
  }
  return counts;
}
