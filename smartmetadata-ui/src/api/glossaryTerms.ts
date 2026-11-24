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
import type { CreateGlossaryTermRequest, GlossaryTerm, TermReference } from '@/types/governance';
import type {
  OntologyDataGraph,
  OntologyDataGraphEdge,
  OntologySummary,
} from '@/types/ontologyDataGraph';
import { apiRequest } from './client';
import { notifyCsvJobsRefresh } from './csvJobs';
import { mapTags } from './entities';

export const GLOSSARY_TERM_FIELDS =
  'children,relatedTerms,reviewers,owners,tags,usageCount,domains,childrenCount,entityStatus,extension';

export interface ListGlossaryTermsQuery {
  glossary?: string;
  parent?: string;
  /** Direct-children-of filter (parent term FQN), the official lazy-children
   *  parameter (GlossaryTermResource list accepts directChildrenOf + after). */
  directChildrenOf?: string;
  /** Entity-status filter (pin getFirstLevelGlossaryTermsPaginated passes
   *  `entityStatus`, comma-joined when several statuses are selected). */
  entityStatus?: string;
  limit?: number;
  after?: string;
  before?: string;
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

function mapSynonyms(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function mapTermReferences(value: unknown): TermReference[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name) || undefined;
    const endpoint = asString(rec.endpoint) || undefined;
    if (!name && !endpoint) {
      return [];
    }
    return [{ name, endpoint }];
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
    deleted: asBoolean(raw.deleted),
    glossary: glossaryRefs[0],
    parent: parentRefs[0],
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    relatedTerms: mapRelatedTerms(raw.relatedTerms),
    conceptMappings: mapEntityRefs(raw.conceptMappings),
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    domains: mapEntityRefs(raw.domains),
    synonyms: mapSynonyms(raw.synonyms),
    references: mapTermReferences(raw.references),
    tags: mapTags(raw.tags),
    // Ant Table draws an expand icon for any truthy children value and an
    // empty array is truthy, so childless terms must carry no children key
    // at all rather than an empty list.
    children: children.length ? children : undefined,
    childrenCount: asNumber(raw.childrenCount) || undefined,
    usageCount: asNumber(raw.usageCount),
    extension: asRecord(raw.extension) ?? undefined,
    status: asString(raw.entityStatus) || asString(raw.status) || undefined,
  };
}

export function listGlossaryTerms(query: ListGlossaryTermsQuery = {}): Promise<Paged<GlossaryTerm>> {
  return apiRequest<unknown>('/v1/glossaryTerms', {
    query: {
      fields: GLOSSARY_TERM_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
      glossary: query.glossary,
      parent: query.parent,
      directChildrenOf: query.directChildrenOf,
      entityStatus: query.entityStatus,
    },
  }).then((payload) => parsePaged(payload, mapTerm));
}

export interface SearchGlossaryTermsQuery {
  q: string;
  glossaryFqn?: string;
  limit?: number;
  offset?: number;
  fields?: string;
  entityStatus?: string;
}

/**
 * Official searchGlossaryTermsPaginated (rest/glossaryAPI.ts:412):
 * GET /v1/glossaryTerms/search — the search-mode listing of the terms
 * table (offset-paged, unlike the cursor-paged first-level listing).
 */
export function searchGlossaryTermsPaginated(
  query: SearchGlossaryTermsQuery,
): Promise<Paged<GlossaryTerm>> {
  return apiRequest<unknown>('/v1/glossaryTerms/search', {
    query: {
      q: query.q,
      glossaryFqn: query.glossaryFqn,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      fields:
        query.fields ??
        'children,relatedTerms,reviewers,owners,tags,usageCount,domains,extension,childrenCount',
      entityStatus: query.entityStatus,
    },
  }).then((payload) => parsePaged(payload, mapTerm));
}

/**
 * Official getFirstLevelGlossaryTermsPaginated (rest/glossaryAPI.ts:427):
 * GET /v1/glossaryTerms?directChildrenOf={parentFqn} — the first-level
 * listing with only the columns the table renders (childrenCount, owners,
 * reviewers); cursor-paged (before/after).
 */
