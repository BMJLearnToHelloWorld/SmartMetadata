/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_FIELD_GROUPS,
  buildConnectionSections,
  clearInactiveAlationDbAuthBranchFields,
  clearInactiveAuthBranchFields,
  clearInactiveBranchFields,
  connectionDisplayHost,
  connectionFieldSchema,
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
import { SERVICE_FILTER_PATTERN_FIELDS } from './ingestionSchemas';
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
      'azureClientSecret',
      'azureTenantId',
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
      'azureClientSecret',
      'azureTenantId',
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
    // 18 pre-existing types + the eight kinds' default types (A9) + the
    // five A-class types (A2, 2026-11-19) + the ten blocked-C rows
    // (T-2, 2026-11-20).
    expect(types.size).toBe(41);
    for (const type of types) {
      if (type === 'Sklearn') {
        // T-2: sklearnConnection.json has no form leaves (only `type` +
        // filter patterns + capability flags) — the empty group IS the
        // coverage; the type-only payload is valid (see the Q4 exemption
        // in buildServiceConnection).
        expect(connectionFieldsForType(type)).toEqual([]);
      } else {
        expect(connectionFieldsForType(type).length).toBeGreaterThan(0);
      }
    }
  });

  it('covers the eight previously form-less kinds via their default types, and blocks the rest', () => {
    expect(connectionFieldsForType('Mlflow').map((field) => field.key)).toEqual([
      'trackingUri',
      'registryUri',
    ]);
    expect(connectionFieldsForType('OpenMetadata').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('GoogleDrive').map((field) => field.key)).toContain('authGcpPrivateKey');
    expect(connectionFieldsForType('ElasticSearch').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('OpenAI').map((field) => field.key)).toContain('apiKey');
    expect(connectionFieldsForType('Mcp').map((field) => field.key)).toContain('registryUrl');
    expect(connectionFieldsForType('Ranger').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'password',
    ]);
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toContain('openApiSchemaUrl');
    // T-2 (2026-11-20): Atlas / Sftp / OpenSearch / SageMaker landed
    // with the blocked-C rows — they are no longer form-less.
    for (const type of ['Atlas', 'Sftp', 'OpenSearch', 'SageMaker']) {
      expect(connectionFieldsForType(type).length).toBeGreaterThan(0);
    }
    // Non-default types in those kinds stay form-less: the wizard must
    // block creation for them rather than send an undefined connection.
    for (const type of ['Anthropic', 'WEBHOOK', 'CustomLLM']) {
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
    // T-2 (2026-11-20): the nested `connection` oneOf — the API branch
    // plus the Postgres / Mysql database branches (shared IAM / Azure /
    // GCP leaves appear once, gated by the branch selectors).
    expect(connectionFieldsForType('Superset').map((field) => field.key)).toEqual([
      'hostPort',
      'supersetConnectionBranch',
      'provider',
      'username',
      '',
      'password',
      'verifySSL',
      'supersetSSLCaCertificate',
      'supersetSSLCertificate',
      'supersetSSLKey',
      'supersetDbScheme',
      'supersetDbUsername',
      'supersetDbAuthBranch',
      'supersetDbPassword',
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
      'authAzureClientId',
      'authAzureClientSecret',
      'authAzureTenantId',
      'authAzureAccountName',
      'authAzureVaultName',
      'authAzureScopes',
      'supersetDbHostPort',
      'supersetDbDatabase',
      'supersetDbIngestAllDatabases',
      'supersetDbSslMode',
      'supersetDbSslCaCertificate',
      'supersetDbSslCertificate',
      'supersetDbSslKey',
      'supersetDbClassificationName',
      'supersetDbQueryStatementSource',
      'supersetDbConnectionOptions',
      'supersetDbConnectionArguments',
      'supersetDbScheme',
      'supersetDbUsername',
      'supersetDbAuthBranch',
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
      'supersetDbHostPort',
      'supersetDbDatabaseName',
      'supersetDbDatabaseSchema',
      'supersetDbSslCaCertificate',
      'supersetDbSslCertificate',
      'supersetDbSslKey',
      'supersetDbConnectionOptions',
      'supersetDbConnectionArguments',
      'supersetDbUseSlowLogs',
      'supersetDbQueryHistoryTable',
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
      'apiKey',
      'prefectAccountId',
      'prefectWorkspaceId',
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
    // T-2 (2026-11-20): the openAPISchemaConnection oneOf (URL /
    // FilePath / S3) plus the apiEndpointFilterPattern leaf.
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toEqual([
      'restSchemaBranch',
      'openApiSchemaUrl',
      'openApiSchemaFilePath',
      'openApiSchemaS3Url',
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
      'apiKey',
      'docURL',
      'apiEndpointFilterPattern',
      'verifySSL',
      'restSSLCaCertificate',
      'restSSLCertificate',
      'restSSLKey',
    ]);
    // T-2 (2026-11-20): the B group (13 include* switches,
    // limitRecords, forceEntityOverwriting, elasticsSearch) in pin order.
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
      'enableVersionValidation',
      'includeDatabaseServices',
      'includePipelineServices',
      'limitRecords',
      'forceEntityOverwriting',
      'omStoreServiceConnection',
      'omElasticSearchType',
      'omElasticSearchConfig',
      'extraHeaders',
    ]);
    // T-2 (2026-11-20): per-leaf GCP variants on the shared authGcp*
    // keys (the JSON-blob fields are gone).
    expect(connectionFieldsForType('GoogleDrive').map((field) => field.key)).toEqual([
      'gcpConfigType',
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
    const valuesProjectId = driveFields.find((field) => field.key === 'authGcpProjectId')!;
    expect(isConnectionFieldVisible(valuesProjectId, { gcpConfigType: 'gcpValues' })).toBe(true);
    expect(isConnectionFieldVisible(valuesProjectId, { gcpConfigType: 'gcpADC' })).toBe(false);
    const credentialsPath = driveFields.find((field) => field.key === 'authGcpPath')!;
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

  it('refills the Alation nested IAM branch into the shared keys', () => {
    const form = hydrateAuthBranchForm(
      'Alation',
      {
        connection: {
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
      } as ServiceConnectionConfig,
      formWith({}),
    );
    expect(form.alationDbAuthBranch).toBe('iam');
    expect(form.authAwsEnabled).toBe(true);
    expect(form.authAwsAccessKeyId).toBe('AK');
    expect(form.authAwsRegion).toBe('r');
    expect(form.authAssumeRoleArn).toBe('arn');
    expect(form.authAwsSecretAccessKey).toBeUndefined();
  });

  it('refills the Alation nested GCP branch and its impersonate block', () => {
    const form = hydrateAuthBranchForm(
      'Alation',
      {
        connection: {
          authType: {
            password: '*****',
            enableIamAuth: true,
            gcpConfig: {
              gcpConfig: {
                type: 'service_account',
                projectId: 'p1',
                clientEmail: 'svc@example.com',
              },
              gcpImpersonateServiceAccount: {
                impersonateServiceAccount: 'sa@example.com',
                lifetime: 3600,
              },
            },
          },
        },
      } as ServiceConnectionConfig,
      formWith({}),
    );
    expect(form.alationDbAuthBranch).toBe('gcp');
    expect(form.authGcpConfigBranch).toBe('gcpValues');
    expect(form.authGcpProjectId).toBe('p1');
    expect(form.authGcpClientEmail).toBe('svc@example.com');
    expect(form.authGcpEnableIamAuth).toBe(true);
    expect(form.authGcpImpersonateEmail).toBe('sa@example.com');
    expect(form.authGcpImpersonateLifetime).toBe(3600);
    expect(form.authGcpPrivateKey).toBeUndefined();
  });

  it('defaults the Alation nested branch to basic when no nested auth is stored', () => {
    const form = hydrateAuthBranchForm(
      'Alation',
      { connection: { authType: { password: '*****' } } } as ServiceConnectionConfig,
      formWith({}),
    );
    expect(form.alationDbAuthBranch).toBe('basic');
  });

  it('refills the VertexAI GCP variant from credentials', () => {
    const form = hydrateAuthBranchForm(
      'VertexAI',
      {
        credentials: {
          gcpConfig: {
            type: 'gcp_credential_path',
            path: '/tmp/sa.json',
            projectId: 'p9',
          },
          gcpImpersonateServiceAccount: {
            impersonateServiceAccount: 'sa@example.com',
          },
        },
      } as ServiceConnectionConfig,
      formWith({}),
    );
    expect(form.authGcpConfigBranch).toBe('gcpCredentialsPath');
    expect(form.authGcpPath).toBe('/tmp/sa.json');
    expect(form.authGcpProjectId).toBe('p9');
    expect(form.authGcpImpersonateEmail).toBe('sa@example.com');
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

  it('clearInactiveAlationDbAuthBranchFields wipes the other nested branches, including GCP variants', () => {
    const form: ServiceFormValues = {
      ...createEmptyServiceForm(),
      alationDbPassword: 'dbpw',
      authAwsRegion: 'r',
      authAzureClientId: 'cid',
      authGcpProjectId: 'p',
      authGcpPrivateKey: 'pk',
      authGcpImpersonateEmail: 'sa@example.com',
    };
    clearInactiveAlationDbAuthBranchFields(form, 'iam');
    expect(form.alationDbPassword).toBeUndefined();
    expect(form.authAwsRegion).toBe('r');
    expect(form.authAzureClientId).toBeUndefined();
    expect(form.authGcpProjectId).toBeUndefined();
    expect(form.authGcpPrivateKey).toBeUndefined();
    expect(form.authGcpImpersonateEmail).toBeUndefined();
    const basic: ServiceFormValues = {
      ...createEmptyServiceForm(),
      alationDbPassword: 'dbpw',
      authAwsRegion: 'r',
    };
    clearInactiveAlationDbAuthBranchFields(basic, 'basic');
    expect(basic.alationDbPassword).toBe('dbpw');
    expect(basic.authAwsRegion).toBeUndefined();
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
    expect(
      hasStoredFileFieldValue(
        { connection: { sslConfig: { caCertificate: '---CERT---' } } } as ServiceConnectionConfig,
        'alationDbSslCaCertificate',
      ),
    ).toBe(true);
    expect(
      hasStoredFileFieldValue(
        { connection: { sslConfig: {} } } as ServiceConnectionConfig,
        'alationDbSslCaCertificate',
      ),
    ).toBe(false);
    expect(
      hasStoredFileFieldValue(
        { credentials: { gcpConfig: { privateKey: 'pk' } } } as ServiceConnectionConfig,
        'authGcpPrivateKey',
        'VertexAI',
      ),
    ).toBe(true);
    expect(
      hasStoredFileFieldValue(
        {
          connection: {
            authType: { gcpConfig: { gcpConfig: { privateKey: 'pk' } } },
          },
        } as ServiceConnectionConfig,
        'authGcpPrivateKey',
        'Alation',
      ),
    ).toBe(true);
    expect(
      hasStoredFileFieldValue(
        { credentials: { gcpConfig: { privateKey: 'pk' } } } as ServiceConnectionConfig,
        'authGcpPrivateKey',
        'Mysql',
      ),
    ).toBe(false);
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

describe('A2 A-class field sets (T-2)', () => {
  const ALATION_NESTED_SSL_KEYS = [
    'alationDbSslCaCertificate',
    'alationDbSslCertificate',
    'alationDbSslKey',
  ];
  const ALATION_KEYS = [
    'hostPort',
    'alationAuthBranch',
    'username',
    'password',
    'alationAccessToken',
    'alationConnectionBranch',
    // Nested PostgresConnection leaves (pin order).
    'alationDbScheme',
    'alationDbUsername',
    'alationDbAuthBranch',
    'alationDbPassword',
    ...IAM_KEYS,
    ...AZURE_KEYS,
    'alationDbHostPort',
    'alationDbDatabase',
    'alationDbIngestAllDatabases',
    'alationDbSslMode',
    ...ALATION_NESTED_SSL_KEYS,
    'alationDbClassificationName',
    'alationDbQueryStatementSource',
    'alationDbConnectionOptions',
    'alationDbConnectionArguments',
    // Nested MysqlConnection leaves (pin order).
    'alationDbScheme',
    'alationDbUsername',
    'alationDbAuthBranch',
    ...GCP_KEYS,
    'alationDbHostPort',
    'alationDbDatabaseName',
    'alationDbDatabaseSchema',
    ...ALATION_NESTED_SSL_KEYS,
    'alationDbConnectionOptions',
    'alationDbConnectionArguments',
    'alationDbUseSlowLogs',
    'alationDbQueryHistoryTable',
    // Top-level Alation API settings (pin order after `connection`).
    'projectName',
    'paginationLimit',
    'includeUndeployedDatasources',
    'includeHiddenDatasources',
    'ingestDatasources',
    'ingestUsersAndGroups',
    'ingestDomains',
    'ingestKnowledgeArticles',
    'ingestDashboards',
    'alationTagClassificationName',
    'connectionOptions',
    'connectionArguments',
  ];

  it('returns the VertexAI field set in pin schema order', () => {
    // Pin vertexaiConnection.json: credentials (gcpConfig oneOf, 4 variants
    // + impersonate) then location. The Mysql GCP head fields (password /
    // enableIamAuth) are NOT part of this schema.
    expect(connectionFieldsForType('VertexAI').map((field) => field.key)).toEqual([
      'authGcpConfigBranch',
      ...GCP_KEYS.slice(3),
      'location',
    ]);
    const location = connectionFieldsForType('VertexAI').find(
      (field) => field.key === 'location',
    );
    expect(location?.required).toBe(true);
    expect(location?.title).toBe('Project location');
    expect(location?.description).toBe('location/region of google cloud project');
  });

  it('returns the Alation field set in pin schema order', () => {
    expect(connectionFieldsForType('Alation').map((field) => field.key)).toEqual(ALATION_KEYS);
  });

  it('returns the Collibra field set in pin schema order (connection form: 8 leaves)', () => {
    // Pin collibraConnection.json order, including the glossary/domain
    // filter leaves (D-A2-3): they render in the connection form's Scope
    // section AND in the filter step, both on the same config keys.
    expect(connectionFieldsForType('Collibra').map((field) => field.key)).toEqual([
      'username',
      'password',
      'hostPort',
      'glossaryFilterPattern',
      'domainFilterPattern',
      'enableEnrichment',
      'connectionOptions',
      'connectionArguments',
    ]);
    const fields = connectionFieldsForType('Collibra');
    expect(fields.find((field) => field.key === 'glossaryFilterPattern')).toMatchObject({
      control: 'filterPattern',
      title: 'Glossary Filter Pattern',
      description: 'Regex to only include/exclude glossaries that match the pattern.',
      testId: 'service-collibra-glossary-filter-pattern',
    });
    expect(fields.find((field) => field.key === 'domainFilterPattern')).toMatchObject({
      control: 'filterPattern',
      title: 'Domain Filter Pattern',
      description: 'Regex to only include/exclude domains that match the pattern.',
      testId: 'service-collibra-domain-filter-pattern',
    });
    const enrichment = connectionFieldsForType('Collibra').find(
      (field) => field.key === 'enableEnrichment',
    );
    expect(enrichment?.title).toBe('Enable Asset Enrichment');
    expect(enrichment?.description).toBe(
      'Enable enrichment of existing OpenMetadata assets with Collibra metadata (descriptions, tags, owners). When enabled, the connector will match Collibra assets to OpenMetadata entities and apply metadata without creating new assets.',
    );
  });

  it('returns the MetadataES field set in pin schema order', () => {
    expect(connectionFieldsForType('MetadataES').map((field) => field.key)).toEqual([
      'metadataESEntities',
      'recreateIndex',
      'runMode',
      'searchIndexMappingLanguage',
      'batchSize',
    ]);
    const fields = connectionFieldsForType('MetadataES');
    expect(fields.find((field) => field.key === 'metadataESEntities')?.description).toBe(
      'List of entities that you need to reindex',
    );
    expect(fields.find((field) => field.key === 'recreateIndex')?.title).toBe(
      'Recreate Indexes',
    );
    expect(fields.find((field) => field.key === 'runMode')?.description).toBe(
      'This schema publisher run modes.',
    );
    expect(fields.find((field) => field.key === 'batchSize')?.description).toBe(
      'Maximum number of events sent in a batch (Default 100).',
    );
  });

  it('returns the SharePoint field set in pin schema order', () => {
    expect(connectionFieldsForType('SharePoint').map((field) => field.key)).toEqual([
      'clientId',
      'clientSecret',
      'tenantId',
      'siteUrl',
      'siteName',
      'driveId',
      'connectionOptions',
      'connectionArguments',
    ]);
    const fields = connectionFieldsForType('SharePoint');
    expect(fields.find((field) => field.key === 'siteUrl')?.title).toBe('Site URL');
    expect(fields.find((field) => field.key === 'siteUrl')?.defaultValue).toBeUndefined();
  });

  it('carries the A2 selector options (pin enums)', () => {
    const alation = connectionFieldsForType('Alation');
    expect(
      alation
        .find((field) => field.key === 'alationAuthBranch')
        ?.options?.map((option) => option.value),
    ).toEqual(['basicAuth', 'apiToken']);
    expect(
      alation
        .find((field) => field.key === 'alationConnectionBranch')
        ?.options?.map((option) => option.value),
    ).toEqual(['postgres', 'mysql', 'none']);
    const dbAuth = alation.filter((field) => field.key === 'alationDbAuthBranch');
    expect(dbAuth).toHaveLength(2);
    expect(dbAuth[0].options?.map((option) => option.value)).toEqual([
      'basic',
      'iam',
      'azure',
    ]);
    expect(dbAuth[1].options?.map((option) => option.value)).toEqual([
      'basic',
      'iam',
      'azure',
      'gcp',
    ]);
    const schemes = alation.filter((field) => field.key === 'alationDbScheme');
    expect(schemes).toHaveLength(2);
    expect(schemes[0].options?.map((option) => option.value)).toEqual([
      'postgresql+psycopg2',
      'pgspider+psycopg2',
    ]);
    expect(schemes[1].options?.map((option) => option.value)).toEqual(['mysql+pymysql']);
    const metadataES = connectionFieldsForType('MetadataES');
    expect(
      metadataES
        .find((field) => field.key === 'runMode')
        ?.options?.map((option) => option.value),
    ).toEqual(['stream', 'batch']);
    expect(
      metadataES
        .find((field) => field.key === 'searchIndexMappingLanguage')
        ?.options?.map((option) => option.value),
    ).toEqual(['EN', 'JP', 'ZH', 'RU', 'KO']);
    const vertexAI = connectionFieldsForType('VertexAI');
    expect(
      vertexAI
        .find((field) => field.key === 'authGcpConfigBranch')
        ?.options?.map((option) => option.value),
    ).toEqual(['gcpValues', 'gcpCredentialsPath', 'gcpExternalAccount', 'gcpADC']);
  });

  it('marks secret leaves required exactly where pin requires them (A2 covered fix)', () => {
    // Deduplicated: the two-copy nested defs (Postgres/Mysql username and
    // hostPort) carry the same required flag on both copies.
    const required = (type: string): string[] => [
      ...new Set(
        connectionFieldsForType(type)
          .filter((field) => field.required)
          .map((field) => field.key as string),
      ),
    ];
    expect(required('VertexAI')).toEqual(['location']);
    // Alation: hostPort + username/password (basicAuth branch) +
    // alationAccessToken (apiToken branch) + alationDbUsername/hostPort/
    // database (nested Postgres) + authAwsRegion (the shared IAM defs
    // mark the region required, as for Mysql/Postgres). The nested
    // alationDbPassword stays unmarked: pin's nested Postgres/Mysql
    // required arrays do not contain a password.
    expect(required('Alation')).toEqual([
      'hostPort',
      'username',
      'password',
      'alationAccessToken',
      'alationDbUsername',
      'authAwsRegion',
      'alationDbHostPort',
      'alationDbDatabase',
    ]);
    expect(required('Collibra')).toEqual(['username', 'password', 'hostPort']);
    expect(required('MetadataES')).toEqual([]);
    expect(required('SharePoint')).toEqual(['clientId', 'clientSecret', 'tenantId', 'siteUrl']);
  });

  it('gates the Alation nested leaves on the connection + nested auth selectors', () => {
    const fields = connectionFieldsForType('Alation');
    const visibleKeys = (form: Partial<ServiceFormValues>): string[] =>
      fields.filter((field) => isConnectionFieldVisible(field, form)).map((field) => field.key as string);
    const defaults = visibleKeys({});
    // Postgres is the default connection branch; basic is the default auth.
    expect(defaults).toContain('alationDbScheme');
    expect(defaults).toContain('alationDbUsername');
    expect(defaults).toContain('alationDbPassword');
    expect(defaults).toContain('alationDbDatabase');
    expect(defaults).not.toContain('alationDbDatabaseName');
    expect(defaults).not.toContain('authGcpProjectId');
    const mysqlGcp = visibleKeys({
      alationConnectionBranch: 'mysql',
      alationDbAuthBranch: 'gcp',
    });
    expect(mysqlGcp).toContain('alationDbDatabaseName');
    expect(mysqlGcp).toContain('authGcpProjectId');
    expect(mysqlGcp).not.toContain('alationDbDatabase');
    expect(mysqlGcp).not.toContain('alationDbPassword');
    const none = visibleKeys({ alationConnectionBranch: 'none' });
    expect(none).not.toContain('alationDbScheme');
    expect(none).not.toContain('alationDbUsername');
    expect(none).toContain('hostPort');
    expect(none).toContain('projectName');
    const apiToken = visibleKeys({ alationAuthBranch: 'apiToken' });
    expect(apiToken).toContain('alationAccessToken');
    expect(apiToken).not.toContain('username');
  });

  it('gates the VertexAI GCP variant leaves on the credentials selector', () => {
    const fields = connectionFieldsForType('VertexAI');
    const visibleKeys = (form: Partial<ServiceFormValues>): string[] =>
      fields.filter((field) => isConnectionFieldVisible(field, form)).map((field) => field.key as string);
    expect(visibleKeys({})).toContain('authGcpProjectId');
    expect(visibleKeys({})).not.toContain('authGcpPath');
    expect(visibleKeys({ authGcpConfigBranch: 'gcpCredentialsPath' })).toContain('authGcpPath');
    expect(visibleKeys({ authGcpConfigBranch: 'gcpCredentialsPath' })).not.toContain(
      'authGcpPrivateKey',
    );
    expect(visibleKeys({ authGcpConfigBranch: 'gcpADC' })).toContain('authGcpProjectId');
  });

  it('counts visible required blanks per A2 row, branch-aware', () => {
    const empty = createEmptyServiceForm();
    expect(missingRequiredConnectionFields('VertexAI', empty)).toBe(1);
    expect(missingRequiredConnectionFields('VertexAI', { ...empty, location: 'us-central1' })).toBe(0);
    // Alation empty: hostPort + top password (basicAuth is the default
    // branch) + nested alationDbUsername/hostPort/database = 6.
    expect(missingRequiredConnectionFields('Alation', empty)).toBe(6);
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        alationDbAuthBranch: 'iam',
      }),
    ).toBe(7);
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        alationConnectionBranch: 'mysql',
      }),
    ).toBe(5);
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        alationConnectionBranch: 'none',
      }),
    ).toBe(3);
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        hostPort: 'alation:443',
        username: 'api-user',
        password: 'secret',
        alationDbUsername: 'db-user',
        alationDbHostPort: 'db:5432',
        alationDbDatabase: 'alation',
      }),
    ).toBe(0);
    // apiToken branch: the top password is hidden, the access token is
    // required instead (hostPort + token + nested 3 = 5).
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        alationAuthBranch: 'apiToken',
      }),
    ).toBe(5);
    expect(
      missingRequiredConnectionFields('Alation', {
        ...empty,
        alationAuthBranch: 'apiToken',
        hostPort: 'alation:443',
        alationAccessToken: 'tok',
        alationDbUsername: 'db-user',
        alationDbHostPort: 'db:5432',
        alationDbDatabase: 'alation',
      }),
    ).toBe(0);
    expect(missingRequiredConnectionFields('Collibra', empty)).toBe(3);
    expect(missingRequiredConnectionFields('MetadataES', empty)).toBe(0);
    expect(missingRequiredConnectionFields('SharePoint', empty)).toBe(4);
    expect(
      missingRequiredConnectionFields('SharePoint', {
        ...empty,
        clientId: 'cid',
        clientSecret: 'csec',
        tenantId: 'tid',
        siteUrl: 'https://org.sharepoint.com/sites/x',
      }),
    ).toBe(0);
  });

  it('does not count a blank required secret on edit (blank means keep)', () => {
    const empty = createEmptyServiceForm();
    // Create (default isCreate): the blank secrets count.
    expect(missingRequiredConnectionFields('Collibra', empty)).toBe(3);
    expect(missingRequiredConnectionFields('SharePoint', empty)).toBe(4);
    expect(missingRequiredConnectionFields('Alation', empty)).toBe(6);
    // Edit (isCreate false): a blank password/clientSecret/accessToken is
    // "keep the stored secret", so only the non-secret blanks count.
    expect(missingRequiredConnectionFields('Collibra', empty, false)).toBe(2);
    expect(missingRequiredConnectionFields('SharePoint', empty, false)).toBe(3);
    expect(missingRequiredConnectionFields('Alation', empty, false)).toBe(5);
    expect(
      missingRequiredConnectionFields(
        'Alation',
        { ...empty, alationAuthBranch: 'apiToken' },
        false,
      ),
    ).toBe(4);
    // A filled secret still counts as filled in both modes.
    expect(
      missingRequiredConnectionFields(
        'Collibra',
        { ...empty, username: 'u', password: 'p', hostPort: 'h:443' },
        false,
      ),
    ).toBe(0);
  });
});

