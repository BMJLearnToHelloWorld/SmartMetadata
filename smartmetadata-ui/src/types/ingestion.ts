/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef, TagLabelState, TagLabelType } from './api';
import type { EntityStyle, TagSource } from './governance';
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';

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

/**
 * Official pipeline types, all 12 (generated/entity/services/
 * ingestionPipelines/ingestionPipeline.ts:940-953): `application`,
 * `autoClassification`, `dataInsight`, `dbt`, `elasticSearchReindex`,
 * `lineage`, `metadata`, `policyAgent`, `profiler`, `reverseMetadata`,
 * `TestSuite`, `usage`. `dataInsight` / `elasticSearchReindex` are
 * settings pipelines (no parent service of their own — they are created
 * under the OpenMetadata metadata service; see getSupportedPipelineTypes,
 * whose connection-flag mapping offers them only where the connection
 * declares the matching supports* flag).
 */
export const PIPELINE_TYPES = [
  'application',
  'autoClassification',
  'dataInsight',
  'dbt',
  'elasticSearchReindex',
  'lineage',
  'metadata',
  'policyAgent',
  'profiler',
  'reverseMetadata',
  'TestSuite',
  'usage',
] as const;
export type PipelineType = (typeof PIPELINE_TYPES)[number];

/** AWS credentials (openmetadata-spec security/credentials/awsCredentials.json):
 * shared by the S3 top-level `awsConfig` and the `authType.awsConfig` IAM
 * branch of the database connection schemas (pin mysqlConnection.json). */
export interface AwsCredentialsConfig {
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
}

/** Azure credentials (openmetadata-spec security/credentials/azureCredentials.json):
 * the `authType.azureConfig` branch of the database connection schemas. */
export interface AzureCredentialsConfig {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  accountName?: string;
  vaultName?: string;
  scopes?: string;
}

/** GCP CloudSQL credentials wrapper (openmetadata-spec
 * security/credentials/gcpCredentials.json): the `authType.gcpConfig` branch
 * of mysqlConnection.json. The inner `gcpConfig` oneOf (values / path /
 * external account / ADC) stays free-form — its variants are entered as
 * structured fields and assembled by the auth-branch merge. */
