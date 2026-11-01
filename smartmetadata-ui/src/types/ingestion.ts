/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

export const DATABASE_SERVICE_TYPES = ['Postgres', 'Mysql', 'Snowflake', 'Databricks', 'UnityCatalog', 'Doris', 'Mssql', 'Redshift', 'MariaDB', 'Greenplum', 'Timescale'] as const;
export type DatabaseServiceType = (typeof DATABASE_SERVICE_TYPES)[number];

export const MESSAGING_SERVICE_TYPES = ['Kafka', 'Redpanda'] as const;
export type MessagingServiceType = (typeof MESSAGING_SERVICE_TYPES)[number];

export const DASHBOARD_SERVICE_TYPES = ['Superset', 'Metabase'] as const;
export type DashboardServiceType = (typeof DASHBOARD_SERVICE_TYPES)[number];

export const STORAGE_SERVICE_TYPES = ['S3'] as const;
export type StorageServiceType = (typeof STORAGE_SERVICE_TYPES)[number];

export const PIPELINE_SERVICE_TYPES = ['Prefect', 'Dagster'] as const;
export type PipelineServiceType = (typeof PIPELINE_SERVICE_TYPES)[number];

export const SUPPORTED_SERVICE_TYPES = [
  ...DATABASE_SERVICE_TYPES,
  ...MESSAGING_SERVICE_TYPES,
  ...DASHBOARD_SERVICE_TYPES,
  ...STORAGE_SERVICE_TYPES,
  ...PIPELINE_SERVICE_TYPES,
] as const;
export type SupportedServiceType = (typeof SUPPORTED_SERVICE_TYPES)[number];

export type ServiceKind = 'database' | 'messaging' | 'dashboard' | 'storage' | 'pipeline';

export const CLI_SOURCE_BY_SERVICE_TYPE: Record<SupportedServiceType, string> = {
  Postgres: 'postgres',
  Mysql: 'mysql',
  Snowflake: 'snowflake',
  Databricks: 'databricks',
  UnityCatalog: 'unitycatalog',
  Doris: 'doris',
  Mssql: 'mssql',
  Redshift: 'redshift',
  MariaDB: 'mariadb',
  Greenplum: 'greenplum',
  Timescale: 'timescale',
  Kafka: 'kafka',
  Redpanda: 'redpanda',
  Superset: 'superset',
  Metabase: 'metabase',
  S3: 's3',
  Prefect: 'prefect',
  Dagster: 'dagster',
};

export const SERVICE_TYPE_BY_CLI_SOURCE: Record<string, SupportedServiceType> = {
  postgres: 'Postgres',
  mysql: 'Mysql',
  snowflake: 'Snowflake',
  databricks: 'Databricks',
  unitycatalog: 'UnityCatalog',
  doris: 'Doris',
  mssql: 'Mssql',
  redshift: 'Redshift',
  mariadb: 'MariaDB',
  greenplum: 'Greenplum',
  timescale: 'Timescale',
  kafka: 'Kafka',
  redpanda: 'Redpanda',
  superset: 'Superset',
  metabase: 'Metabase',
  s3: 'S3',
  prefect: 'Prefect',
  dagster: 'Dagster',
};

export const PIPELINE_TYPES = ['metadata', 'usage', 'lineage', 'profiler', 'TestSuite'] as const;
export type PipelineType = (typeof PIPELINE_TYPES)[number];

/**
 * Agent / ingestion pipeline kinds offered per serviceType, derived 1:1 from OM
 * service_spec class fields that map to PipelineType (metadata_source_class,
 * lineage_source_class, usage_source_class, profiler_class, test_suite_class).
 * DefaultDatabaseSpec always supplies profiler + TestSuite. Sampler / data_diff
 * are capabilities, not pipelineType agents. No AutoClassification / dbt invent
 * (those are schema-flag UX extras without service_spec classes here).
 */
export const AGENT_KINDS_BY_SERVICE: Record<SupportedServiceType, readonly PipelineType[]> = {
  Postgres: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Mysql: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Snowflake: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Databricks: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  UnityCatalog: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Doris: ['metadata', 'lineage', 'profiler', 'TestSuite'],
  Mssql: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Redshift: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  MariaDB: ['metadata', 'lineage', 'profiler', 'TestSuite'],
  Greenplum: ['metadata', 'lineage', 'profiler', 'TestSuite'],
  Timescale: ['metadata', 'lineage', 'usage', 'profiler', 'TestSuite'],
  Kafka: ['metadata'],
  Redpanda: ['metadata'],
  Superset: ['metadata'],
  Metabase: ['metadata'],
  S3: ['metadata'],
  Prefect: ['metadata'],
  Dagster: ['metadata'],
};

export function agentKindsForService(serviceType: string): readonly PipelineType[] {
  const kinds = AGENT_KINDS_BY_SERVICE[serviceType as SupportedServiceType];
  return kinds ?? (['metadata'] as const);
}

