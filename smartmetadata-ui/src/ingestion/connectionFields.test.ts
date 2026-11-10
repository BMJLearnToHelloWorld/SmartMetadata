/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_FIELD_GROUPS,
  connectionFieldsForType,
  hasConnectionForm,
  isConnectionFieldVisible,
  type ConnectionFieldGroup,
} from './connectionFields';

describe('connectionFields', () => {
  it('returns the Postgres field set in table order with shared trailing fields', () => {
    const keys = connectionFieldsForType('Postgres').map((field) => field.key);
    expect(keys).toEqual([
      'hostPort',
      'username',
      'database',
      'password',
      'scheme',
      'ingestAllDatabases',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
  });

  it('returns the de-noised database field sets in table order (Wave 0 lean-forms)', () => {
    // Target counts (RULING.md R-T1): Postgres 12, MySQL 11, MariaDB 8,
    // Mssql 13, Snowflake 24, Databricks 11, UnityCatalog 11, Doris 9,
    // Redshift 12, Greenplum 10, Timescale 12 — counted as official
    // de-noised properties covered; storeConnectionSecrets is product-only
    // and excluded from the count, while password renders authType basicAuth.
    expect(connectionFieldsForType('Mysql').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'databaseName',
      'databaseSchema',
      'queryHistoryTable',
      'password',
      'useSlowLogs',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('MariaDB').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'databaseName',
      'databaseSchema',
      'password',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Mssql').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'database',
      'scheme',
      'driver',
      'encrypt',
      'trustServerCertificate',
      'ingestAllDatabases',
      'includeSynonyms',
      'password',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Snowflake').map((field) => field.key)).toEqual([
      'account',
      'username',
      'warehouse',
      'database',
      'role',
      'password',
      'queryTag',
      'accountUsageSchema',
      'systemMetricsBatchSize',
      'privateKey',
      'snowflakePrivatekeyPassphrase',
      'includeTransientTables',
      'includeStreams',
      'includeStages',
      'includeSemanticViews',
      'clientSessionKeepAlive',
      'useAccessHistory',
      'accessHistoryChunkSize',
      'creditCost',
      'snowflakeSourceHost',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Doris').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'databaseName',
      'databaseSchema',
      'password',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Redshift').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'database',
      'ingestAllDatabases',
      'password',
      'clusterIdentifier',
      'workgroupName',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Greenplum').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'database',
      'ingestAllDatabases',
      'password',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Timescale').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'database',
      'ingestAllDatabases',
      'password',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Databricks').map((field) => field.key)).toEqual([
      'hostPort',
      'httpPath',
      'catalog',
      'databaseSchema',
      'queryHistoryTable',
      'connectionTimeout',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureTenantId',
      'azureClientSecret',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('UnityCatalog').map((field) => field.key)).toEqual([
      'hostPort',
      'httpPath',
      'catalog',
      'databaseSchema',
      'includeMetricViews',
      'connectionTimeout',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureTenantId',
      'azureClientSecret',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
  });

  it('returns an empty table for an unknown service type instead of inventing fields', () => {
    expect(connectionFieldsForType('Oracle')).toEqual([]);
  });

  it('covers every supported service type with at least one field', () => {
    const types = new Set(CONNECTION_FIELD_GROUPS.flatMap((group) => group.types));
    // 18 pre-existing types + the eight kinds' default types (A9).
    expect(types.size).toBe(26);
    for (const type of types) {
      expect(connectionFieldsForType(type).length).toBeGreaterThan(0);
    }
  });

  it('covers the eight previously form-less kinds via their default types, and blocks the rest', () => {
    expect(connectionFieldsForType('Mlflow').map((field) => field.key)).toEqual([
      'trackingUri',
      'registryUri',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('OpenMetadata').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('GoogleDrive').map((field) => field.key)).toContain('credentialsJson');
    expect(connectionFieldsForType('ElasticSearch').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('OpenAI').map((field) => field.key)).toContain('apiKey');
    expect(connectionFieldsForType('Mcp').map((field) => field.key)).toContain('registryUrl');
    expect(connectionFieldsForType('Ranger').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'password',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toContain('openApiSchemaUrl');
    // Non-default types in those kinds stay form-less: the wizard must
    // block creation for them rather than send an undefined connection.
    for (const type of ['Anthropic', 'Atlas', 'Sftp', 'OpenSearch', 'WEBHOOK', 'SageMaker', 'CustomLLM']) {
      expect(hasConnectionForm(type)).toBe(false);
      expect(connectionFieldsForType(type)).toEqual([]);
    }
    for (const type of ['Mlflow', 'OpenMetadata', 'GoogleDrive', 'ElasticSearch', 'OpenAI', 'Mcp', 'Ranger', 'Rest']) {
      expect(hasConnectionForm(type)).toBe(true);
    }
  });

  it('lets a new service type be added by touching only the data table', () => {
    const synthetic: ConnectionFieldGroup = {
      types: ['SyntheticDb'],
      fields: [
        { key: 'hostPort', control: 'text', labelKey: 'connection.hostPort', testId: 'service-host-port' },
      ],
    };
    const table = [...CONNECTION_FIELD_GROUPS, synthetic];
    const found = table.find((group) => group.types.includes('SyntheticDb'));
    expect(found?.fields.map((field) => field.key)).toEqual(['hostPort']);
    expect(connectionFieldsForType('SyntheticDb')).toEqual([]);
  });

  it('evaluates showWhen with defaults and negation', () => {
    const driver = connectionFieldsForType('Mssql').find((field) => field.key === 'driver');
    expect(driver).toBeDefined();
    expect(isConnectionFieldVisible(driver!, { scheme: 'mssql+pyodbc' })).toBe(true);
    expect(isConnectionFieldVisible(driver!, { scheme: 'mssql+pytds' })).toBe(false);
    const token = connectionFieldsForType('Databricks').find((field) => field.key === 'password');
    expect(token).toBeDefined();
    expect(isConnectionFieldVisible(token!, {})).toBe(true);
    expect(isConnectionFieldVisible(token!, { authMode: 'oauth' })).toBe(false);
    const authString = connectionFieldsForType('Prefect').find((field) => field.key === 'prefectAuthString');
    expect(authString).toBeDefined();
    expect(isConnectionFieldVisible(authString!, { prefectAuthMode: 'server' })).toBe(true);
    expect(isConnectionFieldVisible(authString!, { prefectAuthMode: 'cloud' })).toBe(false);
  });

  it('keeps Redshift and Greenplum on different default ports via separate groups', () => {
    // Wave 0 lean-forms: the shared group is split (R-T1.9/10/11) — each
    // type carries only its own spec's fields, with its own placeholder.
    const redshift = connectionFieldsForType('Redshift').find((field) => field.key === 'hostPort');
    const greenplum = connectionFieldsForType('Greenplum').find((field) => field.key === 'hostPort');
    const timescale = connectionFieldsForType('Timescale').find((field) => field.key === 'hostPort');
    expect(redshift?.placeholder).toBe('localhost:5439');
    expect(greenplum?.placeholder).toBe('localhost:5432');
    expect(timescale?.placeholder).toBe('localhost:5432');
    expect(redshift?.placeholderByType).toBeUndefined();
    // The split is real: Redshift-only identifiers and Timescale-only
    // classification fields do not leak into the sibling groups.
    expect(connectionFieldsForType('Redshift').map((field) => field.key)).toContain('clusterIdentifier');
    expect(connectionFieldsForType('Greenplum').map((field) => field.key)).not.toContain('clusterIdentifier');
    expect(connectionFieldsForType('Timescale').map((field) => field.key)).toContain('classificationName');
    expect(connectionFieldsForType('Greenplum').map((field) => field.key)).not.toContain('classificationName');
  });

  it('shows sslConfig leaves only when sslMode is not disable', () => {
    const ca = connectionFieldsForType('Postgres').find((field) => field.key === 'sslCaCertificate');
    expect(ca).toBeDefined();
    expect(isConnectionFieldVisible(ca!, { sslMode: 'disable' })).toBe(false);
    expect(isConnectionFieldVisible(ca!, {})).toBe(false);
    expect(isConnectionFieldVisible(ca!, { sslMode: 'require' })).toBe(true);
    expect(isConnectionFieldVisible(ca!, { sslMode: 'verify-full' })).toBe(true);
    // MySQL has sslConfig but no sslMode: its leaves are always visible.
    const mysqlCa = connectionFieldsForType('Mysql').find((field) => field.key === 'sslCaCertificate');
    expect(mysqlCa).toBeDefined();
    expect(isConnectionFieldVisible(mysqlCa!, {})).toBe(true);
  });

  it('rolls back the UnityCatalog queryHistoryTable invent and mirrors the official field sets', () => {
    // M-Next B3: official unityCatalogConnection.json has no queryHistoryTable
    // (it was copied in from Databricks); official mysqlConnection.json has it.
    const ucKeys = connectionFieldsForType('UnityCatalog').map((field) => field.key);
    expect(ucKeys).not.toContain('queryHistoryTable');
    const mysqlKeys = connectionFieldsForType('Mysql').map((field) => field.key);
    expect(mysqlKeys).toEqual([
      'hostPort',
      'username',
      'databaseName',
      'databaseSchema',
      'queryHistoryTable',
      'password',
      'useSlowLogs',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    const databricksKeys = connectionFieldsForType('Databricks').map((field) => field.key);
    expect(databricksKeys).toContain('queryHistoryTable');
    // M-Next B6: official metabaseConnection.json lists password beside apiKey.
    const metabaseKeys = connectionFieldsForType('Metabase').map((field) => field.key);
    expect(metabaseKeys).toEqual(['hostPort', 'username', 'password', 'apiKey']);
    // M-Next B7: Kafka gains the securityProtocol Redpanda already had.
    // W2-5 lean-forms tier 2: new keys in each type's own spec order —
    // Kafka follows kafkaConnection.json, Redpanda redpandaConnection.json
    // (the suffix sits before securityProtocol there; Kafka has two SSL groups).
    const kafkaKeys = connectionFieldsForType('Kafka').map((field) => field.key);
    expect(kafkaKeys).toEqual([
      'bootstrapServers',
      'schemaRegistryURL',
      'saslUsername',
      'saslPassword',
      'securityProtocol',
      'saslMechanism',
      'basicAuthUserInfo',
      'consumerConfig',
      'schemaRegistryConfig',
      'schemaRegistryTopicSuffixName',
      'consumerConfigSSLCaCertificate',
      'consumerConfigSSLCertificate',
      'consumerConfigSSLKey',
      'schemaRegistrySSLCaCertificate',
      'schemaRegistrySSLCertificate',
      'schemaRegistrySSLKey',
      'storeConnectionSecrets',
      '',
    ]);
    const redpandaKeys = connectionFieldsForType('Redpanda').map((field) => field.key);
    expect(redpandaKeys).toEqual([
      'bootstrapServers',
      'schemaRegistryURL',
      'saslUsername',
      'saslPassword',
      'schemaRegistryTopicSuffixName',
      'securityProtocol',
      'saslMechanism',
      'basicAuthUserInfo',
      'consumerConfig',
      'schemaRegistryConfig',
      'storeConnectionSecrets',
      '',
    ]);
    expect(connectionFieldsForType('Kafka').find((field) => field.key === 'securityProtocol')).toEqual(
      connectionFieldsForType('Redpanda').find((field) => field.key === 'securityProtocol'),
    );
  });

  it('returns the tier 2 Superset/S3/Prefect field sets in spec order (W2-5 lean-forms)', () => {
    expect(connectionFieldsForType('Superset').map((field) => field.key)).toEqual([
      'hostPort',
      'provider',
      'username',
      '',
      'password',
      'verifySSL',
      'supersetSSLCaCertificate',
      'supersetSSLCertificate',
      'supersetSSLKey',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('S3').map((field) => field.key)).toEqual([
      'awsRegion',
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsSessionToken',
      'awsEndPointURL',
      'awsProfileName',
      'assumeRoleArn',
      'assumeRoleSessionName',
      'assumeRoleSourceIdentity',
      'awsIamEnabled',
      'bucketNames',
      'connectionOptions',
      'connectionArguments',
      'consoleEndpointURL',
      'storeConnectionSecrets',
      '',
    ]);
    expect(connectionFieldsForType('Prefect').map((field) => field.key)).toEqual([
      'hostPort',
      'prefectAuthMode',
      'prefectAccountId',
      'prefectWorkspaceId',
      'apiKey',
      'prefectAuthString',
      'numberOfStatus',
      'verifySSL',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'storeConnectionSecrets',
      '',
    ]);
    // W2-5: no showWhen linkage — the SASL / verifySSL / SSL-leaf fields
    // are always visible (the specs state no visibility rule for them).
    const saslMechanism = connectionFieldsForType('Kafka').find((field) => field.key === 'saslMechanism');
    expect(saslMechanism).toBeDefined();
    expect(isConnectionFieldVisible(saslMechanism!, {})).toBe(true);
    const supersetCa = connectionFieldsForType('Superset').find(
      (field) => field.key === 'supersetSSLCaCertificate',
    );
    expect(supersetCa).toBeDefined();
    expect(isConnectionFieldVisible(supersetCa!, {})).toBe(true);
    expect(isConnectionFieldVisible(supersetCa!, { verifySSL: 'no-ssl' })).toBe(true);
    const prefectCa = connectionFieldsForType('Prefect').find((field) => field.key === 'sslCaCertificate');
    expect(prefectCa).toBeDefined();
    expect(isConnectionFieldVisible(prefectCa!, { verifySSL: 'no-ssl' })).toBe(true);
  });

  it('lists the tier 3A fields in spec order, with the spec oneOf gates (W3-3A)', () => {
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toEqual([
      'openApiSchemaUrl',
      'apiKey',
      'docURL',
      'verifySSL',
      'restSSLCaCertificate',
      'restSSLCertificate',
      'restSSLKey',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('OpenMetadata').map((field) => field.key)).toEqual([
      'clusterName',
      'hostPort',
      'authProvider',
      'verifySSL',
      'openMetadataSSLCaCertificate',
      'openMetadataSSLCertificate',
      'openMetadataSSLKey',
      'jwtToken',
      'secretsManagerProvider',
      'secretsManagerLoader',
      'apiVersion',
      'enableVersionValidation',
      'omStoreServiceConnection',
      'extraHeaders',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('GoogleDrive').map((field) => field.key)).toEqual([
      'gcpConfigType',
      'credentialsJson',
      'gcpCredentialsPath',
      'gcpExternalAccountJson',
      'impersonateServiceAccount',
      'impersonateLifetime',
      'delegatedEmail',
      'driveId',
      'includeTeamDrives',
      'includeGoogleSheets',
      'connectionOptions',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('ElasticSearch').map((field) => field.key)).toEqual([
      'hostPort',
      'elasticSearchAuthMode',
      'username',
      'password',
      'apiKey',
      'apiKeyId',
      'sslCertMode',
      'sslCaCertPath',
      'sslClientCertPath',
      'sslPrivateKeyPath',
      'sslCaCertValue',
      'sslClientCertValue',
      'sslPrivateKeyValue',
      'sslStagingDir',
      'connectionTimeoutSecs',
      'connectionArguments',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('OpenAI').map((field) => field.key)).toEqual([
      'apiKey',
      'organization',
      'baseUrl',
      'openAITimeout',
      'openAIMaxRetries',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Mcp').map((field) => field.key)).toEqual([
      'discoveryMethod',
      'configFilePaths',
      'servers',
      'registryUrl',
      'connectionTimeout',
      'initializationTimeout',
      'fetchTools',
      'fetchResources',
      'fetchPrompts',
      'storeConnectionSecrets',
    ]);
    // Mlflow registryUri is a password control (spec format password);
    // the Mcp connectionTimeout lost its min: 1 (§2-11).
    expect(connectionFieldsForType('Mlflow').find((field) => field.key === 'registryUri')?.control).toBe(
      'password',
    );
    expect(
      connectionFieldsForType('Mcp').find((field) => field.key === 'connectionTimeout')?.min,
    ).toBeUndefined();
    // The spec oneOf gates: ES auth branches and ssl branches, GoogleDrive
    // gcpConfig branches. Mcp has no showWhen linkage (spec defines none).
    const esFields = connectionFieldsForType('ElasticSearch');
    const esUsername = esFields.find((field) => field.key === 'username')!;
    expect(isConnectionFieldVisible(esUsername, { elasticSearchAuthMode: 'basicAuth' })).toBe(true);
    expect(isConnectionFieldVisible(esUsername, { elasticSearchAuthMode: 'apiAuth' })).toBe(false);
    const esApiKey = esFields.find((field) => field.key === 'apiKey')!;
    expect(isConnectionFieldVisible(esApiKey, { elasticSearchAuthMode: 'apiAuth' })).toBe(true);
    expect(isConnectionFieldVisible(esApiKey, { elasticSearchAuthMode: 'basicAuth' })).toBe(false);
    const esCertValue = esFields.find((field) => field.key === 'sslCaCertValue')!;
    expect(isConnectionFieldVisible(esCertValue, { sslCertMode: 'values' })).toBe(true);
    expect(isConnectionFieldVisible(esCertValue, { sslCertMode: 'paths' })).toBe(false);
    const driveFields = connectionFieldsForType('GoogleDrive');
    const credentialsJson = driveFields.find((field) => field.key === 'credentialsJson')!;
    expect(isConnectionFieldVisible(credentialsJson, { gcpConfigType: 'gcpValues' })).toBe(true);
    expect(isConnectionFieldVisible(credentialsJson, { gcpConfigType: 'gcpADC' })).toBe(false);
    const credentialsPath = driveFields.find((field) => field.key === 'gcpCredentialsPath')!;
    expect(isConnectionFieldVisible(credentialsPath, { gcpConfigType: 'gcpCredentialsPath' })).toBe(true);
    expect(isConnectionFieldVisible(credentialsPath, { gcpConfigType: 'gcpValues' })).toBe(false);
    for (const field of connectionFieldsForType('Mcp')) {
      expect(field.showWhen).toBeUndefined();
    }
  });
});
