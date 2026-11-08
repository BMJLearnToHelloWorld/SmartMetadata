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
  ContextFile,
  ContextMemory,
  ContextMemoryStatus,
  CreateKnowledgePageRequest,
  DriveFolder,
  KnowledgePage,
  KnowledgePageType,
  PersonaAiContext,
  PersonaAiContextRule,
  PersonaAiContextStatus,
} from '@/types/contextCenter';
import { apiBaseUrl, apiRequest, ApiError, readErrorMessage } from './client';
import type { ChangeDescription, EntityVersion } from './entities';
import { mapChangeDescription, mapTags } from './entities';
import { authorizationHeader, loadSession } from '@/auth/token';
import type { JsonPatchOp } from '@/admin/jsonPatch';

const PAGES_PATH = '/v1/contextCenter/pages';
const MEMORIES_PATH = '/v1/contextCenter/memories';
const FILES_PATH = '/v1/contextCenter/drive/files';
const FOLDERS_PATH = '/v1/contextCenter/drive/folders';
const PERSONAS_PATH = '/v1/personas';

function mapKnowledgePage(raw: Record<string, unknown>): KnowledgePage | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const page = asRecord(raw.page);
  const pageType = asString(raw.pageType);
  return {
    id,
    name,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    version: asNumber(raw.version),
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
    owners: mapEntityRefs(raw.owners),
    tags: mapTags(raw.tags),
    pageType: pageType === 'QuickLink' ? 'QuickLink' : 'Article',
    pageUrl: page ? asString(page.url) || undefined : undefined,
    parent: mapEntityRefs(raw.parent ? [raw.parent] : [])[0],
    children: mapEntityRefs(raw.children),
    deleted: asBoolean(raw.deleted) ?? undefined,
    extension: asRecord(raw.extension) ?? undefined,
  };
}

function mapContextMemory(raw: Record<string, unknown>): ContextMemory | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    question: asString(raw.question) || undefined,
    answer: asString(raw.answer) || undefined,
    entityStatus: asString(raw.entityStatus) as ContextMemoryStatus | undefined,
    pinned: asBoolean(raw.pinned) ?? undefined,
    /**
     * ADR:2026-11-07-context-center-most-cited-memories — the most-cited
     * card sorts by appliedCount (official getListContextMemories
     * sortBy='appliedCount'); usageCount is a different counter and must
     * never stand in for citation counts.
     */
    appliedCount: asNumber(raw.appliedCount),
    owners: mapEntityRefs(raw.owners),
    primaryEntity: mapEntityRefs(raw.primaryEntity ? [raw.primaryEntity] : [])[0],
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
  };
}

function mapContextFile(raw: Record<string, unknown>): ContextFile | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fileExtension: asString(raw.fileExtension) || undefined,
    fileType: asString(raw.fileType) || undefined,
    fileSize: asNumber(raw.fileSize),
    contentType: asString(raw.contentType) || undefined,
    folder: mapEntityRefs(raw.folder ? [raw.folder] : [])[0],
    memoryCount: asNumber(raw.memoryCount),
    pageCount: asNumber(raw.pageCount),
    processingStatus: asString(raw.processingStatus) || undefined,
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
    sourceUrl: asString(raw.sourceUrl) || undefined,
    sourceType: asString(raw.sourceType) || undefined,
  };
}

function mapDriveFolder(raw: Record<string, unknown>): DriveFolder | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    childrenCount: asNumber(raw.childrenCount),
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
  };
}

