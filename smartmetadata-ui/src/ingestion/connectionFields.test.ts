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
  buildConnectionSections,
  clearInactiveAuthBranchFields,
  clearInactiveBranchFields,
  connectionDisplayHost,
  connectionFieldsForType,
  filterPatternDefaultExcludes,
  filterPatternSchemaMeta,
  hasStoredFileFieldValue,
  hydrateAuthBranchForm,
  isConnectionFieldVisible,
  mergeAuthBranchIntoConfig,
  missingRequiredConnectionFields,
  parseMapFieldValue,
  stringifyMapFieldValue,
  type ConnectionFieldDef,
  type ConnectionFieldGroup,
} from './connectionFields';
import { createEmptyServiceForm } from './connections';
import type { ServiceConnectionConfig, ServiceFormValues } from '../types/ingestion';

const IAM_KEYS = [
  'authAwsEnabled',
  'authAwsAccessKeyId',
  'authAwsSecretAccessKey',
  'authAwsRegion',
  'authAwsSessionToken',
  'authAwsEndPointURL',
  'authAwsProfileName',
  'authAssumeRoleArn',
  'authAssumeRoleSessionName',
  'authAssumeRoleSourceIdentity',
];

const AZURE_KEYS = [
  'authAzureClientId',
  'authAzureClientSecret',
  'authAzureTenantId',
  'authAzureAccountName',
  'authAzureVaultName',
  'authAzureScopes',
];

const GCP_KEYS = [
  'authGcpPassword',
  'authGcpEnableIamAuth',
  'authGcpConfigBranch',
  'authGcpProjectId',
  'authGcpPrivateKeyId',
  'authGcpPrivateKey',
  'authGcpClientEmail',
  'authGcpClientId',
  'authGcpAuthUri',
  'authGcpTokenUri',
  'authGcpAuthProviderX509CertUrl',
  'authGcpClientX509CertUrl',
  'authGcpUniverseDomain',
  'authGcpPath',
  'authGcpProjectId',
  'authGcpAudience',
  'authGcpSubjectTokenType',
  'authGcpTokenUrl',
  'authGcpCredentialSource',
  'authGcpProjectId',
  'authGcpImpersonateEmail',
  'authGcpImpersonateLifetime',
];

