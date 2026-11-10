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
import type { EntityRef } from '@/types/api';
import type { CreateGlossaryTermRequest, GlossaryTerm } from '@/types/governance';
import type {
  OntologyDataGraph,
  OntologyDataGraphEdge,
  OntologySummary,
} from '@/types/ontologyDataGraph';
import { apiRequest } from './client';
import { mapTags } from './entities';

export const GLOSSARY_TERM_FIELDS =
  'children,relatedTerms,reviewers,owners,tags,usageCount,domains,childrenCount,entityStatus';

export interface ListGlossaryTermsQuery {
  glossary?: string;
  parent?: string;
  /** Direct-children-of filter (parent term FQN), the official lazy-children
   *  parameter (GlossaryTermResource list accepts directChildrenOf + after). */
  directChildrenOf?: string;
  limit?: number;
  after?: string;
}

function mapRelatedTerms(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): EntityRef[] => {
    if (typeof item === 'string') {
      return item ? [{ name: item, fullyQualifiedName: item, type: 'glossaryTerm' }] : [];
    }
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const nested = asRecord(rec.term);
    // TermRelation carries its typed relation on the outer object
    // (relationType, default 'relatedTo'); the graph builder needs it,
    // plus the stored relation id and audit fields — the edge keys on
    // relation.id (ADR:2026-11-10-g18-stage2-inspector-rail).
    const relationType = asString(rec.relationType) || undefined;
    const relationshipRefs = mapEntityRefs(rec.relationshipType ? [rec.relationshipType] : []);
    return mapEntityRefs(nested ? [nested] : [rec]).map((ref) => ({
      ...ref,
      ...(relationType ? { relationType } : {}),
      relationId: asString(rec.id) || undefined,
      relationshipType: relationshipRefs[0],
      provenance: (asString(rec.provenance) as EntityRef['provenance']) || undefined,
      relationStatus: asString(rec.status) || undefined,
      createdBy: asString(rec.createdBy) || undefined,
      createdAt: asNumber(rec.createdAt) || undefined,
    }));
  });
}

/**
 * Child rows arrive as EntityReferences, which carry a description but no
 * status or owners; keeping the description is what lets an expanded child
 * row show more than its name. The shared ref mapper drops it, so children
 * are mapped here instead of through mapEntityRefs.
 */
function mapTermChildren(value: unknown): Array<EntityRef & { description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
        description: asString(rec.description) || undefined,
      },
    ];
  });
}

function mapTerm(raw: Record<string, unknown>): GlossaryTerm | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const glossaryRefs = mapEntityRefs(raw.glossary ? [raw.glossary] : []);
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  const children = mapTermChildren(raw.children);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    glossary: glossaryRefs[0],
    parent: parentRefs[0],
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    relatedTerms: mapRelatedTerms(raw.relatedTerms),
    conceptMappings: mapEntityRefs(raw.conceptMappings),
    owners: mapEntityRefs(raw.owners),
    tags: mapTags(raw.tags),
    // Ant Table draws an expand icon for any truthy children value and an
    // empty array is truthy, so childless terms must carry no children key
    // at all rather than an empty list.
    children: children.length ? children : undefined,
    childrenCount: asNumber(raw.childrenCount) || undefined,
    usageCount: asNumber(raw.usageCount),
    status: asString(raw.entityStatus) || asString(raw.status) || undefined,
  };
}

export function listGlossaryTerms(query: ListGlossaryTermsQuery = {}): Promise<Paged<GlossaryTerm>> {
  return apiRequest<unknown>('/v1/glossaryTerms', {
    query: {
      fields: GLOSSARY_TERM_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      glossary: query.glossary,
      parent: query.parent,
      directChildrenOf: query.directChildrenOf,
    },
  }).then((payload) => parsePaged(payload, mapTerm));
}

/**
 * Official getGlossaryTermsByIds (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms/byIds?ids=… — the server endpoint exists
 * (GlossaryTermResource @Path("/byIds")) and returns a bare array. The
 * relations graph uses it to hydrate cross-glossary relatedTerms, exactly
 * as official useOntologyExplorer.resolveRelatedTerms does.
 */
export async function getGlossaryTermsByIds(ids: readonly string[]): Promise<GlossaryTerm[]> {
  if (ids.length === 0) {
    return [];
  }
  const payload = await apiRequest<unknown>('/v1/glossaryTerms/byIds', {
    query: { ids: ids.join(','), fields: GLOSSARY_TERM_FIELDS },
  });
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap((item) => {
    const rec = asRecord(item);
    const mapped = rec ? mapTerm(rec) : null;
    return mapped ? [mapped] : [];
  });
}

/**
 * Official getGlossaryTermChildrenLazy (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms?directChildrenOf={parentFqn}&limit=50&after={cursor}.
 * Unlike the embedded `children` refs of a list response (name + description
 * only), each page carries full terms — status, owners, and their own
 * childrenCount — so an expanded child row shows the same columns as a
 * top-level row, and its own children lazy-load on expand in turn.
 */
export function listGlossaryTermChildrenLazy(
  parentFqn: string,
  limit = 50,
  after?: string,
): Promise<Paged<GlossaryTerm>> {
  return listGlossaryTerms({ directChildrenOf: parentFqn, limit, after });
}