function mapPersona(raw: Record<string, unknown>): PersonaAiContext | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const definition = asRecord(raw.contextDefinition);
  const rules = Array.isArray(definition?.rules) ? definition.rules : [];
  const mappedRules: PersonaAiContextRule[] = rules.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const entityType = asString(rec.entityType);
    if (!entityType) {
      return [];
    }
    return [
      {
        id: asString(rec.id) || undefined,
        entityType,
        description: asString(rec.description) || undefined,
        enabled: asBoolean(rec.enabled) ?? undefined,
        alwaysInContext: asBoolean(rec.alwaysInContext) ?? undefined,
        filteredInSearch: asBoolean(rec.filteredInSearch) ?? undefined,
      },
    ];
  });
  return {
    id,
    name,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    users: mapEntityRefs(raw.users),
    rules: mappedRules,
    characterBudget: definition ? asNumber(definition.characterBudget) : undefined,
    cacheTtlMinutes: definition ? asNumber(definition.cacheTtlMinutes) : undefined,
    enabled: definition ? asBoolean(definition.enabled) ?? undefined : undefined,
    prompt: definition ? asString(definition.prompt) || undefined : undefined,
  };
}

function mapPersonaStatus(raw: Record<string, unknown>): PersonaAiContextStatus | null {
  const personaId = asString(raw.personaId);
  if (!personaId) {
    return null;
  }
  return {
    personaId,
    entitiesIncluded: asNumber(raw.entitiesIncluded),
    tokensEst: asNumber(raw.tokensEst),
    lastGeneratedAt: asNumber(raw.lastGeneratedAt),
    lastError: asString(raw.lastError) || undefined,
  };
}

export interface ListKnowledgePagesQuery {
  limit?: number;
  after?: string;
  before?: string;
  q?: string;
  pageType?: KnowledgePageType;
  entityType?: string;
  entityId?: string;
  tagFQN?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  fields?: string;
}

export async function listKnowledgePages(
  query: ListKnowledgePagesQuery = {},
): Promise<Paged<KnowledgePage>> {
  const payload = await apiRequest<unknown>(PAGES_PATH, { query: { ...query } });
  return parsePaged(payload, mapKnowledgePage);
}

export async function getKnowledgePageByFqn(fqn: string): Promise<KnowledgePage | null> {
  const payload = await apiRequest<unknown>(
    `${PAGES_PATH}/name/${encodeURIComponent(fqn)}`,
  );
  const rec = asRecord(payload);
  return rec ? mapKnowledgePage(rec) : null;
}

export async function createKnowledgePage(
  request: CreateKnowledgePageRequest,
): Promise<KnowledgePage | null> {
  const page =
    request.pageType === 'QuickLink'
      ? { url: request.pageUrl ?? '' }
      : { publicationDate: new Date().toISOString() };
  const payload = await apiRequest<unknown>(PAGES_PATH, {
    json: {
      name: request.name,
      displayName: request.displayName,
      description: request.description,
      pageType: request.pageType,
      page,
    },
  });
  const rec = asRecord(payload);
  return rec ? mapKnowledgePage(rec) : null;
}

/**
 * Official putKnowledgePage is a create-or-update PUT on the collection
 * with the create-shaped body: the server identifies the page by name,
 * so no id rides along (the create schema rejects unknown fields).
 */
export async function updateKnowledgePage(
  request: CreateKnowledgePageRequest,
): Promise<KnowledgePage | null> {
  const page =
    request.pageType === 'QuickLink'
      ? { url: request.pageUrl ?? '' }
      : { publicationDate: new Date().toISOString() };
  // apiRequest defaults to POST when a json body is present, so the PUT
  // verb must be explicit here, or an edit would hit the create endpoint.
  const payload = await apiRequest<unknown>(PAGES_PATH, {
    method: 'PUT',
    json: {
      name: request.name,
      displayName: request.displayName,
      description: request.description,
      pageType: request.pageType,
      page,
    },
  });
  const rec = asRecord(payload);
  return rec ? mapKnowledgePage(rec) : null;
}

/**
 * Official patch on KnowledgePage (generic EntityResource PATCH): JSON
 * Patch, mirroring patchTag — the create-shaped PUT above must never
 * carry extension values.
 */
export async function patchKnowledgePage(
  id: string,
  patch: JsonPatchOp[],
): Promise<KnowledgePage> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${PAGES_PATH}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: patch,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = mapKnowledgePage(raw);
  if (!mapped) {
    throw new Error('Patch page succeeded but the response had no page');
  }
  return mapped;
}