describe('connectionFields', () => {
  it('returns the Postgres field set in pin schema order (S-10/S-12)', () => {
    // Pin postgresConnection.json property order, with the authType oneOf
    // expanded to the branch selector + Basic/IAM/Azure branch fields at
    // the authType position; filter patterns and supports* stay out.
    const keys = connectionFieldsForType('Postgres').map((field) => field.key);
    expect(keys).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      ...AZURE_KEYS,
      'hostPort',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
    ]);
  });

  it('returns the database field sets in pin schema order (S-10/S-11/S-12)', () => {
    expect(connectionFieldsForType('Mysql').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      ...AZURE_KEYS,
      ...GCP_KEYS,
      'hostPort',
      'databaseName',
      'databaseSchema',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'useSlowLogs',
      'queryHistoryTable',
    ]);
    expect(connectionFieldsForType('MariaDB').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'databaseName',
      'databaseSchema',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Mssql').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'database',
      'driver',
      'encrypt',
      'trustServerCertificate',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'ingestAllDatabases',
      'includeSynonyms',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Snowflake').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      'account',
      'role',
      'database',
      'warehouse',
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
      'connectionOptions',
      'connectionArguments',
      'creditCost',
      'snowflakeSourceHost',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
    ]);
    expect(connectionFieldsForType('Doris').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'databaseName',
      'databaseSchema',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Redshift').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      'hostPort',
      'clusterIdentifier',
      'workgroupName',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Greenplum').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      'hostPort',
      'database',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'ingestAllDatabases',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Timescale').map((field) => field.key)).toEqual([
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      ...AZURE_KEYS,
      'hostPort',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(connectionFieldsForType('Databricks').map((field) => field.key)).toEqual([
      'scheme',
      'hostPort',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureTenantId',
      'azureClientSecret',
      'httpPath',
      'catalog',
      'databaseSchema',
      'connectionTimeout',
      'queryHistoryTable',
      'connectionOptions',
      'connectionArguments',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
    ]);
    expect(connectionFieldsForType('UnityCatalog').map((field) => field.key)).toEqual([
      'scheme',
      'hostPort',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureTenantId',
      'azureClientSecret',
      'httpPath',
      'catalog',
      'databaseSchema',
      'includeMetricViews',
      'connectionTimeout',
      'connectionOptions',
      'connectionArguments',
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
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
    ]);
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toContain('openApiSchemaUrl');
    // Non-default types in those kinds stay form-less: the wizard must
    // block creation for them rather than send an undefined connection.
    for (const type of ['Anthropic', 'Atlas', 'Sftp', 'OpenSearch', 'WEBHOOK', 'SageMaker', 'CustomLLM']) {
      expect(connectionFieldsForType(type)).toEqual([]);
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

  it('keeps Redshift, Greenplum and Timescale in separate groups with no field leakage', () => {
    // Wave 0 lean-forms: the shared group is split (R-T1.9/10/11) — each
    // type carries only its own spec's fields.
    const redshift = connectionFieldsForType('Redshift').find((field) => field.key === 'hostPort');
    const greenplum = connectionFieldsForType('Greenplum').find((field) => field.key === 'hostPort');
    const timescale = connectionFieldsForType('Timescale').find((field) => field.key === 'hostPort');
    expect(redshift).toBeDefined();
    expect(greenplum).toBeDefined();
    expect(timescale).toBeDefined();
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
      'scheme',
      'username',
      'authTypeBranch',
      'password',
      ...IAM_KEYS,
      ...AZURE_KEYS,
      ...GCP_KEYS,
      'hostPort',
      'databaseName',
      'databaseSchema',
      'sslCaCertificate',
      'sslCertificate',
      'sslKey',
      'connectionOptions',
      'connectionArguments',
      'useSlowLogs',
      'queryHistoryTable',
    ]);
    const databricksKeys = connectionFieldsForType('Databricks').map((field) => field.key);
    expect(databricksKeys).toContain('queryHistoryTable');
    // M-Next B6: official metabaseConnection.json lists password beside apiKey.
    // S-10: the Metabase group follows the pin property order
    // (username, password, apiKey, hostPort).
    const metabaseKeys = connectionFieldsForType('Metabase').map((field) => field.key);
    expect(metabaseKeys).toEqual(['username', 'password', 'apiKey', 'hostPort']);
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
    ]);
    // S-10: S3 follows the pin awsCredentials.json order — `enabled`
    // first, `awsRegion` after the secret key.
    expect(connectionFieldsForType('S3').map((field) => field.key)).toEqual([
      'awsIamEnabled',
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsRegion',
      'awsSessionToken',
      'awsEndPointURL',
      'awsProfileName',
      'assumeRoleArn',
      'assumeRoleSessionName',
      'assumeRoleSourceIdentity',
      'bucketNames',
      'connectionOptions',
      'connectionArguments',
      'consoleEndpointURL',
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
    ]);
    expect(connectionFieldsForType('OpenAI').map((field) => field.key)).toEqual([
      'apiKey',
      'organization',
      'baseUrl',
      'openAITimeout',
      'openAIMaxRetries',
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

describe('buildConnectionSections (S-09/S-10)', () => {
  it('assigns MySQL groups to pin sections in pin order, booleans last in scope', () => {
    const { sections, notes, hiddenUnsectioned } = buildConnectionSections('Mysql', {});
    expect(sections.map((section) => section.key)).toEqual([
      'connection',
      'authentication',
      'scope',
      'advanced',
    ]);
    expect(sections[0].groups.map((group) => group.name)).toEqual(['username', 'hostPort']);
    expect(sections[0].collapsible).toBe(false);
    expect(sections[0].defaultOpen).toBe(true);
    expect(sections[0].index).toBe(1);
    expect(sections[0].badge).toEqual({ kind: 'required', count: 2 });
    expect(sections[1].groups.map((group) => group.name)).toEqual(['authType']);
    expect(sections[1].layout).toBe('stack');
    expect(sections[1].index).toBe(2);
    expect(sections[2].groups.map((group) => group.name)).toEqual([
      'databaseName',
      'databaseSchema',
      'queryHistoryTable',
      'useSlowLogs',
    ]);
    expect(sections[2].collapsible).toBe(true);
    expect(sections[2].defaultOpen).toBe(false);
    expect(sections[2].index).toBe(3);
    expect(sections[2].badge).toEqual({ kind: 'optional' });
    expect(sections[3].groups.map((group) => group.name)).toEqual([
      'scheme',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(sections[3].collapsible).toBe(true);
    expect(sections[3].defaultOpen).toBe(false);
    expect(sections[3].index).toBeUndefined();
    expect(sections[3].badge).toBeNull();
    expect(sections[3].groups.find((group) => group.name === 'sslConfig')?.wide).toBe(true);
    expect(sections[3].groups.find((group) => group.name === 'scheme')?.wide).toBe(false);
    expect(notes).toEqual([]);
    expect(hiddenUnsectioned).toEqual([]);
  });

  it('flips the connection badge to optional once required fields are filled', () => {
    const filled = buildConnectionSections('Mysql', {
      username: 'root',
      hostPort: 'localhost:3306',
    });
    expect(filled.sections[0].badge).toEqual({ kind: 'optional' });
  });

  it('assigns Snowflake groups: password-format leaves land in authentication, primary advanced first', () => {
    const { sections } = buildConnectionSections('Snowflake', {});
    expect(sections.map((section) => section.key)).toEqual([
      'connection',
      'authentication',
      'scope',
      'advanced',
    ]);
    expect(sections[0].groups.map((group) => group.name)).toEqual([
      'username',
      'account',
      'warehouse',
    ]);
    expect(sections[1].groups.map((group) => group.name)).toEqual(['authType']);
    // The synthesized branches merge into the authType group: selector,
    // password branch, and key-pair branch render together.
    expect(
      sections[1].groups[0].fields.map((field) => field.key),
    ).toEqual([
      'authTypeBranch',
      'password',
      'privateKey',
      'snowflakePrivatekeyPassphrase',
    ]);
    expect(sections[2].groups.map((group) => group.name)).toEqual([
      'role',
      'database',
      'queryTag',
      'accountUsageSchema',
      'creditCost',
      'snowflakeSourceHost',
      'policyAgentConfig',
      'includeTransientTables',
      'includeStreams',
      'includeStages',
      'includeSemanticViews',
      'clientSessionKeepAlive',
    ]);
    expect(sections[3].groups.map((group) => group.name)).toEqual([
      'scheme',
      'useAccessHistory',
      'accessHistoryChunkSize',
      'systemMetricsBatchSize',
      'connectionOptions',
      'connectionArguments',
    ]);
  });
});

describe('scheme fields (S-11)', () => {
  it('exposes a visible select with the pin enum for every database type', () => {
    const expected: Record<string, string[]> = {
      Mysql: ['mysql+pymysql'],
      Postgres: ['postgresql+psycopg2', 'pgspider+psycopg2'],
      Snowflake: ['snowflake'],
      Doris: ['doris'],
      Mssql: ['mssql+pyodbc', 'mssql+pytds', 'mssql+pymssql'],
      MariaDB: ['mysql+pymysql'],
      Redshift: ['redshift+psycopg2'],
      Greenplum: ['postgresql+psycopg2'],
      Timescale: ['postgresql+psycopg2'],
      Databricks: ['databricks'],
      UnityCatalog: ['databricks'],
    };
    for (const [type, values] of Object.entries(expected)) {
      const scheme = connectionFieldsForType(type).find((field) => field.key === 'scheme');
      expect(scheme?.control).toBe('select');
      expect(scheme?.options?.map((option) => option.value)).toEqual(values);
      expect(scheme?.title).toBe('Connection Scheme');
      expect(scheme?.description).toBe('SQLAlchemy driver scheme options.');
    }
  });

  it('has no scheme field on non-database types', () => {
    for (const type of ['Kafka', 'S3', 'Metabase', 'Rest', 'ElasticSearch']) {
      expect(
        connectionFieldsForType(type).some((field) => field.key === 'scheme'),
      ).toBe(false);
    }
  });
});

describe('auth branch fields (S-12)', () => {
  it('offers the pin oneOf branches per type, with pin branch titles', () => {
    const branchTitles = (type: string) =>
      connectionFieldsForType(type)
        .find((field) => field.key === 'authTypeBranch')
        ?.options?.map((option) => option.title);
    expect(branchTitles('Mysql')).toEqual([
      'Basic Auth',
      'IAM Auth Configuration Source',
      'Azure Configuration Source',
      'GCP CloudSQL Configuration Source',
    ]);
    expect(branchTitles('Postgres')).toEqual([
      'Basic Auth',
      'IAM Auth Configuration Source',
      'Azure Configuration Source',
    ]);
    expect(branchTitles('Timescale')).toEqual([
      'Basic Auth',
      'IAM Auth Configuration Source',
      'Azure Configuration Source',
    ]);
    expect(branchTitles('Redshift')).toEqual([
      'Basic Auth',
      'IAM Auth Configuration Source',
    ]);
    expect(branchTitles('Greenplum')).toEqual([
      'Basic Auth',
      'IAM Auth Configuration Source',
    ]);
    const mysqlSelector = connectionFieldsForType('Mysql').find(
      (field) => field.key === 'authTypeBranch',
    );
    expect(mysqlSelector?.control).toBe('authSelect');
    expect(mysqlSelector?.title).toBe('Auth Configuration Type');
    expect(mysqlSelector?.defaultValue).toBe('basic');
    expect(mysqlSelector?.authNote).toBe(true);
    expect(mysqlSelector?.group).toBe('authType');
  });

  it('synthesizes the Snowflake password/key-pair selector (pin getSchemaWithSynthesizedAuthType)', () => {
    const selector = connectionFieldsForType('Snowflake').find(
      (field) => field.key === 'authTypeBranch',
    );
    expect(selector?.control).toBe('authSelect');
    expect(selector?.options).toEqual([
      { value: 'password', labelKey: 'forms.docPanel.passwordAuthTitle' },
      { value: 'keyPair', labelKey: 'forms.docPanel.keyPairAuthTitle' },
    ]);
    expect(selector?.defaultValue).toBe('password');
    expect(selector?.authNote).toBe(true);
  });

  it('gates branch fields on the selector with the basic/password default', () => {
    const mysql = connectionFieldsForType('Mysql');
    const region = mysql.find((field) => field.key === 'authAwsRegion')!;
    const password = mysql.find((field) => field.key === 'password')!;
    expect(isConnectionFieldVisible(region, {})).toBe(false);
    expect(isConnectionFieldVisible(region, { authTypeBranch: 'iam' })).toBe(true);
    expect(isConnectionFieldVisible(region, { authTypeBranch: 'azure' })).toBe(false);
    expect(isConnectionFieldVisible(password, {})).toBe(true);
    expect(isConnectionFieldVisible(password, { authTypeBranch: 'iam' })).toBe(false);
    expect(region.required).toBe(true);
    const snowflake = connectionFieldsForType('Snowflake');
    const privateKey = snowflake.find((field) => field.key === 'privateKey')!;
    const snowPassword = snowflake.find((field) => field.key === 'password')!;
    expect(isConnectionFieldVisible(privateKey, {})).toBe(false);
    expect(isConnectionFieldVisible(privateKey, { authTypeBranch: 'keyPair' })).toBe(true);
    expect(isConnectionFieldVisible(snowPassword, {})).toBe(true);
    expect(isConnectionFieldVisible(snowPassword, { authTypeBranch: 'keyPair' })).toBe(false);
  });

  it('gates GCP variant fields on both the branch and the variant selector', () => {
    const mysql = connectionFieldsForType('Mysql');
    const path = mysql.find((field) => field.key === 'authGcpPath')!;
    expect(isConnectionFieldVisible(path, {})).toBe(false);
    expect(isConnectionFieldVisible(path, { authTypeBranch: 'gcp' })).toBe(false);
    expect(
      isConnectionFieldVisible(path, {
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpCredentialsPath',
      }),
    ).toBe(true);
    const projectIdValues = mysql.find(
      (field) => field.testId === 'service-auth-gcp-project-id',
    )!;
    expect(
      isConnectionFieldVisible(projectIdValues, {
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpValues',
      }),
    ).toBe(true);
    expect(
      isConnectionFieldVisible(projectIdValues, {
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpADC',
      }),
    ).toBe(false);
  });
});

describe('schema titles and descriptions (S-15/S-16/S-17)', () => {
  it('carries pin schema titles for the MySQL headline fields', () => {
    const mysql = connectionFieldsForType('Mysql');
    expect(mysql.find((field) => field.key === 'hostPort')?.title).toBe('Host and Port');
    expect(mysql.find((field) => field.key === 'password')?.title).toBe('Password');
    expect(mysql.find((field) => field.key === 'password')?.description).toBe(
      'Password to connect to source.',
    );
    expect(mysql.find((field) => field.key === 'useSlowLogs')?.title).toBe(
      'Use Slow Logs for Lineage',
    );
    expect(mysql.find((field) => field.key === 'username')?.title).toBe('Username');
  });

  it('carries the D-L2 spec descriptions for databaseName/databaseSchema', () => {
    const mysql = connectionFieldsForType('Mysql');
    expect(mysql.find((field) => field.key === 'databaseName')?.description).toBe(
      'Optional name to give to the database in OpenMetadata. If left blank, we will use default as the database name.',
    );
    expect(mysql.find((field) => field.key === 'databaseSchema')?.description).toBe(
      'Database Schema of the data source. This is optional parameter, if you would like to restrict the metadata reading to a single schema. When left blank, OpenMetadata Ingestion attempts to scan all the schemas.',
    );
  });

  it('keeps inline hints only for the blank-means-keep secret hint', () => {
    for (const group of CONNECTION_FIELD_GROUPS) {
      for (const field of group.fields) {
        if (field.hintKey !== undefined) {
          expect(field.hintKey).toBe('connection.secretHint');
        }
        expect(field.extraKey).toBeUndefined();
      }
    }
  });
});

describe('SSL and map controls (S-13/S-14)', () => {
  it('renders SSL leaves as file-or-input with the pin accept lists', () => {
    const mysqlCa = connectionFieldsForType('Mysql').find(
      (field) => field.key === 'sslCaCertificate',
    );
    expect(mysqlCa?.control).toBe('fileOrInput');
    expect(mysqlCa?.acceptedFileTypes).toEqual(['.pem', '.crt', '.cer']);
    const snowPrivateKey = connectionFieldsForType('Snowflake').find(
      (field) => field.key === 'privateKey',
    );
    expect(snowPrivateKey?.control).toBe('fileOrInput');
    expect(snowPrivateKey?.acceptedFileTypes).toEqual(['.pem', '.key', '.p8']);
    const kafkaCa = connectionFieldsForType('Kafka').find(
      (field) => field.key === 'consumerConfigSSLCaCertificate',
    );
    expect(kafkaCa?.control).toBe('fileOrInput');
  });

  it('renders ElasticSearch certificate values as file-or-input and paths as text', () => {
    const es = connectionFieldsForType('ElasticSearch');
    expect(es.find((field) => field.key === 'sslCaCertValue')?.control).toBe('fileOrInput');
    expect(es.find((field) => field.key === 'sslPrivateKeyValue')?.control).toBe('fileOrInput');
    expect(es.find((field) => field.key === 'sslCaCertPath')?.control).toBe('text');
    expect(es.find((field) => field.key === 'sslPrivateKeyPath')?.control).toBe('text');
  });

  it('renders connectionOptions/connectionArguments as maps, free-form JSON stays textarea', () => {
    const mysql = connectionFieldsForType('Mysql');
    expect(mysql.find((field) => field.key === 'connectionOptions')?.control).toBe('map');
    expect(mysql.find((field) => field.key === 'connectionArguments')?.control).toBe('map');
    const kafka = connectionFieldsForType('Kafka');
    expect(kafka.find((field) => field.key === 'consumerConfig')?.control).toBe('textarea');
    expect(kafka.find((field) => field.key === 'schemaRegistryConfig')?.control).toBe('textarea');
    expect(
      connectionFieldsForType('OpenMetadata').find((field) => field.key === 'extraHeaders')
        ?.control,
    ).toBe('textarea');
  });
});

describe('map field adapters (S-14)', () => {
  it('parses JSON strings to string maps, dropping non-string values', () => {
    expect(parseMapFieldValue('{"a":"1","b":2,"c":null}')).toEqual({ a: '1' });
    expect(parseMapFieldValue('')).toEqual({});
    expect(parseMapFieldValue(undefined)).toEqual({});
    expect(parseMapFieldValue('not json')).toEqual({});
    expect(parseMapFieldValue('[]')).toEqual({});
    expect(parseMapFieldValue('  {"x": "y"}  ')).toEqual({ x: 'y' });
  });

  it('stringifies maps back, with empty maps as blank strings', () => {
    expect(stringifyMapFieldValue({})).toBe('');
    expect(stringifyMapFieldValue(undefined)).toBe('');
    expect(stringifyMapFieldValue({ a: '1' })).toBe('{"a":"1"}');
    expect(parseMapFieldValue(stringifyMapFieldValue({ k: 'v' }))).toEqual({ k: 'v' });
  });
});

describe('filter pattern defaults and meta (S-02)', () => {
  it('returns the pin schema default excludes per type and field', () => {
    expect(filterPatternDefaultExcludes('Mysql', 'schemaFilterPattern')).toEqual([
      '^information_schema$',
      '^performance_schema$',
    ]);
    expect(filterPatternDefaultExcludes('Snowflake', 'databaseFilterPattern')).toEqual([
      '^snowflake$',
    ]);
    expect(filterPatternDefaultExcludes('Mssql', 'storedProcedureFilterPattern')).toEqual([
      '^sp_',
      '^xp_',
      '^ms_',
    ]);
    expect(filterPatternDefaultExcludes('Postgres', 'tableFilterPattern')).toEqual([]);
    expect(filterPatternDefaultExcludes('Kafka', 'topicFilterPattern')).toEqual([
      '^__.*',
      '^_schemas$',
      '^_confluent.*',
    ]);
    expect(filterPatternDefaultExcludes('Oracle', 'schemaFilterPattern')).toEqual([]);
  });

  it('returns pin titles/descriptions for filter-pattern fields', () => {
    expect(filterPatternSchemaMeta('schemaFilterPattern')).toEqual({
      title: 'Default Schema Filter Pattern',
      description: 'Regex to only include/exclude schemas that matches the pattern.',
    });
    expect(filterPatternSchemaMeta('topicFilterPattern')?.title).toBe(
      'Default Topic Filter Pattern',
    );
    expect(filterPatternSchemaMeta('notAFilterPattern')).toBeUndefined();
  });
});

describe('connectionDisplayHost (S-02 connected message)', () => {
  it('prefers hostPort, then the pin host-key order, then account, then the type', () => {
    expect(
      connectionDisplayHost({ hostPort: 'db:3306', host: 'other' } as ServiceConnectionConfig, 'Mysql'),
    ).toBe('db:3306');
    expect(
      connectionDisplayHost({ host: '  host-only ' } as ServiceConnectionConfig, 'Mysql'),
    ).toBe('host-only');
    expect(
      connectionDisplayHost({ account: 'acc1' } as ServiceConnectionConfig, 'Mysql'),
    ).toBe('acc1');
    expect(connectionDisplayHost({} as ServiceConnectionConfig, 'Mysql')).toBe('Mysql');
    expect(
      connectionDisplayHost({ hostPort: '   ' } as ServiceConnectionConfig, 'Doris'),
    ).toBe('Doris');
  });

  it('suffixes bare Snowflake accounts and leaves Snowflake hostnames as-is', () => {
    expect(
      connectionDisplayHost({ account: 'xyz123' } as ServiceConnectionConfig, 'Snowflake'),
    ).toBe('xyz123.snowflakecomputing.com');
    expect(
      connectionDisplayHost(
        { account: 'xyz.snowflakecomputing.com' } as ServiceConnectionConfig,
        'Snowflake',
      ),
    ).toBe('xyz.snowflakecomputing.com');
    expect(
      connectionDisplayHost(
        { account: 'https://xyz.us-east-1.gcp.snowflakecomputing.com' } as ServiceConnectionConfig,
        'Snowflake',
      ),
    ).toBe('https://xyz.us-east-1.gcp.snowflakecomputing.com');
  });
});

describe('mergeAuthBranchIntoConfig (S-12)', () => {
  function formWith(values: Partial<ServiceFormValues>): ServiceFormValues {
    return { ...createEmptyServiceForm(), ...values };
  }

  it('replaces the basic authType wholesale with the IAM awsConfig', () => {
    const built: ServiceConnectionConfig = {
      hostPort: 'h:5432',
      authType: { password: 'old' },
    };
    const result = mergeAuthBranchIntoConfig(
      'Postgres',
      formWith({
        authTypeBranch: 'iam',
        authAwsAccessKeyId: 'AKID',
        authAwsSecretAccessKey: 'secret',
        authAwsRegion: 'us-east-1',
      }),
      built,
      undefined,
    );
    expect(result).toBe(built);
    expect(result.authType).toEqual({
      awsConfig: {
        awsAccessKeyId: 'AKID',
        awsSecretAccessKey: 'secret',
        awsRegion: 'us-east-1',
      },
    });
  });

  it('carries a masked stored IAM secret when the field is left blank', () => {
    const built: ServiceConnectionConfig = { hostPort: 'h' };
    const existing: ServiceConnectionConfig = {
      authType: {
        awsConfig: { awsSecretAccessKey: '*****', awsRegion: 'old-region' },
      },
    };
    const result = mergeAuthBranchIntoConfig(
      'Postgres',
      formWith({ authTypeBranch: 'iam', authAwsRegion: 'new-region' }),
      built,
      existing,
    );
    expect(result.authType).toEqual({
      awsConfig: { awsSecretAccessKey: '*****', awsRegion: 'new-region' },
    });
  });

  it('deletes authType when the IAM branch is entirely empty', () => {
    const built: ServiceConnectionConfig = { authType: { password: 'old' } };
    const result = mergeAuthBranchIntoConfig(
      'Postgres',
      formWith({ authTypeBranch: 'iam' }),
      built,
      undefined,
    );
    expect('authType' in result).toBe(false);
  });

  it('builds the Azure azureConfig branch', () => {
    const built: ServiceConnectionConfig = {};
    const result = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({
        authTypeBranch: 'azure',
        authAzureClientId: 'cid',
        authAzureClientSecret: 'cs',
        authAzureTenantId: 'tid',
      }),
      built,
      undefined,
    );
    expect(result.authType).toEqual({
      azureConfig: { clientId: 'cid', clientSecret: 'cs', tenantId: 'tid' },
    });
  });

  it('builds the GCP values variant with password, IAM toggle and credentials', () => {
    const built: ServiceConnectionConfig = {};
    const result = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({
        authTypeBranch: 'gcp',
        authGcpPassword: 'pw',
        authGcpEnableIamAuth: true,
        authGcpConfigBranch: 'gcpValues',
        authGcpProjectId: 'proj',
        authGcpPrivateKey: 'key',
        authGcpClientEmail: 'svc@example.com',
      }),
      built,
      undefined,
    );
    expect(result.authType).toEqual({
      password: 'pw',
      enableIamAuth: true,
      gcpConfig: {
        gcpConfig: {
          type: 'service_account',
          projectId: 'proj',
          privateKey: 'key',
          clientEmail: 'svc@example.com',
        },
      },
    });
  });

  it('builds the GCP path and external-account variants, dropping bad credential JSON', () => {
    const pathResult = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpCredentialsPath',
        authGcpPath: '/secrets/gcp.json',
        authGcpProjectId: 'proj',
      }),
      {},
      undefined,
    );
    expect(pathResult.authType?.gcpConfig?.gcpConfig).toEqual({
      type: 'gcp_credential_path',
      path: '/secrets/gcp.json',
      projectId: 'proj',
    });
    const externalResult = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpExternalAccount',
        authGcpAudience: 'aud',
        authGcpCredentialSource: 'not json',
      }),
      {},
      undefined,
    );
    expect(externalResult.authType?.gcpConfig?.gcpConfig).toEqual({
      type: 'external_account',
      audience: 'aud',
    });
    const sourceResult = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({
        authTypeBranch: 'gcp',
        authGcpConfigBranch: 'gcpExternalAccount',
        authGcpCredentialSource: '{"url":"https://example.com/token"}',
      }),
      {},
      undefined,
    );
    expect(sourceResult.authType?.gcpConfig?.gcpConfig).toEqual({
      type: 'external_account',
      credentialSource: { url: 'https://example.com/token' },
    });
  });

  it('leaves the basic branch untouched — the builder already wrote {password}', () => {
    const built: ServiceConnectionConfig = { authType: { password: 'pw' } };
    const result = mergeAuthBranchIntoConfig(
      'Mysql',
      formWith({ authTypeBranch: 'basic' }),
      built,
      undefined,
    );
    expect(result.authType).toEqual({ password: 'pw' });
  });

  it('drops the inactive flat branch on Snowflake, defaulting to password', () => {
    const keyPair = mergeAuthBranchIntoConfig(
      'Snowflake',
      formWith({ authTypeBranch: 'keyPair' }),
      { password: 'pw', privateKey: 'pk', snowflakePrivatekeyPassphrase: 'pp' },
      undefined,
    );
    expect('password' in keyPair).toBe(false);
    expect(keyPair.privateKey).toBe('pk');
    expect(keyPair.snowflakePrivatekeyPassphrase).toBe('pp');
    const password = mergeAuthBranchIntoConfig(
      'Snowflake',
      formWith({}),
      { password: 'pw', privateKey: 'pk', snowflakePrivatekeyPassphrase: 'pp' },
      undefined,
    );
    expect(password.password).toBe('pw');
    expect('privateKey' in password).toBe(false);
    expect('snowflakePrivatekeyPassphrase' in password).toBe(false);
  });

  it('passes flat-secret types through unchanged', () => {
    const built: ServiceConnectionConfig = { password: 'pw' };
    expect(mergeAuthBranchIntoConfig('Doris', formWith({}), built, undefined)).toBe(built);
    expect(built).toEqual({ password: 'pw' });
  });
});

