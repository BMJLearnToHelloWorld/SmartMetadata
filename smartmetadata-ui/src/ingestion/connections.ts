/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { isFilterPatternConfig, type FilterPatternConfig } from '@/ingestion/filterPatterns';
import { isMaskedSecret, shouldPersistSecret } from '@/ingestion/secrets';
import {
  buildAzureAuthType,
  buildGcpAuthType,
  buildGcpImpersonateServiceAccount,
  buildGcpVariant,
  buildIamAuthType,
} from '@/ingestion/connectionFields';
import type {
  AwsCredentialsConfig,
  CatalogService,
  ElasticSearchSslConfig,
  EsSslCertPaths,
  EsSslCertValues,
  ServiceConnection,
  ServiceConnectionConfig,
  ServiceFormValues,
  ServiceKind,
  SslClientConfig,
} from '@/types/ingestion';
import {
  API_SERVICE_TYPES,
  DATABASE_SERVICE_TYPES,
  DASHBOARD_SERVICE_TYPES,
  DRIVE_SERVICE_TYPES,
  LLM_SERVICE_TYPES,
  MCP_SERVICE_TYPES,
  METADATA_SERVICE_TYPES,
  MESSAGING_SERVICE_TYPES,
  MLMODEL_SERVICE_TYPES,
  PIPELINE_SERVICE_TYPES,
  SEARCH_SERVICE_TYPES,
  SECURITY_SERVICE_TYPES,
  STORAGE_SERVICE_TYPES,
} from '@/types/ingestion';

/** Service-kind tables: views look kinds up here instead of if-else chains. */export const SERVICE_TYPES_BY_KIND: Record<ServiceKind, readonly string[]> = {
  database: DATABASE_SERVICE_TYPES,
  messaging: MESSAGING_SERVICE_TYPES,
  dashboard: DASHBOARD_SERVICE_TYPES,
  storage: STORAGE_SERVICE_TYPES,
  pipeline: PIPELINE_SERVICE_TYPES,
  api: API_SERVICE_TYPES,
  mlmodel: MLMODEL_SERVICE_TYPES,
  metadata: METADATA_SERVICE_TYPES,
  drive: DRIVE_SERVICE_TYPES,
  search: SEARCH_SERVICE_TYPES,
  llm: LLM_SERVICE_TYPES,
  mcp: MCP_SERVICE_TYPES,
  security: SECURITY_SERVICE_TYPES,
};

export const SERVICE_KIND_DEFAULT_TYPE: Record<ServiceKind, string> = {
  database: 'Postgres',
  messaging: 'Kafka',
  dashboard: 'Superset',
  storage: 'S3',
  pipeline: 'Prefect',
  api: 'Rest',
  mlmodel: 'Mlflow',
  metadata: 'OpenMetadata',
  drive: 'GoogleDrive',
  search: 'ElasticSearch',
  llm: 'OpenAI',
  mcp: 'Mcp',
  security: 'Ranger',
};

export const SERVICE_ENTITY_TYPE_BY_KIND: Record<ServiceKind, string> = {
  database: 'databaseService',
  messaging: 'messagingService',
  dashboard: 'dashboardService',
  storage: 'storageService',
  pipeline: 'pipelineService',
  api: 'apiService',
  mlmodel: 'mlmodelService',
  metadata: 'metadataService',
  drive: 'driveService',
  search: 'searchService',
  llm: 'llmService',
  mcp: 'mcpService',
  security: 'securityService',
};

/** Entity-type string (as stored on a pipeline's service reference) back to kind. */
export const SERVICE_KIND_BY_ENTITY_TYPE: Record<string, ServiceKind> = {
  databaseService: 'database',
  messagingService: 'messaging',
  dashboardService: 'dashboard',
  storageService: 'storage',
  pipelineService: 'pipeline',
  apiService: 'api',
  mlmodelService: 'mlmodel',
  metadataService: 'metadata',
  driveService: 'drive',
  searchService: 'search',
  llmService: 'llm',
  mcpService: 'mcp',
  securityService: 'security',
};

/**
 * Kind to localized service-type label key, for the delete/restore
 * modals: the pin delete header, radio descriptions, and restore title
 * all use the kind-specific name (DeleteEntityModal.tsx,
 * ManageButton.tsx via getFormattedEntityType), never a generic
 * "Service". Values are the pin `label.*-service` keys for the ten
 * kinds that have one; drive/llm/mcp have no dedicated key, so their
 * values compose the pin `label.entity-service` template
 * (`{{entity}} Service` / `{{entity}} 服务`) with the kind label —
 * drive exactly as the pin builds it (EntityNameUtils, entity-service
 * + `label.drive`), llm/mcp with the fork kind label, since the pin
 * has neither an entry nor a label for them and its
 * `capitalize(entityType)` fallback must not be replicated.
 */
export const SERVICE_TYPE_LABEL_KEY_BY_KIND: Record<ServiceKind, string> = {
  database: 'ingestion.services.serviceTypeLabels.database',
  messaging: 'ingestion.services.serviceTypeLabels.messaging',
  dashboard: 'ingestion.services.serviceTypeLabels.dashboard',
  storage: 'ingestion.services.serviceTypeLabels.storage',
  pipeline: 'ingestion.services.serviceTypeLabels.pipeline',
  api: 'ingestion.services.serviceTypeLabels.api',
  mlmodel: 'ingestion.services.serviceTypeLabels.mlmodel',
  metadata: 'ingestion.services.serviceTypeLabels.metadata',
  drive: 'ingestion.services.serviceTypeLabels.drive',
  search: 'ingestion.services.serviceTypeLabels.search',
  llm: 'ingestion.services.serviceTypeLabels.llm',
  mcp: 'ingestion.services.serviceTypeLabels.mcp',
  security: 'ingestion.services.serviceTypeLabels.security',
};

export function kindForServiceType(serviceType: string): ServiceKind | undefined {
  const found = (Object.keys(SERVICE_TYPES_BY_KIND) as ServiceKind[]).find((kind) =>
    (SERVICE_TYPES_BY_KIND[kind] as readonly string[]).includes(serviceType),
  );
  return found;
}

export function entityTypeForKind(kind: ServiceKind): string {
  return SERVICE_ENTITY_TYPE_BY_KIND[kind];
}

/** Blank service form with the same defaults the create modal historically used. */
/** MetadataES (metadataESConnection.json): the pin default `entities` list
 * (14 items). Prefilled into new forms and used as the edit refill when the
 * stored config omits the field — the same spec-default discipline as the
 * database defaults below. */
const METADATA_ES_DEFAULT_ENTITIES: readonly string[] = [
  'table',
  'topic',
  'dashboard',
  'pipeline',
  'mlmodel',
  'user',
  'team',
  'glossaryTerm',
  'tag',
  'entityReportData',
  'webAnalyticEntityViewReportData',
  'webAnalyticUserActivityReportData',
  'container',
  'query',
];

export function createEmptyServiceForm(): ServiceFormValues {
  return {
    name: '',
    displayName: '',
    description: '',
    kind: 'database',
    serviceType: 'Postgres',
    hostPort: '',
    username: '',
    database: '',
    databaseName: '',
    databaseSchema: '',
    account: '',
    warehouse: '',
    role: '',
    bootstrapServers: '',
    securityProtocol: '',
    schemaRegistryURL: '',
    // W2-5 lean-forms tier 2: spec defaults, prefilled like provider: 'db'
    // (ADR:2026-11-08-leanforms-tier2-form-defaults). securityProtocol stays
    // '' (builder omits it; the server defaults to PLAINTEXT).
    saslUsername: '',
    saslPassword: '',
    saslMechanism: 'PLAIN',
    basicAuthUserInfo: '',
    consumerConfig: '',
    schemaRegistryConfig: '',
    schemaRegistryTopicSuffixName: '-value',
    consumerConfigSSLCaCertificate: '',
    consumerConfigSSLCertificate: '',
    consumerConfigSSLKey: '',
    schemaRegistrySSLCaCertificate: '',
    schemaRegistrySSLCertificate: '',
    schemaRegistrySSLKey: '',
    httpPath: '',
    catalog: '',
    queryHistoryTable: '',
    includeMetricViews: true,
    authMode: 'pat',
    clientId: '',
    clientSecret: '',
    azureClientId: '',
    azureClientSecret: '',
    azureTenantId: '',
    password: '',
    apiKey: '',
    provider: 'db',
    // W2-5 lean-forms tier 2: verifySSL default no-ssl (verifySSLConfig);
    // the same form key serves Superset (nested) and Prefect (top level).
    verifySSL: 'no-ssl',
    supersetSSLCaCertificate: '',
    supersetSSLCertificate: '',
    supersetSSLKey: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsSessionToken: '',
    awsEndPointURL: '',
    awsProfileName: '',
    assumeRoleArn: '',
    assumeRoleSessionName: '',
    assumeRoleSourceIdentity: '',
    awsIamEnabled: false,
    bucketNames: '',
    consoleEndpointURL: '',
    prefectAuthMode: 'server',
    prefectAccountId: '',
    prefectWorkspaceId: '',
    prefectAuthString: '',
    numberOfStatus: 10,
    dagsterTimeout: 1000,
    stripAssetKeyPrefixLength: 0,
    trackingUri: '',
    registryUri: '',
    openApiSchemaUrl: '',
    delegatedEmail: '',
    driveId: '',
    organization: '',
    baseUrl: '',
    registryUrl: '',
    connectionTimeout: undefined,
    // W3-3A lean-forms tier 3A: spec defaults, prefilled like the tier 2
    // defaults above (ADR:2026-11-10-leanforms-3a-form-defaults). The Mcp
    // connectionTimeout default (30) is NOT prefilled here: the form key is
    // shared with Databricks, whose spec default is 120 — prefilling 30
    // would silently override it. The Mcp default applies on the read side
    // (formValuesFromService) and via the server default on create.
    docURL: '',
    restSSLCaCertificate: '',
    restSSLCertificate: '',
    restSSLKey: '',
    clusterName: 'openmetadata',
    authProvider: 'basic',
    jwtToken: '',
    secretsManagerProvider: 'db',
    secretsManagerLoader: 'noop',
    apiVersion: 'v1',
    enableVersionValidation: true,
    extraHeaders: '',
    omStoreServiceConnection: true,
    includeTopics: true,
    includeTables: true,
    includeDashboards: true,
    includePipelines: true,
    includeMlModels: true,
    includeUsers: true,
    includeTeams: true,
    includeGlossaryTerms: true,
    includeTags: true,
    includePolicy: true,
    includeMessagingServices: true,
    includeDatabaseServices: true,
    includePipelineServices: true,
    limitRecords: 1000,
    forceEntityOverwriting: false,
    omElasticSearchType: '',
    omElasticSearchConfig: '',
    gcpConfigType: 'gcpValues',
    // T-2 (2026-11-20): the shared GCP impersonate lifetime (pin default
    // 3600; the old GoogleDrive-only impersonateLifetime default). The
    // other authGcp* leaves stay unset on create (blank = unset).
    authGcpImpersonateLifetime: 3600,
    includeTeamDrives: true,
    includeGoogleSheets: false,
    elasticSearchAuthMode: 'basicAuth',
    apiKeyId: '',
    sslCertMode: 'paths',
    sslCaCertPath: '',
    sslClientCertPath: '',
    sslPrivateKeyPath: '',
    sslCaCertValue: '',
    sslClientCertValue: '',
    sslPrivateKeyValue: '',
    sslStagingDir: '/tmp/openmetadata-certs',
    connectionTimeoutSecs: 30,
    openAITimeout: 60,
    openAIMaxRetries: 3,
    discoveryMethod: 'ConfigFile',
    configFilePaths: '',
    servers: '',
    initializationTimeout: 60,
    fetchTools: true,
    fetchResources: true,
    fetchPrompts: true,
    // Wave 0 lean-forms database档: spec defaults (RULING.md §1.4). These are
    // the official defaults for the new fields; the builder only emits them
    // when set, so a blank form stays equivalent to the server default.
    sslMode: 'disable',
    sslCaCertificate: '',
    sslCertificate: '',
    sslKey: '',
    classificationName: 'PostgresPolicyTags',
    queryStatementSource: 'pg_stat_statements',
    connectionOptions: '',
    connectionArguments: '',
    useSlowLogs: false,
    queryTag: '',
    accountUsageSchema: 'SNOWFLAKE.ACCOUNT_USAGE',
    systemMetricsBatchSize: 50,
    privateKey: '',
    snowflakePrivatekeyPassphrase: '',
    includeTransientTables: false,
    includeStreams: false,
    includeStages: false,
    includeSemanticViews: false,
    clientSessionKeepAlive: false,
    useAccessHistory: true,
    accessHistoryChunkSize: 2,
    creditCost: 3.3,
    snowflakeSourceHost: 'app.snowflake.com',
    clusterIdentifier: '',
    workgroupName: '',
    policyAgentEnabled: true,
    policyAgentSupportsColumnAccess: false,
    policyAgentSupportsFullAccess: true,
    policyAgentSupportsMaskedAccess: true,
    // A2 (2026-11-19): spec defaults for the five A-class types brought
    // into T-2 (Bai ruling: A-class 5 rows in). Branch selectors start on
    // their field defaults (Alation basicAuth / postgres / basic); the
    // Alation-only keys, Collibra enableEnrichment and the MetadataES
    // leaves prefill their pin defaults. SharePoint siteUrl is deliberately
    // NOT prefilled — the pin default is a placeholder URL, never a value.
    location: '',
    alationAuthBranch: 'basicAuth',
    alationAccessToken: '',
    alationConnectionBranch: 'postgres',
    alationDbAuthBranch: 'basic',
    alationDbUsername: '',
    alationDbPassword: '',
    alationDbHostPort: '',
    alationDbDatabase: '',
    alationDbDatabaseName: '',
    alationDbDatabaseSchema: '',
    alationDbScheme: '',
    alationDbIngestAllDatabases: false,
    alationDbSslMode: 'disable',
    alationDbSslCaCertificate: '',
    alationDbSslCertificate: '',
    alationDbSslKey: '',
    alationDbClassificationName: 'PostgresPolicyTags',
    alationDbQueryStatementSource: 'pg_stat_statements',
    alationDbUseSlowLogs: false,
    alationDbQueryHistoryTable: '',
    alationDbConnectionOptions: '',
    alationDbConnectionArguments: '',
    projectName: 'AlationAPI',
    paginationLimit: 10,
    includeUndeployedDatasources: false,
    includeHiddenDatasources: false,
    ingestDatasources: true,
    ingestUsersAndGroups: true,
    ingestDomains: true,
    ingestKnowledgeArticles: true,
    ingestDashboards: true,
    alationTagClassificationName: 'alationTags',
    enableEnrichment: false,
    metadataESEntities: JSON.stringify(METADATA_ES_DEFAULT_ENTITIES),
    recreateIndex: true,
    searchIndexMappingLanguage: 'EN',
    batchSize: 100,
    tenantId: '',
    siteUrl: '',
    siteName: '',
    // T-2 (2026-11-20): spec defaults for Superset / Rest / the ten
    // blocked-C rows. Branch selectors start on their field defaults
    // (Superset api / basic, Rest url, Sftp usernamePassword, AlationSink
    // basicAuth, OpenSearch basicAuth).
    supersetConnectionBranch: 'api',
    supersetDbAuthBranch: 'basic',
    supersetDbScheme: '',
    supersetDbUsername: '',
    supersetDbPassword: '',
    supersetDbHostPort: '',
    supersetDbDatabase: '',
    supersetDbDatabaseName: '',
    supersetDbDatabaseSchema: '',
    supersetDbIngestAllDatabases: false,
    supersetDbSslMode: 'disable',
    supersetDbSslCaCertificate: '',
    supersetDbSslCertificate: '',
    supersetDbSslKey: '',
    supersetDbClassificationName: 'PostgresPolicyTags',
    supersetDbQueryStatementSource: 'pg_stat_statements',
    supersetDbUseSlowLogs: false,
    supersetDbQueryHistoryTable: '',
    supersetDbConnectionOptions: '',
    supersetDbConnectionArguments: '',
    restSchemaBranch: 'url',
    openApiSchemaFilePath: '',
    openApiSchemaS3Url: '',
    apiEndpointFilterPattern: undefined,
    sourcePythonClass: '',
    alationSinkAuthBranch: 'basicAuth',
    alationSinkAccessToken: '',
    datasourceLinks: '',
    alationSinkSSLCaCertificate: '',
    alationSinkSSLCertificate: '',
    alationSinkSSLKey: '',
    maxConnectionLifeTime: 50,
    validateSSL: false,
    encrypted: false,
    databaseServiceName: '',
    messagingServiceName: '',
    entity_type: '',
    sftpHost: '',
    sftpPort: 22,
    sftpAuthBranch: 'usernamePassword',
    sftpPrivateKey: '',
    sftpPrivateKeyPassphrase: '',
    rootDirectories: '["/"]',
    structuredDataFilesOnly: false,
    extractSampleData: false,
    openSearchAuthBranch: 'basicAuth',
  };
}