export async function deleteKnowledgePage(id: string, hardDelete = false): Promise<void> {
  await apiRequest(`${PAGES_PATH}/${id}`, {
    method: 'DELETE',
    // Official deleteKnowledgePage defaults recursive to true.
    query: { recursive: true, ...(hardDelete ? { hardDelete: true } : {}) },
  });
}

export async function restoreKnowledgePage(id: string): Promise<void> {
  await apiRequest(`${PAGES_PATH}/restore`, { method: 'PUT', json: { id } });
}

/** A knowledge-page snapshot at one version, carrying its changeDescription. */
export interface VersionedKnowledgePage extends KnowledgePage {
  changeDescription?: ChangeDescription;
}

function mapEntityVersion(raw: Record<string, unknown>): EntityVersion {
  return {
    version: asNumber(raw.version) ?? asString(raw.version) ?? undefined,
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
    changeDescription: mapChangeDescription(raw.changeDescription),
  };
}

/**
 * Official getKnowledgePageVersionsList: GET /v1/contextCenter/pages/{id}/versions,
 * returning EntityHistory.versions in server order.
 */
export async function listKnowledgePageVersions(id: string): Promise<EntityVersion[]> {
  const payload = await apiRequest<unknown>(`${PAGES_PATH}/${encodeURIComponent(id)}/versions`);
  const versions = asRecord(payload)?.versions;
  if (!Array.isArray(versions)) {
    return [];
  }
  return versions.flatMap((item) => {
    const rec = asRecord(item);
    return rec ? [mapEntityVersion(rec)] : [];
  });
}

/**
 * Official getKnowledgePageVersionData: GET /v1/contextCenter/pages/{id}/versions/{version},
 * returning the page snapshot at that version (with its changeDescription).
 */