describe('hydrateAuthBranchForm (S-12)', () => {
  function formWith(values: Partial<ServiceFormValues>): ServiceFormValues {
    return { ...createEmptyServiceForm(), ...values };
  }

  it('refills the IAM branch and leaves secrets blank', () => {
    const form = hydrateAuthBranchForm(
      'Postgres',
      {
        authType: {
          awsConfig: {
            enabled: true,
            awsAccessKeyId: 'AK',
            awsSecretAccessKey: '*****',
            awsRegion: 'r',
            assumeRoleArn: 'arn',
          },
        },
      },
      formWith({}),
    );
    expect(form.authTypeBranch).toBe('iam');
    expect(form.authAwsEnabled).toBe(true);
    expect(form.authAwsAccessKeyId).toBe('AK');
    expect(form.authAwsRegion).toBe('r');
    expect(form.authAssumeRoleArn).toBe('arn');
    expect(form.authAwsSecretAccessKey).toBeUndefined();
  });

  it('refills the Azure branch and leaves the client secret blank', () => {
    const form = hydrateAuthBranchForm(
      'Mysql',
      {
        authType: {
          azureConfig: { clientId: 'cid', clientSecret: '*****', tenantId: 'tid' },
        },
      },
      formWith({}),
    );
    expect(form.authTypeBranch).toBe('azure');
    expect(form.authAzureClientId).toBe('cid');
    expect(form.authAzureTenantId).toBe('tid');
    expect(form.authAzureClientSecret).toBeUndefined();
  });

  it('detects the GCP variant from the stored type and takes the first projectId', () => {
    const form = hydrateAuthBranchForm(
      'Mysql',
      {
        authType: {
          password: '*****',
          enableIamAuth: true,
          gcpConfig: {
            gcpConfig: {
              type: 'service_account',
              projectId: ['p1', 'p2'],
              privateKeyId: 'kid',
              clientEmail: 'svc@example.com',
            },
            gcpImpersonateServiceAccount: {
              impersonateServiceAccount: 'sa@example.com',
              lifetime: 3600,
            },
          },
        },
      },
      formWith({}),
    );
    expect(form.authTypeBranch).toBe('gcp');
    expect(form.authGcpConfigBranch).toBe('gcpValues');
    expect(form.authGcpProjectId).toBe('p1');
    expect(form.authGcpPrivateKeyId).toBe('kid');
    expect(form.authGcpClientEmail).toBe('svc@example.com');
    expect(form.authGcpEnableIamAuth).toBe(true);
    expect(form.authGcpImpersonateEmail).toBe('sa@example.com');
    expect(form.authGcpImpersonateLifetime).toBe(3600);
    expect(form.authGcpPassword).toBeUndefined();
    expect(form.authGcpPrivateKey).toBeUndefined();
  });

  it('detects the GCP external-account variant and stringifies credentialSource', () => {
    const form = hydrateAuthBranchForm(
      'Mysql',
      {
        authType: {
          gcpConfig: {
            gcpConfig: {
              type: 'external_account',
              audience: 'aud',
              credentialSource: { url: 'https://example.com/token' },
            },
          },
        },
      },
      formWith({}),
    );
    expect(form.authTypeBranch).toBe('gcp');
    expect(form.authGcpConfigBranch).toBe('gcpExternalAccount');
    expect(form.authGcpAudience).toBe('aud');
    expect(form.authGcpCredentialSource).toBe('{"url":"https://example.com/token"}');
  });

  it('defaults to basic when no branch config is stored', () => {
    const form = hydrateAuthBranchForm(
      'Mysql',
      { authType: { password: '*****' } },
      formWith({}),
    );
    expect(form.authTypeBranch).toBe('basic');
  });

  it('picks the Snowflake key-pair branch when a private key is stored', () => {
    expect(
      hydrateAuthBranchForm('Snowflake', { privateKey: 'pk' }, formWith({})).authTypeBranch,
    ).toBe('keyPair');
    expect(
      hydrateAuthBranchForm('Snowflake', { password: '*****' }, formWith({})).authTypeBranch,
    ).toBe('password');
  });

  it('leaves flat-secret types untouched', () => {
    const form = formWith({ password: 'typed' });
    expect(hydrateAuthBranchForm('Doris', { password: '*****' }, form)).toBe(form);
    expect(form.authTypeBranch).toBeUndefined();
  });
});