function pickPassword(config: ServiceConnectionConfig | undefined): string | undefined {
  if (!config) {
    return undefined;
  }
  const auth = config.authType;
  if (auth && typeof auth === 'object') {
    if (typeof auth.password === 'string') {
      return auth.password;
    }
    if (typeof auth.token === 'string') {
      return auth.token;
    }
  }
  if (typeof config.password === 'string') {
    return config.password;
  }
  // W2-5 (condition 6): Superset keeps its password nested in
  // config.connection.password (supersetApiConnection.json) — without this
  // read, an edit-save silently drops a masked Superset password.
  if (typeof config.connection?.password === 'string') {
    return config.connection.password;
  }
  return undefined;
}

export function formValuesFromService(service: CatalogService): ServiceFormValues {
  const config = service.connection?.config ?? {};
  // W3-3A: computed once for the refill keys below.
  const esCerts = elasticSearchCertificatesFromConfig(config);
  const esCertPaths = esCerts && 'caCertPath' in esCerts ? esCerts : undefined;
  const esCertValues = esCerts && 'caCertValue' in esCerts ? esCerts : undefined;
  return {
    name: service.name,
    displayName: service.displayName,
    description: service.description,
    kind: service.kind,
    serviceType: service.serviceType,
    // Dagster (and any schema using `host`) must reload into the shared hostPort field.
    hostPort:
      (typeof config.host === 'string' && config.host) ||
      (typeof config.hostPort === 'string' ? config.hostPort : '') ||
      '',
    username:
      // A2: Alation's top-level `username` is the API auth username
      // (config.authType.username); the nested database username lives at
      // config.connection.username and refills the separate
      // alationDbUsername key below — the generic chain would read the
      // nested username into the top-level field.
      service.serviceType === 'Alation'
        ? (typeof config.authType?.username === 'string' ? config.authType.username : '')
        : service.serviceType === 'Superset'
          ? typeof config.connection?.provider === 'string'
            ? (typeof config.connection.username === 'string' ? config.connection.username : '')
            : ''
          : typeof config.username === 'string'
          ? config.username
          : typeof config.connection?.username === 'string'
            ? config.connection.username
            : typeof config.authType?.username === 'string'
              ? config.authType.username
              : '',
    database: typeof config.database === 'string' ? config.database : '',
    databaseName: typeof config.databaseName === 'string' ? config.databaseName : '',
    databaseSchema: typeof config.databaseSchema === 'string' ? config.databaseSchema : '',
    account: typeof config.account === 'string' ? config.account : '',
    warehouse: typeof config.warehouse === 'string' ? config.warehouse : '',
    role: typeof config.role === 'string' ? config.role : '',
    bootstrapServers: typeof config.bootstrapServers === 'string' ? config.bootstrapServers : '',
    schemaRegistryURL: typeof config.schemaRegistryURL === 'string' ? config.schemaRegistryURL : '',
    securityProtocol: typeof config.securityProtocol === 'string' ? config.securityProtocol : '',
    // W2-5 lean-forms tier 2: round-trip the new fields. Secrets are never
    // prefilled (blank; masked previous values are preserved at build time).
    // Spec defaults apply when the stored config omits the field.
    saslUsername: typeof config.saslUsername === 'string' ? config.saslUsername : '',
    saslPassword: '',
    saslMechanism: typeof config.saslMechanism === 'string' ? config.saslMechanism : 'PLAIN',
    basicAuthUserInfo: '',
    consumerConfig: stringifyJsonMap(config.consumerConfig),
    schemaRegistryConfig: stringifyJsonMap(config.schemaRegistryConfig),
    schemaRegistryTopicSuffixName:
      typeof config.schemaRegistryTopicSuffixName === 'string'
        ? config.schemaRegistryTopicSuffixName
        : '-value',
    consumerConfigSSLCaCertificate: '',
    consumerConfigSSLCertificate: '',
    consumerConfigSSLKey: '',
    schemaRegistrySSLCaCertificate: '',
    schemaRegistrySSLCertificate: '',
    schemaRegistrySSLKey: '',
    httpPath: typeof config.httpPath === 'string' ? config.httpPath : '',
    catalog: typeof config.catalog === 'string' ? config.catalog : '',
    queryHistoryTable: typeof config.queryHistoryTable === 'string' ? config.queryHistoryTable : '',
    includeMetricViews: typeof config.includeMetricViews === 'boolean' ? config.includeMetricViews : true,
    scheme: typeof config.scheme === 'string' ? config.scheme : '',
    driver: typeof config.driver === 'string' ? config.driver : '',
    encrypt: typeof config.encrypt === 'boolean' ? config.encrypt : false,
    trustServerCertificate: typeof config.trustServerCertificate === 'boolean' ? config.trustServerCertificate : false,
    ingestAllDatabases: typeof config.ingestAllDatabases === 'boolean' ? config.ingestAllDatabases : false,
    includeSynonyms: typeof config.includeSynonyms === 'boolean' ? config.includeSynonyms : false,
    authMode: authModeFromConfig(config),
    // A2: SharePoint stores clientId at the top level (config.clientId);
    // Databricks OAuth stores it under authType. Top level wins — no
    // existing type stores a different clientId at the top level.
    clientId:
      typeof config.clientId === 'string'
        ? config.clientId
        : typeof config.authType?.clientId === 'string'
          ? config.authType.clientId
          : '',
    clientSecret: '',
    azureClientId: typeof config.authType?.azureClientId === 'string' ? config.authType.azureClientId : '',
    azureClientSecret: '',
    azureTenantId: typeof config.authType?.azureTenantId === 'string' ? config.authType.azureTenantId : '',
    password: '',
    apiKey: '',
    provider: typeof config.connection?.provider === 'string'
      ? config.connection.provider
      : typeof config.provider === 'string'
        ? config.provider
        : 'db',
    // W2-5 lean-forms tier 2: verifySSL lives nested (Superset connection)
    // or top level (Prefect); neither type carries both, so top level wins.
    verifySSL:
      typeof config.verifySSL === 'string'
        ? config.verifySSL
        : typeof config.connection?.verifySSL === 'string'
          ? config.connection.verifySSL
          : 'no-ssl',
    supersetSSLCaCertificate: '',
    supersetSSLCertificate: '',
    supersetSSLKey: '',
    awsRegion: typeof config.awsConfig?.awsRegion === 'string' ? config.awsConfig.awsRegion : '',
    awsAccessKeyId:
      typeof config.awsConfig?.awsAccessKeyId === 'string' ? config.awsConfig.awsAccessKeyId : '',
    awsSecretAccessKey: '',
    awsSessionToken: '',
    awsEndPointURL: typeof config.awsConfig?.endPointURL === 'string' ? config.awsConfig.endPointURL : '',
    awsProfileName: typeof config.awsConfig?.profileName === 'string' ? config.awsConfig.profileName : '',
    assumeRoleArn: typeof config.awsConfig?.assumeRoleArn === 'string' ? config.awsConfig.assumeRoleArn : '',
    assumeRoleSessionName:
      typeof config.awsConfig?.assumeRoleSessionName === 'string'
        ? config.awsConfig.assumeRoleSessionName
        : '',
    assumeRoleSourceIdentity:
      typeof config.awsConfig?.assumeRoleSourceIdentity === 'string'
        ? config.awsConfig.assumeRoleSourceIdentity
        : '',
    awsIamEnabled: typeof config.awsConfig?.enabled === 'boolean' ? config.awsConfig.enabled : false,
    bucketNames: Array.isArray(config.bucketNames) ? config.bucketNames.join(', ') : '',
    consoleEndpointURL: typeof config.consoleEndpointURL === 'string' ? config.consoleEndpointURL : '',
    prefectAuthMode: prefectAuthModeFromConfig(config),
    prefectAccountId: typeof config.authType?.accountId === 'string' ? config.authType.accountId : '',
    prefectWorkspaceId:
      typeof config.authType?.workspaceId === 'string' ? config.authType.workspaceId : '',
    prefectAuthString: '',
    numberOfStatus: typeof config.numberOfStatus === 'number' ? config.numberOfStatus : 10,
    dagsterTimeout: typeof config.timeout === 'number' ? config.timeout : 1000,
    stripAssetKeyPrefixLength:
      typeof config.stripAssetKeyPrefixLength === 'number' ? config.stripAssetKeyPrefixLength : 0,
    // Eight-kind default types (see connectionFields.ts): secrets are never
    // prefilled — the build step preserves a masked previous secret instead.
    trackingUri: typeof config.trackingUri === 'string' ? config.trackingUri : '',
    // W3-3A (condition 5): the registry URI refills in plaintext, unchanged.
    // It is a connection locator (the whole URI is the address, credentials
    // embedded), not a pure secret — blanking it would silently drop the
    // registry address on edit-save.
    registryUri: typeof config.registryUri === 'string' ? config.registryUri : '',
    openApiSchemaUrl:
      typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)?.openAPISchemaURL ===
      'string'
        ? ((config.openAPISchemaConnection as Record<string, unknown>).openAPISchemaURL as string)
        : '',
    // Rest (restConnection.json): the openAPISchemaConnection oneOf branch
    // is inferred from the stored leaf; the S3 AWS leaves refill in
    // hydrateAuthBranchForm; the apiEndpointFilterPattern leaf refills
    // here (it is not one of the 19 filtered fields).
    restSchemaBranch:
      typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)
        ?.openAPISchemaFilePath === 'string'
        ? 'filePath'
        : typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)
              ?.openAPISchemaS3URL === 'string'
          ? 's3'
          : 'url',
    openApiSchemaFilePath:
      typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)
        ?.openAPISchemaFilePath === 'string'
        ? ((config.openAPISchemaConnection as Record<string, unknown>).openAPISchemaFilePath as string)
        : '',
    openApiSchemaS3Url:
      typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)
        ?.openAPISchemaS3URL === 'string'
        ? ((config.openAPISchemaConnection as Record<string, unknown>).openAPISchemaS3URL as string)
        : '',
    apiEndpointFilterPattern: isFilterPatternConfig(config.apiEndpointFilterPattern)
      ? config.apiEndpointFilterPattern
      : undefined,
    delegatedEmail: typeof config.delegatedEmail === 'string' ? config.delegatedEmail : '',
    driveId: typeof config.driveId === 'string' ? config.driveId : '',
    organization: typeof config.organization === 'string' ? config.organization : '',
    // Server schema field is baseURL (openAIConnection.json); baseUrl is
    // only accepted as a read fallback for records this branch wrote
    // before the mapping was corrected.
    baseUrl:
      typeof config.baseURL === 'string'
        ? config.baseURL
        : typeof config.baseUrl === 'string'
          ? config.baseUrl
          : '',
    registryUrl: typeof config.registryUrl === 'string' ? config.registryUrl : '',
    // W3-3A: the Mcp spec default is 30, but the form key is shared with
    // Databricks (spec default 120) — the default applies only for Mcp, so
    // a Databricks refill keeps its previous behaviour (undefined).
    connectionTimeout:
      typeof config.connectionTimeout === 'number'
        ? config.connectionTimeout
        : service.serviceType === 'Mcp'
          ? 30
          : undefined,
    // W3-3A lean-forms tier 3A: round-trip the new fields. Secrets are never
    // prefilled (blank; masked previous values are preserved at build time).
    // Spec defaults apply when the stored config omits the field.
    // Rest (restConnection.json).
    docURL: typeof config.docURL === 'string' ? config.docURL : '',
    restSSLCaCertificate: '',
    restSSLCertificate: '',
    restSSLKey: '',
    // OpenMetadata (openMetadataConnection.json), A group.
    clusterName: typeof config.clusterName === 'string' ? config.clusterName : 'openmetadata',
    authProvider: typeof config.authProvider === 'string' ? config.authProvider : 'basic',
    jwtToken: '',
    secretsManagerProvider:
      typeof config.secretsManagerProvider === 'string' ? config.secretsManagerProvider : 'db',
    secretsManagerLoader:
      typeof config.secretsManagerLoader === 'string' ? config.secretsManagerLoader : 'noop',
    apiVersion: typeof config.apiVersion === 'string' ? config.apiVersion : 'v1',
    enableVersionValidation:
      typeof config.enableVersionValidation === 'boolean' ? config.enableVersionValidation : true,
    extraHeaders: stringifyJsonMap(config.extraHeaders),
    omStoreServiceConnection:
      typeof config.storeServiceConnection === 'boolean' ? config.storeServiceConnection : true,
    // OpenMetadata (openMetadataConnection.json), B group — 13 include*
    // switches (all default True), limitRecords (default 1000),
    // forceEntityOverwriting (default False), elasticsSearch
    // (conditionally required `type` + string-map `config`).
    includeTopics: typeof config.includeTopics === 'boolean' ? config.includeTopics : true,
    includeTables: typeof config.includeTables === 'boolean' ? config.includeTables : true,
    includeDashboards:
      typeof config.includeDashboards === 'boolean' ? config.includeDashboards : true,
    includePipelines:
      typeof config.includePipelines === 'boolean' ? config.includePipelines : true,
    includeMlModels: typeof config.includeMlModels === 'boolean' ? config.includeMlModels : true,
    includeUsers: typeof config.includeUsers === 'boolean' ? config.includeUsers : true,
    includeTeams: typeof config.includeTeams === 'boolean' ? config.includeTeams : true,
    includeGlossaryTerms:
      typeof config.includeGlossaryTerms === 'boolean' ? config.includeGlossaryTerms : true,
    includeTags: typeof config.includeTags === 'boolean' ? config.includeTags : true,
    includePolicy: typeof config.includePolicy === 'boolean' ? config.includePolicy : true,
    includeMessagingServices:
      typeof config.includeMessagingServices === 'boolean'
        ? config.includeMessagingServices
        : true,
    includeDatabaseServices:
      typeof config.includeDatabaseServices === 'boolean'
        ? config.includeDatabaseServices
        : true,
    includePipelineServices:
      typeof config.includePipelineServices === 'boolean'
        ? config.includePipelineServices
        : true,
    limitRecords: typeof config.limitRecords === 'number' ? config.limitRecords : 1000,
    forceEntityOverwriting:
      typeof config.forceEntityOverwriting === 'boolean' ? config.forceEntityOverwriting : false,
    omElasticSearchType:
      typeof (config.elasticsSearch as { type?: unknown } | undefined)?.type === 'string'
        ? (config.elasticsSearch as { type: string }).type
        : '',
    omElasticSearchConfig: stringifyJsonMap(
      (config.elasticsSearch as { config?: Record<string, string> } | undefined)?.config,
    ),
    openMetadataSSLCaCertificate: '',
    openMetadataSSLCertificate: '',
    openMetadataSSLKey: '',
    includeTeamDrives: typeof config.includeTeamDrives === 'boolean' ? config.includeTeamDrives : true,
    includeGoogleSheets:
      typeof config.includeGoogleSheets === 'boolean' ? config.includeGoogleSheets : false,
    // ElasticSearch (elasticSearchConnection.json).
    elasticSearchAuthMode: elasticSearchAuthModeFromConfig(config),
    apiKeyId: typeof config.authType?.apiKeyId === 'string' ? config.authType.apiKeyId : '',
    sslCertMode: elasticSearchSslCertModeFromConfig(config),
    sslCaCertPath:
      esCertPaths && typeof esCertPaths.caCertPath === 'string' ? esCertPaths.caCertPath : '',
    sslClientCertPath:
      esCertPaths && typeof esCertPaths.clientCertPath === 'string'
        ? esCertPaths.clientCertPath
        : '',
    sslPrivateKeyPath:
      esCertPaths && typeof esCertPaths.privateKeyPath === 'string'
        ? esCertPaths.privateKeyPath
        : '',
    sslCaCertValue: '',
    sslClientCertValue: '',
    sslPrivateKeyValue: '',
    sslStagingDir:
      esCertValues && typeof esCertValues.stagingDir === 'string'
        ? esCertValues.stagingDir
        : '/tmp/openmetadata-certs',
    connectionTimeoutSecs:
      typeof config.connectionTimeoutSecs === 'number' ? config.connectionTimeoutSecs : 30,
    // OpenAI (openAIConnection.json): the spec attribute names (timeout /
    // maxRetries) are shared with Dagster's config timeout — the form keys
    // are type-prefixed and the builder dispatches per type, so the refill
    // defaults here apply to the OpenAI keys only.
    openAITimeout: typeof config.timeout === 'number' ? config.timeout : 60,
    openAIMaxRetries: typeof config.maxRetries === 'number' ? config.maxRetries : 3,
    // Mcp (mcpConnection.json): servers refills with each apiKey masked.
    discoveryMethod: typeof config.discoveryMethod === 'string' ? config.discoveryMethod : 'ConfigFile',
    configFilePaths: Array.isArray(config.configFilePaths) ? JSON.stringify(config.configFilePaths) : '',
    servers:
      Array.isArray(config.servers) && config.servers.length
        ? JSON.stringify(maskServerApiKeys(config.servers))
        : '',
    initializationTimeout:
      typeof config.initializationTimeout === 'number' ? config.initializationTimeout : 60,
    fetchTools: typeof config.fetchTools === 'boolean' ? config.fetchTools : true,
    fetchResources: typeof config.fetchResources === 'boolean' ? config.fetchResources : true,
    fetchPrompts: typeof config.fetchPrompts === 'boolean' ? config.fetchPrompts : true,
    // Wave 0 lean-forms database档: round-trip the new fields. Secrets are
    // never prefilled (password fields stay blank; masked previous values are
    // preserved at build time instead). Spec defaults apply when the stored
    // config omits the field (RULING.md §1.4).
    sslMode: typeof config.sslMode === 'string' ? config.sslMode : 'disable',
    sslCaCertificate: '',
    sslCertificate: '',
    sslKey: '',
    classificationName:
      typeof config.classificationName === 'string' ? config.classificationName : 'PostgresPolicyTags',
    queryStatementSource:
      typeof config.queryStatementSource === 'string' ? config.queryStatementSource : 'pg_stat_statements',
    connectionOptions: stringifyJsonMap(config.connectionOptions),
    connectionArguments: stringifyJsonMap(config.connectionArguments),
    useSlowLogs: typeof config.useSlowLogs === 'boolean' ? config.useSlowLogs : false,
    queryTag: typeof config.queryTag === 'string' ? config.queryTag : '',
    accountUsageSchema:
      typeof config.accountUsageSchema === 'string' ? config.accountUsageSchema : 'SNOWFLAKE.ACCOUNT_USAGE',
    systemMetricsBatchSize:
      typeof config.systemMetricsBatchSize === 'number' ? config.systemMetricsBatchSize : 50,
    privateKey: '',
    snowflakePrivatekeyPassphrase: '',
    includeTransientTables:
      typeof config.includeTransientTables === 'boolean' ? config.includeTransientTables : false,
    includeStreams: typeof config.includeStreams === 'boolean' ? config.includeStreams : false,
    includeStages: typeof config.includeStages === 'boolean' ? config.includeStages : false,
    includeSemanticViews:
      typeof config.includeSemanticViews === 'boolean' ? config.includeSemanticViews : false,
    clientSessionKeepAlive:
      typeof config.clientSessionKeepAlive === 'boolean' ? config.clientSessionKeepAlive : false,
    useAccessHistory: typeof config.useAccessHistory === 'boolean' ? config.useAccessHistory : true,
    accessHistoryChunkSize:
      typeof config.accessHistoryChunkSize === 'number' ? config.accessHistoryChunkSize : 2,
    creditCost: typeof config.creditCost === 'number' ? config.creditCost : 3.3,
    snowflakeSourceHost:
      typeof config.snowflakeSourceHost === 'string' ? config.snowflakeSourceHost : 'app.snowflake.com',
    clusterIdentifier: typeof config.clusterIdentifier === 'string' ? config.clusterIdentifier : '',
    workgroupName: typeof config.workgroupName === 'string' ? config.workgroupName : '',
    policyAgentEnabled:
      typeof (config.policyAgentConfig as { enabled?: unknown } | undefined)?.enabled === 'boolean'
        ? (config.policyAgentConfig as { enabled: boolean }).enabled
        : true,
    policyAgentSupportsColumnAccess:
      typeof (config.policyAgentConfig as { supportsColumnAccess?: unknown } | undefined)
        ?.supportsColumnAccess === 'boolean'
        ? (config.policyAgentConfig as { supportsColumnAccess: boolean }).supportsColumnAccess
        : false,
    policyAgentSupportsFullAccess:
      typeof (config.policyAgentConfig as { supportsFullAccess?: unknown } | undefined)
        ?.supportsFullAccess === 'boolean'
        ? (config.policyAgentConfig as { supportsFullAccess: boolean }).supportsFullAccess
        : true,
    policyAgentSupportsMaskedAccess:
      typeof (config.policyAgentConfig as { supportsMaskedAccess?: unknown } | undefined)
        ?.supportsMaskedAccess === 'boolean'
        ? (config.policyAgentConfig as { supportsMaskedAccess: boolean }).supportsMaskedAccess
        : true,
    // A2 (2026-11-19): round-trip the five A-class types. Secrets are
    // never prefilled (blank; masked previous values are preserved at
    // build time). Spec defaults apply when the stored config omits the
    // field. The nested Alation auth branch + shared auth keys refill in
    // hydrateAuthBranchForm (paired call in EditServiceConnectionView),
    // not here — the Mysql/Postgres precedent.
    // VertexAI (vertexaiConnection.json): location is top level; the GCP
    // credentials refill in hydrateAuthBranchForm.
    location: typeof config.location === 'string' ? config.location : '',
    // Alation (alationConnection.json): top-level API auth + settings.
    alationAuthBranch:
      typeof config.authType?.accessToken === 'string' ? 'apiToken' : 'basicAuth',
    alationAccessToken: '',
    alationConnectionBranch:
      config.connection?.type === 'Postgres'
        ? 'postgres'
        : config.connection?.type === 'Mysql'
          ? 'mysql'
          : 'none',
    projectName: typeof config.projectName === 'string' ? config.projectName : 'AlationAPI',
    paginationLimit: typeof config.paginationLimit === 'number' ? config.paginationLimit : 10,
    includeUndeployedDatasources:
      typeof config.includeUndeployedDatasources === 'boolean'
        ? config.includeUndeployedDatasources
        : false,
    includeHiddenDatasources:
      typeof config.includeHiddenDatasources === 'boolean'
        ? config.includeHiddenDatasources
        : false,
    ingestDatasources:
      typeof config.ingestDatasources === 'boolean' ? config.ingestDatasources : true,
    ingestUsersAndGroups:
      typeof config.ingestUsersAndGroups === 'boolean' ? config.ingestUsersAndGroups : true,
    ingestDomains: typeof config.ingestDomains === 'boolean' ? config.ingestDomains : true,
    ingestKnowledgeArticles:
      typeof config.ingestKnowledgeArticles === 'boolean'
        ? config.ingestKnowledgeArticles
        : true,
    ingestDashboards:
      typeof config.ingestDashboards === 'boolean' ? config.ingestDashboards : true,
    alationTagClassificationName:
      typeof config.alationTagClassificationName === 'string'
        ? config.alationTagClassificationName
        : 'alationTags',
    // Alation nested database connection (config.connection).
    alationDbUsername:
      typeof config.connection?.username === 'string' ? config.connection.username : '',
    alationDbPassword: '',
    alationDbHostPort:
      typeof config.connection?.hostPort === 'string' ? config.connection.hostPort : '',
    alationDbDatabase:
      typeof config.connection?.database === 'string' ? config.connection.database : '',
    alationDbDatabaseName:
      typeof config.connection?.databaseName === 'string' ? config.connection.databaseName : '',
    alationDbDatabaseSchema:
      typeof config.connection?.databaseSchema === 'string' ? config.connection.databaseSchema : '',
    alationDbScheme:
      typeof config.connection?.scheme === 'string' ? config.connection.scheme : '',
    alationDbIngestAllDatabases:
      typeof config.connection?.ingestAllDatabases === 'boolean'
        ? config.connection.ingestAllDatabases
        : false,
    alationDbSslMode:
      typeof config.connection?.sslMode === 'string' ? config.connection.sslMode : 'disable',
    alationDbSslCaCertificate: '',
    alationDbSslCertificate: '',
    alationDbSslKey: '',
    alationDbClassificationName:
      typeof config.connection?.classificationName === 'string'
        ? config.connection.classificationName
        : 'PostgresPolicyTags',
    alationDbQueryStatementSource:
      typeof config.connection?.queryStatementSource === 'string'
        ? config.connection.queryStatementSource
        : 'pg_stat_statements',
    alationDbUseSlowLogs:
      typeof config.connection?.useSlowLogs === 'boolean' ? config.connection.useSlowLogs : false,
    alationDbQueryHistoryTable:
      typeof config.connection?.queryHistoryTable === 'string'
        ? config.connection.queryHistoryTable
        : '',
    alationDbConnectionOptions: stringifyJsonMap(config.connection?.connectionOptions),
    alationDbConnectionArguments: stringifyJsonMap(config.connection?.connectionArguments),
    // Collibra (collibraConnection.json).
    enableEnrichment:
      typeof config.enableEnrichment === 'boolean' ? config.enableEnrichment : false,
    glossaryFilterPattern: isFilterPatternConfig(config.glossaryFilterPattern)
      ? config.glossaryFilterPattern
      : undefined,
    domainFilterPattern: isFilterPatternConfig(config.domainFilterPattern)
      ? config.domainFilterPattern
      : undefined,
    // MetadataES (metadataESConnection.json).
    metadataESEntities: Array.isArray(config.entities)
      ? JSON.stringify(config.entities)
      : JSON.stringify(METADATA_ES_DEFAULT_ENTITIES),
    recreateIndex: typeof config.recreateIndex === 'boolean' ? config.recreateIndex : true,
    runMode: typeof config.runMode === 'string' ? config.runMode : '',
    searchIndexMappingLanguage:
      typeof config.searchIndexMappingLanguage === 'string'
        ? config.searchIndexMappingLanguage
        : 'EN',
    batchSize: typeof config.batchSize === 'number' ? config.batchSize : 100,
    // SharePoint (sharePointConnection.json): clientId refills above
    // (top-level-first); clientSecret never refills; driveId refills above.
    tenantId: typeof config.tenantId === 'string' ? config.tenantId : '',
    siteUrl: typeof config.siteUrl === 'string' ? config.siteUrl : '',
    siteName: typeof config.siteName === 'string' ? config.siteName : '',
    // T-2 (2026-11-20): Superset nested connection + the ten blocked-C
    // rows. The nested auth branch + shared auth keys refill in
    // hydrateAuthBranchForm (paired call in EditServiceConnectionView);
    // the OpenSearch auth selector is inferred here (top-level authType).
    supersetConnectionBranch:
      typeof config.connection?.provider === 'string'
        ? 'api'
        : typeof config.connection?.scheme === 'string' &&
            config.connection.scheme.includes('postgresql')
          ? 'postgres'
          : typeof config.connection?.scheme === 'string' &&
              config.connection.scheme.includes('mysql')
            ? 'mysql'
            : 'api',
    supersetDbScheme:
      typeof config.connection?.scheme === 'string' ? config.connection.scheme : '',
    supersetDbUsername:
      typeof config.connection?.username === 'string' ? config.connection.username : '',
    supersetDbPassword: '',
    supersetDbHostPort:
      typeof config.connection?.hostPort === 'string' ? config.connection.hostPort : '',
    supersetDbDatabase:
      typeof config.connection?.database === 'string' ? config.connection.database : '',
    supersetDbDatabaseName:
      typeof config.connection?.databaseName === 'string' ? config.connection.databaseName : '',
    supersetDbDatabaseSchema:
      typeof config.connection?.databaseSchema === 'string'
        ? config.connection.databaseSchema
        : '',
    supersetDbIngestAllDatabases:
      typeof config.connection?.ingestAllDatabases === 'boolean'
        ? config.connection.ingestAllDatabases
        : false,
    supersetDbSslMode:
      typeof config.connection?.sslMode === 'string' ? config.connection.sslMode : 'disable',
    supersetDbSslCaCertificate: '',
    supersetDbSslCertificate: '',
    supersetDbSslKey: '',
    supersetDbClassificationName:
      typeof config.connection?.classificationName === 'string'
        ? config.connection.classificationName
        : 'PostgresPolicyTags',
    supersetDbQueryStatementSource:
      typeof config.connection?.queryStatementSource === 'string'
        ? config.connection.queryStatementSource
        : 'pg_stat_statements',
    supersetDbUseSlowLogs:
      typeof config.connection?.useSlowLogs === 'boolean' ? config.connection.useSlowLogs : false,
    supersetDbQueryHistoryTable:
      typeof config.connection?.queryHistoryTable === 'string'
        ? config.connection.queryHistoryTable
        : '',
    supersetDbConnectionOptions: stringifyJsonMap(config.connection?.connectionOptions),
    supersetDbConnectionArguments: stringifyJsonMap(config.connection?.connectionArguments),
    // CustomMlModel / CustomSearch (sourcePythonClass).
    sourcePythonClass:
      typeof config.sourcePythonClass === 'string' ? config.sourcePythonClass : '',
    // AlationSink (alationSinkConnection.json): the API access token never
    // refills; the branch selector is inferred from the stored authType.
    alationSinkAuthBranch:
      typeof config.authType?.accessToken === 'string' ? 'apiToken' : 'basicAuth',
    alationSinkAccessToken: '',
    datasourceLinks: stringifyJsonMap(config.datasourceLinks),
    alationSinkSSLCaCertificate: '',
    alationSinkSSLCertificate: '',
    alationSinkSSLKey: '',
    // Amundsen (amundsenConnection.json): flat username / password.
    maxConnectionLifeTime:
      typeof config.maxConnectionLifeTime === 'number' ? config.maxConnectionLifeTime : 50,
    validateSSL: typeof config.validateSSL === 'boolean' ? config.validateSSL : false,
    encrypted: typeof config.encrypted === 'boolean' ? config.encrypted : false,
    // Atlas (atlasConnection.json): the two service-name arrays refill as JSON.
    databaseServiceName: Array.isArray(config.databaseServiceName)
      ? JSON.stringify(config.databaseServiceName)
      : '',
    messagingServiceName: Array.isArray(config.messagingServiceName)
      ? JSON.stringify(config.messagingServiceName)
      : '',
    entity_type: typeof config.entity_type === 'string' ? config.entity_type : '',
    // Sftp (sftpConnection.json): host + port are separate leaves; the
    // private key + passphrase never refill.
    sftpHost: typeof config.host === 'string' ? config.host : '',
    sftpPort: typeof config.port === 'number' ? config.port : 22,
    sftpAuthBranch:
      typeof config.authType?.privateKey === 'string' ? 'privateKey' : 'usernamePassword',
    sftpPrivateKey: '',
    sftpPrivateKeyPassphrase: '',
    rootDirectories: Array.isArray(config.rootDirectories)
      ? JSON.stringify(config.rootDirectories)
      : '["/"]',
    structuredDataFilesOnly:
      typeof config.structuredDataFilesOnly === 'boolean'
        ? config.structuredDataFilesOnly
        : false,
    extractSampleData:
      typeof config.extractSampleData === 'boolean' ? config.extractSampleData : false,
    // OpenSearch (openSearchConnection.json): the auth selector is inferred
    // from the stored authType; the AWS leaves refill in
    // hydrateAuthBranchForm; the ssl certificate leaves refill via the
    // shared esCerts keys above.
    openSearchAuthBranch:
      typeof config.authType?.awsConfig === 'object' ? 'awsCredentials' : 'basicAuth',
  };
}