export async function getKnowledgePageVersion(
  id: string,
  version: string,
): Promise<VersionedKnowledgePage | null> {
  const payload = await apiRequest<unknown>(
    `${PAGES_PATH}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
  );
  const rec = asRecord(payload);
  if (!rec) {
    return null;
  }
  const page = mapKnowledgePage(rec);
  if (!page) {
    return null;
  }
  return { ...page, changeDescription: mapChangeDescription(rec.changeDescription) };
}

export interface ListContextMemoriesQuery {
  limit?: number;
  after?: string;
  before?: string;
  q?: string;
  pinned?: boolean;
  statuses?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  author?: string;
  assets?: string;
  offset?: number;
  fields?: string;
}

export async function listContextMemories(
  query: ListContextMemoriesQuery = {},
): Promise<Paged<ContextMemory>> {
  const payload = await apiRequest<unknown>(MEMORIES_PATH, { query: { ...query } });
  return parsePaged(payload, mapContextMemory);
}

export async function createContextMemory(request: {
  question: string;
  answer?: string;
  description?: string;
}): Promise<ContextMemory | null> {
  const payload = await apiRequest<unknown>(MEMORIES_PATH, { json: request });
  const rec = asRecord(payload);
  return rec ? mapContextMemory(rec) : null;
}

export async function deleteContextMemory(id: string, hardDelete = false): Promise<void> {
  await apiRequest(`${MEMORIES_PATH}/${id}`, {
    method: 'DELETE',
    query: hardDelete ? { hardDelete: true } : {},
  });
}

export async function pinContextMemory(id: string): Promise<void> {
  await apiRequest(`${MEMORIES_PATH}/${id}/pin`, { method: 'PUT' });
}

/**
 * Official unpin (rest/contextMemoryAPI.ts): DELETE /{id}/pin. The server
 * exposes no PUT .../unpin route, so the old call 404'd; pin stays PUT /pin.
 */
export async function unpinContextMemory(id: string): Promise<void> {
  await apiRequest(`${MEMORIES_PATH}/${id}/pin`, { method: 'DELETE' });
}

export interface ListContextFilesQuery {
  limit?: number;
  after?: string;
  folderId?: string;
  assetId?: string;
}

export async function listContextFiles(
  query: ListContextFilesQuery = {},
): Promise<Paged<ContextFile>> {
  const payload = await apiRequest<unknown>(FILES_PATH, {
    query: { fields: 'folder,memoryCount', ...query },
  });
  return parsePaged(payload, mapContextFile);
}

export async function getContextFileById(
  id: string,
  include?: 'non-deleted' | 'deleted' | 'all',
): Promise<ContextFile | null> {
  const payload = await apiRequest<unknown>(`${FILES_PATH}/${id}`, {
    query: { fields: 'folder,memoryCount', include },
  });
  const rec = asRecord(payload);
  return rec ? mapContextFile(rec) : null;
}

export async function listArchivedContextFiles(
  query: { limit?: number; after?: string; updatedBy?: string } = {},
): Promise<Paged<ContextFile>> {
  const payload = await apiRequest<unknown>(FILES_PATH, {
    query: { include: 'deleted', orderBy: 'DESC', ...query },
  });
  return parsePaged(payload, mapContextFile);
}

export async function restoreDriveFile(id: string): Promise<void> {
  await apiRequest(`${FILES_PATH}/restore`, { json: { id } });
}

export async function deleteDriveFile(id: string, hardDelete = false): Promise<void> {
  await apiRequest(`${FILES_PATH}/${id}`, {
    method: 'DELETE',
    query: hardDelete ? { hardDelete: true } : {},
  });
}

/**
 * Official BulkOperationResult (ContextFileResource.buildBulkOperationResult):
 * row counts plus the per-id success/failure lists. `request` carries the
 * file id as a string on both lists.
 */
export interface BulkOperationResult {
  numberOfRowsProcessed?: number;
  numberOfRowsPassed?: number;
  numberOfRowsFailed?: number;
  successRequest?: Array<{ request?: string; status?: number; message?: string }>;
  failedRequest?: Array<{ request?: string; status?: number; message?: string }>;
  status?: string;
}

function mapBulkRequests(value: unknown): Array<{ request?: string; status?: number; message?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    return [
      {
        request: asString(rec.request) || undefined,
        status: asNumber(rec.status),
        message: asString(rec.message) || undefined,
      },
    ];
  });
}

function mapBulkOperationResult(raw: unknown): BulkOperationResult {
  const rec = asRecord(raw) ?? {};
  return {
    numberOfRowsProcessed: asNumber(rec.numberOfRowsProcessed),
    numberOfRowsPassed: asNumber(rec.numberOfRowsPassed),
    numberOfRowsFailed: asNumber(rec.numberOfRowsFailed),
    successRequest: mapBulkRequests(rec.successRequest),
    failedRequest: mapBulkRequests(rec.failedRequest),
    status: asString(rec.status) || undefined,
  };
}

/** Official getSuccessfulIds: the successRequest[].request string set. */
export function getBulkSuccessfulIds(result: BulkOperationResult): Set<string> {
  return new Set(
    (result.successRequest ?? [])
      .map((item) => item.request)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

/**
 * Official bulkDeleteDriveFiles (rest/assetAPI.ts): POST …/bulk/delete
 * with { ids, hardDelete }. Soft delete by default; partial success is
 * reported per id in the result, never as an exception.
 */
export async function bulkDeleteDriveFiles(
  ids: string[],
  hardDelete = false,
): Promise<BulkOperationResult> {
  const payload = await apiRequest<unknown>(`${FILES_PATH}/bulk/delete`, {
    json: { ids, hardDelete },
  });
  return mapBulkOperationResult(payload);
}

/**
 * Official bulkMoveFilesToFolder (rest/assetAPI.ts): PUT …/bulk/move
 * with { ids, folder: { id, type: 'folder' } }.
 */
export async function bulkMoveFilesToFolder(
  ids: string[],
  folderId: string,
): Promise<BulkOperationResult> {
  const payload = await apiRequest<unknown>(`${FILES_PATH}/bulk/move`, {
    method: 'PUT',
    json: { ids, folder: { id: folderId, type: 'folder' } },
  });
  return mapBulkOperationResult(payload);
}

/**
 * Official downloadDriveFiles (rest/assetAPI.ts): POST …/bulk/download,
 * returning a zip blob.
 *
 * ADR:2026-11-07-context-center-bulk-download-blob-path — apiRequest has
 * no blob mode, so this uses a raw authed fetch like uploadDriveFile.
 * The endpoint answers failures as JSON (503 with no object storage,
 * 404 with no file content, 400 with a BulkOperationResult), so a JSON
 * body is always an error and is never saved as a .zip.
 */
export async function downloadDriveFiles(ids: string[]): Promise<Blob> {
  if (ids.length === 0) {
    throw new Error('No files selected for download');
  }
  const session = loadSession(window.localStorage);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.accessToken) {
    headers.Authorization = authorizationHeader(session.accessToken);
  }
  const response = await fetch(`${apiBaseUrl()}${FILES_PATH}/bulk/download`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids }),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text, readErrorMessage(text, response.status));
  }
  if (contentType.includes('application/json')) {
    const text = await response.text();
    throw new ApiError(response.status, text, readErrorMessage(text, response.status));
  }
  return response.blob();
}

/**
 * G-20 document search.
 *
 * ADR:2026-11-07-context-center-g20-search-size-100 — a dedicated call,
 * not searchAssets: SearchHit drops the columns the document table
 * renders, so hits are read from _source and mapped through the existing
 * mapContextFile, with the total from hits.total.value. Size defaults to
 * 100 (the REST page size; the search view replaces the list and has no
 * search-state paging). The folder term filter follows the official
 * shape and is attached only when a folder is selected.
 */
export async function searchContextFiles(
  query: string,
  options: { folderId?: string; size?: number } = {},
): Promise<{ data: ContextFile[]; total: number }> {
  const q = query.trim();
  const queryFilter = options.folderId
    ? JSON.stringify({
        query: { bool: { filter: { term: { 'folder.id': options.folderId } } } },
      })
    : undefined;
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q: q.length > 0 ? q : '*',
      index: 'contextFile',
      from: 0,
      size: options.size ?? 100,
      sort_field: 'updatedAt',
      sort_order: 'desc',
      query_filter: queryFilter,
    },
  });
  const root = asRecord(payload) ?? {};
  const hits = asRecord(root.hits) ?? {};
  const total = asRecord(hits.total);
  const rows = Array.isArray(hits.hits) ? hits.hits : [];
  const data = rows.flatMap((item) => {
    const source = asRecord(asRecord(item)?._source);
    if (!source) {
      return [];
    }
    const mapped = mapContextFile(source);
    return mapped ? [mapped] : [];
  });
  return { data, total: asNumber(total?.value) ?? data.length };
}

export async function listDriveFolders(
  query: { limit?: number; after?: string } = {},
): Promise<Paged<DriveFolder>> {
  const payload = await apiRequest<unknown>(FOLDERS_PATH, {
    query: { fields: 'childrenCount', ...query },
  });
  return parsePaged(payload, mapDriveFolder);
}

export async function createDriveFolder(request: {
  name: string;
  displayName?: string;
  description?: string;
}): Promise<DriveFolder | null> {
  const payload = await apiRequest<unknown>(FOLDERS_PATH, { json: request });
  const rec = asRecord(payload);
  return rec ? mapDriveFolder(rec) : null;
}

export async function deleteDriveFolder(id: string, hardDelete = false): Promise<void> {
  await apiRequest(`${FOLDERS_PATH}/${id}`, {
    method: 'DELETE',
    query: hardDelete ? { hardDelete: true } : {},
  });
}

/** Multipart upload: apiRequest only carries JSON, so this posts FormData directly. */
export async function uploadDriveFile(file: File, folderFqn?: string): Promise<ContextFile | null> {
  const formData = new FormData();
  formData.append('file', file);
  if (folderFqn) {
    formData.append('folder', folderFqn);
  }
  const session = loadSession(window.localStorage);
  const headers: Record<string, string> = {};
  if (session?.accessToken) {
    headers.Authorization = authorizationHeader(session.accessToken);
  }
  const response = await fetch(`${apiBaseUrl()}/v1/contextCenter/drive/files/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(response.status, text);
  }
  if (!text) {
    return null;
  }
  const rec = asRecord(JSON.parse(text) as unknown);
  return rec ? mapContextFile(rec) : null;
}