describe('branch sanitize helpers (S-12)', () => {
  it('clearInactiveAuthBranchFields discards the other branches only', () => {
    const form: ServiceFormValues = {
      ...createEmptyServiceForm(),
      password: 'pw',
      authAwsRegion: 'r',
      authAzureClientId: 'cid',
      authGcpProjectId: 'p',
    };
    clearInactiveAuthBranchFields('Mysql', form, 'iam');
    expect(form.password).toBeUndefined();
    expect(form.authAwsRegion).toBe('r');
    expect(form.authAzureClientId).toBeUndefined();
    expect(form.authGcpProjectId).toBeUndefined();
    const snow: ServiceFormValues = {
      ...createEmptyServiceForm(),
      password: 'pw',
      privateKey: 'pk',
    };
    clearInactiveAuthBranchFields('Snowflake', snow, 'keyPair');
    expect(snow.password).toBeUndefined();
    expect(snow.privateKey).toBe('pk');
  });

  it('clearInactiveBranchFields clears only fields gated on the switched selector', () => {
    const fields: ConnectionFieldDef[] = [
      {
        key: 'hostPort',
        control: 'text',
        labelKey: 'x',
        branch: 'a',
        showWhen: { field: 'sel', equals: 'a' },
      },
      {
        key: 'username',
        control: 'text',
        labelKey: 'x',
        branch: 'b',
        showWhen: { field: 'sel', equals: 'b' },
      },
      {
        key: 'password',
        control: 'text',
        labelKey: 'x',
        branch: 'b',
        showWhen: { field: 'other', equals: 'b' },
      },
      { key: 'databaseName', control: 'text', labelKey: 'x' },
    ];
    const form = {
      ...createEmptyServiceForm(),
      hostPort: 'k',
      username: 'c',
      password: 'o',
      databaseName: 'u',
    } as ServiceFormValues;
    clearInactiveBranchFields(fields, form, 'sel', 'a');
    expect((form as unknown as Record<string, unknown>)['hostPort']).toBe('k');
    expect((form as unknown as Record<string, unknown>)['username']).toBeUndefined();
    expect((form as unknown as Record<string, unknown>)['password']).toBe('o');
    expect((form as unknown as Record<string, unknown>)['databaseName']).toBe('u');
  });
});