export interface GcpCloudSqlCredentialsConfig {
  gcpConfig?: Record<string, unknown>;
  gcpImpersonateServiceAccount?: {
    impersonateServiceAccount?: string;
    lifetime?: number;
  };
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
    /** Alation ApiAccessTokenAuth (alationConnection.json): the API access token. */
    accessToken?: string;
    clientId?: string;
    clientSecret?: string;
    azureClientId?: string;
    azureClientSecret?: string;
    azureTenantId?: string;
    /** ElasticSearch / Ranger basic auth (elasticSearch/basicAuth, ranger/basicAuth). */
    username?: string;
    /** ElasticSearch api auth (elasticSearch/apiAuth). */
    apiKey?: string;
    /** ElasticSearch api auth (elasticSearch/apiAuth): the key id — an
     * identifier, not a secret, so it refills in plaintext. */
    apiKeyId?: string;
    /** Prefect Cloud auth (prefect/cloudAuth.json). */
    accountId?: string;
    /** Prefect Cloud auth (prefect/cloudAuth.json). */
    workspaceId?: string;
    /** Prefect Server auth (prefect/serverAuth.json). */
    authString?: string;
    /** Sftp private-key auth (sftpConnection.json): the private key + its
     * passphrase — both secrets, blank-means-keep on edit. */
    privateKey?: string;
    privateKeyPassphrase?: string;
    /** IAM branch (mysql/postgres/greenplum/timescale/redshift authType oneOf). */
    awsConfig?: AwsCredentialsConfig;
    /** Azure branch (mysql/postgres/timescale authType oneOf). */
    azureConfig?: AzureCredentialsConfig;
    /** GCP CloudSQL branch (mysql authType oneOf): IAM toggle + credentials. */
    enableIamAuth?: boolean;
    gcpConfig?: GcpCloudSqlCredentialsConfig;
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
    /**
     * Alation nested database connection (alationConnection.json `connection`
     * oneOf: PostgresConnection / MysqlConnection). The nested authType is
     * the same shape as the top-level one (Basic {password} / IAM
     * {awsConfig} / Azure {azureConfig} / GCP {password, enableIamAuth,
     * gcpConfig}); nested sslConfig is a validateSSLClientConfig triplet.
     */
    type?: string;
    scheme?: string;
    authType?: ServiceConnectionConfig['authType'];
    hostPort?: string;
    database?: string;
    databaseName?: string;
    databaseSchema?: string;
    ingestAllDatabases?: boolean;
    sslMode?: string;
    classificationName?: string;
    queryStatementSource?: string;
    connectionOptions?: Record<string, string>;
    connectionArguments?: Record<string, string>;
    useSlowLogs?: boolean;
    queryHistoryTable?: string;
  };
  awsConfig?: AwsCredentialsConfig;
  bucketNames?: string[];
  consoleEndpointURL?: string;
  host?: string;
  token?: string;
  timeout?: number;
  stripAssetKeyPrefixLength?: number;
  numberOfStatus?: number;
  /** Prefect top level (prefectConnection.json): verifySSL enum, default no-ssl. */
  verifySSL?: string;
  /** Prefect top level sslConfig (validateSSLClientConfig). ElasticSearch
   * uses the same key with the certificates oneOf shape instead
   * (common/sslConfig.json). */
  sslConfig?: SslClientConfig | ElasticSearchSslConfig;
  /** OpenMetadata (openMetadataConnection.json): JWT client config. */
  securityConfig?: {
    jwtToken?: string;
  };
  /** GoogleDrive (googleDriveConnection.json): GCP credentials wrapper
   * { gcpConfig, gcpImpersonateServiceAccount? } (gcpCredentials.json).
   * gcpConfig stays free-form — its four branches are entered as JSON /
   * path fields. A redacted display copy replaces the whole object with
   * the '********' mask (see redactConnectionForDisplay); stored configs
   * always carry the object. */
  credentials?: {
    gcpConfig?: Record<string, unknown>;
    gcpImpersonateServiceAccount?: {
      impersonateServiceAccount?: string;
      lifetime?: number;
    };
    [key: string]: unknown;
  } | string;
  /** OpenMetadata (openMetadataConnection.json): extra HTTP headers. */
  extraHeaders?: Record<string, string>;
  /** Mcp (mcpConnection.json): directly-connected server list. Free-form
   * objects (each item follows mcpServerConfig) because the servers field
   * is entered as textarea JSON, not as structured form fields. */
  servers?: Array<Record<string, unknown>>;
  /** ElasticSearch (elasticSearchConnection.json): timeout in seconds. */
  connectionTimeoutSecs?: number;
  /** SharePoint (sharePointConnection.json): Entra app + site. `clientSecret` is a secret leaf. */
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  siteUrl?: string;
  siteName?: string;
  /** MetadataES (metadataESConnection.json): reindex selection + run shape. */
  entities?: string[];
  recreateIndex?: boolean;
  runMode?: string;
  searchIndexMappingLanguage?: string;
  batchSize?: number;
  /** Alation (alationConnection.json): top-level Alation API settings. */
  projectName?: string;
  paginationLimit?: number;
  includeUndeployedDatasources?: boolean;
  includeHiddenDatasources?: boolean;
  ingestDatasources?: boolean;
  ingestUsersAndGroups?: boolean;
  ingestDomains?: boolean;
  ingestKnowledgeArticles?: boolean;
  ingestDashboards?: boolean;
  alationTagClassificationName?: string;
  /** Collibra (collibraConnection.json): asset-enrichment toggle. */
  enableEnrichment?: boolean;
  /** Collibra (collibraConnection.json): glossary/domain filter patterns.
   * Edited both by the connection form (Scope section) and the filter
   * step; both write the same `connection.config` keys. */
  glossaryFilterPattern?: FilterPatternConfig;
  domainFilterPattern?: FilterPatternConfig;
  /** OpenAI (openAIConnection.json): max retries for failed requests. */
  maxRetries?: number;
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
  /**
   * Capability flags the server applies as schema defaults on store.
   * `getSupportedPipelineTypes` (ADR:2026-11-14-autopilot-agents-ui-parity)
   * reads them to derive the addable agent kinds; a flag absent from a
   * connection schema reads as not offered.
   */
  supportsMetadataExtraction?: boolean;
  supportsUsageExtraction?: boolean;
  supportsLineageExtraction?: boolean;
  supportsViewLineageExtraction?: boolean;
  supportsProfiler?: boolean;
  supportsDBTExtraction?: boolean;
  supportsDataInsightExtraction?: boolean;
  supportsElasticSearchReindexingExtraction?: boolean;
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