export async function listPersonas(
  query: { limit?: number; after?: string; fields?: string } = {},
): Promise<Paged<PersonaAiContext>> {
  const payload = await apiRequest<unknown>(PERSONAS_PATH, { query: { ...query } });
  return parsePaged(payload, mapPersona);
}

export async function listPersonaAiContextStatuses(
  query: { limit?: number; after?: string } = {},
): Promise<PersonaAiContextStatus[]> {
  const payload = await apiRequest<unknown>(`${PERSONAS_PATH}/aiContext/status`, {
    query: { ...query },
  });
  return parsePaged(payload, mapPersonaStatus).data;
}

export async function getPersonaAiContext(id: string): Promise<PersonaAiContext | null> {
  const payload = await apiRequest<unknown>(`${PERSONAS_PATH}/${id}/aiContext`);
  const rec = asRecord(payload);
  if (!rec) {
    return null;
  }
  // The definition endpoint returns the context definition, not the persona:
  // wrap it so the detail view can reuse the same shape.
  const rules = Array.isArray(rec.rules) ? rec.rules : [];
  const mappedRules: PersonaAiContextRule[] = rules.flatMap((item) => {
    const ruleRec = asRecord(item);
    if (!ruleRec) {
      return [];
    }
    const entityType = asString(ruleRec.entityType);
    if (!entityType) {
      return [];
    }
    return [
      {
        id: asString(ruleRec.id) || undefined,
        entityType,
        description: asString(ruleRec.description) || undefined,
        enabled: asBoolean(ruleRec.enabled) ?? undefined,
        alwaysInContext: asBoolean(ruleRec.alwaysInContext) ?? undefined,
        filteredInSearch: asBoolean(ruleRec.filteredInSearch) ?? undefined,
      },
    ];
  });
  return {
    id,
    name: '',
    rules: mappedRules,
    characterBudget: asNumber(rec.characterBudget),
    cacheTtlMinutes: asNumber(rec.cacheTtlMinutes),
    enabled: asBoolean(rec.enabled) ?? undefined,
    prompt: asString(rec.prompt) || undefined,
  };
}

