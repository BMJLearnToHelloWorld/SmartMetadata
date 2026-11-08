/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { isMaskedSecret, shouldPersistSecret } from '@/ingestion/secrets';
import type {
  CatalogService,
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

/** Service-kind tables: views look kinds up here instead of if-else chains. */
export const SERVICE_TYPES_BY_KIND: Record<ServiceKind, readonly string[]> = {
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

/** Password placeholder shown in connection forms, per service type. */
export const PASSWORD_PLACEHOLDERS: Record<string, string> = {
  Postgres: '${PG_PASSWORD}',
  Mysql: '${MYSQL_PASSWORD}',
  Snowflake: '${SNOWFLAKE_PASSWORD}',
  Doris: '${DORIS_PASSWORD}',
  Mssql: '${MSSQL_PASSWORD}',
  MariaDB: '${MARIADB_PASSWORD}',
  Redshift: '${REDSHIFT_PASSWORD}',
  Greenplum: '${GREENPLUM_PASSWORD}',
  Timescale: '${TIMESCALE_PASSWORD}',
  Superset: '${SUPERSET_PASSWORD}',
  Metabase: '${METABASE_PASSWORD}',
  S3: '${AWS_SECRET_ACCESS_KEY}',
  Prefect: '${PREFECT_API_KEY}',
  Dagster: '${DAGSTER_TOKEN}',
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
    storeConnectionSecrets: false,
    trackingUri: '',
    registryUri: '',
    openApiSchemaUrl: '',
    credentialsJson: '',
    delegatedEmail: '',
    driveId: '',
    organization: '',
    baseUrl: '',
    registryUrl: '',
    connectionTimeout: undefined,
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
      typeof config.username === 'string'
        ? config.username
        : typeof config.connection?.username === 'string'
          ? config.connection.username
          : typeof (config.authType as { username?: string } | undefined)?.username === 'string'
            ? ((config.authType as { username?: string }).username as string)
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
    clientId: typeof config.authType?.clientId === 'string' ? config.authType.clientId : '',
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
    prefectAccountId:
      typeof (config.authType as { accountId?: string } | undefined)?.accountId === 'string'
        ? (config.authType as { accountId?: string }).accountId!
        : '',
    prefectWorkspaceId:
      typeof (config.authType as { workspaceId?: string } | undefined)?.workspaceId === 'string'
        ? (config.authType as { workspaceId?: string }).workspaceId!
        : '',
    prefectAuthString: '',
    numberOfStatus: typeof config.numberOfStatus === 'number' ? config.numberOfStatus : 10,
    dagsterTimeout: typeof config.timeout === 'number' ? config.timeout : 1000,
    stripAssetKeyPrefixLength:
      typeof config.stripAssetKeyPrefixLength === 'number' ? config.stripAssetKeyPrefixLength : 0,
    storeConnectionSecrets: false,
    // Eight-kind default types (see connectionFields.ts): secrets are never
    // prefilled — the build step preserves a masked previous secret instead.
    trackingUri: typeof config.trackingUri === 'string' ? config.trackingUri : '',
    registryUri: typeof config.registryUri === 'string' ? config.registryUri : '',
    openApiSchemaUrl:
      typeof (config.openAPISchemaConnection as Record<string, unknown> | undefined)?.openAPISchemaURL ===
      'string'
        ? ((config.openAPISchemaConnection as Record<string, unknown>).openAPISchemaURL as string)
        : '',
    credentialsJson: '',
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
    connectionTimeout: typeof config.connectionTimeout === 'number' ? config.connectionTimeout : undefined,
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
  if (shouldPersistSecret(typed, Boolean(form.storeConnectionSecrets))) {
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
    if (shouldPersistSecret(secret, Boolean(form.storeConnectionSecrets))) {
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
    if (shouldPersistSecret(secret, Boolean(form.storeConnectionSecrets))) {
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
  if (shouldPersistSecret(token, Boolean(form.storeConnectionSecrets))) {
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
 * string map. Mirrors the GoogleDrive credentialsJson precedent: invalid JSON,
 * a non-object, or a non-string value throws instead of sending a
 * schema-invalid config (all 11 database schemas are additionalProperties:
 * false with string map values).
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
 * Secret-field discipline shared by the new secret leaves (Snowflake
 * privateKey/passphrase, sslConfig leaves): same rules as applyPassword —
 * a typed literal is sent only when it is an ${ENV} placeholder or
 * storeConnectionSecrets is on; a blank field preserves a masked previous
 * value; anything else is dropped, never sent.
 */
function secretFieldValue(
  typed: string | undefined,
  store: boolean,
  previous: string | undefined,
): string | undefined {
  const value = typed?.trim() ?? '';
  if (shouldPersistSecret(value, store)) {
    return value;
  }
  if (!value && previous && isMaskedSecret(previous)) {
    return previous;
  }
  return undefined;
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
    | 'supersetSSLCaCertificate';
  sslCertificate:
    | 'sslCertificate'
    | 'consumerConfigSSLCertificate'
    | 'schemaRegistrySSLCertificate'
    | 'supersetSSLCertificate';
  sslKey: 'sslKey' | 'consumerConfigSSLKey' | 'schemaRegistrySSLKey' | 'supersetSSLKey';
}

function sslConfigFromFormKeys(
  form: ServiceFormValues,
  keys: SslLeafFormKeys,
  previous?: SslClientConfig,
): Record<string, string> | undefined {
  const store = Boolean(form.storeConnectionSecrets);
  const sslConfig: Record<string, string> = {};
  for (const outKey of ['caCertificate', 'sslCertificate', 'sslKey'] as const) {
    const value = secretFieldValue(form[keys[outKey]], store, previous?.[outKey]);
    if (value) {
      sslConfig[outKey] = value;
    }
  }
  return Object.keys(sslConfig).length ? sslConfig : undefined;
}

function sslConfigFromForm(
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): Record<string, string> | undefined {
  return sslConfigFromFormKeys(
    form,
    { caCertificate: 'sslCaCertificate', sslCertificate: 'sslCertificate', sslKey: 'sslKey' },
    existing?.sslConfig,
  );
}

function policyAgentConfigFromForm(form: ServiceFormValues): Record<string, boolean> {
  return {
    enabled: form.policyAgentEnabled ?? true,
    supportsColumnAccess: form.policyAgentSupportsColumnAccess ?? false,
    supportsFullAccess: form.policyAgentSupportsFullAccess ?? true,
    supportsMaskedAccess: form.policyAgentSupportsMaskedAccess ?? true,
  };
}

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
    // literals only with storeConnectionSecrets, masked previous preserved).
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
    const store = Boolean(form.storeConnectionSecrets);
    const prevConfig = existing?.config;
    const privateKey = secretFieldValue(
      form.privateKey,
      store,
      typeof prevConfig?.privateKey === 'string' ? prevConfig.privateKey : undefined,
    );
    if (privateKey) {
      config.privateKey = privateKey;
    }
    const passphrase = secretFieldValue(
      form.snowflakePrivatekeyPassphrase,
      store,
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
    config.policyAgentConfig = policyAgentConfigFromForm(form);
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
    const store = Boolean(form.storeConnectionSecrets);
    const prevConfig = existing?.config;
    const saslPassword = secretFieldValue(
      form.saslPassword,
      store,
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
    const basicAuthUserInfo = secretFieldValue(
      form.basicAuthUserInfo,
      store,
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
    const nested: NonNullable<ServiceConnectionConfig['connection']> = {
      provider: form.provider?.trim() || 'db',
    };
    if (form.username?.trim()) {
      nested.username = form.username.trim();
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
  } else if (type === 'Metabase') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    const apiKey = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(apiKey, Boolean(form.storeConnectionSecrets))) {
      config.apiKey = apiKey;
    } else if (!apiKey) {
      const prev = existing?.config?.apiKey;
      if (prev && isMaskedSecret(prev)) {
        config.apiKey = prev;
      }
    }
  } else if (type === 'S3') {
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
    if (shouldPersistSecret(secret, Boolean(form.storeConnectionSecrets))) {
      awsConfig.awsSecretAccessKey = secret;
    } else if (!secret) {
      const prev = existing?.config?.awsConfig?.awsSecretAccessKey;
      if (prev && isMaskedSecret(prev)) {
        awsConfig.awsSecretAccessKey = prev;
      }
    }
    const session = form.awsSessionToken?.trim() ?? '';
    if (shouldPersistSecret(session, Boolean(form.storeConnectionSecrets))) {
      awsConfig.awsSessionToken = session;
    } else if (!session) {
      const prev = existing?.config?.awsConfig?.awsSessionToken;
      if (prev && isMaskedSecret(prev)) {
        awsConfig.awsSessionToken = prev;
      }
    }
    config.awsConfig = awsConfig;
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
      if (shouldPersistSecret(apiKey, Boolean(form.storeConnectionSecrets))) {
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
      if (shouldPersistSecret(authString, Boolean(form.storeConnectionSecrets))) {
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
    if (shouldPersistSecret(token, Boolean(form.storeConnectionSecrets))) {
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
    config.policyAgentConfig = policyAgentConfigFromForm(form);
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
  } else if (type === 'Rest') {
    if (form.openApiSchemaUrl?.trim()) {
      config.openAPISchemaConnection = { openAPISchemaURL: form.openApiSchemaUrl.trim() };
    }
    const token = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(token, Boolean(form.storeConnectionSecrets))) {
      config.token = token;
    } else if (!token) {
      const prev = existing?.config?.token;
      if (prev && isMaskedSecret(prev)) {
        config.token = prev;
      }
    }
  } else if (type === 'GoogleDrive') {
    const raw = form.credentialsJson?.trim() ?? '';
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('Google Drive credentials must be valid JSON');
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Google Drive credentials must be a JSON object');
      }
      config.credentials = parsed as Record<string, unknown>;
    } else if (existing?.config?.credentials) {
      config.credentials = existing.config.credentials;
    }
    if (form.delegatedEmail?.trim()) {
      config.delegatedEmail = form.delegatedEmail.trim();
    }
    if (form.driveId?.trim()) {
      config.driveId = form.driveId.trim();
    }
  } else if (type === 'ElasticSearch' || type === 'Ranger') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const auth: Record<string, string> = {};
    if (form.username?.trim()) {
      auth.username = form.username.trim();
    }
    const secret = form.password?.trim() ?? '';
    if (shouldPersistSecret(secret, Boolean(form.storeConnectionSecrets))) {
      auth.password = secret;
    } else if (!secret) {
      const prevAuth = existing?.config?.authType;
      const prev = prevAuth && typeof prevAuth === 'object' ? (prevAuth as { password?: string }).password : undefined;
      if (prev && isMaskedSecret(prev)) {
        auth.password = prev;
      }
    }
    const apiKey = form.apiKey?.trim() ?? '';
    if (type === 'ElasticSearch' && apiKey && shouldPersistSecret(apiKey, Boolean(form.storeConnectionSecrets))) {
      config.authType = { apiKey };
    } else if (Object.keys(auth).length) {
      config.authType = auth;
    }
  } else if (type === 'OpenAI') {
    const apiKey = form.apiKey?.trim() ?? '';
    if (shouldPersistSecret(apiKey, Boolean(form.storeConnectionSecrets))) {
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
  } else if (type === 'Mcp') {
    if (form.registryUrl?.trim()) {
      config.registryUrl = form.registryUrl.trim();
    }
    if (typeof form.connectionTimeout === 'number') {
      config.connectionTimeout = form.connectionTimeout;
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
  ];
  if (!NO_GENERIC_PASSWORD.includes(type)) {
    applyPassword(config, form, existing?.config);
  }
  if (Object.keys(config).length <= 1) {
    return undefined;
  }
  return { config };
}

/** The three validateSSLClientConfig PEM leaves, shared by every sslConfig object. */
const SSL_CONFIG_LEAF_KEYS = ['caCertificate', 'sslCertificate', 'sslKey'] as const;

export function redactConnectionForDisplay(connection?: ServiceConnection): ServiceConnection | undefined {
  if (!connection?.config) {
    return connection;
  }
  const config = { ...connection.config };
  if (config.authType && typeof config.authType === 'object') {
    const auth = { ...config.authType };
    for (const key of ['password', 'token', 'clientSecret', 'azureClientSecret', 'apiKey', 'authString'] as const) {
      if (typeof auth[key] === 'string') {
        auth[key] = '********';
      }
    }
    config.authType = auth;
  }
  if (typeof config.password === 'string') {
    config.password = '********';
  }
  if (typeof config.apiKey === 'string') {
    config.apiKey = '********';
  }
  if (typeof config.token === 'string') {
    config.token = '********';
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
    for (const key of SSL_CONFIG_LEAF_KEYS) {
      if (typeof sslConfig[key] === 'string') {
        sslConfig[key] = '********';
      }
    }
    config.sslConfig = sslConfig;
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