/**
 * ElasticSearch sslConfig (openmetadata-spec
 * .../security/ssl/sslConfig.json): certificates oneOf — either three file
 * paths (sslCertPaths) or four inline values plus a staging dir
 * (sslCertValues). Deliberately distinct from SslClientConfig: the leaves
 * are path/value pairs, not PEM contents, and the value leaves are secrets
 * (ADR:2026-11-10-leanforms-3a-elasticsearch-auth-mode).
 */
export interface EsSslCertPaths {
  caCertPath?: string;
  clientCertPath?: string;
  privateKeyPath?: string;
}

export interface EsSslCertValues {
  caCertValue?: string;
  clientCertValue?: string;
  privateKeyValue?: string;
  stagingDir?: string;
}

export interface ElasticSearchSslConfig {
  certificates?: EsSslCertPaths | EsSslCertValues;
}

export interface ServiceConnection {
  config?: ServiceConnectionConfig;
}

/**
 * Service tag label, mirroring the pin TagLabel field set
 * (generated/type/tagLabel.ts at a3012259ca, from openmetadata-spec
 * type/tagLabel.json) in full: a tier edit rewrites the whole `tags`
 * array, so every field the server stored on a retained label must
 * survive the round trip — dropping `style`, `reason`, or the
 * auto-classification provenance (`appliedAt`/`appliedBy`/`metadata`)
 * would silently strip it on save. `appliedAt` stays the JSON string
 * the server sent (the pin type is Date; the transport is a string).
 * `source`/`labelType`/`state` stay optional: fork payloads are
 * unverified and may omit them, like TagRef.
 */
