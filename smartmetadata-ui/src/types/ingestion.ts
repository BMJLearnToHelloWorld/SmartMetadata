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

/**
 * Remaining official service kinds (openmetadata-ui generated
 * ApiServiceType / MlModelServiceType / MetadataServiceType /
 * DriveServiceType / SearchServiceType / LlmServiceType / MCPType /
 * security Type). Kept out of SUPPORTED_SERVICE_TYPES on purpose: that
 * union feeds CLI_SOURCE_BY_SERVICE_TYPE, and these kinds have no CLI
 * source mapping in this console — their connection JSON stays read-only.
 */
export const API_SERVICE_TYPES = ['Rest', 'WEBHOOK'] as const;
export type ApiServiceType = (typeof API_SERVICE_TYPES)[number];

export const MLMODEL_SERVICE_TYPES = ['CustomMlModel', 'Mlflow', 'SageMaker', 'Sklearn', 'VertexAI'] as const;
export type MlModelServiceType = (typeof MLMODEL_SERVICE_TYPES)[number];

export const METADATA_SERVICE_TYPES = ['Alation', 'AlationSink', 'Amundsen', 'Atlas', 'Collibra', 'MetadataES', 'OpenMetadata'] as const;
export type MetadataServiceType = (typeof METADATA_SERVICE_TYPES)[number];

export const DRIVE_SERVICE_TYPES = ['CustomDrive', 'GoogleDrive', 'Sftp', 'SharePoint'] as const;
export type DriveServiceType = (typeof DRIVE_SERVICE_TYPES)[number];

export const SEARCH_SERVICE_TYPES = ['CustomSearch', 'ElasticSearch', 'OpenSearch'] as const;
export type SearchServiceType = (typeof SEARCH_SERVICE_TYPES)[number];

export const LLM_SERVICE_TYPES = ['Anthropic', 'AzureOpenAI', 'Bedrock', 'CustomLLM', 'HuggingFace', 'Ollama', 'OpenAI', 'VertexAI'] as const;
export type LlmServiceType = (typeof LLM_SERVICE_TYPES)[number];

export const MCP_SERVICE_TYPES = ['Mcp'] as const;
export type McpServiceType = (typeof MCP_SERVICE_TYPES)[number];

export const SECURITY_SERVICE_TYPES = ['Ranger'] as const;
export type SecurityServiceType = (typeof SECURITY_SERVICE_TYPES)[number];

export const SUPPORTED_SERVICE_TYPES = [
  ...DATABASE_SERVICE_TYPES,
  ...MESSAGING_SERVICE_TYPES,
  ...DASHBOARD_SERVICE_TYPES,
  ...STORAGE_SERVICE_TYPES,
  ...PIPELINE_SERVICE_TYPES,
] as const;
export type SupportedServiceType = (typeof SUPPORTED_SERVICE_TYPES)[number];

export type ServiceKind =
  | 'database'
  | 'messaging'
  | 'dashboard'
  | 'storage'
  | 'pipeline'
  | 'api'
  | 'mlmodel'
  | 'metadata'
  | 'drive'
  | 'search'
  | 'llm'
  | 'mcp'
  | 'security';

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
    /** ElasticSearch / Ranger basic auth (elasticSearch/basicAuth, ranger/basicAuth). */
    username?: string;
    /** ElasticSearch api auth (elasticSearch/apiAuth). */
    apiKey?: string;
    /** Prefect Cloud auth (prefect/cloudAuth.json). */
    accountId?: string;
    /** Prefect Cloud auth (prefect/cloudAuth.json). */
    workspaceId?: string;
    /** Prefect Server auth (prefect/serverAuth.json). */
    authString?: string;
  };
  password?: string;
  apiKey?: string;
  provider?: string;
  connection?: {
    provider?: string;
    username?: string;
    password?: string;
    /** Superset API connection (supersetApiConnection.json): verifySSL enum. */
    verifySSL?: string;
    /** Superset API connection sslConfig (validateSSLClientConfig). */
    sslConfig?: SslClientConfig;
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
  /** Prefect top level (prefectConnection.json): verifySSL enum, default no-ssl. */
  verifySSL?: string;
  /** Prefect top level sslConfig (validateSSLClientConfig). */
  sslConfig?: SslClientConfig;
  /** Kafka/Redpanda (kafkaConnection.json / redpandaConnection.json). */
  saslUsername?: string;
  saslPassword?: string;
  saslMechanism?: string;
  basicAuthUserInfo?: string;
  /** Arbitrary JSON objects (additionalProperties: true), not string maps. */
  consumerConfig?: Record<string, unknown>;
  schemaRegistryConfig?: Record<string, unknown>;
  schemaRegistryTopicSuffixName?: string;
  /** Kafka's two sslConfig groups (validateSSLClientConfig each). */
  consumerConfigSSL?: SslClientConfig;
  schemaRegistrySSL?: SslClientConfig;
  [key: string]: unknown;
}

/**
 * validateSSLClientConfig (openmetadata-spec
 * .../security/ssl/validateSSLClientConfig.json): the three PEM leaves of one
 * sslConfig group. Every sslConfig group in a connection (top level,
 * Kafka's consumerConfigSSL/schemaRegistrySSL, Superset's nested one) has
 * this shape; each group gets its own form-key triplet (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups).
 */