function prefectAuthModeFromConfig(config: ServiceConnectionConfig): 'cloud' | 'server' {
  const auth = config.authType;
  if (auth && typeof auth === 'object') {
    if ('accountId' in auth || 'workspaceId' in auth || 'apiKey' in auth) {
      return 'cloud';
    }
  }
  return 'server';
}


function authModeFromConfig(config: ServiceConnectionConfig): 'pat' | 'oauth' | 'azure' {
  const auth = config.authType;
  if (auth?.azureClientId || auth?.azureTenantId) {
    return 'azure';
  }
  if (auth?.clientId) {
    return 'oauth';
  }
  return 'pat';
}

/** W3-3A: ElasticSearch auth branch, inferred from the stored authType —
 * an apiKey means apiAuth, anything else is basicAuth
 * (ADR:2026-11-10-leanforms-3a-elasticsearch-auth-mode). */
function elasticSearchAuthModeFromConfig(config: ServiceConnectionConfig): 'basicAuth' | 'apiAuth' {
  const auth = config.authType;
  if (auth && typeof auth === 'object' && typeof auth.apiKey === 'string') {
    return 'apiAuth';
  }
  return 'basicAuth';
}

/** W3-3A: ElasticSearch sslConfig certificates object (common/sslConfig.json
 * oneOf), or undefined when the stored sslConfig is the 3-leaf shape or
 * absent. The 'certificates' in-check narrows the sslConfig union without
 * a cast. */
function elasticSearchCertificatesFromConfig(
  config: ServiceConnectionConfig,
): EsSslCertPaths | EsSslCertValues | undefined {
  const ssl = config.sslConfig;
  if (ssl && typeof ssl === 'object' && 'certificates' in ssl) {
    return ssl.certificates;
  }
  return undefined;
}

/** W3-3A: which certificates branch the stored config uses — value leaves
 * mean the values branch, anything else (incl. absent) is the paths branch. */
function elasticSearchSslCertModeFromConfig(config: ServiceConnectionConfig): 'paths' | 'values' {
  const certs = elasticSearchCertificatesFromConfig(config);
  if (
    certs &&
    ('caCertValue' in certs || 'clientCertValue' in certs || 'privateKeyValue' in certs)
  ) {
    return 'values';
  }
  return 'paths';
}