export interface ServiceTagLabel {
  tagFQN: string;
  name?: string;
  displayName?: string;
  description?: string;
  style?: EntityStyle;
  source?: TagSource;
  labelType?: TagLabelType;
  state?: TagLabelState;
  href?: string;
  reason?: string;
  appliedAt?: string;
  appliedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Deployment attributes of a service (pin generated/entity/services/
 * serviceAttributes.ts at a3012259ca). An ordinary property of the
 * service entity, not a fields expansion: the pin service-detail
 * fetches never list it in `fields`, yet the attributes card renders
 * from it. `environment` is the pin closed set below, kept as a plain
 * string so a value outside the set still round-trips instead of
 * being dropped by the mapper.
 */
export interface ServiceAttributes {
  environment?: string;
  region?: string;
  deployment?: string;
}

/** Pin `Environment` enum values, in declaration order, verbatim. */
export const SERVICE_ENVIRONMENTS = [
  'Development',
  'Other',
  'Production',
  'QA',
  'Sandbox',
  'Staging',
  'UAT',
] as const;

export interface CatalogService {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  kind: ServiceKind;
  serviceType: string;
  connection?: ServiceConnection;
  /** Owners of the service (fetched with fields=owners); seeds a new pipeline's owners (P-13). */
  owners?: EntityRef[];
  /**
   * Tag labels (fetched with fields=tags). The tier facet reads the
   * first `Tier.*` label from here; a tier edit rewrites this array.
   */
  tags?: ServiceTagLabel[];
  /** Followers (fetched with fields=followers); follow state is membership of the current user id. */
  followers?: EntityRef[];
  /** Domains (fetched with fields=domains). */
  domains?: EntityRef[];
  /** Data products (fetched with fields=dataProducts; metadata services never request it). */
  dataProducts?: EntityRef[];
  /** Entity version; the header version entry renders only when present. */
  version?: number;
  /** Deployment attributes; an ordinary entity property, not a fields expansion. */
  serviceAttributes?: ServiceAttributes;
  /**
   * Stored test-connection outcome (openmetadata-spec
   * entity/services/connections/testConnectionResult.json), written by a
   * test-connection runner — never written by this console. The UI only
   * displays it and triggers a fresh run through an automations workflow.
   */
  testConnectionResult?: TestConnectionResult;
  /** Soft-deleted flag; the detail shell renders its deleted Tag from this. */
  deleted?: boolean;
  /**
   * Display style (pin ServicesType.style); the logo resolver reads
   * `style.iconURL` first (01-services.md §2.2). Mappers pass it through
   * verbatim; it is never written by the service pages.
   */
  style?: EntityStyle;
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
  resultSummary?: string;
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
  /** Mlflow (mlmodel): tracking + registry URIs (mlflowConnection, required). */
  trackingUri?: string;
  registryUri?: string;
  /** Rest (api): OpenAPI schema URL (openAPISchemaURL, required). */
  openApiSchemaUrl?: string;
  /** Rest (api/restConnection.json): `openAPISchemaConnection` oneOf
   * branch state + the FilePath / S3 branch leaves. */
  restSchemaBranch?: 'url' | 'filePath' | 's3';
  openApiSchemaFilePath?: string;
  openApiSchemaS3Url?: string;
  /** Rest: the apiEndpointFilterPattern leaf (NOT one of the 19 filtered
   * fields — pin renders it in the connection form). */
  apiEndpointFilterPattern?: FilterPatternConfig;
  delegatedEmail?: string;
  driveId?: string;
  /** OpenAI (llm): organization id + custom base URL (openAIConnection). */
  organization?: string;
  baseUrl?: string;
  /** Mcp: registry URL + timeouts (mcpConnection, all optional). */
  registryUrl?: string;
  connectionTimeout?: number;
  /** Wave 3 lean-forms tier 3A (Rest/Mlflow/OpenMetadata/GoogleDrive/
   * ElasticSearch/OpenAI/Mcp/Ranger). */
  /** Rest (restConnection.json): documentation URL for the schema. */
  docURL?: string;
  /** Rest / OpenMetadata sslConfig leaves — independent triplets, never
   * shared with each other or with the single-group leaves
   * (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups). */
  restSSLCaCertificate?: string;
  restSSLCertificate?: string;
  restSSLKey?: string;
  openMetadataSSLCaCertificate?: string;
  openMetadataSSLCertificate?: string;
  openMetadataSSLKey?: string;
  /** OpenMetadata (openMetadataConnection.json), A group. */
  clusterName?: string;
  authProvider?: string;
  jwtToken?: string;
  secretsManagerProvider?: string;
  secretsManagerLoader?: string;
  apiVersion?: string;
  enableVersionValidation?: boolean;
  /** Extra headers as a JSON object (string map). */
  extraHeaders?: string;
  /** Whether to save the service connection when creating the service.
   * The spec's own flag (openMetadataConnection / storeServiceConnection). */
  omStoreServiceConnection?: boolean;
  /** GoogleDrive (googleDriveConnection.json): which gcpConfig branch the
   * credentials take (gcpCredentials.json oneOf). The variant leaves use
   * the shared `authGcp*` keys (see above); the old JSON-blob form keys
   * were deleted with the T-2 per-leaf rebuild (2026-11-20). */
  gcpConfigType?: 'gcpValues' | 'gcpCredentialsPath' | 'gcpExternalAccount' | 'gcpADC';
  includeTeamDrives?: boolean;
  includeGoogleSheets?: boolean;
  /** ElasticSearch (elasticSearchConnection.json): auth branch + ssl
   * certificates oneOf mode. */
  elasticSearchAuthMode?: 'basicAuth' | 'apiAuth';
  apiKeyId?: string;
  sslCertMode?: 'paths' | 'values';
  sslCaCertPath?: string;
  sslClientCertPath?: string;
  sslPrivateKeyPath?: string;
  sslCaCertValue?: string;
  sslClientCertValue?: string;
  sslPrivateKeyValue?: string;
  sslStagingDir?: string;
  connectionTimeoutSecs?: number;
  /** OpenAI (openAIConnection.json): type-prefixed keys — the spec
   * attribute names (timeout/maxRetries) collide with Dagster's config
   * timeout, so the form keys are prefixed and the builder dispatches
   * per type, never cross-values. */
  openAITimeout?: number;
  openAIMaxRetries?: number;
  /** Mcp (mcpConnection.json). */
  discoveryMethod?: string;
  configFilePaths?: string;
  servers?: string;
  initializationTimeout?: number;
  fetchTools?: boolean;
  fetchResources?: boolean;
  fetchPrompts?: boolean;
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
  /** Live-issues S-12: `authType` oneOf branch state (pin
   * mysql/postgres/greenplum/timescale/redshiftConnection.json `authType`,
   * plus the synthesized Snowflake Password/Key-pair selector). The
   * selector value is the branch key (`basic`/`iam`/`azure`/`gcp`, or
   * `password`/`keyPair` for Snowflake); branch leaves are prefixed so
   * they never collide with the top-level S3/Databricks keys of the same
   * pin names. Secrets are never prefilled — see the auth-branch merge
   * in `ingestion/connectionFields.ts` for the blank-means-keep rules. */
  authTypeBranch?: string;
  authAwsEnabled?: boolean;
  authAwsAccessKeyId?: string;
  authAwsSecretAccessKey?: string;
  authAwsRegion?: string;
  authAwsSessionToken?: string;
  authAwsEndPointURL?: string;
  authAwsProfileName?: string;
  authAssumeRoleArn?: string;
  authAssumeRoleSessionName?: string;
  authAssumeRoleSourceIdentity?: string;
  authAzureClientId?: string;
  authAzureClientSecret?: string;
  authAzureTenantId?: string;
  authAzureAccountName?: string;
  authAzureVaultName?: string;
  authAzureScopes?: string;
  authGcpPassword?: string;
  authGcpEnableIamAuth?: boolean;
  authGcpConfigBranch?: 'gcpValues' | 'gcpCredentialsPath' | 'gcpExternalAccount' | 'gcpADC';
  authGcpProjectId?: string;
  authGcpPrivateKeyId?: string;
  authGcpPrivateKey?: string;
  authGcpClientEmail?: string;
  authGcpClientId?: string;
  authGcpAuthUri?: string;
  authGcpTokenUri?: string;
  authGcpAuthProviderX509CertUrl?: string;
  authGcpClientX509CertUrl?: string;
  authGcpUniverseDomain?: string;
  authGcpPath?: string;
  authGcpAudience?: string;
  authGcpSubjectTokenType?: string;
  authGcpTokenUrl?: string;
  /** GCP external-account credentialSource: string map, entered via the map editor. */
  authGcpCredentialSource?: string;
  authGcpImpersonateEmail?: string;
  authGcpImpersonateLifetime?: number;
  /** A2 (2026-11-19): the five A-class types brought into T-2. */
  /** VertexAI (mlmodel/vertexaiConnection.json): GCP project location. */
  location?: string;
  /** Alation (metadata/alationConnection.json): top-level authType oneOf. */
  alationAuthBranch?: 'basicAuth' | 'apiToken';
  alationAccessToken?: string;
  /** Alation: `connection` oneOf (Postgres / Mysql / None). */
  alationConnectionBranch?: 'postgres' | 'mysql' | 'none';
  /** Alation: nested database-connection leaves (shared by the Postgres and
   * Mysql branches — only one branch is active at a time). */
  alationDbUsername?: string;
  alationDbPassword?: string;
  alationDbHostPort?: string;
  alationDbDatabase?: string;
  alationDbDatabaseName?: string;
  alationDbDatabaseSchema?: string;
  alationDbScheme?: string;
  alationDbAuthBranch?: 'basic' | 'iam' | 'azure' | 'gcp';
  alationDbIngestAllDatabases?: boolean;
  alationDbSslMode?: string;
  alationDbSslCaCertificate?: string;
  alationDbSslCertificate?: string;
  alationDbSslKey?: string;
  alationDbClassificationName?: string;
  alationDbQueryStatementSource?: string;
  alationDbUseSlowLogs?: boolean;
  alationDbQueryHistoryTable?: string;
  alationDbConnectionOptions?: string;
  alationDbConnectionArguments?: string;
  /** Alation: top-level Alation API settings. */
  projectName?: string;
  paginationLimit?: number;
  includeUndeployedDatasources?: boolean;
  includeHiddenDatasources?: boolean;
  ingestDatasources?: boolean;
  ingestUsersAndGroups?: boolean;
  ingestDomains?: boolean;
  ingestKnowledgeArticles?: boolean;
  ingestDashboards?: boolean;
  alationTagClassificationName?: string;
  /** Collibra (metadata/collibraConnection.json): asset-enrichment toggle. */
  enableEnrichment?: boolean;
  /** Collibra (metadata/collibraConnection.json): glossary/domain filter
   * patterns (pin order: after hostPort, before enableEnrichment). The
   * connection form (Scope section) and the filter step both edit these
   * keys on the same `connection.config`. */
  glossaryFilterPattern?: FilterPatternConfig;
  domainFilterPattern?: FilterPatternConfig;
  /** MetadataES (metadata/metadataESConnection.json): reindex selection. */
  metadataESEntities?: string;
  recreateIndex?: boolean;
  runMode?: string;
  searchIndexMappingLanguage?: string;
  batchSize?: number;
  /** SharePoint (drive/sharePointConnection.json): Entra app + site. */
  tenantId?: string;
  siteUrl?: string;
  siteName?: string;
  /** T-2 (2026-11-20): the ten blocked-C rows + the Superset / Rest /
   * OpenMetadata missing leaves. */
  /** Superset (dashboard/supersetConnection.json): `connection` oneOf
   * (SupersetApiConnection / PostgresConnection / MysqlConnection). */
  supersetConnectionBranch?: 'api' | 'postgres' | 'mysql';
  supersetDbScheme?: string;
  supersetDbUsername?: string;
  supersetDbPassword?: string;
  supersetDbHostPort?: string;
  supersetDbDatabase?: string;
  supersetDbDatabaseName?: string;
  supersetDbDatabaseSchema?: string;
  supersetDbAuthBranch?: 'basic' | 'iam' | 'azure' | 'gcp';
  supersetDbIngestAllDatabases?: boolean;
  supersetDbSslMode?: string;
  supersetDbSslCaCertificate?: string;
  supersetDbSslCertificate?: string;
  supersetDbSslKey?: string;
  supersetDbClassificationName?: string;
  supersetDbQueryStatementSource?: string;
  supersetDbUseSlowLogs?: boolean;
  supersetDbQueryHistoryTable?: string;
  supersetDbConnectionOptions?: string;
  supersetDbConnectionArguments?: string;
  /** OpenMetadata (metadata/openMetadataConnection.json): the B group —
   * 13 include* switches + limitRecords + forceEntityOverwriting +
   * elasticsSearch (conditionally required `type` + string-map `config`). */
  includeTopics?: boolean;
  includeTables?: boolean;
  includeDashboards?: boolean;
  includePipelines?: boolean;
  includeMlModels?: boolean;
  includeUsers?: boolean;
  includeTeams?: boolean;
  includeGlossaryTerms?: boolean;
  includeTags?: boolean;
  includePolicy?: boolean;
  includeMessagingServices?: boolean;
  includeDatabaseServices?: boolean;
  includePipelineServices?: boolean;
  limitRecords?: number;
  forceEntityOverwriting?: boolean;
  omElasticSearchType?: string;
  omElasticSearchConfig?: string;
  /** CustomMlModel / CustomSearch: source python class to instantiate. */
  sourcePythonClass?: string;
  /** AlationSink (metadata/alationSinkConnection.json): authType oneOf. */
  alationSinkAuthBranch?: 'basicAuth' | 'apiToken';
  alationSinkAccessToken?: string;
  /** AlationSink: datasource links (string map, entered via the map editor). */
  datasourceLinks?: string;
  alationSinkSSLCaCertificate?: string;
  alationSinkSSLCertificate?: string;
  alationSinkSSLKey?: string;
  /** Amundsen (metadata/amundsenConnection.json). */
  maxConnectionLifeTime?: number;
  validateSSL?: boolean;
  encrypted?: boolean;
  /** Atlas (metadata/atlasConnection.json): string arrays, entered as JSON. */
  databaseServiceName?: string;
  messagingServiceName?: string;
  entity_type?: string;
  /** Sftp (drive/sftpConnection.json): host + port are separate leaves
   * (no hostPort); authType oneOf (username/password / private key). */
  sftpHost?: string;
  sftpPort?: number;
  sftpAuthBranch?: 'usernamePassword' | 'privateKey';
  sftpPrivateKey?: string;
  sftpPrivateKeyPassphrase?: string;
  /** Sftp: root directories (string array, entered as JSON). */
  rootDirectories?: string;
  structuredDataFilesOnly?: boolean;
  extractSampleData?: boolean;
  /** OpenSearch (search/openSearchConnection.json): authType oneOf
   * (Basic Authentication / AWSCredentials). */
  openSearchAuthBranch?: 'basicAuth' | 'awsCredentials';
}

export interface CreateDatabaseServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  /** Pin getServiceConfigData owners: [{id: userId, type: 'user'}] (wizard create only). */
  owners?: Array<{ id: string; type: string }>;
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
    generateSampleData?: boolean;
    dashboardFilterPattern?: { includes?: string[]; excludes?: string[] };
    chartFilterPattern?: { includes?: string[]; excludes?: string[] };
    containerFilterPattern?: { includes?: string[]; excludes?: string[] };
    /** TestSuite pipelines: the table under test; absent for bundle suites. */
    entityFullyQualifiedName?: string;
    /** TestSuite pipelines: selected test case names; absent means "all". */
    testCases?: string[];
    [key: string]: unknown;
  };
}