describe('hasStoredFileFieldValue (S-13)', () => {
  it('resolves nested stored paths for SSL, Superset, ES and GCP leaves', () => {
    expect(
      hasStoredFileFieldValue(
        { sslConfig: { caCertificate: '---CERT---' } },
        'sslCaCertificate',
      ),
    ).toBe(true);
    expect(hasStoredFileFieldValue({ sslConfig: {} }, 'sslCaCertificate')).toBe(false);
    expect(
      hasStoredFileFieldValue(
        { connection: { sslConfig: { sslKey: 'k' } } } as ServiceConnectionConfig,
        'supersetSSLKey',
      ),
    ).toBe(true);
    expect(
      hasStoredFileFieldValue(
        { sslConfig: { certificates: { caCertValue: 'v' } } } as ServiceConnectionConfig,
        'sslCaCertValue',
      ),
    ).toBe(true);
    expect(
      hasStoredFileFieldValue(
        {
          authType: { gcpConfig: { gcpConfig: { privateKey: 'pk' } } },
        } as ServiceConnectionConfig,
        'authGcpPrivateKey',
      ),
    ).toBe(true);
    expect(hasStoredFileFieldValue({ privateKey: 'pk' }, 'privateKey')).toBe(true);
    expect(hasStoredFileFieldValue({ privateKey: '   ' }, 'privateKey')).toBe(false);
    expect(hasStoredFileFieldValue(undefined, 'sslCaCertificate')).toBe(false);
    expect(hasStoredFileFieldValue({}, 'notAFileField')).toBe(false);
  });
});

describe('missingRequiredConnectionFields (S-03)', () => {
  it('counts visible required blanks, branch-aware', () => {
    const empty = createEmptyServiceForm();
    expect(missingRequiredConnectionFields('Mysql', empty)).toBe(2);
    expect(
      missingRequiredConnectionFields('Mysql', {
        ...empty,
        username: 'root',
        hostPort: 'localhost:3306',
      }),
    ).toBe(0);
    expect(
      missingRequiredConnectionFields('Mysql', { ...empty, authTypeBranch: 'iam' }),
    ).toBe(3);
    expect(
      missingRequiredConnectionFields('Mysql', {
        ...empty,
        authTypeBranch: 'iam',
        username: 'root',
        hostPort: 'localhost:3306',
        authAwsRegion: 'us-east-1',
      }),
    ).toBe(0);
    expect(missingRequiredConnectionFields('Snowflake', empty)).toBe(3);
  });
});
