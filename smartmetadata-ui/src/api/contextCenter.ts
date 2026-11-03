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
import { apiBaseUrl, apiRequest, ApiError } from './client';
import { mapTags } from './entities';
import { authorizationHeader, loadSession } from '@/auth/token';

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
  pageType?: KnowledgePageType;
  entityType?: string;
  entityId?: string;
  tagFQN?: string;
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

export interface ListContextMemoriesQuery {
  limit?: number;
  after?: string;
  q?: string;
  pinned?: boolean;
  statuses?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

export async function unpinContextMemory(id: string): Promise<void> {
  await apiRequest(`${MEMORIES_PATH}/${id}/unpin`, { method: 'PUT' });
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
