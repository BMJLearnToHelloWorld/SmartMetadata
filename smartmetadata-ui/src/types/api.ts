/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SearchFacet } from '@/catalog/searchFacets';

export interface JwtResponse {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiryDuration?: number;
}

export interface LoginUser {
  id?: string;
  name?: string;
  email?: string;
  displayName?: string;
}

export interface EntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  fullyQualifiedName?: string;
}

export interface TagRef {
  tagFQN: string;
  name: string;
  source?: 'Classification' | 'Glossary';
}

export interface SearchHit {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  entityType: string;
  description?: string;
  serviceType?: string;
  serviceName?: string;
  databaseName?: string;
  schemaName?: string;
  tier?: string;
  owners: EntityRef[];
  tags: TagRef[];
  domains?: EntityRef[];
  dataProducts?: EntityRef[];
  dataType?: string;
  tableName?: string;
  constraint?: string;
  updatedAt?: number;
}

export interface SearchPage {
  total: number;
  hits: SearchHit[];
  facets: SearchFacet[];
}

export interface SchemaRow {
  name: string;
  dataType: string;
  description?: string;
}

export interface PipelineTask {
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  taskType?: string;
  sourceUrl?: string;
  downstreamTasks: string[];
}

export interface PipelineTaskStatus {
  name: string;
  executionStatus: string;
  startTime?: number;
  endTime?: number;
}

export interface CatalogPipelineStatus {
  timestamp: number;
  executionStatus: string;
  executionId?: string;
  endTime?: number;
  taskStatus: PipelineTaskStatus[];
}

export interface MlHyperParameter {
  name: string;
  value?: string;
  description?: string;
}

export interface StoredProcedureCode {
  language?: string;
  code?: string;
}

export interface AssetDetail {
  entityType: string;
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  description?: string;
  tableType?: string;
  serviceType?: string;
  service?: EntityRef;
  database?: EntityRef;
  databaseSchema?: EntityRef;
  partitions?: number;
  sourceUrl?: string;
  scheduleInterval?: string;
  pipelineState?: string;
  project?: string;
  dashboardType?: string;
  chartType?: string;
  metricType?: string;
  unitOfMeasurement?: string;
  granularity?: string;
  dataModelType?: string;
  algorithm?: string;
  target?: string;
  prefix?: string;
  numberOfObjects?: number;
  size?: number;
  fileFormats?: string[];
  indexType?: string;
  storedProcedureType?: string;
  storedProcedureCode?: StoredProcedureCode;
  parent?: EntityRef;
  children?: EntityRef[];
  charts?: EntityRef[];
  dataModels?: EntityRef[];
  mlFeatures?: SchemaRow[];
  mlHyperParameters?: MlHyperParameter[];
  tasks?: PipelineTask[];
  pipelineStatus?: CatalogPipelineStatus;
  owners: EntityRef[];
  tags: TagRef[];
  domains: EntityRef[];
  schemaRows: SchemaRow[];
  schemaLabel: string;
  extension?: Record<string, unknown>;
}
