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
  /**
   * Full-profile fields from GET /v1/users/loggedInUser. The login call
   * itself returns a JWT only; these arrive with the profile, and the
   * permission chain (isAdminUser line) reads isAdmin from here, exactly
   * as official useAuth reads currentUser?.isAdmin.
   */
  isAdmin?: boolean;
  roles?: EntityRef[];
  teams?: EntityRef[];
  /**
   * Official User.defaultPersona: the persona a user falls back to when
   * no persona is selected. The profile endpoint returns it; the persona
   * store uses it as the selection fallback.
   */
  defaultPersona?: EntityRef;
}

export interface EntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  fullyQualifiedName?: string;
}

/** Official votes shape (openmetadata-spec type/votes.json). */
export interface EntityVotes {
  upVotes: number;
  downVotes: number;
  upVoters?: EntityRef[];
  downVoters?: EntityRef[];
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
  // Parent table FQN for tableColumn hits, from the ES source's embedded
  // `table` reference (official column cards link to the parent table, not
  // to a column detail page, which does not exist). Absent when the source
  // carries no table reference; never derived by trimming the column FQN.
  tableFqn?: string;
  constraint?: string;
  updatedAt?: number;
}

export interface SearchPage {
  total: number;
  hits: SearchHit[];
  facets: SearchFacet[];
}

export interface SchemaRow {
  /** Dotted path (parent.child), unique across nested rows: Ant Table needs
      a row key that cannot collide between same-named children of different
      STRUCT parents, which a bare column name cannot guarantee. */
  key: string;
  name: string;
  dataType: string;
  description?: string;
  /** Nested columns of a STRUCT column; absent when there are none, so no
      expand icon is drawn for leaf columns. */
  children?: SchemaRow[];
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
  apiEndpointUrl?: string;
  apiRequestMethod?: string;
  apiRequestSchema?: Record<string, unknown>;
  apiResponseSchema?: Record<string, unknown>;
  parent?: EntityRef;
  children?: EntityRef[];
  charts?: EntityRef[];
  dataModels?: EntityRef[];
  mlFeatures?: SchemaRow[];
  mlHyperParameters?: MlHyperParameter[];
  tasks?: PipelineTask[];
  pipelineStatus?: CatalogPipelineStatus;
  owners: EntityRef[];
  followers?: EntityRef[];
  votes?: EntityVotes;
  tags: TagRef[];
  domains: EntityRef[];
  schemaRows: SchemaRow[];
  schemaLabel: string;
  extension?: Record<string, unknown>;
}