export interface AirflowConfig {
  pausePipeline?: boolean;
  scheduleInterval?: string;
  pipelineTimezone?: string;
  /** Retry count for failed runs (official default 0, min 0). */
  retries?: number;
  /**
   * Start date of the pipeline (ISO 8601 date-time, official
   * `startDate`). Create sets it to yesterday UTC 00:00; edits keep the
   * saved value via the JSON Patch.
   */
  startDate?: string;
  /** Official airflowConfig.workflowTimeout (seconds). */
  workflowTimeout?: number;
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
  /** Fail fast on a test error (TestSuite pipelines; official default true). */
  raiseOnError?: boolean;
  /** Soft-deleted flag; the detail shell renders its deleted Tag from this. */
  deleted?: boolean;
  /**
   * Provider type of the pipeline (official generated ProviderType:
   * `system` / `user` / `automation`). The Insights agents widget
   * filters on `automation` (pin AgentsStatusWidgetUtils); AutoPilot
   * agents carry it, hand-built pipelines do not.
   */
  provider?: string;
  /** Owners of the pipeline, only present when the caller asks for fields=owners. */
  owners?: EntityRef[];
  /**
   * Latest run statuses, newest first. Only present when the caller
   * asks for fields=pipelineStatuses (the Platform Health widget's
   * culprit lookup); the list mapper drops it otherwise.
   */
  pipelineStatuses?: PipelineStatus[];
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
  /** Owners of the new pipeline (official: required except settings pipelines). */
  owners?: EntityRef[];
  /** Profiler pipelines only (official: Spark agent processing engine). */
  processingEngine?: EntityRef;
}