export async function updatePersonaAiContext(
  id: string,
  request: {
    cacheTtlMinutes?: number;
    characterBudget?: number;
    enabled?: boolean;
    prompt?: string;
  },
): Promise<void> {
  await apiRequest(`${PERSONAS_PATH}/${id}/aiContext`, { json: request });
}

export async function refreshPersonaAiContextDocument(id: string): Promise<void> {
  await apiRequest(`${PERSONAS_PATH}/${id}/aiContext/document:refresh`, { method: 'POST' });
}

export async function createPersonaAiContextRule(
  id: string,
  rule: Omit<PersonaAiContextRule, 'id'>,
): Promise<void> {
  await apiRequest(`${PERSONAS_PATH}/${id}/aiContext/rules`, { json: rule });
}

export async function updatePersonaAiContextRule(
  id: string,
  ruleId: string,
  rule: Omit<PersonaAiContextRule, 'id'>,
): Promise<void> {
  await apiRequest(`${PERSONAS_PATH}/${id}/aiContext/rules/${ruleId}`, { json: rule });
}

export async function deletePersonaAiContextRule(id: string, ruleId: string): Promise<void> {
  await apiRequest(`${PERSONAS_PATH}/${id}/aiContext/rules/${ruleId}`, { method: 'DELETE' });
}