describe('A2 JSON-oracle field parity (§1.4 ⑥, covered fix)', () => {
  // The oracle is the copied official connection JSON
  // (public/jsons/connectionSchemas/connections/<kind>/<type>Connection.json,
  // md5-identical to pin a3012259ca) — read from disk, never hand-transcribed.
  // A vitest JSON import has no precedent in this tree, so the tests read
  // the files with readFileSync; no build config is changed for tests.
  const here = dirname(fileURLToPath(import.meta.url));
  const loadConnectionJson = (relativePath: string): ConnectionSchemaJson =>
    JSON.parse(
      readFileSync(join(here, '../../public/jsons/connectionSchemas', relativePath), 'utf8'),
    ) as ConnectionSchemaJson;

  interface ConnectionSchemaJson {
    properties?: Record<
      string,
      {
        title?: string;
        description?: string;
        enum?: string[];
        oneOf?: Array<{ title?: string; required?: string[] }>;
      }
    >;
    required?: string[];
  }

  const HIDDEN = new Set(['type', 'supportsMetadataExtraction', 'policyAgentConfig']);
  const FILTER_19 = new Set(SERVICE_FILTER_PATTERN_FIELDS as readonly string[]);
  /** JSON top-level props that belong in the connection form, in pin order. */
  const formProps = (json: ConnectionSchemaJson): string[] =>
    Object.keys(json.properties ?? {}).filter(
      (key) => !HIDDEN.has(key) && !FILTER_19.has(key),
    );
  const productKeys = (type: string): string[] =>
    connectionFieldsForType(type).map((field) => field.key as string);
  const productRequired = (type: string): string[] => [
    ...new Set(
      connectionFieldsForType(type)
        .filter((field) => field.required)
        .map((field) => field.key as string),
    ),
  ];

  it('Collibra matches collibraConnection.json: field set, order, required, filter-leaf text', () => {
    const json = loadConnectionJson('connections/metadata/collibraConnection.json');
    // No 19-item filter field and no hidden key is dropped here: the
    // glossary/domain leaves are NOT in the 19-item exclusion, so the
    // oracle's form props are exactly the product keys, in pin order.
    expect(formProps(json)).toEqual([
      'username',
      'password',
      'hostPort',
      'glossaryFilterPattern',
      'domainFilterPattern',
      'enableEnrichment',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productKeys('Collibra')).toEqual(formProps(json));
    expect(json.required).toEqual(['username', 'password', 'hostPort']);
    expect(productRequired('Collibra')).toEqual(json.required);
    // The filter leaves carry the pin JSON title/description verbatim.
    for (const key of ['glossaryFilterPattern', 'domainFilterPattern'] as const) {
      const field = connectionFieldsForType('Collibra').find((entry) => entry.key === key);
      expect(field?.title).toBe(json.properties?.[key]?.title);
      expect(field?.description).toBe(json.properties?.[key]?.description);
      expect(field?.control).toBe('filterPattern');
      expect(connectionFieldSchema(field as ConnectionFieldDef).type).toBe('object');
    }
  });

  it('SharePoint matches sharePointConnection.json: field set, order, required', () => {
    const json = loadConnectionJson('connections/drive/sharePointConnection.json');
    // The directory/file/spreadsheet/worksheet leaves are 19-item filter
    // fields: they belong to the filter step, not this form.
    expect(formProps(json)).toEqual([
      'clientId',
      'clientSecret',
      'tenantId',
      'siteUrl',
      'siteName',
      'driveId',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productKeys('SharePoint')).toEqual(formProps(json));
    expect(json.required).toEqual(['clientId', 'clientSecret', 'tenantId', 'siteUrl']);
    expect(productRequired('SharePoint')).toEqual(json.required);
  });

  it('MetadataES matches metadataESConnection.json: field set, order, enums, no required', () => {
    const json = loadConnectionJson('connections/metadata/metadataESConnection.json');
    // The schema/table/database leaves are 19-item filter fields; the
    // `entities` prop is renamed to the `metadataESEntities` form key.
    expect(formProps(json)).toEqual([
      'entities',
      'recreateIndex',
      'runMode',
      'searchIndexMappingLanguage',
      'batchSize',
    ]);
    expect(
      productKeys('MetadataES').map((key) =>
        key === 'metadataESEntities' ? 'entities' : key,
      ),
    ).toEqual(formProps(json));
    expect(json.required ?? []).toEqual([]);
    expect(productRequired('MetadataES')).toEqual([]);
    const fields = connectionFieldsForType('MetadataES');
    expect(
      fields.find((field) => field.key === 'runMode')?.options?.map((option) => option.value),
    ).toEqual(json.properties?.['runMode']?.enum);
    expect(
      fields
        .find((field) => field.key === 'searchIndexMappingLanguage')
        ?.options?.map((option) => option.value),
    ).toEqual(json.properties?.['searchIndexMappingLanguage']?.enum);
  });

  it('VertexAI matches vertexaiConnection.json: required leaves and credential oneOf', () => {
    const json = loadConnectionJson('connections/mlmodel/vertexaiConnection.json');
    expect(json.required).toEqual(['credentials', 'location']);
    // `mlModelFilterPattern` is a 19-item filter field (filter step only);
    // `location` is required in both the JSON and the product; `credentials`
    // (a GCP oneOf) is represented by the credentials-variant selector.
    expect(formProps(json)).toEqual(['credentials', 'location']);
    expect(productKeys('VertexAI')).not.toContain('mlModelFilterPattern');
    expect(productKeys('VertexAI')).toContain('location');
    const location = connectionFieldsForType('VertexAI').find(
      (field) => field.key === 'location',
    );
    expect(location?.required).toBe(true);
    const branch = connectionFieldsForType('VertexAI').find(
      (field) => field.key === 'authGcpConfigBranch',
    );
    expect(branch?.options?.map((option) => option.value)).toEqual([
      'gcpValues',
      'gcpCredentialsPath',
      'gcpExternalAccount',
      'gcpADC',
    ]);
    // The VertexAI privateKey leaf is NOT required: the JSON's only
    // required array is [credentials, location] and no GCP variant
    // carries a required array.
    expect(productRequired('VertexAI')).toEqual(['location']);
  });

  it('Alation matches alationConnection.json: top-level order, oneOf branches, branch required', () => {
    const json = loadConnectionJson('connections/metadata/alationConnection.json');
    // Top-level props minus hidden/filter leaves, in pin order.
    expect(formProps(json)).toEqual([
      'hostPort',
      'authType',
      'connection',
      'projectName',
      'paginationLimit',
      'includeUndeployedDatasources',
      'includeHiddenDatasources',
      'ingestDatasources',
      'ingestUsersAndGroups',
      'ingestDomains',
      'ingestKnowledgeArticles',
      'ingestDashboards',
      'alationTagClassificationName',
      'connectionOptions',
      'connectionArguments',
    ]);
    // The non-oneOf top-level leaves appear as product keys in the same
    // relative order; the authType/connection oneOfs expand into the
    // branch selectors + nested leaves.
    const scalarProps = formProps(json).filter(
      (key) => key !== 'authType' && key !== 'connection',
    );
    const productScalars = productKeys('Alation').filter((key) => scalarProps.includes(key));
    expect(productScalars).toEqual(scalarProps);
    expect(json.required).toEqual(['hostPort', 'authType']);
    expect(
      connectionFieldsForType('Alation').find((field) => field.key === 'hostPort')?.required,
    ).toBe(true);
    const authBranch = connectionFieldsForType('Alation').find(
      (field) => field.key === 'alationAuthBranch',
    );
    expect(authBranch?.options?.map((option) => option.value)).toEqual(['basicAuth', 'apiToken']);
    expect(authBranch?.options?.map((option) => option.title)).toEqual(
      json.properties?.['authType']?.oneOf?.map((branch) => branch.title),
    );
    // Branch required arrays come from the JSON oneOf itself: BasicAuth
    // requires username + password, ApiAccessTokenAuth requires accessToken.
    const [basicAuth, apiToken] = json.properties?.['authType']?.oneOf ?? [];
    expect(basicAuth?.required).toEqual(['username', 'password']);
    expect(apiToken?.required).toEqual(['accessToken']);
    const fields = connectionFieldsForType('Alation');
    const visibleRequired = (form: Partial<ServiceFormValues>): string[] => [
      ...new Set(
        fields
          .filter(
            (field) =>
              field.required && field.key && isConnectionFieldVisible(field, form),
          )
          .map((field) => field.key as string),
      ),
    ];
    expect(visibleRequired({ alationAuthBranch: 'basicAuth' })).toContain('username');
    expect(visibleRequired({ alationAuthBranch: 'basicAuth' })).toContain('password');
    expect(visibleRequired({ alationAuthBranch: 'basicAuth' })).not.toContain('alationAccessToken');
    expect(visibleRequired({ alationAuthBranch: 'apiToken' })).toContain('alationAccessToken');
    expect(visibleRequired({ alationAuthBranch: 'apiToken' })).not.toContain('password');
    // Nested connection oneOf required arrays: Postgres requires
    // hostPort/username/database, Mysql requires hostPort/username.
    const connectionBranches = json.properties?.['connection']?.oneOf ?? [];
    expect(connectionBranches[0]?.required).toEqual(['hostPort', 'username', 'database']);
    expect(connectionBranches[1]?.required).toEqual(['hostPort', 'username']);
    expect(productRequired('Alation')).toContain('alationDbHostPort');
    expect(productRequired('Alation')).toContain('alationDbUsername');
    expect(productRequired('Alation')).toContain('alationDbDatabase');
    expect(productRequired('Alation')).not.toContain('alationDbPassword');
    const connectionBranch = fields.find(
      (field) => field.key === 'alationConnectionBranch',
    );
    expect(connectionBranch?.options?.map((option) => option.value)).toEqual([
      'postgres',
      'mysql',
      'none',
    ]);
  });
});

describe('T-2 JSON-oracle field parity (remaining 29 rows)', () => {
  // Same oracle as the A2 describe above, with HIDDEN expanded to EVERY
  // `supports*` key: pin DEF_UI_SCHEMA (ServiceUISchema.constant.ts) hides
  // them all, and the A2 describe only listed supportsMetadataExtraction.
  // The full leaf sets (nested oneOf expansions) are verified by the lane
  // tool t2/scripts/compare.py (0 differences); these tests assert the
  // vitest-level depth per A2 precedent: top-level field set/order,
  // required, enum/branch-selector options, and branch-visible required.
  const here = dirname(fileURLToPath(import.meta.url));
  const loadConnectionJson = (relativePath: string): ConnectionSchemaJson =>
    JSON.parse(
      readFileSync(join(here, '../../public/jsons/connectionSchemas', relativePath), 'utf8'),
    ) as ConnectionSchemaJson;

  interface ConnectionSchemaJson {
    properties?: Record<
      string,
      {
        title?: string;
        description?: string;
        enum?: string[];
        oneOf?: Array<{ title?: string; required?: string[] }>;
        properties?: Record<string, { oneOf?: Array<{ title?: string; required?: string[] }> }>;
      }
    >;
    required?: string[];
  }

  const FILTER_19 = new Set(SERVICE_FILTER_PATTERN_FIELDS as readonly string[]);
  const isHidden = (key: string): boolean =>
    key === 'type' || key === 'policyAgentConfig' || key.startsWith('supports');
  /** JSON top-level props that belong in the connection form, in pin order. */
  const formProps = (json: ConnectionSchemaJson): string[] =>
    Object.keys(json.properties ?? {}).filter((key) => !isHidden(key) && !FILTER_19.has(key));
  const oneOfKeys = (json: ConnectionSchemaJson): string[] =>
    Object.keys(json.properties ?? {}).filter((key) => json.properties?.[key]?.oneOf);
  /** Top-level props minus oneOf containers, in pin order. */
  const scalarProps = (json: ConnectionSchemaJson): string[] =>
    formProps(json).filter((key) => !oneOfKeys(json).includes(key));
  const productKeys = (type: string): string[] =>
    connectionFieldsForType(type).map((field) => field.key as string);
  /** The scalar props as they appear in the product key list, in order. */
  const productScalars = (type: string, scalars: string[]): string[] =>
    productKeys(type).filter((key) => scalars.includes(key));
  const productRequired = (type: string): string[] => [
    ...new Set(
      connectionFieldsForType(type)
        .filter((field) => field.required)
        .map((field) => field.key as string),
    ),
  ];
  const fieldsOf = (type: string): readonly ConnectionFieldDef[] => connectionFieldsForType(type);
  const selector = (type: string, key: string): ConnectionFieldDef | undefined =>
    fieldsOf(type).find((field) => field.key === key);
  const optionValues = (field: ConnectionFieldDef | undefined): unknown[] =>
    field?.options?.map((option) => option.value) ?? [];
  const optionTitles = (field: ConnectionFieldDef | undefined): unknown[] =>
    field?.options?.map((option) => option.title) ?? [];
  const visibleRequired = (type: string, form: Partial<ServiceFormValues>): string[] => [
    ...new Set(
      fieldsOf(type)
        .filter((field) => field.required && field.key && isConnectionFieldVisible(field, form))
        .map((field) => field.key as string),
    ),
  ];
  /** The ten shared AWS-credential leaves, in pin order, as product keys. */
  const AWS_KEYS = [
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
  ];
  const awsSubsequence = (type: string): string[] =>
    productKeys(type).filter((key) => AWS_KEYS.includes(key));
  const sslTriplet = (type: string, prefix: string): string[] =>
    productKeys(type).filter((key) =>
      [`${prefix}CaCertificate`, `${prefix}Certificate`, `${prefix}Key`].includes(key),
    );

  it('Postgres matches postgresConnection.json: scalars, required, auth branches, enums', () => {
    const json = loadConnectionJson('connections/database/postgresConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'authType',
      'hostPort',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslConfig',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Postgres', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username', 'database']);
    // Union of top-level required + the IAM branch required (awsRegion).
    expect(productRequired('Postgres')).toEqual(['username', 'authAwsRegion', 'hostPort', 'database']);
    const branch = selector('Postgres', 'authTypeBranch');
    expect(optionValues(branch)).toEqual(['basic', 'iam', 'azure']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    expect(visibleRequired('Postgres', {})).toContain('username');
    expect(visibleRequired('Postgres', {})).toContain('hostPort');
    expect(visibleRequired('Postgres', {})).toContain('database');
    expect(visibleRequired('Postgres', { authTypeBranch: 'iam' })).toContain('authAwsRegion');
    expect(visibleRequired('Postgres', { authTypeBranch: 'basic' })).not.toContain('authAwsRegion');
    expect(optionValues(selector('Postgres', 'scheme'))).toEqual(
      json.properties?.['scheme']?.enum,
    );
    expect(optionValues(selector('Postgres', 'sslMode'))).toEqual(
      json.properties?.['sslMode']?.enum,
    );
    expect(sslTriplet('Postgres', 'ssl')).toEqual(['sslCaCertificate', 'sslCertificate', 'sslKey']);
  });

  it('Mysql matches mysqlConnection.json: scalars, required, auth branches incl. GCP', () => {
    const json = loadConnectionJson('connections/database/mysqlConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'authType',
      'hostPort',
      'databaseName',
      'databaseSchema',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
      'useSlowLogs',
      'queryHistoryTable',
    ]);
    expect(productScalars('Mysql', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username']);
    expect(productRequired('Mysql')).toEqual(['username', 'authAwsRegion', 'hostPort']);
    const branch = selector('Mysql', 'authTypeBranch');
    expect(optionValues(branch)).toEqual(['basic', 'iam', 'azure', 'gcp']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    expect(optionValues(selector('Mysql', 'scheme'))).toEqual(json.properties?.['scheme']?.enum);
    // The IAM leaves are only visible-required on the iam branch; the GCP
    // variant selector only exists on the gcp auth branch, and no GCP leaf
    // is required there.
    expect(visibleRequired('Mysql', { authTypeBranch: 'iam' })).toContain('authAwsRegion');
    expect(visibleRequired('Mysql', { authTypeBranch: 'gcp' })).not.toContain('authGcpPrivateKey');
  });

  it('Snowflake matches snowflakeConnection.json: flat required, synthesized auth selector', () => {
    const json = loadConnectionJson('connections/database/snowflakeConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
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
    ]);
    expect(productScalars('Snowflake', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['username', 'account', 'warehouse']);
    expect(productRequired('Snowflake')).toEqual(['username', 'account', 'warehouse']);
    // The JSON has no authType: pin getSchemaWithSynthesizedAuthType
    // synthesizes the Password / Key-pair selector from the flat secrets.
    expect(optionValues(selector('Snowflake', 'authTypeBranch'))).toEqual(['password', 'keyPair']);
    expect(visibleRequired('Snowflake', {})).toContain('username');
    expect(visibleRequired('Snowflake', {})).toContain('account');
    expect(visibleRequired('Snowflake', {})).toContain('warehouse');
    // Known EXTRA, documented: the pin schema HAS policyAgentConfig but
    // DEF_UI_SCHEMA hides it from the form; the product renders the four
    // leaves and serializes them (connections.test.ts verifies the payload
    // defaults per type). Required is unaffected.
    for (const key of [
      'policyAgentEnabled',
      'policyAgentSupportsColumnAccess',
      'policyAgentSupportsFullAccess',
      'policyAgentSupportsMaskedAccess',
    ]) {
      expect(productKeys('Snowflake')).toContain(key);
    }
  });

  it('Databricks matches databricksConnection.json: auth branches, branch required, order', () => {
    const json = loadConnectionJson('connections/database/databricksConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'hostPort',
      'authType',
      'httpPath',
      'catalog',
      'databaseSchema',
      'connectionTimeout',
      'queryHistoryTable',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Databricks', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'httpPath', 'authType']);
    expect(productRequired('Databricks')).toEqual([
      'hostPort',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureClientSecret',
      'azureTenantId',
      'httpPath',
    ]);
    const mode = selector('Databricks', 'authMode');
    expect(optionValues(mode)).toEqual(['pat', 'oauth', 'azure']);
    expect(optionTitles(mode)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    // Branch required arrays come from the JSON oneOf itself.
    const [pat, oauth, azure] = json.properties?.['authType']?.oneOf ?? [];
    expect(pat?.required).toEqual(['token']);
    expect(oauth?.required).toEqual(['clientId', 'clientSecret']);
    expect(azure?.required).toEqual(['azureClientId', 'azureClientSecret', 'azureTenantId']);
    expect(visibleRequired('Databricks', { authMode: 'pat' })).toContain('password');
    expect(visibleRequired('Databricks', { authMode: 'oauth' })).toContain('clientId');
    expect(visibleRequired('Databricks', { authMode: 'oauth' })).toContain('clientSecret');
    expect(visibleRequired('Databricks', { authMode: 'azure' })).toContain('azureClientId');
    expect(visibleRequired('Databricks', { authMode: 'azure' })).toContain('azureClientSecret');
    expect(visibleRequired('Databricks', { authMode: 'azure' })).toContain('azureTenantId');
    expect(visibleRequired('Databricks', { authMode: 'pat' })).not.toContain('clientId');
  });

  it('UnityCatalog matches unityCatalogConnection.json: auth branches, no httpPath required', () => {
    const json = loadConnectionJson('connections/database/unityCatalogConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'hostPort',
      'authType',
      'httpPath',
      'catalog',
      'databaseSchema',
      'includeMetricViews',
      'connectionTimeout',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('UnityCatalog', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'authType']);
    expect(productRequired('UnityCatalog')).toEqual([
      'hostPort',
      'authMode',
      'password',
      'clientId',
      'clientSecret',
      'azureClientId',
      'azureClientSecret',
      'azureTenantId',
    ]);
    const mode = selector('UnityCatalog', 'authMode');
    expect(optionValues(mode)).toEqual(['pat', 'oauth', 'azure']);
    expect(optionTitles(mode)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    expect(visibleRequired('UnityCatalog', { authMode: 'pat' })).toContain('password');
    expect(visibleRequired('UnityCatalog', { authMode: 'azure' })).toContain('azureTenantId');
  });

  it('Doris matches dorisConnection.json: field set and required', () => {
    const json = loadConnectionJson('connections/database/dorisConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'databaseName',
      'databaseSchema',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Doris', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username']);
    expect(productRequired('Doris')).toEqual(['username', 'hostPort']);
    expect(sslTriplet('Doris', 'ssl')).toEqual(['sslCaCertificate', 'sslCertificate', 'sslKey']);
  });

  it('Mssql matches mssqlConnection.json: only database is required', () => {
    const json = loadConnectionJson('connections/database/mssqlConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'database',
      'driver',
      'encrypt',
      'trustServerCertificate',
      'sslConfig',
      'ingestAllDatabases',
      'includeSynonyms',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Mssql', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['database']);
    expect(productRequired('Mssql')).toEqual(['database']);
    expect(optionValues(selector('Mssql', 'scheme'))).toEqual(json.properties?.['scheme']?.enum);
  });

  it('Redshift matches redshiftConnection.json: scalars, required, IAM branch', () => {
    const json = loadConnectionJson('connections/database/redshiftConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'authType',
      'hostPort',
      'clusterIdentifier',
      'workgroupName',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Redshift', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username', 'database']);
    expect(productRequired('Redshift')).toEqual(['username', 'authAwsRegion', 'hostPort', 'database']);
    expect(optionValues(selector('Redshift', 'authTypeBranch'))).toEqual(['basic', 'iam']);
    expect(optionTitles(selector('Redshift', 'authTypeBranch'))).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
  });

  it('MariaDB matches mariaDBConnection.json exactly', () => {
    const json = loadConnectionJson('connections/database/mariaDBConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'password',
      'hostPort',
      'databaseName',
      'databaseSchema',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productKeys('MariaDB')).toEqual(formProps(json));
    expect(json.required).toEqual(['hostPort', 'username']);
    expect(productRequired('MariaDB')).toEqual(['username', 'hostPort']);
  });

  it('Greenplum matches greenplumConnection.json: scalars, required, IAM branch', () => {
    const json = loadConnectionJson('connections/database/greenplumConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'authType',
      'hostPort',
      'database',
      'sslMode',
      'sslConfig',
      'ingestAllDatabases',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Greenplum', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username', 'database']);
    expect(productRequired('Greenplum')).toEqual(['username', 'authAwsRegion', 'hostPort', 'database']);
    expect(optionValues(selector('Greenplum', 'authTypeBranch'))).toEqual(['basic', 'iam']);
  });

  it('Timescale matches timescaleConnection.json: scalars, required, auth branches', () => {
    const json = loadConnectionJson('connections/database/timescaleConnection.json');
    expect(formProps(json)).toEqual([
      'scheme',
      'username',
      'authType',
      'hostPort',
      'database',
      'ingestAllDatabases',
      'sslMode',
      'sslConfig',
      'classificationName',
      'queryStatementSource',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('Timescale', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'username', 'database']);
    expect(productRequired('Timescale')).toEqual(['username', 'authAwsRegion', 'hostPort', 'database']);
    expect(optionValues(selector('Timescale', 'authTypeBranch'))).toEqual(['basic', 'iam', 'azure']);
  });

  it('Kafka matches kafkaConnection.json: scalars, required, enums, ssl triplets', () => {
    const json = loadConnectionJson('connections/messaging/kafkaConnection.json');
    expect(formProps(json)).toEqual([
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
      'consumerConfigSSL',
      'schemaRegistrySSL',
    ]);
    expect(productScalars('Kafka', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['bootstrapServers']);
    expect(productRequired('Kafka')).toEqual(['bootstrapServers']);
    expect(optionValues(selector('Kafka', 'securityProtocol'))).toEqual(
      json.properties?.['securityProtocol']?.enum,
    );
    expect(optionValues(selector('Kafka', 'saslMechanism'))).toEqual(
      json.properties?.['saslMechanism']?.enum,
    );
    expect(sslTriplet('Kafka', 'consumerConfigSSL')).toEqual([
      'consumerConfigSSLCaCertificate',
      'consumerConfigSSLCertificate',
      'consumerConfigSSLKey',
    ]);
    expect(sslTriplet('Kafka', 'schemaRegistrySSL')).toEqual([
      'schemaRegistrySSLCaCertificate',
      'schemaRegistrySSLCertificate',
      'schemaRegistrySSLKey',
    ]);
  });

  it('Redpanda matches redpandaConnection.json: scalars, required, enums', () => {
    const json = loadConnectionJson('connections/messaging/redpandaConnection.json');
    expect(formProps(json)).toEqual([
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
    ]);
    expect(productScalars('Redpanda', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['bootstrapServers']);
    expect(productRequired('Redpanda')).toEqual(['bootstrapServers']);
    expect(optionValues(selector('Redpanda', 'securityProtocol'))).toEqual(
      json.properties?.['securityProtocol']?.enum,
    );
  });

  it('Superset matches supersetConnection.json: connection branches and branch required', () => {
    const json = loadConnectionJson('connections/dashboard/supersetConnection.json');
    expect(formProps(json)).toEqual(['hostPort', 'connection']);
    expect(json.required).toEqual(['hostPort', 'connection']);
    expect(productRequired('Superset')).toEqual([
      'hostPort',
      'supersetConnectionBranch',
      'provider',
      'username',
      'password',
      'supersetDbUsername',
      'authAwsRegion',
      'supersetDbHostPort',
      'supersetDbDatabase',
    ]);
    const branch = selector('Superset', 'supersetConnectionBranch');
    expect(optionValues(branch)).toEqual(['api', 'postgres', 'mysql']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['connection']?.oneOf?.map((entry) => entry.title),
    );
    const [api, postgres, mysql] = json.properties?.['connection']?.oneOf ?? [];
    expect(api?.required).toEqual(['provider', 'password', 'username']);
    expect(postgres?.required).toEqual(['hostPort', 'username', 'database']);
    expect(mysql?.required).toEqual(['hostPort', 'username']);
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'api' })).toContain('provider');
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'api' })).toContain('username');
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'api' })).toContain('password');
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'postgres' })).toContain(
      'supersetDbHostPort',
    );
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'postgres' })).toContain(
      'supersetDbUsername',
    );
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'postgres' })).toContain(
      'supersetDbDatabase',
    );
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'mysql' })).toContain(
      'supersetDbHostPort',
    );
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'mysql' })).toContain(
      'supersetDbUsername',
    );
    expect(visibleRequired('Superset', { supersetConnectionBranch: 'mysql' })).not.toContain(
      'supersetDbDatabase',
    );
  });

  it('Metabase matches metabaseConnection.json exactly', () => {
    const json = loadConnectionJson('connections/dashboard/metabaseConnection.json');
    expect(formProps(json)).toEqual(['username', 'password', 'apiKey', 'hostPort']);
    expect(productKeys('Metabase')).toEqual(formProps(json));
    expect(json.required).toEqual(['hostPort']);
    expect(productRequired('Metabase')).toEqual(['hostPort']);
  });

  it('S3 matches s3Connection.json: aws leaves in pin order, region required', () => {
    const json = loadConnectionJson('connections/storage/s3Connection.json');
    expect(formProps(json)).toEqual([
      'awsConfig',
      'bucketNames',
      'connectionOptions',
      'connectionArguments',
      'consoleEndpointURL',
    ]);
    // awsConfig is a plain object (not a oneOf): it expands into the ten
    // aws* leaves, asserted below via awsSubsequence.
    expect(
      productScalars('S3', ['bucketNames', 'connectionOptions', 'connectionArguments', 'consoleEndpointURL']),
    ).toEqual(['bucketNames', 'connectionOptions', 'connectionArguments', 'consoleEndpointURL']);
    // Top-level required is the awsConfig object itself; the only required
    // leaf inside it is awsRegion.
    expect(json.required).toEqual(['awsConfig']);
    expect(productRequired('S3')).toEqual(['awsRegion']);
    expect(awsSubsequence('S3')).toEqual(AWS_KEYS);
  });

  it('Prefect matches prefectConnection.json: auth branches and branch required', () => {
    const json = loadConnectionJson('connections/pipeline/prefectConnection.json');
    expect(formProps(json)).toEqual(['hostPort', 'authType', 'numberOfStatus', 'verifySSL', 'sslConfig']);
    expect(productScalars('Prefect', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['authType', 'hostPort']);
    expect(productRequired('Prefect')).toEqual([
      'hostPort',
      'apiKey',
      'prefectAccountId',
      'prefectWorkspaceId',
    ]);
    const mode = selector('Prefect', 'prefectAuthMode');
    expect(optionValues(mode)).toEqual(['cloud', 'server']);
    expect(optionTitles(mode)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    const [cloud, server] = json.properties?.['authType']?.oneOf ?? [];
    expect(cloud?.required).toEqual(['apiKey', 'accountId', 'workspaceId']);
    expect(server?.required ?? []).toEqual([]);
    expect(visibleRequired('Prefect', { prefectAuthMode: 'cloud' })).toContain('apiKey');
    expect(visibleRequired('Prefect', { prefectAuthMode: 'cloud' })).toContain('prefectAccountId');
    expect(visibleRequired('Prefect', { prefectAuthMode: 'cloud' })).toContain(
      'prefectWorkspaceId',
    );
    expect(visibleRequired('Prefect', { prefectAuthMode: 'server' })).not.toContain('apiKey');
    expect(visibleRequired('Prefect', { prefectAuthMode: 'server' })).not.toContain(
      'prefectAccountId',
    );
  });

  it('Dagster matches dagsterConnection.json: renamed leaves and required', () => {
    const json = loadConnectionJson('connections/pipeline/dagsterConnection.json');
    expect(formProps(json)).toEqual(['host', 'token', 'timeout', 'stripAssetKeyPrefixLength']);
    expect(json.required).toEqual(['host']);
    // host -> hostPort, token -> apiKey, timeout -> dagsterTimeout.
    expect(
      productScalars('Dagster', [
        'hostPort',
        'apiKey',
        'dagsterTimeout',
        'stripAssetKeyPrefixLength',
      ]),
    ).toEqual(['hostPort', 'apiKey', 'dagsterTimeout', 'stripAssetKeyPrefixLength']);
    expect(productRequired('Dagster')).toEqual(['hostPort']);
  });

  it('Rest matches restConnection.json: schema branches and branch required', () => {
    const json = loadConnectionJson('connections/api/restConnection.json');
    expect(formProps(json)).toEqual([
      'openAPISchemaConnection',
      'token',
      'docURL',
      'apiEndpointFilterPattern',
      'verifySSL',
      'sslConfig',
    ]);
    // token -> apiKey.
    expect(
      productScalars('Rest', ['apiKey', 'docURL', 'apiEndpointFilterPattern', 'verifySSL']),
    ).toEqual(['apiKey', 'docURL', 'apiEndpointFilterPattern', 'verifySSL']);
    expect(json.required).toEqual(['openAPISchemaConnection']);
    expect(productRequired('Rest')).toEqual([
      'restSchemaBranch',
      'openApiSchemaUrl',
      'openApiSchemaFilePath',
      'openApiSchemaS3Url',
      'authAwsRegion',
    ]);
    const branch = selector('Rest', 'restSchemaBranch');
    expect(optionValues(branch)).toEqual(['url', 'filePath', 's3']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['openAPISchemaConnection']?.oneOf?.map((entry) => entry.title),
    );
    const [url, filePath, s3] = json.properties?.['openAPISchemaConnection']?.oneOf ?? [];
    expect(url?.required).toEqual(['openAPISchemaURL']);
    expect(filePath?.required).toEqual(['openAPISchemaFilePath']);
    expect(s3?.required).toEqual(['openAPISchemaS3URL', 'awsCredentials']);
    expect(visibleRequired('Rest', { restSchemaBranch: 'url' })).toContain('openApiSchemaUrl');
    expect(visibleRequired('Rest', { restSchemaBranch: 'filePath' })).toContain(
      'openApiSchemaFilePath',
    );
    expect(visibleRequired('Rest', { restSchemaBranch: 's3' })).toContain('openApiSchemaS3Url');
    expect(visibleRequired('Rest', { restSchemaBranch: 's3' })).toContain('authAwsRegion');
    expect(visibleRequired('Rest', { restSchemaBranch: 'url' })).not.toContain('authAwsRegion');
    // apiEndpointFilterPattern is NOT one of the 19 filter fields: pin
    // getFilteredSchema renders it in the connection form.
    expect(productKeys('Rest')).toContain('apiEndpointFilterPattern');
  });

  it('Mlflow matches mlflowConnection.json exactly', () => {
    const json = loadConnectionJson('connections/mlmodel/mlflowConnection.json');
    expect(formProps(json)).toEqual(['trackingUri', 'registryUri']);
    expect(productKeys('Mlflow')).toEqual(formProps(json));
    expect(json.required).toEqual(['trackingUri', 'registryUri']);
    expect(productRequired('Mlflow')).toEqual(['trackingUri', 'registryUri']);
  });

  it('OpenMetadata matches openMetadataConnection.json: B group, store rename, jwtToken optional', () => {
    const json = loadConnectionJson('connections/metadata/openMetadataConnection.json');
    expect(formProps(json)).toEqual([
      'clusterName',
      'hostPort',
      'authProvider',
      'verifySSL',
      'sslConfig',
      'securityConfig',
      'secretsManagerProvider',
      'secretsManagerLoader',
      'apiVersion',
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
      'enableVersionValidation',
      'includeDatabaseServices',
      'includePipelineServices',
      'limitRecords',
      'forceEntityOverwriting',
      'storeServiceConnection',
      'elasticsSearch',
      'extraHeaders',
    ]);
    const scalars = [
      'clusterName',
      'hostPort',
      'authProvider',
      'verifySSL',
      'secretsManagerProvider',
      'secretsManagerLoader',
      'apiVersion',
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
      'enableVersionValidation',
      'includeDatabaseServices',
      'includePipelineServices',
      'limitRecords',
      'forceEntityOverwriting',
      'extraHeaders',
    ];
    expect(productScalars('OpenMetadata', scalars)).toEqual(scalars);
    expect(json.required).toEqual(['hostPort']);
    expect(productRequired('OpenMetadata')).toEqual(['hostPort']);
    // Renames: securityConfig -> jwtToken (the only leaf of the optional
    // securityConfig object), storeServiceConnection -> omStoreServiceConnection,
    // elasticsSearch -> omElasticSearchType + omElasticSearchConfig.
    expect(productKeys('OpenMetadata')).toContain('jwtToken');
    expect(productKeys('OpenMetadata')).toContain('omStoreServiceConnection');
    expect(productKeys('OpenMetadata')).toContain('omElasticSearchType');
    expect(productKeys('OpenMetadata')).toContain('omElasticSearchConfig');
    // jwtToken is conditionally required (only inside the optional
    // securityConfig object, which the product emits only when a token is
    // entered) — it must NOT be marked required, or token-less services
    // would be blocked. This corrects the A2 §4.3 "jwtToken required" label.
    expect(selector('OpenMetadata', 'jwtToken')?.required).toBeFalsy();
    expect(productRequired('OpenMetadata')).not.toContain('jwtToken');
    expect(optionValues(selector('OpenMetadata', 'authProvider'))).toEqual(
      json.properties?.['authProvider']?.enum,
    );
  });

  it('GoogleDrive matches googleDriveConnection.json: variant selector, no required leaves', () => {
    const json = loadConnectionJson('connections/drive/googleDriveConnection.json');
    expect(formProps(json)).toEqual([
      'credentials',
      'delegatedEmail',
      'driveId',
      'includeTeamDrives',
      'includeGoogleSheets',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(
      productScalars('GoogleDrive', [
        'delegatedEmail',
        'driveId',
        'includeTeamDrives',
        'includeGoogleSheets',
        'connectionOptions',
        'connectionArguments',
      ]),
    ).toEqual([
      'delegatedEmail',
      'driveId',
      'includeTeamDrives',
      'includeGoogleSheets',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(json.required).toEqual(['credentials']);
    // The top-level `credentials` required is represented by the variant
    // selector, not by a required leaf: no GCP variant carries a required
    // array, so no leaf is marked required (named deviation, BENCHMARK §6).
    expect(productRequired('GoogleDrive')).toEqual([]);
    const variant = selector('GoogleDrive', 'gcpConfigType');
    expect(optionValues(variant)).toEqual([
      'gcpValues',
      'gcpCredentialsPath',
      'gcpExternalAccount',
      'gcpADC',
    ]);
    expect(optionTitles(variant)).toEqual(
      json.properties?.['credentials']?.properties?.['gcpConfig']?.oneOf?.map(
        (entry) => entry.title,
      ),
    );
    for (const branch of ['gcpValues', 'gcpCredentialsPath', 'gcpExternalAccount', 'gcpADC']) {
      expect(visibleRequired('GoogleDrive', { gcpConfigType: branch as never })).toEqual([]);
    }
    // No JSON-blob fields remain: the old credentialsJson /
    // gcpExternalAccountJson inventions are gone.
    expect(productKeys('GoogleDrive')).not.toContain('credentialsJson');
    expect(productKeys('GoogleDrive')).not.toContain('gcpExternalAccountJson');
  });

  it('ElasticSearch matches elasticSearchConnection.json: no required, auth branches', () => {
    const json = loadConnectionJson('connections/search/elasticSearchConnection.json');
    expect(formProps(json)).toEqual([
      'hostPort',
      'authType',
      'sslConfig',
      'connectionTimeoutSecs',
      'connectionArguments',
    ]);
    expect(
      productScalars('ElasticSearch', ['hostPort', 'connectionTimeoutSecs', 'connectionArguments']),
    ).toEqual(['hostPort', 'connectionTimeoutSecs', 'connectionArguments']);
    expect(json.required ?? []).toEqual([]);
    expect(productRequired('ElasticSearch')).toEqual([]);
    const mode = selector('ElasticSearch', 'elasticSearchAuthMode');
    expect(optionValues(mode)).toEqual(['basicAuth', 'apiAuth']);
    expect(optionTitles(mode)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    const [basic, apiKey] = json.properties?.['authType']?.oneOf ?? [];
    expect(basic?.required ?? []).toEqual([]);
    expect(apiKey?.required ?? []).toEqual([]);
    expect(visibleRequired('ElasticSearch', { elasticSearchAuthMode: 'basicAuth' })).toEqual([]);
    expect(visibleRequired('ElasticSearch', { elasticSearchAuthMode: 'apiAuth' })).toEqual([]);
    expect(optionValues(selector('ElasticSearch', 'sslCertMode'))).toEqual(['paths', 'values']);
  });

  it('Ranger matches rangerConnection.json: single-branch auth, all three required', () => {
    const json = loadConnectionJson('connections/security/rangerConnection.json');
    expect(formProps(json)).toEqual(['hostPort', 'authType']);
    expect(json.required).toEqual(['hostPort', 'authType']);
    // The single authType branch requires username + password.
    expect(json.properties?.['authType']?.oneOf?.[0]?.required).toEqual(['username', 'password']);
    expect(productRequired('Ranger')).toEqual(['hostPort', 'username', 'password']);
    expect(productKeys('Ranger')).toEqual(['hostPort', 'username', 'password']);
  });

  it('CustomMlModel matches customMlModelConnection.json exactly', () => {
    const json = loadConnectionJson('connections/mlmodel/customMlModelConnection.json');
    expect(formProps(json)).toEqual(['sourcePythonClass', 'connectionOptions']);
    expect(productKeys('CustomMlModel')).toEqual(formProps(json));
    // JSON required is ['type'] (hidden) — nothing is required in the form.
    expect(json.required).toEqual(['type']);
    expect(productRequired('CustomMlModel')).toEqual([]);
  });

  it('SageMaker matches sageMakerConnection.json: aws leaves in pin order, region required', () => {
    const json = loadConnectionJson('connections/mlmodel/sageMakerConnection.json');
    expect(formProps(json)).toEqual(['awsConfig']);
    // awsConfig is a plain object (not a oneOf): no scalar props.
    expect(scalarProps(json)).toEqual(['awsConfig']);
    expect(json.required).toEqual(['awsConfig']);
    expect(productRequired('SageMaker')).toEqual(['awsRegion']);
    expect(awsSubsequence('SageMaker')).toEqual(AWS_KEYS);
  });

  it('Sklearn matches sklearnConnection.json: no form leaves', () => {
    const json = loadConnectionJson('connections/mlmodel/sklearnConnection.json');
    expect(formProps(json)).toEqual([]);
    expect(productKeys('Sklearn')).toEqual([]);
    expect(productRequired('Sklearn')).toEqual([]);
  });

  it('AlationSink matches alationSinkConnection.json: auth branches and branch required', () => {
    const json = loadConnectionJson('connections/metadata/alationSinkConnection.json');
    expect(formProps(json)).toEqual([
      'hostPort',
      'authType',
      'projectName',
      'paginationLimit',
      'datasourceLinks',
      'verifySSL',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productScalars('AlationSink', scalarProps(json))).toEqual(scalarProps(json));
    expect(json.required).toEqual(['hostPort', 'authType']);
    expect(productRequired('AlationSink')).toEqual([
      'hostPort',
      'username',
      'password',
      'alationSinkAccessToken',
    ]);
    const branch = selector('AlationSink', 'alationSinkAuthBranch');
    expect(optionValues(branch)).toEqual(['basicAuth', 'apiToken']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    const [basic, token] = json.properties?.['authType']?.oneOf ?? [];
    expect(basic?.required).toEqual(['username', 'password']);
    expect(token?.required).toEqual(['accessToken']);
    expect(visibleRequired('AlationSink', { alationSinkAuthBranch: 'basicAuth' })).toContain(
      'username',
    );
    expect(visibleRequired('AlationSink', { alationSinkAuthBranch: 'basicAuth' })).toContain(
      'password',
    );
    expect(visibleRequired('AlationSink', { alationSinkAuthBranch: 'apiToken' })).toContain(
      'alationSinkAccessToken',
    );
    expect(visibleRequired('AlationSink', { alationSinkAuthBranch: 'apiToken' })).not.toContain(
      'password',
    );
  });

  it('Amundsen matches amundsenConnection.json exactly', () => {
    const json = loadConnectionJson('connections/metadata/amundsenConnection.json');
    expect(formProps(json)).toEqual([
      'username',
      'password',
      'hostPort',
      'maxConnectionLifeTime',
      'validateSSL',
      'encrypted',
    ]);
    expect(productKeys('Amundsen')).toEqual(formProps(json));
    expect(json.required).toEqual(['username', 'password', 'hostPort']);
    expect(productRequired('Amundsen')).toEqual(['username', 'password', 'hostPort']);
  });

  it('Atlas matches atlasConnection.json: hostPort is NOT required', () => {
    const json = loadConnectionJson('connections/metadata/atlasConnection.json');
    expect(formProps(json)).toEqual([
      'username',
      'password',
      'hostPort',
      'databaseServiceName',
      'messagingServiceName',
      'entity_type',
      'connectionOptions',
      'connectionArguments',
    ]);
    expect(productKeys('Atlas')).toEqual(formProps(json));
    expect(json.required).toEqual(['entity_type', 'username', 'password']);
    expect(productRequired('Atlas')).toEqual(['username', 'password', 'entity_type']);
    // T-2 fix: the product used to mark hostPort required; pin does not.
    expect(selector('Atlas', 'hostPort')?.required).toBe(false);
  });

  it('CustomDrive matches customDriveConnection.json exactly', () => {
    const json = loadConnectionJson('connections/drive/customDriveConnection.json');
    expect(formProps(json)).toEqual(['connectionOptions', 'connectionArguments']);
    expect(productKeys('CustomDrive')).toEqual(formProps(json));
    expect(json.required ?? []).toEqual([]);
    expect(productRequired('CustomDrive')).toEqual([]);
  });

  it('Sftp matches sftpConnection.json: auth branches and branch required', () => {
    const json = loadConnectionJson('connections/drive/sftpConnection.json');
    expect(formProps(json)).toEqual([
      'host',
      'port',
      'authType',
      'rootDirectories',
      'connectionOptions',
      'connectionArguments',
      'structuredDataFilesOnly',
      'extractSampleData',
    ]);
    // host -> sftpHost, port -> sftpPort.
    expect(
      productScalars('Sftp', [
        'sftpHost',
        'sftpPort',
        'rootDirectories',
        'connectionOptions',
        'connectionArguments',
        'structuredDataFilesOnly',
        'extractSampleData',
      ]),
    ).toEqual([
      'sftpHost',
      'sftpPort',
      'rootDirectories',
      'connectionOptions',
      'connectionArguments',
      'structuredDataFilesOnly',
      'extractSampleData',
    ]);
    expect(json.required).toEqual(['host', 'authType']);
    expect(productRequired('Sftp')).toEqual(['sftpHost', 'username', 'password', 'sftpPrivateKey']);
    const branch = selector('Sftp', 'sftpAuthBranch');
    expect(optionValues(branch)).toEqual(['usernamePassword', 'privateKey']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    const [up, pk] = json.properties?.['authType']?.oneOf ?? [];
    expect(up?.required).toEqual(['username', 'password']);
    expect(pk?.required).toEqual(['username', 'privateKey']);
    expect(visibleRequired('Sftp', { sftpAuthBranch: 'usernamePassword' })).toContain('username');
    expect(visibleRequired('Sftp', { sftpAuthBranch: 'usernamePassword' })).toContain('password');
    expect(visibleRequired('Sftp', { sftpAuthBranch: 'privateKey' })).toContain('username');
    expect(visibleRequired('Sftp', { sftpAuthBranch: 'privateKey' })).toContain('sftpPrivateKey');
    expect(visibleRequired('Sftp', { sftpAuthBranch: 'privateKey' })).not.toContain('password');
  });

  it('CustomSearch matches customSearchConnection.json exactly', () => {
    const json = loadConnectionJson('connections/search/customSearchConnection.json');
    expect(formProps(json)).toEqual(['sourcePythonClass', 'connectionOptions']);
    expect(productKeys('CustomSearch')).toEqual(formProps(json));
    expect(json.required).toEqual(['type']);
    expect(productRequired('CustomSearch')).toEqual([]);
  });

  it('OpenSearch matches openSearchConnection.json: hostPort NOT required, AWS branch region', () => {
    const json = loadConnectionJson('connections/search/openSearchConnection.json');
    expect(formProps(json)).toEqual([
      'hostPort',
      'authType',
      'verifySSL',
      'sslConfig',
      'connectionTimeoutSecs',
      'connectionArguments',
    ]);
    expect(
      productScalars('OpenSearch', [
        'hostPort',
        'verifySSL',
        'connectionTimeoutSecs',
        'connectionArguments',
      ]),
    ).toEqual(['hostPort', 'verifySSL', 'connectionTimeoutSecs', 'connectionArguments']);
    expect(json.required ?? []).toEqual([]);
    // Only the AWS branch requires anything (awsRegion).
    expect(productRequired('OpenSearch')).toEqual(['authAwsRegion']);
    const branch = selector('OpenSearch', 'openSearchAuthBranch');
    expect(optionValues(branch)).toEqual(['basicAuth', 'awsCredentials']);
    expect(optionTitles(branch)).toEqual(
      json.properties?.['authType']?.oneOf?.map((entry) => entry.title),
    );
    const [basic, aws] = json.properties?.['authType']?.oneOf ?? [];
    expect(basic?.required ?? []).toEqual([]);
    expect(aws?.required).toEqual(['awsRegion']);
    expect(visibleRequired('OpenSearch', { openSearchAuthBranch: 'basicAuth' })).toEqual([]);
    expect(visibleRequired('OpenSearch', { openSearchAuthBranch: 'awsCredentials' })).toContain(
      'authAwsRegion',
    );
    // T-2 fix: the product used to mark hostPort required; pin has no
    // required array at all for this schema.
    expect(selector('OpenSearch', 'hostPort')?.required).toBe(false);
  });
});