/** W3-3A: mask the apiKey leaf of each Mcp server entry — the detail page
 * and the edit form never show a stored server apiKey in plaintext
 * (ADR:2026-11-10-leanforms-3a-mcp-servers-api-key). */
function maskServerApiKeys(
  servers: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return servers.map((server) =>
    typeof server.apiKey === 'string' ? { ...server, apiKey: '********' } : server,
  );
}

function applyPassword(
  config: ServiceConnectionConfig,
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): void {
  const typed = form.password?.trim() ?? '';
  if (form.serviceType === 'Databricks' || form.serviceType === 'UnityCatalog') {
    applyDatabricksAuth(config, form, existing);
    return;
  }
  if (shouldPersistSecret(typed)) {
    if (
      form.serviceType === 'Snowflake' ||
      form.serviceType === 'Kafka' ||
      form.serviceType === 'Redpanda' ||
      form.serviceType === 'Doris' ||
      form.serviceType === 'Mssql' ||
      form.serviceType === 'MariaDB' ||
      form.serviceType === 'Metabase'
    ) {
      config.password = typed;
    } else if (form.serviceType === 'Superset') {
      config.connection = {
        ...(typeof config.connection === 'object' && config.connection ? config.connection : {}),
        password: typed,
      };
    } else {
      config.authType = { password: typed };
    }
    return;
  }
  if (typed) {
    return;
  }
  const previous = pickPassword(existing);
  if (previous && isMaskedSecret(previous)) {
    if (
      form.serviceType === 'Snowflake' ||
      form.serviceType === 'Kafka' ||
      form.serviceType === 'Redpanda' ||
      form.serviceType === 'Doris' ||
      form.serviceType === 'Mssql' ||
      form.serviceType === 'MariaDB' ||
      form.serviceType === 'Metabase'
    ) {
      config.password = previous;
    } else if (form.serviceType === 'Superset') {
      config.connection = {
        ...(typeof config.connection === 'object' && config.connection ? config.connection : {}),
        password: previous,
      };
    } else {
      config.authType = { password: previous };
    }
  }
}

function applyDatabricksAuth(
  config: ServiceConnectionConfig,
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): void {
  const mode = form.authMode || 'pat';
  if (mode === 'oauth') {
    const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
    if (form.clientId?.trim()) {
      auth.clientId = form.clientId.trim();
    }
    const secret = form.clientSecret?.trim() ?? '';
    if (shouldPersistSecret(secret)) {
      auth.clientSecret = secret;
    } else if (!secret) {
      const prev = existing?.authType?.clientSecret;
      if (prev && isMaskedSecret(prev)) {
        auth.clientSecret = prev;
      }
    }
    config.authType = auth;
    return;
  }
  if (mode === 'azure') {
    const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
    if (form.azureClientId?.trim()) {
      auth.azureClientId = form.azureClientId.trim();
    }
    if (form.azureTenantId?.trim()) {
      auth.azureTenantId = form.azureTenantId.trim();
    }
    const secret = form.azureClientSecret?.trim() ?? '';
    if (shouldPersistSecret(secret)) {
      auth.azureClientSecret = secret;
    } else if (!secret) {
      const prev = existing?.authType?.azureClientSecret;
      if (prev && isMaskedSecret(prev)) {
        auth.azureClientSecret = prev;
      }
    }
    config.authType = auth;
    return;
  }
  const token = form.password?.trim() ?? '';
  if (shouldPersistSecret(token)) {
    config.authType = { token };
    return;
  }
  if (!token) {
    const prev = existing?.authType?.token;
    if (prev && isMaskedSecret(prev)) {
      config.authType = { token: prev };
    }
  }
}


/** JSON-object text (connectionOptions/connectionArguments) back to a form string. */
function stringifyJsonMap(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  if (!Object.keys(value as Record<string, unknown>).length) {
    return '';
  }
  return JSON.stringify(value);
}

/**
 * Parse a JSON-object textarea (connectionOptions/connectionArguments) into a
 * string map. Invalid JSON, a non-object, or a non-string value throws
 * instead of sending a schema-invalid config (all 11 database schemas are
 * additionalProperties: false with string map values).
 */
function parseJsonMap(raw: string | undefined, field: string): Record<string, string> | undefined {
  const text = raw?.trim() ?? '';
  if (!text) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${field} must be a valid JSON object`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object`);
  }
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val !== 'string') {
      throw new Error(`${field} values must be strings`);
    }
    out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Parse a JSON-object textarea whose values may be any JSON type (Kafka
 * consumerConfig / schemaRegistryConfig: additionalProperties: true).
 * Unlike parseJsonMap it must NOT reject numbers, booleans, or nested
 * objects (ADR:2026-11-08-leanforms-tier2-kafka-config-parser).
 */
function parseJsonObject(raw: string | undefined, field: string): Record<string, unknown> | undefined {
  const text = raw?.trim() ?? '';
  if (!text) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${field} must be a valid JSON object`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object`);
  }
  const out = parsed as Record<string, unknown>;
  return Object.keys(out).length ? out : undefined;
}

/**
 * W3-3A: parse a JSON-array textarea (Mcp configFilePaths / servers) into a
 * typed array. Invalid JSON, a non-array, or an element failing the check
 * throws instead of sending a schema-invalid config — the same discipline
 * as parseJsonMap / parseJsonObject, for arrays.
 */
function parseJsonArray<T>(
  raw: string | undefined,
  field: string,
  elementCheck: (element: unknown) => element is T,
  elementDescription: string,
): T[] | undefined {
  const text = raw?.trim() ?? '';
  if (!text) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${field} must be a valid JSON array`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON array`);
  }
  for (const element of parsed) {
    if (!elementCheck(element)) {
      throw new Error(`${field} elements must be ${elementDescription}`);
    }
  }
  return parsed.length ? parsed : undefined;
}

function isJsonString(element: unknown): element is string {
  return typeof element === 'string';
}

function isJsonObject(element: unknown): element is Record<string, unknown> {
  return !!element && typeof element === 'object' && !Array.isArray(element);
}

/**
 * Secret-field discipline shared by the new secret leaves (Snowflake
 * privateKey/passphrase, sslConfig leaves): same rules as applyPassword —
 * a typed literal is sent as entered; a blank field preserves a masked
 * previous value; anything else is dropped, never sent.
 */
function secretFieldValue(
  typed: string | undefined,
  previous: string | undefined,
): string | undefined {
  const value = typed?.trim() ?? '';
  if (shouldPersistSecret(value)) {
    return value;
  }
  if (!value && previous && isMaskedSecret(previous)) {
    return previous;
  }
  return undefined;
}

/**
 * A filter-pattern value worth sending: at least one includes or excludes
 * entry. An empty object (or a missing value) means "not set" and is
 * omitted, never sent as `{}` — the same rule the filter step applies
 * when it drops undefined values on submit.
 */
function nonEmptyFilterPattern(
  value: FilterPatternConfig | undefined,
): FilterPatternConfig | undefined {
  if (!value) {
    return undefined;
  }
  const entries = (value.includes?.length ?? 0) + (value.excludes?.length ?? 0);
  return entries > 0 ? value : undefined;
}

/**
 * One sslConfig group (validateSSLClientConfig) from the form: the three PEM
 * leaves under the secret discipline, read from the caller's key triplet and
 * preserved against the caller's previously stored group. Each sslConfig
 * group gets its own triplet — sharing keys across groups in one form would
 * write one group's PEM into the other
 * (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups). The triplet is spelled
 * out as literal unions (not keyof ServiceFormValues) so the reads stay
 * string-typed with no cast.
 */
interface SslLeafFormKeys {
  caCertificate:
    | 'sslCaCertificate'
    | 'consumerConfigSSLCaCertificate'
    | 'schemaRegistrySSLCaCertificate'
    | 'supersetSSLCaCertificate'
    | 'restSSLCaCertificate'
    | 'openMetadataSSLCaCertificate'
    | 'alationDbSslCaCertificate';
  sslCertificate:
    | 'sslCertificate'
    | 'consumerConfigSSLCertificate'
    | 'schemaRegistrySSLCertificate'
    | 'supersetSSLCertificate'
    | 'restSSLCertificate'
    | 'openMetadataSSLCertificate'
    | 'alationDbSslCertificate';
  sslKey:
    | 'sslKey'
    | 'consumerConfigSSLKey'
    | 'schemaRegistrySSLKey'
    | 'supersetSSLKey'
    | 'restSSLKey'
    | 'openMetadataSSLKey'
    | 'alationDbSslKey';
}

function sslConfigFromFormKeys(
  form: ServiceFormValues,
  keys: SslLeafFormKeys,
  previous?: SslClientConfig,
): Record<string, string> | undefined {
  const sslConfig: Record<string, string> = {};
  for (const outKey of ['caCertificate', 'sslCertificate', 'sslKey'] as const) {
    const value = secretFieldValue(form[keys[outKey]], previous?.[outKey]);
    if (value) {
      sslConfig[outKey] = value;
    }
  }
  return Object.keys(sslConfig).length ? sslConfig : undefined;
}

/** Narrow a stored sslConfig to the 3-leaf validateSSLClientConfig shape
 * (Rest / OpenMetadata / database types). The ElasticSearch certificates
 * oneOf shape is not a 3-leaf group — it has its own builder below. */
function asSslClientConfig(
  value: SslClientConfig | ElasticSearchSslConfig | undefined,
): SslClientConfig | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return 'caCertificate' in value || 'sslCertificate' in value || 'sslKey' in value
    ? value
    : undefined;
}

function sslConfigFromForm(
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): Record<string, string> | undefined {
  return sslConfigFromFormKeys(
    form,
    { caCertificate: 'sslCaCertificate', sslCertificate: 'sslCertificate', sslKey: 'sslKey' },
    asSslClientConfig(existing?.sslConfig),
  );
}

/**
 * W3-3A: ElasticSearch sslConfig (common/sslConfig.json) from the form —
 * the certificates oneOf: the paths branch (three file paths) or the
 * values branch (three secret values + staging dir). Only the selected
 * branch's leaves are emitted, so stale values left in the hidden branch
 * never leak into the other oneOf arm. The value leaves follow the secret
 * discipline against the stored certificates.
 */
function elasticSearchSslConfigFromForm(
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): ElasticSearchSslConfig | undefined {
  const mode =
    form.sslCertMode ??
    (form.sslCaCertValue?.trim() || form.sslClientCertValue?.trim() || form.sslPrivateKeyValue?.trim()
      ? 'values'
      : 'paths');
  const prev = elasticSearchCertificatesFromConfig(existing ?? {});
  const prevValues = prev && 'caCertValue' in prev ? prev : undefined;
  if (mode === 'values') {
    const certificates: EsSslCertValues = {};
    const caCertValue = secretFieldValue(form.sslCaCertValue, prevValues?.caCertValue);
    if (caCertValue) {
      certificates.caCertValue = caCertValue;
    }
    const clientCertValue = secretFieldValue(form.sslClientCertValue,
      prevValues?.clientCertValue,
    );
    if (clientCertValue) {
      certificates.clientCertValue = clientCertValue;
    }
    const privateKeyValue = secretFieldValue(form.sslPrivateKeyValue,
      prevValues?.privateKeyValue,
    );
    if (privateKeyValue) {
      certificates.privateKeyValue = privateKeyValue;
    }
    if (form.sslStagingDir?.trim()) {
      certificates.stagingDir = form.sslStagingDir.trim();
    }
    return Object.keys(certificates).length ? { certificates } : undefined;
  }
  const certificates: EsSslCertPaths = {};
  if (form.sslCaCertPath?.trim()) {
    certificates.caCertPath = form.sslCaCertPath.trim();
  }
  if (form.sslClientCertPath?.trim()) {
    certificates.clientCertPath = form.sslClientCertPath.trim();
  }
  if (form.sslPrivateKeyPath?.trim()) {
    certificates.privateKeyPath = form.sslPrivateKeyPath.trim();
  }
  return Object.keys(certificates).length ? { certificates } : undefined;
}

/**
 * W3-3A: Mcp servers apiKey retention (ADR:2026-11-10-leanforms-3a-mcp-servers-api-key).
 * The edit refill puts the masked value in each server's apiKey, so a
 * masked (or blank) apiKey restores the previous value matched by server
 * name. A fresh literal is sent as entered. A masked value with
 * no name match — e.g. the server was renamed — is omitted: never store
 * the literal mask, and never claim retention after a rename.
 */
function mcpServerApiKey(
  typed: string | undefined,
  previousServers: Array<Record<string, unknown>> | undefined,
  name: unknown,
): string | undefined {
  const value = typed?.trim() ?? '';
  if (shouldPersistSecret(value)) {
    return value;
  }
  if (value && !isMaskedSecret(value)) {
    return undefined;
  }
  const previous = previousServers?.find((server) => server.name === name);
  const prevKey = previous && typeof previous.apiKey === 'string' ? previous.apiKey : undefined;
  return prevKey && isMaskedSecret(prevKey) ? prevKey : undefined;
}

/** W3-3A: preserve stored GoogleDrive credentials when no new credentials
 * were entered — wrapped credentials stay wrapped; legacy bare credentials
 * are re-wrapped (content-preserving; the bare shape is schema-invalid and
 * fails ingestion). An empty bare object preserves nothing. */
function preservedGoogleDriveCredentials(
  existing: ServiceConnection | undefined,
): { gcpConfig: Record<string, unknown> } | undefined {
  const credentials = existing?.config?.credentials;
  if (!credentials || typeof credentials !== 'object') {
    return undefined;
  }
  const gcpConfig = credentials.gcpConfig;
  if (gcpConfig && typeof gcpConfig === 'object' && !Array.isArray(gcpConfig)) {
    return { gcpConfig };
  }
  const bare: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (key !== 'gcpImpersonateServiceAccount') {
      bare[key] = value;
    }
  }
  return Object.keys(bare).length ? { gcpConfig: bare } : undefined;
}

/**
 * T-2 (2026-11-20): the `supportsMaskedAccess` default differs by type —
 * Snowflake's spec default is true, Databricks / UnityCatalog's is false
 * (see each schema's `policyAgentConfig.default`). The shared helper
 * previously emitted true for all three.
 */
function policyAgentConfigFromForm(
  form: ServiceFormValues,
  serviceType?: string,
): Record<string, boolean> {
  return {
    enabled: form.policyAgentEnabled ?? true,
    supportsColumnAccess: form.policyAgentSupportsColumnAccess ?? false,
    supportsFullAccess: form.policyAgentSupportsFullAccess ?? true,
    supportsMaskedAccess:
      form.policyAgentSupportsMaskedAccess ??
      (serviceType === 'Databricks' || serviceType === 'UnityCatalog' ? false : true),
  };
}

/**
 * T-2 (2026-11-20): the top-level `awsConfig` object (s3Connection.json /
 * sageMakerConnection.json share the AWSCredentials shape). Secrets follow
 * the blank-means-keep discipline against the stored awsConfig.
 */
function buildTopLevelAwsConfig(
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): NonNullable<ServiceConnectionConfig['awsConfig']> {
  const awsConfig: NonNullable<ServiceConnectionConfig['awsConfig']> = {};
  if (typeof form.awsIamEnabled === 'boolean') {
    awsConfig.enabled = form.awsIamEnabled;
  }
  if (form.awsRegion?.trim()) {
    awsConfig.awsRegion = form.awsRegion.trim();
  }
  if (form.awsAccessKeyId?.trim()) {
    awsConfig.awsAccessKeyId = form.awsAccessKeyId.trim();
  }
  if (form.awsEndPointURL?.trim()) {
    awsConfig.endPointURL = form.awsEndPointURL.trim();
  }
  if (form.awsProfileName?.trim()) {
    awsConfig.profileName = form.awsProfileName.trim();
  }
  if (form.assumeRoleArn?.trim()) {
    awsConfig.assumeRoleArn = form.assumeRoleArn.trim();
  }
  if (form.assumeRoleSessionName?.trim()) {
    awsConfig.assumeRoleSessionName = form.assumeRoleSessionName.trim();
  }
  if (form.assumeRoleSourceIdentity?.trim()) {
    awsConfig.assumeRoleSourceIdentity = form.assumeRoleSourceIdentity.trim();
  }
  const secret = form.awsSecretAccessKey?.trim() ?? '';
  if (shouldPersistSecret(secret)) {
    awsConfig.awsSecretAccessKey = secret;
  } else if (!secret) {
    const prev = existing?.awsConfig?.awsSecretAccessKey;
    if (prev && isMaskedSecret(prev)) {
      awsConfig.awsSecretAccessKey = prev;
    }
  }
  const session = form.awsSessionToken?.trim() ?? '';
  if (shouldPersistSecret(session)) {
    awsConfig.awsSessionToken = session;
  } else if (!session) {
    const prev = existing?.awsConfig?.awsSessionToken;
    if (prev && isMaskedSecret(prev)) {
      awsConfig.awsSessionToken = prev;
    }
  }
  return awsConfig;
}

