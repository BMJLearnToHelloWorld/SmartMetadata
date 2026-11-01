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
} from '@/types/ingestion';
import {
  DATABASE_SERVICE_TYPES,
  DASHBOARD_SERVICE_TYPES,
  MESSAGING_SERVICE_TYPES,
  STORAGE_SERVICE_TYPES,
  PIPELINE_SERVICE_TYPES,
} from '@/types/ingestion';

export function kindForServiceType(serviceType: string): ServiceKind | undefined {
  if ((DATABASE_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'database';
  }
  if ((MESSAGING_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'messaging';
  }
  if ((DASHBOARD_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'dashboard';
  }
  if ((STORAGE_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'storage';
  }
  if ((PIPELINE_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'pipeline';
  }
  return undefined;
}

export function entityTypeForKind(kind: ServiceKind): string {
  if (kind === 'messaging') {
    return 'messagingService';
  }
  if (kind === 'dashboard') {
    return 'dashboardService';
  }
  if (kind === 'storage') {
    return 'storageService';
  }
  if (kind === 'pipeline') {
    return 'pipelineService';
  }
  return 'databaseService';
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
  } else if (type === 'Kafka' || type === 'Redpanda') {
    if (form.bootstrapServers?.trim()) {
      config.bootstrapServers = form.bootstrapServers.trim();
    }
    if (form.schemaRegistryURL?.trim()) {
      config.schemaRegistryURL = form.schemaRegistryURL.trim();
    }
    if (form.securityProtocol?.trim()) {
      config.securityProtocol = form.securityProtocol.trim();
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
  } else if (type === 'Prefect') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    const mode = form.prefectAuthMode === 'cloud' ? 'cloud' : 'server';
    if (mode === 'cloud') {
      const auth: Record<string, string> = {};
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
        const prev = existing?.config?.authType;
        if (prev && typeof prev === 'object' && typeof (prev as { apiKey?: string }).apiKey === 'string') {
          const prevKey = (prev as { apiKey?: string }).apiKey!;
          if (isMaskedSecret(prevKey)) {
            auth.apiKey = prevKey;
          }
        }
      }
      config.authType = auth;
    } else {
      const auth: Record<string, string> = {};
      const authString = form.prefectAuthString?.trim() ?? '';
      if (shouldPersistSecret(authString, Boolean(form.storeConnectionSecrets))) {
        auth.authString = authString;
      } else if (!authString) {
        const prev = existing?.config?.authType;
        if (prev && typeof prev === 'object' && typeof (prev as { authString?: string }).authString === 'string') {
          const prevAuth = (prev as { authString?: string }).authString!;
          if (isMaskedSecret(prevAuth)) {
            auth.authString = prevAuth;
          }
        }
      }
      config.authType = auth;
    }
    if (typeof form.numberOfStatus === 'number') {
      config.numberOfStatus = form.numberOfStatus;
    }
  } else if (type === 'Dagster') {
    const host = form.hostPort?.trim() || '';
    if (host) {
      config.host = host;
    }
    const token = form.apiKey?.trim() || form.password?.trim() || '';
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
    if (form.queryHistoryTable?.trim()) {
      config.queryHistoryTable = form.queryHistoryTable.trim();
    }
    if (type === 'UnityCatalog' && typeof form.includeMetricViews === 'boolean') {
      config.includeMetricViews = form.includeMetricViews;
    }
  } else {
    return existing;
  }

  if (type !== 'S3' && type !== 'Prefect' && type !== 'Dagster') {
    applyPassword(config, form, existing?.config);
  }
  if (Object.keys(config).length <= 1) {
    return undefined;
  }
  return { config };
}

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
  if (config.connection && typeof config.connection === 'object') {
    const nested = { ...config.connection };
    if (typeof nested.password === 'string') {
      nested.password = '********';
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