export async function getGlossaryTerm(id: string): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/glossaryTerms/${encodeURIComponent(id)}`,
    { query: { fields: GLOSSARY_TERM_FIELDS } },
  );
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Glossary term response was missing id and name');
  }
  return mapped;
}

export async function createGlossaryTerm(body: CreateGlossaryTermRequest): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Create glossary term succeeded but the response had no term');
  }
  return mapped;
}

export async function updateGlossaryTerm(body: CreateGlossaryTermRequest): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Update glossary term succeeded but the response had no term');
  }
  return mapped;
}

export function listGlossaryTermAssets(
  id: string,
  limit = 25,
  offset = 0,
  signal?: AbortSignal,
): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/glossaryTerms/${encodeURIComponent(id)}/assets`, {
    query: { limit, offset },
    signal,
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

/**
 * Official getGlossaryTermAssets (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms/{termId}/assets?limit&offset — the data-mode
 * tagged-with load-more path (useOntologyExplorer
 * appendTermAssetsForTerm). Returns the page plus its total so the
 * caller can track the remaining count.
 */
export async function getGlossaryTermAssets(
  termId: string,
  limit = 100,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ data: EntityRef[]; total: number }> {
  const page = await listGlossaryTermAssets(termId, limit, offset, signal);
  return { data: page.data, total: page.total ?? page.data.length };
}

/**
 * Official getOntologySummary (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms/ontology/summary?limit&offset&parent — the health
 * panel's endpoint. Field mapping follows the spec
 * (api/data/ontologySummary.json) and is live-verify-before-trust
 * (ADR:2026-11-10-g18-stage2-data-mode).
 */
export async function getOntologySummary(
  params: { limit?: number; offset?: number; parent?: string } = {},
  signal?: AbortSignal,
): Promise<OntologySummary> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms/ontology/summary', {
    query: { limit: params.limit, offset: params.offset, parent: params.parent },
    signal,
  });
  const isolatedPreview = Array.isArray(raw.isolatedPreview)
    ? raw.isolatedPreview.flatMap((item) => mapEntityRefs([item]))
    : [];
  return {
    totalTerms: asNumber(raw.totalTerms) ?? 0,
    totalRelations: asNumber(raw.totalRelations) ?? 0,
    isolatedTerms: asNumber(raw.isolatedTerms) ?? 0,
    connectedPercentage: asNumber(raw.connectedPercentage) ?? 0,
    isolatedPreview,
    paging: asRecord(raw.paging)
      ? {
          total: asNumber(asRecord(raw.paging)?.total) ?? undefined,
          offset: asNumber(asRecord(raw.paging)?.offset) ?? undefined,
          limit: asNumber(asRecord(raw.paging)?.limit) ?? undefined,
        }
      : undefined,
  };
}

export interface OntologyDataGraphParams {
  limit?: number;
  offset?: number;
  parent?: string;
  assetPreviewSize?: number;
  connectedTermLimit?: number;
  edgeLimit?: number;
  lineageEdgeLimit?: number;
}

/**
 * Official getOntologyDataGraph (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms/ontology/data — the glossary data-mode endpoint.
 * Field mapping follows the spec (api/data/ontologyDataGraph.json) and
 * is live-verify-before-trust
 * (ADR:2026-11-10-g18-stage2-data-mode).
 */
export async function getOntologyDataGraph(
  params: OntologyDataGraphParams = {},
  signal?: AbortSignal,
): Promise<OntologyDataGraph> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms/ontology/data', {
    query: {
      limit: params.limit,
      offset: params.offset,
      parent: params.parent,
      assetPreviewSize: params.assetPreviewSize,
      connectedTermLimit: params.connectedTermLimit,
      edgeLimit: params.edgeLimit,
      lineageEdgeLimit: params.lineageEdgeLimit,
    },
    signal,
  });
  const clusters = Array.isArray(raw.clusters)
    ? raw.clusters.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const termRefs = mapEntityRefs(rec.term ? [rec.term] : []);
        const assets = Array.isArray(rec.assets) ? rec.assets.flatMap((a) => mapEntityRefs([a])) : [];
        return [
          {
            term: termRefs[0] ?? { name: '' },
            assetCount: asNumber(rec.assetCount) ?? assets.length,
            assets,
          },
        ];
      })
    : [];
  const edges = Array.isArray(raw.edges)
    ? raw.edges.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const relationshipRefs = mapEntityRefs(rec.relationshipType ? [rec.relationshipType] : []);
        return [
          {
            id: asString(rec.id) || '',
            from: asString(rec.from) || '',
            to: asString(rec.to) || '',
            relationType: asString(rec.relationType) || 'relatedTo',
            relationshipType: relationshipRefs[0],
            provenance: (asString(rec.provenance) as OntologyDataGraphEdge['provenance']) || undefined,
            status: asString(rec.status) || undefined,
            createdBy: asString(rec.createdBy) || undefined,
            createdAt: asNumber(rec.createdAt) || undefined,
          },
        ];
      })
    : [];
  const lineageEdges = Array.isArray(raw.lineageEdges)
    ? raw.lineageEdges.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        return [{ fromEntity: asString(rec.fromEntity) || '', toEntity: asString(rec.toEntity) || '' }];
      })
    : [];
  const paging = asRecord(raw.paging);
  return {
    clusters,
    seedTermIds: Array.isArray(raw.seedTermIds)
      ? raw.seedTermIds.filter((item): item is string => typeof item === 'string')
      : [],
    edges,
    lineageEdges,
    paging: {
      total: paging ? asNumber(paging.total) ?? undefined : undefined,
      offset: paging ? asNumber(paging.offset) ?? undefined : undefined,
      limit: paging ? asNumber(paging.limit) ?? undefined : undefined,
      after: paging ? asString(paging.after) || undefined : undefined,
    },
  };
}

export interface DeleteEntityOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/**
 * Official term delete via the generic deleteEntity surface (rest/miscAPI.ts);
 * the ontology-impact POST delete (rest/ontologyAPI.ts) needs an ontology
 * surface the product does not have, so it is not used here.
 */
export function deleteGlossaryTerm(id: string, options: DeleteEntityOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/glossaryTerms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}