export interface ServiceConnectionConfig {
  type?: string;
  hostPort?: string;
  username?: string;
  database?: string;
  databaseName?: string;
  databaseSchema?: string;
  account?: string;
  warehouse?: string;
  role?: string;
  bootstrapServers?: string;
  schemaRegistryURL?: string;
  securityProtocol?: string;
  httpPath?: string;
  catalog?: string;
  queryHistoryTable?: string;
  includeMetricViews?: boolean;
  scheme?: string;
  driver?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  ingestAllDatabases?: boolean;
  includeSynonyms?: boolean;
  authType?: {
    password?: string;
    token?: string;
    clientId?: string;
    clientSecret?: string;
    azureClientId?: string;
    azureClientSecret?: string;
    azureTenantId?: string;
  };
  password?: string;
  apiKey?: string;
  provider?: string;
  connection?: {
    provider?: string;
    username?: string;
    password?: string;
  };
  awsConfig?: {
    enabled?: boolean;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsRegion?: string;
    awsSessionToken?: string;
    endPointURL?: string;
    profileName?: string;
    assumeRoleArn?: string;
    assumeRoleSessionName?: string;
    assumeRoleSourceIdentity?: string;
  };
  bucketNames?: string[];
  consoleEndpointURL?: string;
  host?: string;
  token?: string;
  timeout?: number;
  stripAssetKeyPrefixLength?: number;
  numberOfStatus?: number;
  [key: string]: unknown;
}

export interface ServiceConnection {
  config?: ServiceConnectionConfig;
}

export interface CatalogService {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  kind: ServiceKind;
  serviceType: string;
  connection?: ServiceConnection;
}

export interface ServiceFormValues {
  name: string;
  displayName?: string;
  description?: string;
  kind: ServiceKind;
  serviceType: string;
  hostPort?: string;
  username?: string;
  database?: string;
  databaseName?: string;
  databaseSchema?: string;
  account?: string;
  warehouse?: string;
  role?: string;
  bootstrapServers?: string;
  schemaRegistryURL?: string;
  securityProtocol?: string;
  httpPath?: string;
  catalog?: string;
  queryHistoryTable?: string;
  includeMetricViews?: boolean;
  scheme?: string;
  driver?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  ingestAllDatabases?: boolean;
  includeSynonyms?: boolean;
  authMode?: 'pat' | 'oauth' | 'azure';
  clientId?: string;
  clientSecret?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  password?: string;
  apiKey?: string;
  provider?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  awsEndPointURL?: string;
  awsProfileName?: string;
  assumeRoleArn?: string;
  assumeRoleSessionName?: string;
  assumeRoleSourceIdentity?: string;
  awsIamEnabled?: boolean;
  bucketNames?: string;
  consoleEndpointURL?: string;
  prefectAuthMode?: 'cloud' | 'server';
  prefectAccountId?: string;
  prefectWorkspaceId?: string;
  prefectAuthString?: string;
  numberOfStatus?: number;
  dagsterTimeout?: number;
  stripAssetKeyPrefixLength?: number;
  storeConnectionSecrets?: boolean;
}

export interface CreateDatabaseServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface CreateMessagingServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface CreateDashboardServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface CreateStorageServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface CreatePipelineServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface PipelineSourceConfig {
  config?: {
    type?: string;
    includeViews?: boolean;
    includeTables?: boolean;
    schemaFilterPattern?: { includes?: string[]; excludes?: string[] };
    topicFilterPattern?: { includes?: string[]; excludes?: string[] };
    dashboardFilterPattern?: { includes?: string[]; excludes?: string[] };
    chartFilterPattern?: { includes?: string[]; excludes?: string[] };
    containerFilterPattern?: { includes?: string[]; excludes?: string[] };
    [key: string]: unknown;
  };
}

export interface AirflowConfig {
  pausePipeline?: boolean;
  scheduleInterval?: string;
  pipelineTimezone?: string;
}

export interface IngestionPipeline {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  pipelineType?: string;
  service?: EntityRef;
  sourceConfig?: PipelineSourceConfig;
  airflowConfig?: AirflowConfig;
  deployed?: boolean;
  enabled?: boolean;
  loggerLevel?: string;
}

export interface CreateIngestionPipelineRequest {
  name: string;
  pipelineType: string;
  service: { id: string; type: string };
  sourceConfig: PipelineSourceConfig;
  airflowConfig: AirflowConfig;
  displayName?: string;
  description?: string;
  loggerLevel?: string;
}

export interface PipelineStatus {
  runId?: string;
  pipelineState?: string;
  startDate?: number;
  timestamp?: number;
  endDate?: number;
  triggeredBy?: string;
}

export interface OrchestratorStatus {
  code?: number;
  platform?: string;
  reason?: string;
}

export interface PipelineFormValues {
  name: string;
  displayName?: string;
  description?: string;
  pipelineType: string;
  serviceId: string;
  serviceKind: ServiceKind;
  includeViews: boolean;
  includeSchemas?: string;
  includeTopics?: string;
  includeDashboards?: string;
  includeCharts?: string;
  includeContainers?: string;
  scheduleInterval?: string;
}