export interface SslClientConfig {
  caCertificate?: string;
  sslCertificate?: string;
  sslKey?: string;
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
  /**
   * Stored test-connection outcome (openmetadata-spec
   * entity/services/connections/testConnectionResult.json), written by a
   * test-connection runner — never written by this console. The UI only
   * displays it and triggers a fresh run through an automations workflow.
   */
  testConnectionResult?: TestConnectionResult;
}

/** One step of a stored TestConnectionResult. */
export interface TestConnectionStepResult {
  name: string;
  mandatory?: boolean;
  passed?: boolean;
  message?: string;
  errorLog?: string;
  status?: string;
  skipReason?: string;
  diagnosisTitle?: string;
  diagnosisRemediation?: string;
}

/** Stored TestConnectionResult: status + ordered steps. */
export interface TestConnectionResult {
  lastUpdatedAt?: number;
  status?: string;
  steps: TestConnectionStepResult[];
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
  /** Mlflow (mlmodel): tracking + registry URIs (mlflowConnection, required). */
  trackingUri?: string;
  registryUri?: string;
  /** Rest (api): OpenAPI schema URL (openAPISchemaURL, required). */
  openApiSchemaUrl?: string;
  /** GoogleDrive (drive): GCP service-account credentials JSON (required). */
  credentialsJson?: string;
  delegatedEmail?: string;
  driveId?: string;
  /** OpenAI (llm): organization id + custom base URL (openAIConnection). */
  organization?: string;
  baseUrl?: string;
  /** Mcp: registry URL + timeouts (mcpConnection, all optional). */
  registryUrl?: string;
  connectionTimeout?: number;
  /** Wave 0 lean-forms database档 (official connection schemas, de-noised). */
  /** SSL: sslMode select + validateSSLClientConfig leaves (postgres/redshift/greenplum/timescale/mysql/mssql/doris). */
  sslMode?: string;
  sslCaCertificate?: string;
  sslCertificate?: string;
  sslKey?: string;
  classificationName?: string;
  queryStatementSource?: string;
  /** String maps, entered as a JSON object (connectionOptions/connectionArguments). */
  connectionOptions?: string;
  connectionArguments?: string;
  useSlowLogs?: boolean;
  /** Snowflake. */
  queryTag?: string;
  accountUsageSchema?: string;
  systemMetricsBatchSize?: number;
  privateKey?: string;
  snowflakePrivatekeyPassphrase?: string;
  includeTransientTables?: boolean;
  includeStreams?: boolean;
  includeStages?: boolean;
  includeSemanticViews?: boolean;
  clientSessionKeepAlive?: boolean;
  useAccessHistory?: boolean;
  accessHistoryChunkSize?: number;
  creditCost?: number;
  snowflakeSourceHost?: string;
  /** Redshift (IAM/PrivateLink identifiers; plain spec strings). */
  clusterIdentifier?: string;
  workgroupName?: string;
  /** Policy agent extraction config (snowflake/databricks/unitycatalog). */
  policyAgentEnabled?: boolean;
  policyAgentSupportsColumnAccess?: boolean;
  policyAgentSupportsFullAccess?: boolean;
  policyAgentSupportsMaskedAccess?: boolean;
  /** Wave 2 lean-forms tier 2 (Kafka/Redpanda messaging, official
   * kafkaConnection.json / redpandaConnection.json, de-noised). */
  saslUsername?: string;
  saslPassword?: string;
  saslMechanism?: string;
  basicAuthUserInfo?: string;
  /** Arbitrary JSON objects (additionalProperties: true), entered as JSON text. */
  consumerConfig?: string;
  schemaRegistryConfig?: string;
  schemaRegistryTopicSuffixName?: string;
  /** Kafka's two sslConfig groups: independent key triplets, never shared
   * with each other or with the single-group leaves
   * (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups). */
  consumerConfigSSLCaCertificate?: string;
  consumerConfigSSLCertificate?: string;
  consumerConfigSSLKey?: string;
  schemaRegistrySSLCaCertificate?: string;
  schemaRegistrySSLCertificate?: string;
  schemaRegistrySSLKey?: string;
  /** verifySSL (verifySSLConfig, default no-ssl) — one shared form key for
   * Superset (nested in connection) and Prefect (top level). */
  verifySSL?: string;
  /** Superset's nested sslConfig leaves — independent triplet, never the
   * top-level keys (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups). */
  supersetSSLCaCertificate?: string;
  supersetSSLCertificate?: string;
  supersetSSLKey?: string;
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

/**
 * PipelineServiceClientResponse (openmetadata-spec
 * entity/services/ingestionPipelines/pipelineServiceClientResponse.json):
 * what deploy/trigger/bulk-deploy return. `code` 200 with reason
 * "Pipeline Client Disabled" means no pipeline client is configured — the
 * UI must surface the reason verbatim, never report it as a deploy.
 */
export interface PipelineServiceClientResponse {
  code?: number;
  reason?: string;
  platform?: string;
  version?: string;
  runId?: string;
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
  /** Test-suite pipelines (createIngestionPipeline schema): fail fast on a test error. */
  raiseOnError?: boolean;
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