/**
 * A2 (2026-11-19): the Alation nested database connection
 * (alationConnection.json `connection` oneOf: PostgresConnection /
 * MysqlConnection). The nested leaves use the `alationDb*` form keys; the
 * IAM/Azure/GCP branches reuse the shared builders with a synthetic
 * `{ authType: nestedPrev }` existing object, so their prev-secret lookups
 * resolve to the nested path. A Postgres+gcp combination emits no auth
 * leaves — the pin Postgres branch has no GCP option, and the combination
 * is schema-valid (no required on the nested authType).
 */
function buildAlationDbConnection(
  form: ServiceFormValues,
  prev: ServiceConnectionConfig['connection'],
  branch: 'postgres' | 'mysql',
): NonNullable<ServiceConnectionConfig['connection']> {
  const nested: NonNullable<ServiceConnectionConfig['connection']> = {
    type: branch === 'postgres' ? 'Postgres' : 'Mysql',
  };
  nested.scheme =
    branch === 'postgres'
      ? form.alationDbScheme?.trim() || 'postgresql+psycopg2'
      : 'mysql+pymysql';
  if (form.alationDbUsername?.trim()) {
    nested.username = form.alationDbUsername.trim();
  }
  const authBranch = form.alationDbAuthBranch ?? 'basic';
  const prevAuth = prev?.authType;
  const prevExisting = prevAuth ? { authType: prevAuth } : undefined;
  if (authBranch === 'iam') {
    const auth = buildIamAuthType(form, prevExisting);
    if (auth) {
      nested.authType = auth;
    }
  } else if (authBranch === 'azure') {
    const auth = buildAzureAuthType(form, prevExisting);
    if (auth) {
      nested.authType = auth;
    }
  } else if (authBranch === 'gcp') {
    if (branch === 'mysql') {
      nested.authType = buildGcpAuthType(form, prevExisting);
    }
  } else {
    const password = secretFieldValue(
      form.alationDbPassword,
      typeof prevAuth?.password === 'string' ? prevAuth.password : undefined,
    );
    if (password) {
      nested.authType = { password };
    }
  }
  if (form.alationDbHostPort?.trim()) {
    nested.hostPort = form.alationDbHostPort.trim();
  }
  if (branch === 'postgres') {
    if (form.alationDbDatabase?.trim()) {
      nested.database = form.alationDbDatabase.trim();
    }
    if (typeof form.alationDbIngestAllDatabases === 'boolean') {
      nested.ingestAllDatabases = form.alationDbIngestAllDatabases;
    }
    if (form.alationDbSslMode?.trim()) {
      nested.sslMode = form.alationDbSslMode.trim();
    }
    const sslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'alationDbSslCaCertificate',
        sslCertificate: 'alationDbSslCertificate',
        sslKey: 'alationDbSslKey',
      },
      asSslClientConfig(prev?.sslConfig),
    );
    if (sslConfig) {
      nested.sslConfig = sslConfig;
    }
    if (form.alationDbClassificationName?.trim()) {
      nested.classificationName = form.alationDbClassificationName.trim();
    }
    if (form.alationDbQueryStatementSource?.trim()) {
      nested.queryStatementSource = form.alationDbQueryStatementSource.trim();
    }
  } else {
    if (form.alationDbDatabaseName?.trim()) {
      nested.databaseName = form.alationDbDatabaseName.trim();
    }
    if (form.alationDbDatabaseSchema?.trim()) {
      nested.databaseSchema = form.alationDbDatabaseSchema.trim();
    }
    const sslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'alationDbSslCaCertificate',
        sslCertificate: 'alationDbSslCertificate',
        sslKey: 'alationDbSslKey',
      },
      asSslClientConfig(prev?.sslConfig),
    );
    if (sslConfig) {
      nested.sslConfig = sslConfig;
    }
    if (typeof form.alationDbUseSlowLogs === 'boolean') {
      nested.useSlowLogs = form.alationDbUseSlowLogs;
    }
    if (form.alationDbQueryHistoryTable?.trim()) {
      nested.queryHistoryTable = form.alationDbQueryHistoryTable.trim();
    }
  }
  const connectionOptions = parseJsonMap(
    form.alationDbConnectionOptions,
    'Connection options',
  );
  if (connectionOptions) {
    nested.connectionOptions = connectionOptions;
  }
  const connectionArguments = parseJsonMap(
    form.alationDbConnectionArguments,
    'Connection arguments',
  );
  if (connectionArguments) {
    nested.connectionArguments = connectionArguments;
  }
  return nested;
}

/**
 * T-2 (2026-11-20): Superset's nested `connection` oneOf
 * (supersetConnection.json — SupersetApiConnection / PostgresConnection /
 * MysqlConnection). Mirrors `buildAlationDbConnection`: the nested database
 * leaves use the `supersetDb*` form keys, the auth branch uses the shared
 * `authAws*` / `authAzure*` / `authGcp*` keys, and the basic password is
 * the nested `supersetDbPassword` (the top-level `password` is the
 * Superset API auth, never the nested database auth).
 */
function buildSupersetDbConnection(
  form: ServiceFormValues,
  prev: ServiceConnectionConfig['connection'],
  branch: 'postgres' | 'mysql',
): NonNullable<ServiceConnectionConfig['connection']> {
  const nested: NonNullable<ServiceConnectionConfig['connection']> = {
    type: branch === 'postgres' ? 'Postgres' : 'Mysql',
  };
  nested.scheme =
    branch === 'postgres'
      ? form.supersetDbScheme?.trim() || 'postgresql+psycopg2'
      : 'mysql+pymysql';
  if (form.supersetDbUsername?.trim()) {
    nested.username = form.supersetDbUsername.trim();
  }
  const authBranch = form.supersetDbAuthBranch ?? 'basic';
  const prevAuth = prev?.authType;
  const prevExisting = prevAuth ? { authType: prevAuth } : undefined;
  if (authBranch === 'iam') {
    const auth = buildIamAuthType(form, prevExisting);
    if (auth) {
      nested.authType = auth;
    }
  } else if (authBranch === 'azure') {
    const auth = buildAzureAuthType(form, prevExisting);
    if (auth) {
      nested.authType = auth;
    }
  } else if (authBranch === 'gcp') {
    if (branch === 'mysql') {
      nested.authType = buildGcpAuthType(form, prevExisting);
    }
  } else {
    const password = secretFieldValue(
      form.supersetDbPassword,
      typeof prevAuth?.password === 'string' ? prevAuth.password : undefined,
    );
    if (password) {
      nested.authType = { password };
    }
  }
  if (form.supersetDbHostPort?.trim()) {
    nested.hostPort = form.supersetDbHostPort.trim();
  }
  if (branch === 'postgres') {
    if (form.supersetDbDatabase?.trim()) {
      nested.database = form.supersetDbDatabase.trim();
    }
    if (typeof form.supersetDbIngestAllDatabases === 'boolean') {
      nested.ingestAllDatabases = form.supersetDbIngestAllDatabases;
    }
    if (form.supersetDbSslMode?.trim()) {
      nested.sslMode = form.supersetDbSslMode.trim();
    }
    const sslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'supersetDbSslCaCertificate',
        sslCertificate: 'supersetDbSslCertificate',
        sslKey: 'supersetDbSslKey',
      },
      asSslClientConfig(prev?.sslConfig),
    );
    if (sslConfig) {
      nested.sslConfig = sslConfig;
    }
    if (form.supersetDbClassificationName?.trim()) {
      nested.classificationName = form.supersetDbClassificationName.trim();
    }
    if (form.supersetDbQueryStatementSource?.trim()) {
      nested.queryStatementSource = form.supersetDbQueryStatementSource.trim();
    }
  } else {
    if (form.supersetDbDatabaseName?.trim()) {
      nested.databaseName = form.supersetDbDatabaseName.trim();
    }
    if (form.supersetDbDatabaseSchema?.trim()) {
      nested.databaseSchema = form.supersetDbDatabaseSchema.trim();
    }
    const sslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'supersetDbSslCaCertificate',
        sslCertificate: 'supersetDbSslCertificate',
        sslKey: 'supersetDbSslKey',
      },
      asSslClientConfig(prev?.sslConfig),
    );
    if (sslConfig) {
      nested.sslConfig = sslConfig;
    }
    if (typeof form.supersetDbUseSlowLogs === 'boolean') {
      nested.useSlowLogs = form.supersetDbUseSlowLogs;
    }
    if (form.supersetDbQueryHistoryTable?.trim()) {
      nested.queryHistoryTable = form.supersetDbQueryHistoryTable.trim();
    }
  }
  const connectionOptions = parseJsonMap(
    form.supersetDbConnectionOptions,
    'Connection options',
  );
  if (connectionOptions) {
    nested.connectionOptions = connectionOptions;
  }
  const connectionArguments = parseJsonMap(
    form.supersetDbConnectionArguments,
    'Connection arguments',
  );
  if (connectionArguments) {
    nested.connectionArguments = connectionArguments;
  }
  return nested;
}

/**
 * T-2 (2026-11-20): four connection schemas allow a type-only payload
 * (Sklearn / CustomDrive / CustomMlModel / CustomSearch — every leaf
 * optional, required is [] or ['type']). The empty-body guard must not
 * block them: an empty form IS the connection for these types. The
 * form-level Q4 check (ConnectionConfigForm.submit) reads the same list
 * — one source of truth, never a second copy of the condition.
 */
export const TYPE_ONLY_CONNECTION_TYPES: readonly string[] = [
  'Sklearn',
  'CustomDrive',
  'CustomMlModel',
  'CustomSearch',
];

