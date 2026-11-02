/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { PASSWORD_PLACEHOLDERS } from '@/ingestion/connections';
import type { ServiceFormValues } from '@/types/ingestion';

/**
 * Data-table driven connection fields (R4). The official connection form is
 * JSON-schema driven, not type-branched; the product has no connection schema
 * surface, so this table is the bridge: adding a service type means adding one
 * group entry below, never touching the renderer component.
 */
export type ConnectionFieldControl = 'text' | 'password' | 'select' | 'checkbox' | 'number' | 'note';

export interface ConnectionFieldOption {
  value: string;
  labelKey?: string;
}

export interface ConnectionFieldShowWhen {
  field: string;
  equals?: string;
  notEquals?: string;
  defaultValue?: string;
}

export interface ConnectionFieldDef {
  key: keyof ServiceFormValues | '';
  control: ConnectionFieldControl;
  labelKey: string;
  textKey?: string;
  required?: boolean;
  placeholder?: string;
  placeholderByType?: Record<string, string>;
  placeholderKey?: string;
  testId?: string;
  options?: readonly ConnectionFieldOption[];
  hintKey?: string;
  extraKey?: string;
  min?: number;
  max?: number;
  hideItemLabel?: boolean;
  passwordPlaceholder?: boolean;
  showWhen?: ConnectionFieldShowWhen;
}

export interface ConnectionFieldGroup {
  types: readonly string[];
  fields: readonly ConnectionFieldDef[];
}

type Field = ConnectionFieldDef;

const text = (key: Field['key'], labelKey: string, extra: Partial<Field> = {}): Field => ({
  key,
  control: 'text',
  labelKey,
  ...extra,
});

const requiredText = (key: Field['key'], labelKey: string, extra: Partial<Field> = {}): Field =>
  text(key, labelKey, { required: true, ...extra });

const passwordField: Field = {
  key: 'password',
  control: 'password',
  labelKey: 'connection.password',
  testId: 'service-password',
  passwordPlaceholder: true,
  hintKey: 'connection.secretHint',
};

const storeSecretsField: Field = {
  key: 'storeConnectionSecrets',
  control: 'checkbox',
  labelKey: 'connection.persistSecrets',
  testId: 'service-store-secrets',
  hideItemLabel: true,
};

const hostPort = (placeholder: string): Field =>
  requiredText('hostPort', 'connection.hostPort', { testId: 'service-host-port', placeholder });

const usernameRequired: Field = requiredText('username', 'connection.username', {
  testId: 'service-username',
});

const usernameOptional: Field = text('username', 'connection.username', { testId: 'service-username' });

const databaseNameDefault: Field = text('databaseName', 'connection.databaseName', {
  testId: 'service-database-name',
  placeholder: 'default',
});

const databaseSchema: Field = text('databaseSchema', 'connection.databaseSchema', {
  testId: 'service-database-schema',
});

const ingestAllDatabases: Field = {
  key: 'ingestAllDatabases',
  control: 'checkbox',
  labelKey: 'connection.ingestAllDatabases',
  testId: 'service-ingest-all-dbs',
};

const bootstrapServers: Field = requiredText('bootstrapServers', 'connection.bootstrapServers', {
  testId: 'service-bootstrap-servers',
  placeholder: 'localhost:9092',
});

const schemaRegistry: Field = text('schemaRegistryURL', 'connection.schemaRegistry', {
  testId: 'service-schema-registry',
  placeholder: 'http://localhost:8081',
});

const note = (textKey: string): Field => ({ key: '', control: 'note', labelKey: '', textKey });