export function listFirstLevelGlossaryTermsPaginated(
  parentFqn: string,
  limit = 50,
  after?: string,
  entityStatus?: string,
  before?: string,
): Promise<Paged<GlossaryTerm>> {
  return apiRequest<unknown>('/v1/glossaryTerms', {
    query: {
      directChildrenOf: parentFqn,
      fields: 'childrenCount,owners,reviewers',
      limit,
      after,
      before,
      entityStatus,
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

/**
 * Official getGlossaryTermByFQN (rest/glossaryAPI.ts:166): GET
 * /v1/glossaryTerms/name/{fqn}. The asset picker resolves its active
 * entity by FQN, so the term id for the add/remove calls comes from
 * here, never from a guessed id.
 */
export async function getGlossaryTermByFqn(fqn: string): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/glossaryTerms/name/${encodeURIComponent(fqn)}`,
    { query: { fields: GLOSSARY_TERM_FIELDS } },
  );
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Glossary term response was missing id and name');
  }
  return mapped;
}

/**
 * Bulk glossary-term-assets result (openmetadata-spec
 * type/bulkOperationResult.json): the add/remove endpoints answer 200
 * (202 when everything is held for approval) with this body — NOT the
 * updated GlossaryTerm, despite pin's remove TS type saying so
 * (rest/glossaryAPI.ts:311). A 2xx therefore means "applied (or held)",
 * and callers must not map the body as a GlossaryTerm. The per-row
 * detail lives in successRequest / failedRequest; the UI treats 2xx as
 * success, as pin does.
 */
export interface BulkResponseItem {
  message?: string;
  status?: number;
  hasSideEffects?: boolean;
}

export interface BulkOperationResult {
  dryRun?: boolean;
  status?: string;
  abortReason?: string;
  numberOfRowsProcessed?: number;
  numberOfRowsPassed?: number;
  numberOfRowsFailed?: number;
  numberOfRowsPendingApproval?: number;
  successRequest?: BulkResponseItem[];
  failedRequest?: BulkResponseItem[];
}

function mapBulkOperationResult(raw: unknown): BulkOperationResult {
  const rec = asRecord(raw) ?? {};
  const mapItems = (value: unknown): BulkResponseItem[] | undefined => {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.flatMap((item) => {
      const itemRec = asRecord(item);
      if (!itemRec) {
        return [];
      }
      return [
        {
          message: asString(itemRec.message) || undefined,
          status: asNumber(itemRec.status) ?? undefined,
          hasSideEffects: asBoolean(itemRec.hasSideEffects),
        },
      ];
    });
  };
  return {
    dryRun: asBoolean(rec.dryRun),
    status: asString(rec.status) || undefined,
    abortReason: asString(rec.abortReason) || undefined,
    numberOfRowsProcessed: asNumber(rec.numberOfRowsProcessed) ?? undefined,
    numberOfRowsPassed: asNumber(rec.numberOfRowsPassed) ?? undefined,
    numberOfRowsFailed: asNumber(rec.numberOfRowsFailed) ?? undefined,
    numberOfRowsPendingApproval: asNumber(rec.numberOfRowsPendingApproval) ?? undefined,
    successRequest: mapItems(rec.successRequest),
    failedRequest: mapItems(rec.failedRequest),
  };
}

/**
 * Official addAssetsToGlossaryTerm (rest/glossaryAPI.ts:293): PUT
 * /glossaryTerms/{termId}/assets/add with AddGlossaryToAssetsRequest
 * {assets: EntityReference[], dryRun}. The server answers 200 (202 when
 * held for approval) with a BulkOperationResult
 * (GlossaryTermResource.bulkAddGlossaryToAssets via
 * ApprovalGate.bulkResponse); the edit is synchronous, but callers
 * still wait ES_UPDATE_DELAY before refreshing so the search index
 * catches up.
 */
export async function addAssetsToGlossaryTerm(
  termId: string,
  assets: EntityRef[],
  dryRun = false,
): Promise<BulkOperationResult> {
  const raw = await apiRequest<unknown>(
    `/v1/glossaryTerms/${encodeURIComponent(termId)}/assets/add`,
    {
      method: 'PUT',
      json: { assets, dryRun },
    },
  );
  return mapBulkOperationResult(raw);
}

/**
 * Official removeAssetsFromGlossaryTerm (rest/glossaryAPI.ts:311): PUT
 * /glossaryTerms/{termId}/assets/remove with {assets, dryRun: false}.
 * Same BulkOperationResult as add (200 = applied); the updated
 * GlossaryTerm is NOT returned, despite pin's TS type saying so.
 */
export async function removeAssetsFromGlossaryTerm(
  termId: string,
  assets: EntityRef[],
): Promise<BulkOperationResult> {
  const raw = await apiRequest<unknown>(
    `/v1/glossaryTerms/${encodeURIComponent(termId)}/assets/remove`,
    {
      method: 'PUT',
      json: { assets, dryRun: false },
    },
  );
  return mapBulkOperationResult(raw);
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

/**
 * JSON-patch write for the term extension (custom properties), same call
 * shape as patchDomain (application/json-patch+json).
 */
export function patchGlossaryTerm(id: string, patch: unknown[]): Promise<unknown> {
  return apiRequest(`/v1/glossaryTerms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
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
 * Official getGlossaryTermsAssetCounts (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms/assets/counts?parent=<glossaryFqn> — the FQN ->
 * asset-count map the term-scope explorer uses for node counts
 * (useOntologyExplorer fetchTermAssetCounts). Without `parent` the
 * server returns the unscoped map. Non-numeric values are dropped, so
 * a malformed payload degrades to an empty map instead of breaking
 * the graph.
 */
export async function getGlossaryTermsAssetCounts(parent?: string): Promise<Record<string, number>> {
  const payload = await apiRequest<unknown>('/v1/glossaryTerms/assets/counts', {
    query: parent ? { parent } : undefined,
  });
  const rec = asRecord(payload) ?? {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (typeof value === 'number') {
      out[key] = value;
    }
  }
  return out;
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

/**
 * Official exportGlossaryTermsInCSVFormat (rest/glossaryAPI.ts:213):
 * GET /v1/glossaryTerms/name/{fqn}/exportAsync — async CSV export of a
 * glossary term subtree; the response carries the CSV job id (pin
 * CSVExportResponse), never a file. Same contract as
 * exportGlossaryInCSVFormat / exportMetricsCsvAsync (CSV-jobs tray
 * refresh on call, no invented jobId). Server endpoint verified present
 * in the product server (B2-S1: GlossaryTermResource.java:1707
 * exportAsync). Pin wires this only through the bulk-edit export
 * mapping (EntityBulkEditUtils.tsx:56), which the product has no
 * equivalent of — so this client ships with tests and no UI consumer
 * yet; the header export is the glossary one.
 */
export interface GlossaryTermCsvExportJob {
  jobId?: string;
}

export async function exportGlossaryTermsInCSVFormat(fqn: string): Promise<GlossaryTermCsvExportJob> {
  const payload = await apiRequest<unknown>(
    `/v1/glossaryTerms/name/${encodeURIComponent(fqn)}/exportAsync`,
  );
  notifyCsvJobsRefresh();
  const jobId = asString(asRecord(payload)?.jobId);
  return jobId ? { jobId } : {};
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
