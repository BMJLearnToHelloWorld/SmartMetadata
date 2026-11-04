/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Per-kind service API dispatch tables. Views look the kind up here instead
 * of repeating create/update/get/delete if-else chains per view.
 */
import {
  createApiService,
  deleteApiService,
  getApiService,
  listApiServices,
  mapApiService,
  updateApiService,
} from '@/api/apiServices';
import {
  createDashboardService,
  deleteDashboardService,
  getDashboardService,
  listDashboardServices,
  mapDashboardService,
  updateDashboardService,
} from '@/api/dashboardServices';
import {
  createDatabaseService,
  deleteDatabaseService,
  getDatabaseService,
  listDatabaseServices,
  mapDatabaseService,
  updateDatabaseService,
} from '@/api/databaseServices';
import {
  createDriveService,
  deleteDriveService,
  getDriveService,
  listDriveServices,
  mapDriveService,
  updateDriveService,
} from '@/api/driveServices';
import {
  createLlmService,
  deleteLlmService,
  getLlmService,
  listLlmServices,
  mapLlmService,
  updateLlmService,
} from '@/api/llmServices';
import {
  createMcpService,
  deleteMcpService,
  getMcpService,
  listMcpServices,
  mapMcpService,
  updateMcpService,
} from '@/api/mcpServices';
import {
  createMessagingService,
  deleteMessagingService,
  getMessagingService,
  listMessagingServices,
  mapMessagingService,
  updateMessagingService,
} from '@/api/messagingServices';
import {
  createMetadataService,
  deleteMetadataService,
  getMetadataService,
  listMetadataServices,
  mapMetadataService,
  updateMetadataService,
} from '@/api/metadataServices';
import {
  createMlModelService,
  deleteMlModelService,
  getMlModelService,
  listMlModelServices,
  mapMlModelService,
  updateMlModelService,
} from '@/api/mlmodelServices';
import {
  createPipelineService,
  deletePipelineService,
  getPipelineService,
  listPipelineServices,
  mapPipelineService,
  updatePipelineService,
} from '@/api/pipelineServices';
import {
  createSearchService,
  deleteSearchService,
  getSearchService,
  listSearchServices,
  mapSearchService,
  updateSearchService,
} from '@/api/searchServices';
import {
  createSecurityService,
  deleteSecurityService,
  getSecurityService,
  listSecurityServices,
  mapSecurityService,
  updateSecurityService,
} from '@/api/securityServices';
import {
  createStorageService,
  deleteStorageService,
  getStorageService,
  listStorageServices,
  mapStorageService,
  updateStorageService,
} from '@/api/storageServices';
import type {
  CatalogService,
  CreateDatabaseServiceRequest,
  ServiceKind,
} from '@/types/ingestion';
import type { Paged } from '@/types/admin';

type CreateFn = (body: CreateDatabaseServiceRequest) => Promise<CatalogService>;
type UpdateFn = (body: CreateDatabaseServiceRequest) => Promise<CatalogService>;
type GetFn = (id: string) => Promise<CatalogService>;
type DeleteFn = (id: string) => Promise<void>;
type ListFn = (query?: { limit?: number; after?: string }) => Promise<Paged<CatalogService>>;
type MapFn = (raw: Record<string, unknown>) => CatalogService | null;

export const SERVICE_CREATE_API: Record<ServiceKind, CreateFn> = {
  database: createDatabaseService,
  messaging: createMessagingService,
  dashboard: createDashboardService,
  storage: createStorageService,
  pipeline: createPipelineService,
  api: createApiService,
  mlmodel: createMlModelService,
  metadata: createMetadataService,
  drive: createDriveService,
  search: createSearchService,
  llm: createLlmService,
  mcp: createMcpService,
  security: createSecurityService,
};

export const SERVICE_UPDATE_API: Record<ServiceKind, UpdateFn> = {
  database: updateDatabaseService,
  messaging: updateMessagingService,
  dashboard: updateDashboardService,
  storage: updateStorageService,
  pipeline: updatePipelineService,
  api: updateApiService,
  mlmodel: updateMlModelService,
  metadata: updateMetadataService,
  drive: updateDriveService,
  search: updateSearchService,
  llm: updateLlmService,
  mcp: updateMcpService,
  security: updateSecurityService,
};

export const SERVICE_GET_API: Record<ServiceKind, GetFn> = {
  database: getDatabaseService,
  messaging: getMessagingService,
  dashboard: getDashboardService,
  storage: getStorageService,
  pipeline: getPipelineService,
  api: getApiService,
  mlmodel: getMlModelService,
  metadata: getMetadataService,
  drive: getDriveService,
  search: getSearchService,
  llm: getLlmService,
  mcp: getMcpService,
  security: getSecurityService,
};

export const SERVICE_DELETE_API: Record<ServiceKind, DeleteFn> = {
  database: deleteDatabaseService,
  messaging: deleteMessagingService,
  dashboard: deleteDashboardService,
  storage: deleteStorageService,
  pipeline: deletePipelineService,
  api: deleteApiService,
  mlmodel: deleteMlModelService,
  metadata: deleteMetadataService,
  drive: deleteDriveService,
  search: deleteSearchService,
  llm: deleteLlmService,
  mcp: deleteMcpService,
  security: deleteSecurityService,
};

export const SERVICE_LIST_API: Record<ServiceKind, ListFn> = {
  database: listDatabaseServices,
  messaging: listMessagingServices,
  dashboard: listDashboardServices,
  storage: listStorageServices,
  pipeline: listPipelineServices,
  api: listApiServices,
  mlmodel: listMlModelServices,
  metadata: listMetadataServices,
  drive: listDriveServices,
  search: listSearchServices,
  llm: listLlmServices,
  mcp: listMcpServices,
  security: listSecurityServices,
};

/** Raw-record mapper per kind, for version snapshots (see serviceVersions). */
export const SERVICE_MAP_API: Record<ServiceKind, MapFn> = {
  database: mapDatabaseService,
  messaging: mapMessagingService,
  dashboard: mapDashboardService,
  storage: mapStorageService,
  pipeline: mapPipelineService,
  api: mapApiService,
  mlmodel: mapMlModelService,
  metadata: mapMetadataService,
  drive: mapDriveService,
  search: mapSearchService,
  llm: mapLlmService,
  mcp: mapMcpService,
  security: mapSecurityService,
};