export interface PipelineStatus {
  runId?: string;
  pipelineState?: string;
  startDate?: number;
  timestamp?: number;
  endDate?: number;
  triggeredBy?: string;
  /** Per-step summaries; a step's failures carry the raw error text. */
  status?: PipelineStepStatus[];
}

export interface PipelineStepStatus {
  name?: string;
  /** Records processed by this step (official StepSummary.records). */
  records?: number;
  /** Records filtered out by this step (official StepSummary.filtered). */
  filtered?: number;
  /** Records updated by this step (official StepSummary.updated_records). */
  updated_records?: number;
  /** Warning count for this step (official StepSummary.warnings). */
  warnings?: number;
  /** Error count for this step (official StepSummary.errors). */
  errors?: number;
  failures?: PipelineStepFailure[];
  /**
   * Detailed progress tracking by entity type (official StepSummary
   * `progress` map). Every step of a run carries an identical copy of
   * the whole map — the agent mapper collapses it per entity type
   * before summing, never sums across steps.
   */
  progress?: Record<string, StepProgress>;
}

/**
 * One entry of StepSummary.progress (openmetadata-spec
 * entity/services/ingestionPipelines/pipelineStatus.json, `Progress`):
 * entities processed of the total discovered for one entity type, plus
 * the estimated remaining seconds for that type.
 */