export function buildServiceConnection(
  form: ServiceFormValues,
  existing?: ServiceConnection,
): ServiceConnection | undefined {
  const type = form.serviceType;
  const config: ServiceConnectionConfig = { type };

  if (type === 'Postgres') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
    // Wave 0 lean-forms (R-T1.1): scheme always emitted (spec default
    // postgresql+psycopg2); sslMode emitted when set (empty form pre-fills
    // 'disable'); sslConfig leaves follow the secret discipline.
    config.scheme = form.scheme?.trim() || 'postgresql+psycopg2';
    if (typeof form.ingestAllDatabases === 'boolean') {
      config.ingestAllDatabases = form.ingestAllDatabases;
    }
    if (form.sslMode?.trim()) {
      config.sslMode = form.sslMode.trim();
    }
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
    if (form.classificationName?.trim()) {
      config.classificationName = form.classificationName.trim();
    }
    if (form.queryStatementSource?.trim()) {
      config.queryStatementSource = form.queryStatementSource.trim();
    }
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Mysql') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.databaseName?.trim()) {
      config.databaseName = form.databaseName.trim();
    }
    if (form.databaseSchema?.trim()) {
      config.databaseSchema = form.databaseSchema.trim();
    }
    if (form.queryHistoryTable?.trim()) {
      config.queryHistoryTable = form.queryHistoryTable.trim();
    }
    // Wave 0 lean-forms (R-T1.2): single-option scheme is a builder fixed
    // value; useSlowLogs pairs with queryHistoryTable (mysql spec).
    config.scheme = 'mysql+pymysql';
    if (typeof form.useSlowLogs === 'boolean') {
      config.useSlowLogs = form.useSlowLogs;
    }
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'VertexAI') {
    // A2 (2026-11-19): pin vertexaiConnection.json — credentials
    // { gcpConfig oneOf, gcpImpersonateServiceAccount? } + location
    // (required). The Mysql GCP password/enableIamAuth head fields are NOT
    // part of this schema, so buildGcpVariant (not buildGcpAuthType) builds
    // the variant; the impersonate block nests under `credentials` beside
    // gcpConfig, not inside a gcpConfig wrapper.
    const prevCredentials = existing?.config?.credentials;
    const prevGcp =
      prevCredentials && typeof prevCredentials === 'object'
        ? prevCredentials.gcpConfig
        : undefined;
    const credentials: NonNullable<ServiceConnectionConfig['credentials']> = {
      gcpConfig: buildGcpVariant(form, prevGcp),
    };
    const impersonate = buildGcpImpersonateServiceAccount(form);
    if (impersonate) {
      credentials.gcpImpersonateServiceAccount = impersonate;
    }
    config.credentials = credentials;
    if (form.location?.trim()) {
      config.location = form.location.trim();
    }
  } else if (type === 'Alation') {
    // A2 (2026-11-19): pin alationConnection.json — top-level hostPort +
    // authType oneOf (BasicAuth {username, password} / ApiAccessTokenAuth
    // {accessToken}) + connection oneOf (Postgres / Mysql / None) + the
    // Alation API settings. The nested connection is built by
    // buildAlationDbConnection below.
    const prev = existing?.config;
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if ((form.alationAuthBranch ?? 'basicAuth') === 'apiToken') {
      const token = secretFieldValue(
        form.alationAccessToken,
        typeof prev?.authType?.accessToken === 'string' ? prev.authType.accessToken : undefined,
      );
      if (token) {
        config.authType = { accessToken: token };
      }
    } else {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      if (form.username?.trim()) {
        auth.username = form.username.trim();
      }
      const password = secretFieldValue(
        form.password,
        typeof prev?.authType?.password === 'string' ? prev.authType.password : undefined,
      );
      if (password) {
        auth.password = password;
      }
      if (Object.keys(auth).length) {
        config.authType = auth;
      }
    }
    const connBranch = form.alationConnectionBranch ?? 'postgres';
    if (connBranch !== 'none') {
      config.connection = buildAlationDbConnection(form, prev?.connection, connBranch);
    }
    if (form.projectName?.trim()) {
      config.projectName = form.projectName.trim();
    }
    if (typeof form.paginationLimit === 'number') {
      config.paginationLimit = form.paginationLimit;
    }
    if (typeof form.includeUndeployedDatasources === 'boolean') {
      config.includeUndeployedDatasources = form.includeUndeployedDatasources;
    }
    if (typeof form.includeHiddenDatasources === 'boolean') {
      config.includeHiddenDatasources = form.includeHiddenDatasources;
    }
    if (typeof form.ingestDatasources === 'boolean') {
      config.ingestDatasources = form.ingestDatasources;
    }
    if (typeof form.ingestUsersAndGroups === 'boolean') {
      config.ingestUsersAndGroups = form.ingestUsersAndGroups;
    }
    if (typeof form.ingestDomains === 'boolean') {
      config.ingestDomains = form.ingestDomains;
    }
    if (typeof form.ingestKnowledgeArticles === 'boolean') {
      config.ingestKnowledgeArticles = form.ingestKnowledgeArticles;
    }
    if (typeof form.ingestDashboards === 'boolean') {
      config.ingestDashboards = form.ingestDashboards;
    }
    if (form.alationTagClassificationName?.trim()) {
      config.alationTagClassificationName = form.alationTagClassificationName.trim();
    }
    const alationConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (alationConnectionOptions) {
      config.connectionOptions = alationConnectionOptions;
    }
    const alationConnectionArguments = parseJsonMap(
      form.connectionArguments,
      'Connection arguments',
    );
    if (alationConnectionArguments) {
      config.connectionArguments = alationConnectionArguments;
    }
  } else if (type === 'Collibra') {
    // A2 (2026-11-19): pin collibraConnection.json — flat username /
    // password / hostPort + glossary/domain filter patterns +
    // enableEnrichment + connectionOptions / connectionArguments. The
    // filter leaves live in BOTH the connection form (Scope section) and
    // the filter step, as in pin; both edit the same `connection.config`
    // keys, and only a non-empty pattern is written.
    const prev = existing?.config;
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    const password = secretFieldValue(
      form.password,
      typeof prev?.password === 'string' ? prev.password : undefined,
    );
    if (password) {
      config.password = password;
    }
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const glossaryFilterPattern = nonEmptyFilterPattern(form.glossaryFilterPattern);
    if (glossaryFilterPattern) {
      config.glossaryFilterPattern = glossaryFilterPattern;
    }
    const domainFilterPattern = nonEmptyFilterPattern(form.domainFilterPattern);
    if (domainFilterPattern) {
      config.domainFilterPattern = domainFilterPattern;
    }
    if (typeof form.enableEnrichment === 'boolean') {
      config.enableEnrichment = form.enableEnrichment;
    }
    const collibraConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (collibraConnectionOptions) {
      config.connectionOptions = collibraConnectionOptions;
    }
    const collibraConnectionArguments = parseJsonMap(
      form.connectionArguments,
      'Connection arguments',
    );
    if (collibraConnectionArguments) {
      config.connectionArguments = collibraConnectionArguments;
    }
  } else if (type === 'MetadataES') {
    // A2 (2026-11-19): pin metadataESConnection.json — entities (string
    // array, JSON textarea) + recreateIndex + runMode +
    // searchIndexMappingLanguage + batchSize. No required array, no secret
    // leaves.
    const entities = parseJsonArray(form.metadataESEntities, 'Entities', isJsonString, 'strings');
    if (entities) {
      config.entities = entities;
    }
    if (typeof form.recreateIndex === 'boolean') {
      config.recreateIndex = form.recreateIndex;
    }
    if (form.runMode?.trim()) {
      config.runMode = form.runMode.trim();
    }
    if (form.searchIndexMappingLanguage?.trim()) {
      config.searchIndexMappingLanguage = form.searchIndexMappingLanguage.trim();
    }
    if (typeof form.batchSize === 'number') {
      config.batchSize = form.batchSize;
    }
  } else if (type === 'SharePoint') {
    // A2 (2026-11-19): pin sharePointConnection.json — clientId /
    // clientSecret / tenantId / siteUrl (required) + siteName / driveId +
    // connectionOptions / connectionArguments. clientSecret follows the
    // secret discipline; siteUrl is emitted exactly as typed (the pin
    // default is a placeholder, never prefilled).
    const prev = existing?.config;
    if (form.clientId?.trim()) {
      config.clientId = form.clientId.trim();
    }
    const clientSecret = secretFieldValue(
      form.clientSecret,
      typeof prev?.clientSecret === 'string' ? prev.clientSecret : undefined,
    );
    if (clientSecret) {
      config.clientSecret = clientSecret;
    }
    if (form.tenantId?.trim()) {
      config.tenantId = form.tenantId.trim();
    }
    if (form.siteUrl?.trim()) {
      config.siteUrl = form.siteUrl.trim();
    }
    if (form.siteName?.trim()) {
      config.siteName = form.siteName.trim();
    }
    if (form.driveId?.trim()) {
      config.driveId = form.driveId.trim();
    }
    const sharePointConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (sharePointConnectionOptions) {
      config.connectionOptions = sharePointConnectionOptions;
    }
    const sharePointConnectionArguments = parseJsonMap(
      form.connectionArguments,
      'Connection arguments',
    );
    if (sharePointConnectionArguments) {
      config.connectionArguments = sharePointConnectionArguments;
    }
  } else if (type === 'Snowflake') {
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.account?.trim()) {
      config.account = form.account.trim();
    }
    if (form.warehouse?.trim()) {
      config.warehouse = form.warehouse.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
    if (form.role?.trim()) {
      config.role = form.role.trim();
    }
    // Wave 0 lean-forms (R-T1.5): single-option scheme is a builder fixed
    // value; privateKey/passphrase follow the secret discipline (typed
    // literals are sent as entered, masked previous preserved).
    config.scheme = 'snowflake';
    if (form.queryTag?.trim()) {
      config.queryTag = form.queryTag.trim();
    }
    if (form.accountUsageSchema?.trim()) {
      config.accountUsageSchema = form.accountUsageSchema.trim();
    }
    if (typeof form.systemMetricsBatchSize === 'number') {
      config.systemMetricsBatchSize = form.systemMetricsBatchSize;
    }
    const prevConfig = existing?.config;
    const privateKey = secretFieldValue(form.privateKey,
      typeof prevConfig?.privateKey === 'string' ? prevConfig.privateKey : undefined,
    );
    if (privateKey) {
      config.privateKey = privateKey;
    }
    const passphrase = secretFieldValue(form.snowflakePrivatekeyPassphrase,
      typeof prevConfig?.snowflakePrivatekeyPassphrase === 'string'
        ? prevConfig.snowflakePrivatekeyPassphrase
        : undefined,
    );
    if (passphrase) {
      config.snowflakePrivatekeyPassphrase = passphrase;
    }
    if (typeof form.includeTransientTables === 'boolean') {
      config.includeTransientTables = form.includeTransientTables;
    }
    if (typeof form.includeStreams === 'boolean') {
      config.includeStreams = form.includeStreams;
    }
    if (typeof form.includeStages === 'boolean') {
      config.includeStages = form.includeStages;
    }
    if (typeof form.includeSemanticViews === 'boolean') {
      config.includeSemanticViews = form.includeSemanticViews;
    }
    if (typeof form.clientSessionKeepAlive === 'boolean') {
      config.clientSessionKeepAlive = form.clientSessionKeepAlive;
    }
    if (typeof form.useAccessHistory === 'boolean') {
      config.useAccessHistory = form.useAccessHistory;
    }
    if (typeof form.accessHistoryChunkSize === 'number') {
      config.accessHistoryChunkSize = form.accessHistoryChunkSize;
    }
    if (typeof form.creditCost === 'number') {
      config.creditCost = form.creditCost;
    }
    if (form.snowflakeSourceHost?.trim()) {
      config.snowflakeSourceHost = form.snowflakeSourceHost.trim();
    }
    config.policyAgentConfig = policyAgentConfigFromForm(form, 'Snowflake');
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Kafka' || type === 'Redpanda') {
    // W2-5 lean-forms tier 2 (R-T1 Kafka/Redpanda, de-noised): no showWhen
    // linkage — the specs do not gate the SASL fields on securityProtocol.
    if (form.bootstrapServers?.trim()) {
      config.bootstrapServers = form.bootstrapServers.trim();
    }
    if (form.schemaRegistryURL?.trim()) {
      config.schemaRegistryURL = form.schemaRegistryURL.trim();
    }
    if (form.saslUsername?.trim()) {
      config.saslUsername = form.saslUsername.trim();
    }
    const prevConfig = existing?.config;
    const saslPassword = secretFieldValue(form.saslPassword,
      typeof prevConfig?.saslPassword === 'string' ? prevConfig.saslPassword : undefined,
    );
    if (saslPassword) {
      config.saslPassword = saslPassword;
    }
    if (form.securityProtocol?.trim()) {
      config.securityProtocol = form.securityProtocol.trim();
    }
    if (form.saslMechanism?.trim()) {
      config.saslMechanism = form.saslMechanism.trim();
    }
    const basicAuthUserInfo = secretFieldValue(form.basicAuthUserInfo,
      typeof prevConfig?.basicAuthUserInfo === 'string' ? prevConfig.basicAuthUserInfo : undefined,
    );
    if (basicAuthUserInfo) {
      config.basicAuthUserInfo = basicAuthUserInfo;
    }
    const consumerConfig = parseJsonObject(form.consumerConfig, 'Consumer config');
    if (consumerConfig) {
      config.consumerConfig = consumerConfig;
    }
    const schemaRegistryConfig = parseJsonObject(form.schemaRegistryConfig, 'Schema Registry config');
    if (schemaRegistryConfig) {
      config.schemaRegistryConfig = schemaRegistryConfig;
    }
    if (form.schemaRegistryTopicSuffixName?.trim()) {
      config.schemaRegistryTopicSuffixName = form.schemaRegistryTopicSuffixName.trim();
    }
    if (type === 'Kafka') {
      // Two independent sslConfig groups: each its own key triplet and its
      // own previously stored object (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups).
      const consumerConfigSSL = sslConfigFromFormKeys(
        form,
        {
          caCertificate: 'consumerConfigSSLCaCertificate',
          sslCertificate: 'consumerConfigSSLCertificate',
          sslKey: 'consumerConfigSSLKey',
        },
        prevConfig?.consumerConfigSSL,
      );
      if (consumerConfigSSL) {
        config.consumerConfigSSL = consumerConfigSSL;
      }
      const schemaRegistrySSL = sslConfigFromFormKeys(
        form,
        {
          caCertificate: 'schemaRegistrySSLCaCertificate',
          sslCertificate: 'schemaRegistrySSLCertificate',
          sslKey: 'schemaRegistrySSLKey',
        },
        prevConfig?.schemaRegistrySSL,
      );
      if (schemaRegistrySSL) {
        config.schemaRegistrySSL = schemaRegistrySSL;
      }
    }
  } else if (type === 'Doris') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.databaseName?.trim()) {
      config.databaseName = form.databaseName.trim();
    }
    if (form.databaseSchema?.trim()) {
      config.databaseSchema = form.databaseSchema.trim();
    }
    config.scheme = 'doris';
    // Wave 0 lean-forms (R-T1.8).
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Mssql') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
    config.scheme = (form.scheme?.trim() || 'mssql+pytds');
    if (form.driver?.trim()) {
      config.driver = form.driver.trim();
    }
    if (typeof form.encrypt === 'boolean') {
      config.encrypt = form.encrypt;
    }
    if (typeof form.trustServerCertificate === 'boolean') {
      config.trustServerCertificate = form.trustServerCertificate;
    }
    if (typeof form.ingestAllDatabases === 'boolean') {
      config.ingestAllDatabases = form.ingestAllDatabases;
    }
    if (typeof form.includeSynonyms === 'boolean') {
      config.includeSynonyms = form.includeSynonyms;
    }
    // Wave 0 lean-forms (R-T1.4).
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'MariaDB') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.databaseName?.trim()) {
      config.databaseName = form.databaseName.trim();
    }
    if (form.databaseSchema?.trim()) {
      config.databaseSchema = form.databaseSchema.trim();
    }
    config.scheme = form.scheme?.trim() || 'mysql+pymysql';
    // Wave 0 lean-forms (R-T1.3).
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Redshift' || type === 'Greenplum' || type === 'Timescale') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
    if (typeof form.ingestAllDatabases === 'boolean') {
      config.ingestAllDatabases = form.ingestAllDatabases;
    }
    if (type === 'Redshift') {
      config.scheme = form.scheme?.trim() || 'redshift+psycopg2';
    } else {
      config.scheme = form.scheme?.trim() || 'postgresql+psycopg2';
    }
    // Wave 0 lean-forms (R-T1.9/10/11): clusterIdentifier/workgroupName are
    // Redshift-only; classificationName/queryStatementSource are Timescale-only.
    if (type === 'Redshift') {
      if (form.clusterIdentifier?.trim()) {
        config.clusterIdentifier = form.clusterIdentifier.trim();
      }
      if (form.workgroupName?.trim()) {
        config.workgroupName = form.workgroupName.trim();
      }
    }
    if (form.sslMode?.trim()) {
      config.sslMode = form.sslMode.trim();
    }
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
    if (type === 'Timescale') {
      if (form.classificationName?.trim()) {
        config.classificationName = form.classificationName.trim();
      }
      if (form.queryStatementSource?.trim()) {
        config.queryStatementSource = form.queryStatementSource.trim();
      }
    }
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Superset') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    // T-2 (2026-11-20): the `connection` oneOf (supersetConnection.json) —
    // SupersetApiConnection / PostgresConnection / MysqlConnection. The API
    // password lives nested in `connection.password` and is handled here
    // (not by the generic applyPassword), so a stale API password can
    // never leak into a database-branch connection.
    const connBranch = form.supersetConnectionBranch ?? 'api';
    if (connBranch === 'postgres' || connBranch === 'mysql') {
      config.connection = buildSupersetDbConnection(
        form,
        existing?.config?.connection,
        connBranch,
      );
    } else {
      const nested: NonNullable<ServiceConnectionConfig['connection']> = {
        provider: form.provider?.trim() || 'db',
      };
      if (form.username?.trim()) {
        nested.username = form.username.trim();
      }
      const apiPassword = secretFieldValue(
        form.password,
        typeof existing?.config?.connection?.password === 'string'
          ? existing.config.connection.password
          : undefined,
      );
      if (apiPassword) {
        nested.password = apiPassword;
      }
      // W2-5 lean-forms tier 2 (supersetApiConnection.json): verifySSL and
      // sslConfig live nested in connection. Always visible, no showWhen
      // linkage (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible);
      // the leaves use the Superset triplet, never the top-level keys.
      if (form.verifySSL?.trim()) {
        nested.verifySSL = form.verifySSL.trim();
      }
      const supersetSSL = sslConfigFromFormKeys(
        form,
        {
          caCertificate: 'supersetSSLCaCertificate',
          sslCertificate: 'supersetSSLCertificate',
          sslKey: 'supersetSSLKey',
        },
        existing?.config?.connection?.sslConfig,
      );
      if (supersetSSL) {
        nested.sslConfig = supersetSSL;
      }
      config.connection = nested;
    }
  } else if (type === 'Metabase') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    const apiKey = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(apiKey)) {
      config.apiKey = apiKey;
    } else if (!apiKey) {
      const prev = existing?.config?.apiKey;
      if (prev && isMaskedSecret(prev)) {
        config.apiKey = prev;
      }
    }
  } else if (type === 'S3') {
    config.awsConfig = buildTopLevelAwsConfig(form, existing?.config);
    const buckets = (form.bucketNames ?? '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (buckets.length) {
      config.bucketNames = buckets;
    }
    if (form.consoleEndpointURL?.trim()) {
      config.consoleEndpointURL = form.consoleEndpointURL.trim();
    }
    // W2-5 lean-forms tier 2 (s3Connection.json): both are string maps
    // (connectionBasicType.json), so parseJsonMap still applies.
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Prefect') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const mode = form.prefectAuthMode === 'cloud' ? 'cloud' : 'server';
    if (mode === 'cloud') {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      if (form.prefectAccountId?.trim()) {
        auth.accountId = form.prefectAccountId.trim();
      }
      if (form.prefectWorkspaceId?.trim()) {
        auth.workspaceId = form.prefectWorkspaceId.trim();
      }
      const apiKey = form.apiKey?.trim() ?? '';
      if (shouldPersistSecret(apiKey)) {
        auth.apiKey = apiKey;
      } else if (!apiKey) {
        const prev = existing?.config?.authType?.apiKey;
        if (prev && isMaskedSecret(prev)) {
          auth.apiKey = prev;
        }
      }
      config.authType = auth;
    } else {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      const authString = form.prefectAuthString?.trim() ?? '';
      if (shouldPersistSecret(authString)) {
        auth.authString = authString;
      } else if (!authString) {
        const prev = existing?.config?.authType?.authString;
        if (prev && isMaskedSecret(prev)) {
          auth.authString = prev;
        }
      }
      config.authType = auth;
    }
    if (typeof form.numberOfStatus === 'number') {
      config.numberOfStatus = form.numberOfStatus;
    }
    // W2-5 lean-forms tier 2 (prefectConnection.json): verifySSL and
    // sslConfig live top level. Always visible, no showWhen linkage
    // (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
    if (form.verifySSL?.trim()) {
      config.verifySSL = form.verifySSL.trim();
    }
    const sslConfig = sslConfigFromForm(form, existing?.config);
    if (sslConfig) {
      config.sslConfig = sslConfig;
    }
  } else if (type === 'Dagster') {
    const host = form.hostPort?.trim() || '';
    if (host) {
      config.host = host;
    }
    // W2-5 (condition 10): the form.password fallback is dead code — the
    // Dagster group has no password field and formValuesFromService always
    // sets password: '', so it could never fire.
    const token = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(token)) {
      config.token = token;
    } else if (!token) {
      const prev = existing?.config?.token;
      if (prev && isMaskedSecret(prev)) {
        config.token = prev;
      }
    }
    if (typeof form.dagsterTimeout === 'number') {
      config.timeout = form.dagsterTimeout;
    }
    if (typeof form.stripAssetKeyPrefixLength === 'number') {
      config.stripAssetKeyPrefixLength = form.stripAssetKeyPrefixLength;
    }
  } else if (type === 'Databricks' || type === 'UnityCatalog') {

    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.httpPath?.trim()) {
      config.httpPath = form.httpPath.trim();
    }
    if (form.catalog?.trim()) {
      config.catalog = form.catalog.trim();
    }
    if (form.databaseSchema?.trim()) {
      config.databaseSchema = form.databaseSchema.trim();
    }
    // M-Next B3: queryHistoryTable is Databricks-only in this branch —
    // official unityCatalogConnection.json has no such field (the UC form
    // no longer offers it), so a stored UC value must not round-trip back.
    if (type === 'Databricks' && form.queryHistoryTable?.trim()) {
      config.queryHistoryTable = form.queryHistoryTable.trim();
    }
    if (type === 'UnityCatalog' && typeof form.includeMetricViews === 'boolean') {
      config.includeMetricViews = form.includeMetricViews;
    }
    // Wave 0 lean-forms (R-T1.6/7): single-option scheme is a builder fixed
    // value.
    config.scheme = 'databricks';
    if (typeof form.connectionTimeout === 'number') {
      config.connectionTimeout = form.connectionTimeout;
    }
    config.policyAgentConfig = policyAgentConfigFromForm(form, type);
    const connectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (connectionOptions) {
      config.connectionOptions = connectionOptions;
    }
    const connectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (connectionArguments) {
      config.connectionArguments = connectionArguments;
    }
  } else if (type === 'Mlflow') {
    if (form.trackingUri?.trim()) {
      config.trackingUri = form.trackingUri.trim();
    }
    if (form.registryUri?.trim()) {
      config.registryUri = form.registryUri.trim();
    }
  } else if (type === 'OpenMetadata') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    // W3-3A: A group (openMetadataConnection.json), spec order.
    if (form.clusterName?.trim()) {
      config.clusterName = form.clusterName.trim();
    }
    if (form.authProvider?.trim()) {
      config.authProvider = form.authProvider.trim();
    }
    const omVerifySSL = form.verifySSL?.trim() ?? '';
    if (omVerifySSL) {
      config.verifySSL = omVerifySSL;
    }
    const omSslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'openMetadataSSLCaCertificate',
        sslCertificate: 'openMetadataSSLCertificate',
        sslKey: 'openMetadataSSLKey',
      },
      asSslClientConfig(existing?.config?.sslConfig),
    );
    if (omSslConfig) {
      config.sslConfig = omSslConfig;
    }
    const jwtToken = secretFieldValue(form.jwtToken,
      typeof existing?.config?.securityConfig?.jwtToken === 'string'
        ? existing.config.securityConfig.jwtToken
        : undefined,
    );
    if (jwtToken) {
      config.securityConfig = { jwtToken };
    }
    if (form.secretsManagerProvider?.trim()) {
      config.secretsManagerProvider = form.secretsManagerProvider.trim();
    }
    if (form.secretsManagerLoader?.trim()) {
      config.secretsManagerLoader = form.secretsManagerLoader.trim();
    }
    if (form.apiVersion?.trim()) {
      config.apiVersion = form.apiVersion.trim();
    }
    if (typeof form.enableVersionValidation === 'boolean') {
      config.enableVersionValidation = form.enableVersionValidation;
    }
    // T-2 (2026-11-20): the B group (openMetadataConnection.json) — 13
    // include* switches (all default True), limitRecords (default 1000),
    // forceEntityOverwriting (default False). The create form prefills the
    // defaults; the edit refill defaults a missing key to the same value.
    const includeKeys = [
      'includeTopics',
      'includeTables',
      'includeDashboards',
      'includePipelines',
      'includeMlModels',
      'includeUsers',
      'includeTeams',
      'includeGlossaryTerms',
      'includeTags',
      'includePolicy',
      'includeMessagingServices',
      'includeDatabaseServices',
      'includePipelineServices',
    ] as const;
    for (const key of includeKeys) {
      if (typeof form[key] === 'boolean') {
        config[key] = form[key];
      }
    }
    if (typeof form.limitRecords === 'number') {
      config.limitRecords = form.limitRecords;
    }
    if (typeof form.forceEntityOverwriting === 'boolean') {
      config.forceEntityOverwriting = form.forceEntityOverwriting;
    }
    if (typeof form.omStoreServiceConnection === 'boolean') {
      config.storeServiceConnection = form.omStoreServiceConnection;
    }
    // T-2: `elasticsSearch` is conditionally required — its `type` is
    // required when the object appears, but the object itself is optional.
    // The form models it as a plain optional text leaf, so the whole
    // object is only emitted when a type is typed (see the T-2 verdict,
    // connectionCoverage.ts OpenMetadata row, grid ③).
    const omEsType = form.omElasticSearchType?.trim() ?? '';
    if (omEsType) {
      const elasticsSearch: { type: string; config?: Record<string, string> } = {
        type: omEsType,
      };
      const omEsConfig = parseJsonMap(form.omElasticSearchConfig, 'ElasticSearch config');
      if (omEsConfig) {
        elasticsSearch.config = omEsConfig;
      }
      config.elasticsSearch = elasticsSearch;
    }
    const extraHeaders = parseJsonMap(form.extraHeaders, 'Extra headers');
    if (extraHeaders) {
      config.extraHeaders = extraHeaders;
    }
  } else if (type === 'Rest') {
    // T-2 (2026-11-20): the `openAPISchemaConnection` oneOf
    // (restConnection.json) — OpenAPISchemaURL / OpenAPISchemaFilePath /
    // OpenAPISchemaS3. The S3 branch reuses the shared `authAws*` keys
    // (buildIamAuthType); the apiEndpointFilterPattern leaf is rendered
    // in the connection form (it is not one of the 19 filtered fields).
    const schemaBranch = form.restSchemaBranch ?? 'url';
    if (schemaBranch === 'filePath') {
      if (form.openApiSchemaFilePath?.trim()) {
        config.openAPISchemaConnection = {
          openAPISchemaFilePath: form.openApiSchemaFilePath.trim(),
        };
      }
    } else if (schemaBranch === 's3') {
      const s3Connection: {
        openAPISchemaS3URL?: string;
        awsCredentials?: AwsCredentialsConfig;
      } = {};
      if (form.openApiSchemaS3Url?.trim()) {
        s3Connection.openAPISchemaS3URL = form.openApiSchemaS3Url.trim();
      }
      const prevS3 = existing?.config?.openAPISchemaConnection;
      const prevAws =
        prevS3 && typeof prevS3 === 'object' && 'awsCredentials' in prevS3
          ? (prevS3 as { awsCredentials?: ServiceConnectionConfig['awsConfig'] })
              .awsCredentials
          : undefined;
      const aws = buildIamAuthType(form, prevAws ? { authType: { awsConfig: prevAws } } : undefined)?.awsConfig;
      if (aws && Object.keys(aws).length > 0) {
        s3Connection.awsCredentials = aws;
      }
      if (Object.keys(s3Connection).length > 0) {
        config.openAPISchemaConnection = s3Connection;
      }
    } else if (form.openApiSchemaUrl?.trim()) {
      config.openAPISchemaConnection = { openAPISchemaURL: form.openApiSchemaUrl.trim() };
    }
    const apiEndpointFilter = nonEmptyFilterPattern(form.apiEndpointFilterPattern);
    if (apiEndpointFilter) {
      config.apiEndpointFilterPattern = apiEndpointFilter;
    }
    const token = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(token)) {
      config.token = token;
    } else if (!token) {
      const prev = existing?.config?.token;
      if (prev && isMaskedSecret(prev)) {
        config.token = prev;
      }
    }
    if (form.docURL?.trim()) {
      config.docURL = form.docURL.trim();
    }
    const restVerifySSL = form.verifySSL?.trim() ?? '';
    if (restVerifySSL) {
      config.verifySSL = restVerifySSL;
    }
    const restSslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'restSSLCaCertificate',
        sslCertificate: 'restSSLCertificate',
        sslKey: 'restSSLKey',
      },
      asSslClientConfig(existing?.config?.sslConfig),
    );
    if (restSslConfig) {
      config.sslConfig = restSslConfig;
    }
  } else if (type === 'GoogleDrive') {
    // T-2 (2026-11-20): per-leaf credentials (googleDriveConnection.json) —
    // the four gcpConfig variants share the `authGcp*` form keys with the
    // Mysql / Alation / VertexAI GCP branches (buildGcpVariant), selected
    // by `gcpConfigType`. A blank edit preserves the stored credentials:
    // blank means "keep what you have", never "delete the credentials"
    // (the refill prefills every non-secret leaf, so a variant with only
    // its `type` means nothing new was entered). The ADC branch is the
    // config itself — an empty variant still emits `{type: 'gcp_adc'}`.
    const gcpType = form.gcpConfigType ?? 'gcpValues';
    const storedCredentials = existing?.config?.credentials;
    const storedGcpConfig =
      storedCredentials && typeof storedCredentials === 'object'
        ? storedCredentials.gcpConfig
        : undefined;
    const variant = buildGcpVariant(form, storedGcpConfig, gcpType);
    const credentials: NonNullable<ServiceConnectionConfig['credentials']> =
      Object.keys(variant).length > 1
        ? { gcpConfig: variant }
        : (preservedGoogleDriveCredentials(existing) ?? { gcpConfig: variant });
    const impersonate = buildGcpImpersonateServiceAccount(form);
    if (impersonate?.impersonateServiceAccount) {
      credentials.gcpImpersonateServiceAccount = impersonate;
    }
    config.credentials = credentials;
    if (form.delegatedEmail?.trim()) {
      config.delegatedEmail = form.delegatedEmail.trim();
    }
    if (form.driveId?.trim()) {
      config.driveId = form.driveId.trim();
    }
    if (typeof form.includeTeamDrives === 'boolean') {
      config.includeTeamDrives = form.includeTeamDrives;
    }
    if (typeof form.includeGoogleSheets === 'boolean') {
      config.includeGoogleSheets = form.includeGoogleSheets;
    }
    const driveConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (driveConnectionOptions) {
      config.connectionOptions = driveConnectionOptions;
    }
    const driveConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (driveConnectionArguments) {
      config.connectionArguments = driveConnectionArguments;
    }
  } else if (type === 'ElasticSearch') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    // W3-3A: authType oneOf (elasticSearchConnection.json) — the mode select
    // decides which branch is emitted. A missing mode infers from the form
    // / stored values so raw forms keep working
    // (ADR:2026-11-10-leanforms-3a-elasticsearch-auth-mode).
    const esAuthMode =
      form.elasticSearchAuthMode ??
      (form.apiKey?.trim() || existing?.config?.authType?.apiKey ? 'apiAuth' : 'basicAuth');
    if (esAuthMode === 'apiAuth') {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      const apiKey = form.apiKey?.trim() ?? '';
      if (shouldPersistSecret(apiKey)) {
        auth.apiKey = apiKey;
      } else if (!apiKey || isMaskedSecret(apiKey)) {
        // Blank or masked: restore the stored key (live edit-loss fix —
        // the old builder never read the previous apiKey). A masked value
        // with no stored key is omitted, never stored as the literal mask.
        const prev = existing?.config?.authType?.apiKey;
        if (prev && isMaskedSecret(prev)) {
          auth.apiKey = prev;
        }
      }
      if (form.apiKeyId?.trim()) {
        auth.apiKeyId = form.apiKeyId.trim();
      }
      if (Object.keys(auth).length) {
        config.authType = auth;
      }
    } else {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      if (form.username?.trim()) {
        auth.username = form.username.trim();
      }
      const secret = form.password?.trim() ?? '';
      if (shouldPersistSecret(secret)) {
        auth.password = secret;
      } else if (!secret) {
        const prev = existing?.config?.authType?.password;
        if (prev && isMaskedSecret(prev)) {
          auth.password = prev;
        }
      }
      if (Object.keys(auth).length) {
        config.authType = auth;
      }
    }
    const esSslConfig = elasticSearchSslConfigFromForm(form, existing?.config);
    if (esSslConfig) {
      config.sslConfig = esSslConfig;
    }
    if (typeof form.connectionTimeoutSecs === 'number') {
      config.connectionTimeoutSecs = form.connectionTimeoutSecs;
    }
    const esConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (esConnectionArguments) {
      config.connectionArguments = esConnectionArguments;
    }
  } else if (type === 'Ranger') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
    if (form.username?.trim()) {
      auth.username = form.username.trim();
    }
    const secret = form.password?.trim() ?? '';
    if (shouldPersistSecret(secret)) {
      auth.password = secret;
    } else if (!secret) {
      const prev = existing?.config?.authType?.password;
      if (prev && isMaskedSecret(prev)) {
        auth.password = prev;
      }
    }
    if (Object.keys(auth).length) {
      config.authType = auth;
    }
  } else if (type === 'OpenAI') {
    const apiKey = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(apiKey)) {
      config.apiKey = apiKey;
    } else if (!apiKey) {
      const prev = existing?.config?.apiKey;
      if (prev && isMaskedSecret(prev)) {
        config.apiKey = prev;
      }
    }
    if (form.organization?.trim()) {
      config.organization = form.organization.trim();
    }
    if (form.baseUrl?.trim()) {
      // Schema field name, not the product form key: baseURL.
      config.baseURL = form.baseUrl.trim();
    }
    if (typeof form.openAITimeout === 'number') {
      config.timeout = form.openAITimeout;
    }
    if (typeof form.openAIMaxRetries === 'number') {
      config.maxRetries = form.openAIMaxRetries;
    }
  } else if (type === 'Mcp') {
    if (form.discoveryMethod?.trim()) {
      config.discoveryMethod = form.discoveryMethod.trim();
    }
    const configFilePaths = parseJsonArray(
      form.configFilePaths,
      'Config file paths',
      isJsonString,
      'strings',
    );
    if (configFilePaths) {
      config.configFilePaths = configFilePaths;
    }
    const rawServers = parseJsonArray(form.servers, 'Servers', isJsonObject, 'objects');
    if (rawServers) {
      // W3-3A: each server's apiKey follows the restore-by-name retention
      // (ADR:2026-11-10-leanforms-3a-mcp-servers-api-key).
      const previousServers = existing?.config?.servers;
      config.servers = rawServers.map((server) => {
        const next: Record<string, unknown> = { ...server };
        const apiKey = mcpServerApiKey(
          typeof server.apiKey === 'string' ? server.apiKey : undefined,
          previousServers,
          server.name,
        );
        if (apiKey) {
          next.apiKey = apiKey;
        } else {
          delete next.apiKey;
        }
        return next;
      });
    }
    if (form.registryUrl?.trim()) {
      config.registryUrl = form.registryUrl.trim();
    }
    if (typeof form.connectionTimeout === 'number') {
      config.connectionTimeout = form.connectionTimeout;
    }
    if (typeof form.initializationTimeout === 'number') {
      config.initializationTimeout = form.initializationTimeout;
    }
    if (typeof form.fetchTools === 'boolean') {
      config.fetchTools = form.fetchTools;
    }
    if (typeof form.fetchResources === 'boolean') {
      config.fetchResources = form.fetchResources;
    }
    if (typeof form.fetchPrompts === 'boolean') {
      config.fetchPrompts = form.fetchPrompts;
    }
  } else if (type === 'CustomMlModel' || type === 'CustomSearch') {
    // T-2 (2026-11-20): customMlModelConnection.json /
    // customSearchConnection.json — required is ['type'] only; the one
    // modelled leaf is sourcePythonClass plus connection options.
    if (form.sourcePythonClass?.trim()) {
      config.sourcePythonClass = form.sourcePythonClass.trim();
    }
    const customConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (customConnectionOptions) {
      config.connectionOptions = customConnectionOptions;
    }
  } else if (type === 'SageMaker') {
    // T-2 (2026-11-20): sageMakerConnection.json — the top-level
    // `awsConfig` object (required), same AWSCredentials shape as S3.
    config.awsConfig = buildTopLevelAwsConfig(form, existing?.config);
  } else if (type === 'Sklearn') {
    // T-2 (2026-11-20): sklearnConnection.json has no modelled leaves
    // (only `type` + filter patterns + capability flags). The config
    // stays `{type: 'Sklearn'}` — see the type-only exemption at the
    // empty-body guard below.
  } else if (type === 'AlationSink') {
    // T-2 (2026-11-20): alationSinkConnection.json — authType oneOf
    // (BasicAuth {username, password} / ApiAccessTokenAuth {accessToken}),
    // projectName, paginationLimit, datasourceLinks (string map),
    // verifySSL, sslConfig (validateSSLClientConfig triplet).
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const sinkAuthBranch = form.alationSinkAuthBranch ?? 'basicAuth';
    const prevSinkAuth = existing?.config?.authType;
    const sinkAuth: NonNullable<ServiceConnectionConfig['authType']> = {};
    if (sinkAuthBranch === 'apiToken') {
      const token = secretFieldValue(
        form.alationSinkAccessToken,
        typeof prevSinkAuth?.accessToken === 'string' ? prevSinkAuth.accessToken : undefined,
      );
      if (token) {
        sinkAuth.accessToken = token;
      }
    } else {
      if (form.username?.trim()) {
        sinkAuth.username = form.username.trim();
      }
      const secret = secretFieldValue(
        form.password,
        typeof prevSinkAuth?.password === 'string' ? prevSinkAuth.password : undefined,
      );
      if (secret) {
        sinkAuth.password = secret;
      }
    }
    if (Object.keys(sinkAuth).length) {
      config.authType = sinkAuth;
    }
    if (form.projectName?.trim()) {
      config.projectName = form.projectName.trim();
    }
    if (typeof form.paginationLimit === 'number') {
      config.paginationLimit = form.paginationLimit;
    }
    const datasourceLinks = parseJsonMap(form.datasourceLinks, 'Datasource links');
    if (datasourceLinks) {
      config.datasourceLinks = datasourceLinks;
    }
    if (form.verifySSL?.trim()) {
      config.verifySSL = form.verifySSL.trim();
    }
    const sinkSslConfig = sslConfigFromFormKeys(
      form,
      {
        caCertificate: 'alationSinkSSLCaCertificate',
        sslCertificate: 'alationSinkSSLCertificate',
        sslKey: 'alationSinkSSLKey',
      },
      asSslClientConfig(existing?.config?.sslConfig),
    );
    if (sinkSslConfig) {
      config.sslConfig = sinkSslConfig;
    }
    const sinkConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (sinkConnectionOptions) {
      config.connectionOptions = sinkConnectionOptions;
    }
    const sinkConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (sinkConnectionArguments) {
      config.connectionArguments = sinkConnectionArguments;
    }
  } else if (type === 'Amundsen') {
    // T-2 (2026-11-20): amundsenConnection.json — flat username /
    // password (no authType wrapper), all three required.
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    const amundsenSecret = secretFieldValue(
      form.password,
      typeof existing?.config?.password === 'string' ? existing.config.password : undefined,
    );
    if (amundsenSecret) {
      config.password = amundsenSecret;
    }
    if (typeof form.maxConnectionLifeTime === 'number') {
      config.maxConnectionLifeTime = form.maxConnectionLifeTime;
    }
    if (typeof form.validateSSL === 'boolean') {
      config.validateSSL = form.validateSSL;
    }
    if (typeof form.encrypted === 'boolean') {
      config.encrypted = form.encrypted;
    }
  } else if (type === 'Atlas') {
    // T-2 (2026-11-20): atlasConnection.json — flat username / password,
    // entity_type, and the two service-name string arrays.
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    const atlasSecret = secretFieldValue(
      form.password,
      typeof existing?.config?.password === 'string' ? existing.config.password : undefined,
    );
    if (atlasSecret) {
      config.password = atlasSecret;
    }
    if (form.entity_type?.trim()) {
      config.entity_type = form.entity_type.trim();
    }
    const databaseServiceName = parseJsonArray(
      form.databaseServiceName,
      'Database service names',
      isJsonString,
      'strings',
    );
    if (databaseServiceName) {
      config.databaseServiceName = databaseServiceName;
    }
    const messagingServiceName = parseJsonArray(
      form.messagingServiceName,
      'Messaging service names',
      isJsonString,
      'strings',
    );
    if (messagingServiceName) {
      config.messagingServiceName = messagingServiceName;
    }
    const atlasConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (atlasConnectionOptions) {
      config.connectionOptions = atlasConnectionOptions;
    }
    const atlasConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (atlasConnectionArguments) {
      config.connectionArguments = atlasConnectionArguments;
    }
  } else if (type === 'CustomDrive') {
    // T-2 (2026-11-20): customDriveConnection.json — only the two
    // connection maps; no other modelled leaves.
    const driveConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (driveConnectionOptions) {
      config.connectionOptions = driveConnectionOptions;
    }
    const driveConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (driveConnectionArguments) {
      config.connectionArguments = driveConnectionArguments;
    }
  } else if (type === 'Sftp') {
    // T-2 (2026-11-20): sftpConnection.json — host + port are separate
    // leaves (no hostPort); authType oneOf (Username/Password /
    // Private Key). The private key is a fileOrInput secret.
    if (form.sftpHost?.trim()) {
      config.host = form.sftpHost.trim();
    }
    if (typeof form.sftpPort === 'number') {
      config.port = form.sftpPort;
    }
    const sftpBranch = form.sftpAuthBranch ?? 'usernamePassword';
    const prevSftpAuth = existing?.config?.authType;
    const sftpAuth: NonNullable<ServiceConnectionConfig['authType']> = {};
    if (form.username?.trim()) {
      sftpAuth.username = form.username.trim();
    }
    if (sftpBranch === 'privateKey') {
      const key = secretFieldValue(
        form.sftpPrivateKey,
        typeof prevSftpAuth?.privateKey === 'string' ? prevSftpAuth.privateKey : undefined,
      );
      if (key) {
        sftpAuth.privateKey = key;
      }
      const passphrase = secretFieldValue(
        form.sftpPrivateKeyPassphrase,
        typeof prevSftpAuth?.privateKeyPassphrase === 'string'
          ? prevSftpAuth.privateKeyPassphrase
          : undefined,
      );
      if (passphrase) {
        sftpAuth.privateKeyPassphrase = passphrase;
      }
    } else {
      const secret = secretFieldValue(
        form.password,
        typeof prevSftpAuth?.password === 'string' ? prevSftpAuth.password : undefined,
      );
      if (secret) {
        sftpAuth.password = secret;
      }
    }
    if (Object.keys(sftpAuth).length) {
      config.authType = sftpAuth;
    }
    const rootDirectories = parseJsonArray(
      form.rootDirectories,
      'Root directories',
      isJsonString,
      'strings',
    );
    if (rootDirectories) {
      config.rootDirectories = rootDirectories;
    }
    const sftpConnectionOptions = parseJsonMap(form.connectionOptions, 'Connection options');
    if (sftpConnectionOptions) {
      config.connectionOptions = sftpConnectionOptions;
    }
    const sftpConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (sftpConnectionArguments) {
      config.connectionArguments = sftpConnectionArguments;
    }
    if (typeof form.structuredDataFilesOnly === 'boolean') {
      config.structuredDataFilesOnly = form.structuredDataFilesOnly;
    }
    if (typeof form.extractSampleData === 'boolean') {
      config.extractSampleData = form.extractSampleData;
    }
  } else if (type === 'OpenSearch') {
    // T-2 (2026-11-20): openSearchConnection.json — authType oneOf
    // (Basic Authentication {username, password} / AWSCredentials
    // {awsConfig}), verifySSL, sslConfig (certificates oneOf, same shape
    // as ElasticSearch), connectionTimeoutSecs, connectionArguments.
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const osAuthBranch = form.openSearchAuthBranch ?? 'basicAuth';
    const prevOsAuth = existing?.config?.authType;
    if (osAuthBranch === 'awsCredentials') {
      const auth = buildIamAuthType(form, prevOsAuth ? { authType: prevOsAuth } : undefined);
      if (auth) {
        config.authType = auth;
      }
    } else {
      const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
      if (form.username?.trim()) {
        auth.username = form.username.trim();
      }
      const secret = secretFieldValue(
        form.password,
        typeof prevOsAuth?.password === 'string' ? prevOsAuth.password : undefined,
      );
      if (secret) {
        auth.password = secret;
      }
      if (Object.keys(auth).length) {
        config.authType = auth;
      }
    }
    if (form.verifySSL?.trim()) {
      config.verifySSL = form.verifySSL.trim();
    }
    const osSslConfig = elasticSearchSslConfigFromForm(form, existing?.config);
    if (osSslConfig) {
      config.sslConfig = osSslConfig;
    }
    if (typeof form.connectionTimeoutSecs === 'number') {
      config.connectionTimeoutSecs = form.connectionTimeoutSecs;
    }
    const osConnectionArguments = parseJsonMap(form.connectionArguments, 'Connection arguments');
    if (osConnectionArguments) {
      config.connectionArguments = osConnectionArguments;
    }
  } else {
    return existing;
  }

  const NO_GENERIC_PASSWORD: readonly string[] = [
    'S3',
    'Prefect',
    'Dagster',
    'Rest',
    'GoogleDrive',
    'ElasticSearch',
    'Ranger',
    'OpenAI',
    // A2 (2026-11-19): the five A-class types build their own auth shapes
    // (Alation {username,password}/{accessToken} + nested authType,
    // Collibra flat config.password, VertexAI credentials,
    // MetadataES/SharePoint password-less) — applyPassword would overwrite
    // them with config.authType = {password}.
    'VertexAI',
    'Alation',
    'Collibra',
    'MetadataES',
    'SharePoint',
    // T-2 (2026-11-20): the ten blocked-C rows + Superset build their own
    // auth shapes in-branch (nested connection.password, flat
    // config.password, authType {accessToken}/{privateKey}/{awsConfig},
    // or no password at all) — the generic applyPassword would write a
    // wrong-shape `authType = {password}` over them.
    'Superset',
    'CustomMlModel',
    'SageMaker',
    'Sklearn',
    'AlationSink',
    'Amundsen',
    'Atlas',
    'CustomDrive',
    'Sftp',
    'CustomSearch',
    'OpenSearch',
  ];
  if (!NO_GENERIC_PASSWORD.includes(type)) {
    applyPassword(config, form, existing?.config);
  }
  // P-08(c): the wizard stores declared *FilterPattern objects in
  // connection.config so the add-ingestion form can prefill from them.
  // No branch above sets them — the edit form has no filter inputs —
  // so without this they are dropped on the next service edit and the
  // prefill breaks afterwards. Carry ONLY *FilterPattern keys: every
  // declared filter-pattern property is a $ref to the shared
  // FilterPattern shape, and the flat keys the old wizard wrote
  // (includeSchemas, includeViews, generateSampleData, ...) are
  // undeclared on every connection schema, so a stored flat key must
  // NOT survive an edit — dropping it here heals the stored config
  // instead of re-sending a key the server rejects on encrypt.
  const prevConfig = existing?.config as Record<string, unknown> | undefined;
  if (prevConfig) {
    for (const [key, value] of Object.entries(prevConfig)) {
      if (key.endsWith('FilterPattern') && config[key] === undefined && value !== undefined) {
        config[key] = value;
      }
    }
  }
  if (Object.keys(config).length <= 1 && !TYPE_ONLY_CONNECTION_TYPES.includes(type)) {
    return undefined;
  }
  return { config };
}

