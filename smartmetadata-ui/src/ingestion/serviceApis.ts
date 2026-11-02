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
  createDashboardService,
  deleteDashboardService,
  getDashboardService,
  updateDashboardService,
} from '@/api/dashboardServices';
import {
  createDatabaseService,
  deleteDatabaseService,
  getDatabaseService,
  updateDatabaseService,
} from '@/api/databaseServices';
import {
  createMessagingService,
  deleteMessagingService,
  getMessagingService,
  updateMessagingService,
} from '@/api/messagingServices';
import {
  createPipelineService,
  deletePipelineService,
  getPipelineService,
  updatePipelineService,
} from '@/api/pipelineServices';
import {
  createStorageService,
  deleteStorageService,
  getStorageService,
  updateStorageService,
} from '@/api/storageServices';
import type {
  CatalogService,
  CreateDatabaseServiceRequest,
  ServiceKind,
} from '@/types/ingestion';

type CreateFn = (body: CreateDatabaseServiceRequest) => Promise<CatalogService>;
type UpdateFn = (body: CreateDatabaseServiceRequest) => Promise<CatalogService>;
type GetFn = (id: string) => Promise<CatalogService>;
type DeleteFn = (id: string) => Promise<void>;

export const SERVICE_CREATE_API: Record<ServiceKind, CreateFn> = {
  database: createDatabaseService,
  messaging: createMessagingService,
  dashboard: createDashboardService,
  storage: createStorageService,
  pipeline: createPipelineService,
};

export const SERVICE_UPDATE_API: Record<ServiceKind, UpdateFn> = {
  database: updateDatabaseService,
  messaging: updateMessagingService,
  dashboard: updateDashboardService,
  storage: updateStorageService,
  pipeline: updatePipelineService,
};

export const SERVICE_GET_API: Record<ServiceKind, GetFn> = {
  database: getDatabaseService,
  messaging: getMessagingService,
  dashboard: getDashboardService,
  storage: getStorageService,
  pipeline: getPipelineService,
};

export const SERVICE_DELETE_API: Record<ServiceKind, DeleteFn> = {
  database: deleteDatabaseService,
  messaging: deleteMessagingService,
  dashboard: deleteDashboardService,
  storage: deleteStorageService,
  pipeline: deletePipelineService,
};