export const CONNECTION_FIELD_GROUPS: readonly ConnectionFieldGroup[] = [
  {
    types: ['Postgres'],
    fields: [
      hostPort('localhost:5432'),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      passwordField,
      storeSecretsField,
    ],
  },
  {
    types: ['Mysql'],
    fields: [hostPort('localhost:3306'), usernameRequired, databaseNameDefault, databaseSchema, passwordField, storeSecretsField],
  },
  {
    types: ['Snowflake'],
    fields: [
      requiredText('account', 'connection.account', { testId: 'service-account' }),
      usernameRequired,
      requiredText('warehouse', 'connection.warehouse', { testId: 'service-warehouse' }),
      text('database', 'connection.database', { testId: 'service-database' }),
      text('role', 'connection.role', { testId: 'service-role' }),
      passwordField,
      storeSecretsField,
    ],
  },
  {
    types: ['Doris'],
    fields: [hostPort('localhost:9030'), usernameRequired, databaseNameDefault, databaseSchema, passwordField, storeSecretsField],
  },
  {
    types: ['Mssql'],
    fields: [
      hostPort('localhost:1433'),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      {
        key: 'scheme',
        control: 'select',
        labelKey: 'connection.scheme',
        testId: 'service-scheme',
        placeholder: 'mssql+pytds',
        options: [{ value: 'mssql+pytds' }, { value: 'mssql+pyodbc' }, { value: 'mssql+pymssql' }],
      },
      {
        key: 'driver',
        control: 'text',
        labelKey: 'connection.driver',
        testId: 'service-driver',
        placeholder: 'ODBC Driver 18 for SQL Server',
        showWhen: { field: 'scheme', equals: 'mssql+pyodbc' },
      },
      { key: 'encrypt', control: 'checkbox', labelKey: 'connection.encrypt', testId: 'service-encrypt' },
      {
        key: 'trustServerCertificate',
        control: 'checkbox',
        labelKey: 'connection.trustServerCertificate',
        testId: 'service-trust-cert',
      },
      ingestAllDatabases,
      { key: 'includeSynonyms', control: 'checkbox', labelKey: 'connection.includeSynonyms', testId: 'service-include-synonyms' },
      passwordField,
      storeSecretsField,
    ],
  },
  {
    types: ['MariaDB'],
    fields: [hostPort('localhost:3306'), usernameRequired, databaseNameDefault, databaseSchema, passwordField, storeSecretsField],
  },
  {
    types: ['Redshift', 'Greenplum', 'Timescale'],
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        placeholderByType: { Redshift: 'localhost:5439', '*': 'localhost:5432' },
      }),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      ingestAllDatabases,
      passwordField,
      storeSecretsField,
    ],
  },
  {
    types: ['Kafka'],
    fields: [bootstrapServers, schemaRegistry, note('connection.confluentNote')],
  },
  {
    types: ['Redpanda'],
    fields: [
      bootstrapServers,
      schemaRegistry,
      {
        key: 'securityProtocol',
        control: 'select',
        labelKey: 'connection.securityProtocol',
        testId: 'service-security-protocol',
        options: [{ value: 'PLAINTEXT' }, { value: 'SASL_PLAINTEXT' }, { value: 'SASL_SSL' }, { value: 'SSL' }],
      },
      note('connection.redpandaNote'),
    ],
  },
  {
    types: ['Superset'],
    fields: [
      hostPort('http://localhost:8088'),
      {
        key: 'provider',
        control: 'select',
        labelKey: 'connection.provider',
        testId: 'service-provider',
        required: true,
        options: [
          { value: 'db', labelKey: 'connection.providerDb' },
          { value: 'ldap', labelKey: 'connection.providerLdap' },
        ],
      },
      usernameRequired,
      note('connection.supersetApiNote'),
      passwordField,
      storeSecretsField,
    ],
  },
  {
    types: ['S3'],
    fields: [
      requiredText('awsRegion', 'connection.awsRegion', { testId: 'service-aws-region', placeholder: 'us-east-1' }),
      text('awsAccessKeyId', 'connection.awsAccessKeyId', { testId: 'service-aws-access-key' }),
      {
        key: 'awsSecretAccessKey',
        control: 'password',
        labelKey: 'connection.awsSecretAccessKey',
        testId: 'service-aws-secret-key',
        passwordPlaceholder: true,
        hintKey: 'connection.secretHint',
      },
      {
        key: 'awsSessionToken',
        control: 'password',
        labelKey: 'connection.awsSessionToken',
        testId: 'service-aws-session-token',
      },
      text('awsEndPointURL', 'connection.awsEndPointURL', {
        testId: 'service-aws-endpoint',
        placeholder: 'https://s3.us-east-1.amazonaws.com',
      }),
      text('awsProfileName', 'connection.awsProfileName', { testId: 'service-aws-profile' }),
      text('assumeRoleArn', 'connection.assumeRoleArn', { testId: 'service-aws-role-arn' }),
      text('assumeRoleSessionName', 'connection.assumeRoleSessionName', { testId: 'service-aws-role-session' }),
      text('assumeRoleSourceIdentity', 'connection.assumeRoleSourceIdentity', { testId: 'service-aws-role-source' }),
      { key: 'awsIamEnabled', control: 'checkbox', labelKey: 'connection.awsIamEnabled', testId: 'service-aws-iam-enabled' },
      text('bucketNames', 'connection.bucketNames', {
        testId: 'service-bucket-names',
        placeholder: 'analytics, raw',
        extraKey: 'connection.bucketNamesHelp',
      }),
      text('consoleEndpointURL', 'connection.consoleEndpointURL', {
        testId: 'service-console-endpoint',
        placeholder: 'https://s3.console.aws.amazon.com',
      }),
      storeSecretsField,
      note('connection.s3Note'),
    ],
  },
  {
    types: ['Prefect'],
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        placeholder: 'https://api.prefect.cloud or http://localhost:4200',
      }),
      {
        key: 'prefectAuthMode',
        control: 'select',
        labelKey: 'connection.prefectAuthMode',
        testId: 'service-prefect-auth-mode',
        options: [
          { value: 'cloud', labelKey: 'connection.prefectCloud' },
          { value: 'server', labelKey: 'connection.prefectServer' },
        ],
      },
      requiredText('prefectAccountId', 'connection.prefectAccountId', {
        testId: 'service-prefect-account-id',
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      }),
      requiredText('prefectWorkspaceId', 'connection.prefectWorkspaceId', {
        testId: 'service-prefect-workspace-id',
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        testId: 'service-api-key',
        passwordPlaceholder: true,
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      },
      {
        key: 'prefectAuthString',
        control: 'password',
        labelKey: 'connection.prefectAuthString',
        testId: 'service-prefect-auth-string',
        placeholderKey: 'connection.prefectAuthStringHint',
        showWhen: { field: 'prefectAuthMode', notEquals: 'cloud' },
      },
      {
        key: 'numberOfStatus',
        control: 'number',
        labelKey: 'connection.numberOfStatus',
        testId: 'service-number-of-status',
        min: 1,
        max: 100,
      },
      note('connection.prefectNote'),
    ],
  },
  {
    types: ['Dagster'],
    fields: [
      requiredText('hostPort', 'connection.host', { testId: 'service-host-port', placeholder: 'http://localhost:3000' }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.token',
        testId: 'service-api-key',
        passwordPlaceholder: true,
      },
      { key: 'dagsterTimeout', control: 'number', labelKey: 'connection.timeout', testId: 'service-dagster-timeout', min: 1 },
      {
        key: 'stripAssetKeyPrefixLength',
        control: 'number',
        labelKey: 'connection.stripAssetKeyPrefixLength',
        testId: 'service-strip-prefix',
        min: 0,
      },
      note('connection.dagsterNote'),
    ],
  },
  {
    types: ['Metabase'],
    fields: [
      hostPort('http://localhost:3000'),
      usernameOptional,
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        testId: 'service-api-key',
        placeholderKey: 'connection.apiKeyHint',
        hintKey: 'connection.metabaseAuthNote',
      },
    ],
  },
  {
    types: ['Databricks'],
    fields: [
      hostPort('adb-xxxx.azuredatabricks.net'),
      requiredText('httpPath', 'connection.httpPath', { testId: 'service-http-path', placeholder: '/sql/1.0/warehouses/...' }),
      text('catalog', 'connection.catalog', { testId: 'service-catalog', placeholder: 'hive_metastore' }),
      databaseSchema,
      text('queryHistoryTable', 'connection.queryHistoryTable', {
        testId: 'service-query-history',
        placeholder: 'system.query.history',
      }),
      {
        key: 'authMode',
        control: 'select',
        labelKey: 'connection.authMode',
        testId: 'service-auth-mode',
        required: true,
        options: [
          { value: 'pat', labelKey: 'connection.authPat' },
          { value: 'oauth', labelKey: 'connection.authOauth' },
          { value: 'azure', labelKey: 'connection.authAzure' },
        ],
      },
      {
        ...passwordField,
        labelKey: 'connection.token',
        showWhen: { field: 'authMode', equals: 'pat', defaultValue: 'pat' },
      },
      requiredText('clientId', 'connection.clientId', {
        testId: 'service-client-id',
        showWhen: { field: 'authMode', equals: 'oauth' },
      }),
      {
        key: 'clientSecret',
        control: 'password',
        labelKey: 'connection.clientSecret',
        testId: 'service-client-secret',
        passwordPlaceholder: true,
        showWhen: { field: 'authMode', equals: 'oauth' },
      },
      requiredText('azureClientId', 'connection.azureClientId', {
        testId: 'service-azure-client-id',
        showWhen: { field: 'authMode', equals: 'azure' },
      }),
      requiredText('azureTenantId', 'connection.azureTenantId', {
        testId: 'service-azure-tenant-id',
        showWhen: { field: 'authMode', equals: 'azure' },
      }),
      {
        key: 'azureClientSecret',
        control: 'password',
        labelKey: 'connection.azureClientSecret',
        testId: 'service-azure-client-secret',
        passwordPlaceholder: true,
        showWhen: { field: 'authMode', equals: 'azure' },
      },
      storeSecretsField,
    ],
  },
  {
    types: ['UnityCatalog'],
    fields: [
      hostPort('adb-xxxx.azuredatabricks.net'),
      text('httpPath', 'connection.httpPath', { testId: 'service-http-path', placeholder: '/sql/1.0/warehouses/...' }),
      text('catalog', 'connection.catalog', { testId: 'service-catalog', placeholder: 'hive_metastore' }),
      databaseSchema,
      text('queryHistoryTable', 'connection.queryHistoryTable', {
        testId: 'service-query-history',
        placeholder: 'system.query.history',
      }),
      {
        key: 'includeMetricViews',
        control: 'checkbox',
        labelKey: 'connection.includeMetricViews',
        testId: 'service-include-metric-views',
      },
      {
        key: 'authMode',
        control: 'select',
        labelKey: 'connection.authMode',
        testId: 'service-auth-mode',
        required: true,
        options: [
          { value: 'pat', labelKey: 'connection.authPat' },
          { value: 'oauth', labelKey: 'connection.authOauth' },
          { value: 'azure', labelKey: 'connection.authAzure' },
        ],
      },
      {
        ...passwordField,
        labelKey: 'connection.token',
        showWhen: { field: 'authMode', equals: 'pat', defaultValue: 'pat' },
      },
      requiredText('clientId', 'connection.clientId', {
        testId: 'service-client-id',
        showWhen: { field: 'authMode', equals: 'oauth' },
      }),
      {
        key: 'clientSecret',
        control: 'password',
        labelKey: 'connection.clientSecret',
        testId: 'service-client-secret',
        passwordPlaceholder: true,
        showWhen: { field: 'authMode', equals: 'oauth' },
      },
      requiredText('azureClientId', 'connection.azureClientId', {
        testId: 'service-azure-client-id',
        showWhen: { field: 'authMode', equals: 'azure' },
      }),
      requiredText('azureTenantId', 'connection.azureTenantId', {
        testId: 'service-azure-tenant-id',
        showWhen: { field: 'authMode', equals: 'azure' },
      }),
      {
        key: 'azureClientSecret',
        control: 'password',
        labelKey: 'connection.azureClientSecret',
        testId: 'service-azure-client-secret',
        passwordPlaceholder: true,
        showWhen: { field: 'authMode', equals: 'azure' },
      },
      storeSecretsField,
    ],
  },
];

export function connectionFieldsForType(serviceType: string): readonly ConnectionFieldDef[] {
  return CONNECTION_FIELD_GROUPS.find((group) => group.types.includes(serviceType))?.fields ?? [];
}

export function isConnectionFieldVisible(
  field: ConnectionFieldDef,
  form: Record<string, unknown>,
): boolean {
  const condition = field.showWhen;
  if (!condition) {
    return true;
  }
  const raw = form[condition.field];
  const effective = (raw === undefined || raw === '' ? condition.defaultValue : raw) as string | undefined;
  if (condition.equals !== undefined) {
    return effective === condition.equals;
  }
  if (condition.notEquals !== undefined) {
    return effective !== condition.notEquals;
  }
  return true;
}

export function connectionFieldPlaceholder(field: ConnectionFieldDef, serviceType: string): string {
  if (field.placeholderByType) {
    return field.placeholderByType[serviceType] ?? field.placeholderByType['*'] ?? '';
  }
  return field.placeholder ?? '';
}

export function connectionPasswordPlaceholder(serviceType: string): string {
  return PASSWORD_PLACEHOLDERS[serviceType] ?? '';
}