/**
 * T-2 (2026-11-20): mask every secret leaf of an authType object — the
 * flat leaves plus the AWS session secrets, the Azure client secret, and
 * the GCP private key. Shared by the top-level authType (Mysql / Postgres /
 * OpenSearch / Sftp / ...) and the nested one (Alation / Superset
 * connection). The top-level awsConfig / azureConfig / gcpConfig objects
 * were a pre-existing display gap (A2 noted it out of scope); closing it
 * here because OpenSearch's top-level authType ships on this lane.
 */
function maskAuthTypeSecrets(
  auth: NonNullable<ServiceConnectionConfig['authType']>,
): NonNullable<ServiceConnectionConfig['authType']> {
  const next = { ...auth };
  for (const key of [
    'password',
    'token',
    'clientSecret',
    'azureClientSecret',
    'apiKey',
    'authString',
    // A2: Alation ApiAccessTokenAuth.
    'accessToken',
    // T-2: Sftp private-key auth.
    'privateKey',
    'privateKeyPassphrase',
  ] as const) {
    if (typeof next[key] === 'string') {
      next[key] = '********';
    }
  }
  if (next.awsConfig && typeof next.awsConfig === 'object') {
    const aws = { ...next.awsConfig };
    for (const key of ['awsSecretAccessKey', 'awsSessionToken'] as const) {
      if (typeof aws[key] === 'string') {
        aws[key] = '********';
      }
    }
    next.awsConfig = aws;
  }
  if (next.azureConfig && typeof next.azureConfig === 'object') {
    const azure = { ...next.azureConfig };
    if (typeof azure.clientSecret === 'string') {
      azure.clientSecret = '********';
    }
    next.azureConfig = azure;
  }
  if (next.gcpConfig && typeof next.gcpConfig === 'object') {
    const gcp = { ...next.gcpConfig };
    const inner = gcp.gcpConfig;
    if (
      inner &&
      typeof inner === 'object' &&
      typeof (inner as Record<string, unknown>)['privateKey'] === 'string'
    ) {
      gcp.gcpConfig = {
        ...(inner as Record<string, unknown>),
        privateKey: '********',
      };
    }
    next.gcpConfig = gcp;
  }
  return next;
}