export interface StepProgress {
  /** Number of entities processed. */
  processed?: number;
  /** Total number of entities discovered. */
  total?: number;
  /** Estimated remaining time in seconds for this entity type. */
  estimatedRemainingSeconds?: number;
}

export interface PipelineStepFailure {
  /** Failing step/record name (official StepSummary failure name). */
  name?: string;
  error?: string;
  /** Raw stack trace for the failure (official StepSummary failure stackTrace). */
  stackTrace?: string;
}

/**
 * Agent view-model (official AgentsPage.interface.ts `Agent`): an
 * IngestionPipeline rendered as a service agent card. "Agent" is the
 * display name only — there is no Agent entity, table, or API.
 */
export type AgentStatus = 'running' | 'success' | 'failed' | 'queued' | 'none';

export type RunStatus = 'success' | 'partial' | 'failed' | 'running' | 'skipped';

export interface AgentRecentRun {
  id: string;
  status: RunStatus;
}

export interface AgentActionPermissions {
  trigger: boolean;
  edit: boolean;
  delete: boolean;
}

export interface Agent {
  id: string;
  fqn: string;
  pipelineType: string;
  name: string;
  /** Stable machine key for the icon/label lookup ('Metadata', 'Usage', 'dbt', …); display strings are localized separately. */
  type: string;
  /** Counted unit ('queries' | 'assets' | 'models'). */
  unit: string;
  /** Past-tense verb for the unit ('scanned' | 'processed' | 'ingested' | 'profiled' | 'parsed'). */
  verb: string;
  status: AgentStatus;
  pct: number;
  eta: number | null;
  assets: number;
  target: number;
  errors: number;
  warnings: number;
  recentRuns: AgentRecentRun[];
  // Latest run of any state, including the one in progress — `recentRuns`
  // only keeps completed runs, so it cannot identify a run that is still
  // going. This is what binds the log tail to a run.
  currentRunId?: string;
  schedule?: string;
  after?: string;
  finishedAt?: string;
  /**
   * Epoch ms of the run every count above describes, so consumers
   * comparing two agents can tell whose numbers are newer. `finishedAt`
   * cannot serve: it is a pre-formatted relative string and is absent
   * while a run is in flight.
   */
  lastRunAt?: number;
  enabled?: boolean;
}

/**
 * Service progress stream frames (openmetadata-spec
 * entity/services/ingestionPipelines/serviceProgressEvent.json): one
 * SSE `data:` frame per ProgressUpdate, pushed over
 * GET /v1/services/ingestionPipelines/progress/service/{type}/{fqn}/stream.
 */
export type ProgressUpdateType =
  | 'DISCOVERY'
  | 'PROCESSING'
  | 'STEP_COMPLETE'
  | 'PIPELINE_COMPLETE'
  | 'ERROR';

/** Run-level counter that survives scope pruning; `total` is null while unknown. */
export interface GlobalCounter {
  done?: number;
  entityType?: string;
  total?: number | null;
}

/** One node of the hierarchical progress tree for a run. */
export interface ProgressNode {
  /** Opened and not yet complete. */
  active?: boolean;
  /** Active or relevant child nodes only. */
  children?: ProgressNode[];
  /** Type of children this node counts (Database, DatabaseSchema, Table, …). */
  entityType?: string;
  /** Number of children, or null when the producer was iterated lazily. */
  expected?: number | null;
  /** Display name of this node (database or schema name; empty for the run root). */
  label?: string;
  /** Active children beyond the per-parent display cap. */
  overflow?: number;
  /** Children completed. */
  processed?: number;
}

/** The per-run progress update carried by one stream frame. */
export interface ProgressUpdate {
  /** FQN of the entity currently being processed. */
  currentEntity?: string;
  /** Estimated seconds until the run completes; null when not yet computable. */
  estimatedSecondsRemaining?: number | null;
  /** Run-level counters that survive scope pruning. */
  globalCounters?: GlobalCounter[];
  /** Human-readable status message. */
  message?: string;
  /** Root of the hierarchical progress tree for this run. */
  progress?: ProgressNode;
  /** Pipeline run ID. */
  runId: string;
  /** Name of the current step. */
  stepName?: string;
  /** When this update was created (epoch ms). */
  timestamp: number;
  /**
   * Monotonic count of leaf assets ingested so far. Survives scope
   * pruning and is present on the terminal PIPELINE_COMPLETE event, so
   * it carries the run's final asset total.
   */
  totalAssetsIngested?: number | null;
  updateType: ProgressUpdateType;
}

export interface ServiceProgressEvent {
  event: ProgressUpdate;
  /**
   * The ingestion pipeline (agent) this run belongs to. Populated on
   * the DISCOVERY event that opens a run, so the UI can discover a
   * newly created agent without a separate lookup.
   */
  ingestionPipeline?: IngestionPipeline;
  /** Fully qualified name of the ingestion pipeline this event belongs to. */
  pipelineFqn: string;
  /** Pipeline run ID. */
  runId: string;
}

export interface OrchestratorStatus {
  code?: number;
  platform?: string;
  reason?: string;
}

/**
 * One page of `GET …/logs/{idOrFqn}/last` (official
 * IngestionPipelineLogByIdInterface). A by-fqn fetch returns the logs
 * under the generic `logs` key; a by-id fetch returns them under the
 * pipeline-type task field (`ingestion_task`, `profiler_task`, …).
 * `after`/`total` are the pagination cursor and line count; both are
 * absent on the last (growing) page.
 */
export interface IngestionPipelineLog {
  logs?: string;
  after?: string;
  /** Total log lines, a JSON number from the server (not a string). */
  total?: number;
  ingestion_task?: string;
  profiler_task?: string;
  usage_task?: string;
  lineage_task?: string;
  dbt_task?: string;
  test_suite_task?: string;
  application_task?: string;
  data_insight_task?: string;
  elasticsearch_reindex_task?: string;
  auto_classification_task?: string;
}

export interface PipelineFormValues {
  name: string;
  displayName?: string;
  description?: string;
  pipelineType: string;
  serviceId: string;
  serviceKind: ServiceKind;
  /**
   * The schema-driven sourceConfig form data (P-08(d)): the
   * `sourceConfig.config` object itself. The hand-written filter fields
   * (includeViews / includeSchemas / ...) are gone — the form renders
   * every field of the resolved ingestion schema, includes AND excludes.
   */
  sourceConfigData: Record<string, unknown>;
  scheduleInterval?: string;
  /** Retry count for failed runs (official default 0, min 0). */
  retries?: number;
  /** Fail fast on an error (official default true). */
  raiseOnError?: boolean;
  /** Enable debug logging (loggerLevel DEBUG instead of INFO). */
  debugLog?: boolean;
}