/** The three validateSSLClientConfig PEM leaves, shared by every sslConfig object. */
const SSL_CONFIG_LEAF_KEYS = ['caCertificate', 'sslCertificate', 'sslKey'] as const;

export function redactConnectionForDisplay(connection?: ServiceConnection): ServiceConnection | undefined {
  if (!connection?.config) {
    return connection;
  }
  const config = { ...connection.config };
  if (config.authType && typeof config.authType === 'object') {
    config.authType = maskAuthTypeSecrets(config.authType);
  }
  if (typeof config.password === 'string') {
    config.password = '********';
  }
  // A2: SharePoint top-level clientSecret.
  if (typeof config.clientSecret === 'string') {
    config.clientSecret = '********';
  }
  if (typeof config.apiKey === 'string') {
    config.apiKey = '********';
  }
  if (typeof config.token === 'string') {
    config.token = '********';
  }
  // W3-3A: OpenMetadata securityConfig jwtToken is a secret leaf.
  if (config.securityConfig && typeof config.securityConfig === 'object') {
    const securityConfig = { ...config.securityConfig };
    if (typeof securityConfig.jwtToken === 'string') {
      securityConfig.jwtToken = '********';
    }
    config.securityConfig = securityConfig;
  }
  // W3-3A: GoogleDrive credentials is the whole service-account JSON
  // (incl. private_key) — mask the object, never a single leaf
  // (ADR:2026-11-10-leanforms-3a-googledrive-credentials).
  if (config.credentials && typeof config.credentials === 'object') {
    config.credentials = '********';
  }
  // T-2 (2026-11-20): Rest's S3 branch nests the AWSCredentials under
  // openAPISchemaConnection.awsCredentials — mask the session secrets.
  const openApiSchema = config.openAPISchemaConnection as
    | { awsCredentials?: AwsCredentialsConfig }
    | undefined;
  if (openApiSchema?.awsCredentials && typeof openApiSchema.awsCredentials === 'object') {
    const aws = { ...openApiSchema.awsCredentials };
    for (const key of ['awsSecretAccessKey', 'awsSessionToken'] as const) {
      if (typeof aws[key] === 'string') {
        aws[key] = '********';
      }
    }
    config.openAPISchemaConnection = { ...openApiSchema, awsCredentials: aws };
  }
  // W3-3A: Mcp servers[].apiKey — walk the array, mask each key
  // (ADR:2026-11-10-leanforms-3a-mcp-servers-api-key).
  if (Array.isArray(config.servers) && config.servers.length) {
    config.servers = maskServerApiKeys(config.servers);
  }
  // Wave 0 lean-forms: new secret leaves (Snowflake privateKey/passphrase,
  // sslConfig PEM leaves) are never rendered back in plain text.
  if (typeof config.privateKey === 'string') {
    config.privateKey = '********';
  }
  if (typeof config.snowflakePrivatekeyPassphrase === 'string') {
    config.snowflakePrivatekeyPassphrase = '********';
  }
  if (config.sslConfig && typeof config.sslConfig === 'object') {
    const sslConfig = { ...config.sslConfig };
    const leaves = asSslClientConfig(sslConfig);
    if (leaves) {
      for (const key of SSL_CONFIG_LEAF_KEYS) {
        if (typeof leaves[key] === 'string') {
          leaves[key] = '********';
        }
      }
    }
    // W3-3A: ElasticSearch certificates oneOf — mask only the value leaves
    // (paths are not secrets).
    const certs = elasticSearchCertificatesFromConfig({ sslConfig });
    if (
      certs &&
      ('caCertValue' in certs || 'clientCertValue' in certs || 'privateKeyValue' in certs)
    ) {
      const masked = { ...certs };
      for (const key of ['caCertValue', 'clientCertValue', 'privateKeyValue'] as const) {
        if (typeof masked[key] === 'string') {
          masked[key] = '********';
        }
      }
      config.sslConfig = { ...sslConfig, certificates: masked };
    } else {
      config.sslConfig = sslConfig;
    }
  }
  // W2-5 (condition 4): Kafka's two sslConfig groups live in their own
  // objects — the config.sslConfig branch above does not cover them.
  if (config.consumerConfigSSL && typeof config.consumerConfigSSL === 'object') {
    const sslConfig = { ...config.consumerConfigSSL };
    for (const key of SSL_CONFIG_LEAF_KEYS) {
      if (typeof sslConfig[key] === 'string') {
        sslConfig[key] = '********';
      }
    }
    config.consumerConfigSSL = sslConfig;
  }
  if (config.schemaRegistrySSL && typeof config.schemaRegistrySSL === 'object') {
    const sslConfig = { ...config.schemaRegistrySSL };
    for (const key of SSL_CONFIG_LEAF_KEYS) {
      if (typeof sslConfig[key] === 'string') {
        sslConfig[key] = '********';
      }
    }
    config.schemaRegistrySSL = sslConfig;
  }
  if (config.connection && typeof config.connection === 'object') {
    const nested = { ...config.connection };
    if (typeof nested.password === 'string') {
      nested.password = '********';
    }
    // W2-5 (condition 4): Superset's sslConfig lives nested in connection.
    if (nested.sslConfig && typeof nested.sslConfig === 'object') {
      const sslConfig = { ...nested.sslConfig };
      for (const key of SSL_CONFIG_LEAF_KEYS) {
        if (typeof sslConfig[key] === 'string') {
          sslConfig[key] = '********';
        }
      }
      nested.sslConfig = sslConfig;
    }
    // A2: Alation's nested authType mirrors the top-level one (the
    // Superset nested authType is the same shape) — mask it with the
    // shared helper.
    if (nested.authType && typeof nested.authType === 'object') {
      nested.authType = maskAuthTypeSecrets(nested.authType);
    }
    config.connection = nested;
  }
  if (typeof config.saslPassword === 'string') {
    config.saslPassword = '********';
  }
  if (typeof config.basicAuthUserInfo === 'string') {
    config.basicAuthUserInfo = '********';
  }
  if (config.awsConfig && typeof config.awsConfig === 'object') {
    const aws = { ...config.awsConfig };
    for (const key of ['awsSecretAccessKey', 'awsSessionToken'] as const) {
      if (typeof aws[key] === 'string') {
        aws[key] = '********';
      }
    }
    config.awsConfig = aws;
  }
  return { config };
}
