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
export type ConnectionFieldControl = 'text' | 'password' | 'select' | 'checkbox' | 'number' | 'note' | 'textarea';

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

// Shared by Kafka and Redpanda: official kafkaConnection.json (16 props) and
// redpandaConnection.json (14 props) both carry securityProtocol, in the same
// relative position (after the schema-registry fields in the lean form).
const securityProtocolField: Field = {
  key: 'securityProtocol',
  control: 'select',
  labelKey: 'connection.securityProtocol',
  testId: 'service-security-protocol',
  options: [{ value: 'PLAINTEXT' }, { value: 'SASL_PLAINTEXT' }, { value: 'SASL_SSL' }, { value: 'SSL' }],
};

const note = (textKey: string): Field => ({ key: '', control: 'note', labelKey: '', textKey });

// W2-5 lean-forms tier 2 (Kafka/Redpanda): SASL + schema-registry fields
// (kafkaConnection.json / redpandaConnection.json). No showWhen linkage:
// the specs do not gate these on securityProtocol.
const saslUsernameField: Field = text('saslUsername', 'connection.saslUsername', {
  testId: 'service-sasl-username',
});

const saslPasswordField: Field = {
  key: 'saslPassword',
  control: 'password',
  labelKey: 'connection.saslPassword',
  testId: 'service-sasl-password',
  passwordPlaceholder: true,
  hintKey: 'connection.secretHint',
};

const saslMechanismField: Field = {
  key: 'saslMechanism',
  control: 'select',
  labelKey: 'connection.saslMechanism',
  testId: 'service-sasl-mechanism',
  options: [
    { value: 'PLAIN' },
    { value: 'GSSAPI' },
    { value: 'SCRAM-SHA-256' },
    { value: 'SCRAM-SHA-512' },
    { value: 'OAUTHBEARER' },
  ],
};

const basicAuthUserInfoField: Field = {
  key: 'basicAuthUserInfo',
  control: 'password',
  labelKey: 'connection.basicAuthUserInfo',
  testId: 'service-basic-auth-user-info',
  passwordPlaceholder: true,
  hintKey: 'connection.secretHint',
};

const consumerConfigField: Field = {
  key: 'consumerConfig',
  control: 'textarea',
  labelKey: 'connection.consumerConfig',
  testId: 'service-consumer-config',
  placeholder: '{"key": "value"}',
  hintKey: 'connection.consumerConfigHint',
};

const schemaRegistryConfigField: Field = {
  key: 'schemaRegistryConfig',
  control: 'textarea',
  labelKey: 'connection.schemaRegistryConfig',
  testId: 'service-schema-registry-config',
  placeholder: '{"key": "value"}',
  hintKey: 'connection.schemaRegistryConfigHint',
};

const schemaRegistryTopicSuffixNameField: Field = text(
  'schemaRegistryTopicSuffixName',
  'connection.schemaRegistryTopicSuffixName',
  { testId: 'service-schema-registry-topic-suffix', placeholder: '-value' },
);

// verifySSL (verifySSLConfig, default no-ssl): one shared form key for
// Superset (nested in connection) and Prefect (top level). Always visible,
// no showWhen linkage (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
const verifySSLField: Field = {
  key: 'verifySSL',
  control: 'select',
  labelKey: 'connection.verifySSL',
  testId: 'service-verify-ssl',
  options: [{ value: 'no-ssl' }, { value: 'ignore' }, { value: 'validate' }],
};

// Wave 0 lean-forms database档: shared defs for the de-noised official
// properties (see RULING.md R-T1). sslMode enum + defaults come from
// openmetadata-spec .../security/ssl/verifySSLConfig.json#/definitions/sslMode.
const sslModeField: Field = {
  key: 'sslMode',
  control: 'select',
  labelKey: 'connection.sslMode',
  testId: 'service-ssl-mode',
  options: [
    { value: 'disable' },
    { value: 'allow' },
    { value: 'prefer' },
    { value: 'require' },
    { value: 'verify-ca' },
    { value: 'verify-full' },
  ],
};

const SSL_MODE_GATE: ConnectionFieldShowWhen = {
  field: 'sslMode',
  notEquals: 'disable',
  defaultValue: 'disable',
};

// validateSSLClientConfig leaves (openmetadata-spec
// .../security/ssl/validateSSLClientConfig.json): caCertificate, sslCertificate,
// sslKey — all PEM contents, so textarea, not single-line inputs. `gated` is
// true for types that also carry sslMode (leaves hidden while mode is
// disable); MySQL/Mssql/Doris have sslConfig but no sslMode, so theirs are
// always visible. Tier 2 groups pass their own key triplet: each sslConfig
// group in one form gets independent keys, or one group's PEM would be
// written into the other (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups).
const sslConfigLeavesFor = (
  leaves: readonly [key: Field['key'], labelKey: string, testId: string][],
  gated = false,
): Field[] =>
  leaves.map(([key, labelKey, testId]): Field => ({
    key,
    control: 'textarea',
    labelKey,
    testId,
    ...(gated ? { showWhen: SSL_MODE_GATE } : {}),
  }));

const sslConfigLeaves = (gated: boolean): Field[] =>
  sslConfigLeavesFor(
    [
      ['sslCaCertificate', 'connection.sslCaCertificate', 'service-ssl-ca-certificate'],
      ['sslCertificate', 'connection.sslCertificate', 'service-ssl-certificate'],
      ['sslKey', 'connection.sslKey', 'service-ssl-key'],
    ],
    gated,
  );

// connectionOptions / connectionArguments are string maps
// (connectionBasicType.json); entered as a JSON object and parsed in
// buildServiceConnection (GoogleDrive credentialsJson precedent).
const connectionOptionsField: Field = {
  key: 'connectionOptions',
  control: 'textarea',
  labelKey: 'connection.connectionOptions',
  testId: 'service-connection-options',
  placeholder: '{"key": "value"}',
  hintKey: 'connection.connectionOptionsHint',
};

const connectionArgumentsField: Field = {
  key: 'connectionArguments',
  control: 'textarea',
  labelKey: 'connection.connectionArguments',
  testId: 'service-connection-arguments',
  placeholder: '{"key": "value"}',
  hintKey: 'connection.connectionArgumentsHint',
};

// policyAgentConfig (connectionBasicType.json): four booleans; spec default
// is { enabled: true, supportsColumnAccess: false, supportsFullAccess: true,
// supportsMaskedAccess: true } (see createEmptyServiceForm).
const policyAgentFields: readonly Field[] = [
  {
    key: 'policyAgentEnabled',
    control: 'checkbox',
    labelKey: 'connection.policyAgentEnabled',
    testId: 'service-policy-agent-enabled',
  },
  {
    key: 'policyAgentSupportsColumnAccess',
    control: 'checkbox',
    labelKey: 'connection.policyAgentSupportsColumnAccess',
    testId: 'service-policy-agent-column-access',
  },
  {
    key: 'policyAgentSupportsFullAccess',
    control: 'checkbox',
    labelKey: 'connection.policyAgentSupportsFullAccess',
    testId: 'service-policy-agent-full-access',
  },
  {
    key: 'policyAgentSupportsMaskedAccess',
    control: 'checkbox',
    labelKey: 'connection.policyAgentSupportsMaskedAccess',
    testId: 'service-policy-agent-masked-access',
  },
];

export const CONNECTION_FIELD_GROUPS: readonly ConnectionFieldGroup[] = [
  {
    types: ['Postgres'],
    fields: [
      hostPort('localhost:5432'),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      passwordField,
      // Wave 0 lean-forms: de-noised target 12 (RULING.md R-T1.1). scheme has
      // two enum values (postgresql+psycopg2 / pgspider+psycopg2); password is
      // the authType basicAuth rendering (see §0.3).
      {
        key: 'scheme',
        control: 'select',
        labelKey: 'connection.scheme',
        testId: 'service-scheme',
        options: [{ value: 'postgresql+psycopg2' }, { value: 'pgspider+psycopg2' }],
      },
      ingestAllDatabases,
      sslModeField,
      ...sslConfigLeaves(true),
      text('classificationName', 'connection.classificationName', {
        testId: 'service-classification-name',
        placeholder: 'PostgresPolicyTags',
      }),
      text('queryStatementSource', 'connection.queryStatementSource', {
        testId: 'service-query-statement-source',
        placeholder: 'pg_stat_statements',
      }),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['Mysql'],
    fields: [
      hostPort('localhost:3306'),
      usernameRequired,
      databaseNameDefault,
      databaseSchema,
      // M-Next B3 (reverse check): official mysqlConnection.json carries
      // queryHistoryTable; the product MySQL group was missing it.
      text('queryHistoryTable', 'connection.queryHistoryTable', {
        testId: 'service-query-history',
        placeholder: 'system.query.history',
      }),
      passwordField,
      // Wave 0 lean-forms: de-noised target 11 (R-T1.2). scheme is the
      // single option mysql+pymysql — builder fixed value, no visible field.
      // MySQL has sslConfig but no sslMode, so the leaves are always visible.
      {
        key: 'useSlowLogs',
        control: 'checkbox',
        labelKey: 'connection.useSlowLogs',
        testId: 'service-use-slow-logs',
      },
      ...sslConfigLeaves(false),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
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
      // Wave 0 lean-forms: de-noised target 24 (R-T1.5). scheme is the single
      // option `snowflake` — builder fixed value, no visible field.
      text('queryTag', 'connection.queryTag', { testId: 'service-query-tag' }),
      text('accountUsageSchema', 'connection.accountUsageSchema', {
        testId: 'service-account-usage-schema',
        placeholder: 'SNOWFLAKE.ACCOUNT_USAGE',
      }),
      {
        key: 'systemMetricsBatchSize',
        control: 'number',
        labelKey: 'connection.systemMetricsBatchSize',
        testId: 'service-system-metrics-batch-size',
        min: 1,
        max: 500,
      },
      {
        key: 'privateKey',
        control: 'textarea',
        labelKey: 'connection.privateKey',
        testId: 'service-private-key',
        hintKey: 'connection.privateKeyHint',
      },
      {
        key: 'snowflakePrivatekeyPassphrase',
        control: 'password',
        labelKey: 'connection.snowflakePrivatekeyPassphrase',
        testId: 'service-private-key-passphrase',
        passwordPlaceholder: false,
      },
      {
        key: 'includeTransientTables',
        control: 'checkbox',
        labelKey: 'connection.includeTransientTables',
        testId: 'service-include-transient-tables',
      },
      {
        key: 'includeStreams',
        control: 'checkbox',
        labelKey: 'connection.includeStreams',
        testId: 'service-include-streams',
      },
      {
        key: 'includeStages',
        control: 'checkbox',
        labelKey: 'connection.includeStages',
        testId: 'service-include-stages',
      },
      {
        key: 'includeSemanticViews',
        control: 'checkbox',
        labelKey: 'connection.includeSemanticViews',
        testId: 'service-include-semantic-views',
      },
      {
        key: 'clientSessionKeepAlive',
        control: 'checkbox',
        labelKey: 'connection.clientSessionKeepAlive',
        testId: 'service-client-session-keep-alive',
      },
      {
        key: 'useAccessHistory',
        control: 'checkbox',
        labelKey: 'connection.useAccessHistory',
        testId: 'service-use-access-history',
      },
      {
        key: 'accessHistoryChunkSize',
        control: 'number',
        labelKey: 'connection.accessHistoryChunkSize',
        testId: 'service-access-history-chunk-size',
        min: 1,
      },
      {
        key: 'creditCost',
        control: 'number',
        labelKey: 'connection.creditCost',
        testId: 'service-credit-cost',
      },
      text('snowflakeSourceHost', 'connection.snowflakeSourceHost', {
        testId: 'service-snowflake-source-host',
        placeholder: 'app.snowflake.com',
      }),
      ...policyAgentFields,
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['Doris'],
    fields: [
      hostPort('localhost:9030'),
      usernameRequired,
      databaseNameDefault,
      databaseSchema,
      passwordField,
      // Wave 0 lean-forms: de-noised target 9 (R-T1.8). scheme is the single
      // option `doris` — builder already sets it. Doris has sslConfig but no
      // sslMode, so the leaves are always visible.
      ...sslConfigLeaves(false),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
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
      // Wave 0 lean-forms: de-noised target 13 (R-T1.4). Mssql has sslConfig
      // but no sslMode, so the leaves are always visible.
      ...sslConfigLeaves(false),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['MariaDB'],
    fields: [
      hostPort('localhost:3306'),
      usernameRequired,
      databaseNameDefault,
      databaseSchema,
      passwordField,
      // Wave 0 lean-forms: de-noised target 8 (R-T1.3). scheme is the single
      // option mysql+pymysql — builder already sets it.
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  // Wave 0 lean-forms: the shared Redshift/Greenplum/Timescale group is split
  // — the three specs differ (R-T1.9/10/11). Each group carries only its own
  // spec's fields; scheme is a single option per type and stays a builder
  // fixed value (redshift+psycopg2 / postgresql+psycopg2).
  {
    types: ['Redshift'],
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        placeholder: 'localhost:5439',
      }),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      ingestAllDatabases,
      passwordField,
      text('clusterIdentifier', 'connection.clusterIdentifier', {
        testId: 'service-cluster-identifier',
        hintKey: 'connection.clusterIdentifierHint',
      }),
      text('workgroupName', 'connection.workgroupName', {
        testId: 'service-workgroup-name',
        hintKey: 'connection.workgroupNameHint',
      }),
      sslModeField,
      ...sslConfigLeaves(true),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['Greenplum'],
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        placeholder: 'localhost:5432',
      }),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      ingestAllDatabases,
      passwordField,
      sslModeField,
      ...sslConfigLeaves(true),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['Timescale'],
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        placeholder: 'localhost:5432',
      }),
      usernameRequired,
      requiredText('database', 'connection.database', { testId: 'service-database' }),
      ingestAllDatabases,
      passwordField,
      sslModeField,
      ...sslConfigLeaves(true),
      text('classificationName', 'connection.classificationName', {
        testId: 'service-classification-name',
        placeholder: 'PostgresPolicyTags',
      }),
      text('queryStatementSource', 'connection.queryStatementSource', {
        testId: 'service-query-statement-source',
        placeholder: 'pg_stat_statements',
      }),
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  {
    types: ['Kafka'],
    // W2-5 lean-forms tier 2: field order follows kafkaConnection.json
    // (sasl* / consumerConfig / schemaRegistryConfig / suffix / the two SSL
    // groups). The two SSL groups use independent key triplets, never the
    // single-group keys (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups).
    fields: [
      bootstrapServers,
      schemaRegistry,
      saslUsernameField,
      saslPasswordField,
      securityProtocolField,
      saslMechanismField,
      basicAuthUserInfoField,
      consumerConfigField,
      schemaRegistryConfigField,
      schemaRegistryTopicSuffixNameField,
      ...sslConfigLeavesFor([
        ['consumerConfigSSLCaCertificate', 'connection.consumerConfigSSLCaCertificate', 'service-consumer-config-ssl-ca-certificate'],
        ['consumerConfigSSLCertificate', 'connection.consumerConfigSSLCertificate', 'service-consumer-config-ssl-certificate'],
        ['consumerConfigSSLKey', 'connection.consumerConfigSSLKey', 'service-consumer-config-ssl-key'],
      ]),
      ...sslConfigLeavesFor([
        ['schemaRegistrySSLCaCertificate', 'connection.schemaRegistrySSLCaCertificate', 'service-schema-registry-ssl-ca-certificate'],
        ['schemaRegistrySSLCertificate', 'connection.schemaRegistrySSLCertificate', 'service-schema-registry-ssl-certificate'],
        ['schemaRegistrySSLKey', 'connection.schemaRegistrySSLKey', 'service-schema-registry-ssl-key'],
      ]),
      // W2-5 follow-up (persist-secrets checkbox): Kafka carries secret
      // fields (saslPassword, basicAuthUserInfo, 6 SSL leaves) but had no
      // storeConnectionSecrets checkbox, so literals could never be saved
      // via the UI (ADR:2026-11-08-leanforms-tier2-store-secrets-checkbox).
      storeSecretsField,
      note('connection.confluentNote'),
    ],
  },
  {
    types: ['Redpanda'],
    // W2-5 lean-forms tier 2: field order follows redpandaConnection.json —
    // the suffix sits before securityProtocol here (unlike Kafka), and there
    // are no SSL groups.
    fields: [
      bootstrapServers,
      schemaRegistry,
      saslUsernameField,
      saslPasswordField,
      schemaRegistryTopicSuffixNameField,
      securityProtocolField,
      saslMechanismField,
      basicAuthUserInfoField,
      consumerConfigField,
      schemaRegistryConfigField,
      // W2-5 follow-up (persist-secrets checkbox): Redpanda carries secret
      // fields (saslPassword, basicAuthUserInfo) but had no
      // storeConnectionSecrets checkbox, so literals could never be saved
      // via the UI (ADR:2026-11-08-leanforms-tier2-store-secrets-checkbox).
      storeSecretsField,
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
      // W2-5 lean-forms tier 2 (supersetApiConnection.json): verifySSL +
      // sslConfig live nested in connection. Always visible, no showWhen
      // linkage; the leaves use the Superset triplet, never the top-level
      // keys (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
      verifySSLField,
      ...sslConfigLeavesFor([
        ['supersetSSLCaCertificate', 'connection.supersetSSLCaCertificate', 'service-superset-ssl-ca-certificate'],
        ['supersetSSLCertificate', 'connection.supersetSSLCertificate', 'service-superset-ssl-certificate'],
        ['supersetSSLKey', 'connection.supersetSSLKey', 'service-superset-ssl-key'],
      ]),
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
      // W2-5 lean-forms tier 2 (s3Connection.json): string maps, spec order
      // (after bucketNames, before consoleEndpointURL).
      connectionOptionsField,
      connectionArgumentsField,
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
      // W2-5 lean-forms tier 2 (prefectConnection.json): verifySSL + sslConfig
      // live top level. Always visible, no showWhen linkage
      // (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
      // Prefect has a single sslConfig, so it uses the single-group keys.
      verifySSLField,
      ...sslConfigLeaves(false),
      // W2-5 follow-up (persist-secrets checkbox): Prefect carries secret
      // fields (apiKey, authString, 3 SSL leaves) but had no
      // storeConnectionSecrets checkbox, so literals could never be saved
      // via the UI (ADR:2026-11-08-leanforms-tier2-store-secrets-checkbox).
      storeSecretsField,
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
      // M-Next B6: official metabaseConnection.json lists password and apiKey
      // as two parallel auth modes; the form only offered apiKey.
      passwordField,
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
      // Wave 0 lean-forms: de-noised target 11 (R-T1.6). scheme is the single
      // option `databricks` — builder fixed value, no visible field.
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        testId: 'service-connection-timeout',
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
      ...policyAgentFields,
      connectionOptionsField,
      connectionArgumentsField,
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
      // M-Next B3: queryHistoryTable removed — official unityCatalogConnection.json
      // (23 props) has no such field; it was copied in from the Databricks group.
      // Databricks keeps its own (official databricksConnection.json has it).
      {
        key: 'includeMetricViews',
        control: 'checkbox',
        labelKey: 'connection.includeMetricViews',
        testId: 'service-include-metric-views',
      },
      // Wave 0 lean-forms: de-noised target 11 (R-T1.7). scheme is the single
      // option `databricks` — builder fixed value, no visible field.
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        testId: 'service-connection-timeout',
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
      ...policyAgentFields,
      connectionOptionsField,
      connectionArgumentsField,
      storeSecretsField,
    ],
  },
  // --- The eight kinds that previously had no form at all. Each group
  // below covers that kind's wizard default type, taken from its official
  // connection schema (openmetadata-spec .../connections/<kind>/...):
  // Rest (api/restConnection: openAPISchemaConnection required, token),
  // Mlflow (mlmodel/mlflowConnection: trackingUri + registryUri required),
  // OpenMetadata (metadata/openMetadataConnection: hostPort required),
  // GoogleDrive (drive/googleDriveConnection: credentials required),
  // ElasticSearch (search/elasticSearchConnection: hostPort + authType),
  // OpenAI (llm/openAIConnection: apiKey required), Mcp
  // (mcp/mcpConnection: all optional) and Ranger
  // (security/rangerConnection: hostPort + authType required).
  // Non-default types in these kinds still have no group: the wizard
  // must not offer them a silent undefined connection (see
  // hasConnectionForm, used by AddServiceView to block creation).
  {
    types: ['Rest'],
    fields: [
      requiredText('openApiSchemaUrl', 'connection.openApiSchemaUrl', {
        testId: 'service-openapi-schema-url',
        placeholder: 'https://example.com/openapi.json',
      }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.token',
        testId: 'service-api-key',
        passwordPlaceholder: true,
      },
      storeSecretsField,
    ],
  },
  {
    types: ['Mlflow'],
    fields: [
      requiredText('trackingUri', 'connection.trackingUri', {
        testId: 'service-tracking-uri',
        placeholder: 'http://localhost:5000',
      }),
      requiredText('registryUri', 'connection.registryUri', {
        testId: 'service-registry-uri',
        placeholder: 'mysql+pymysql://mlflow:password@localhost:3306/mlflow',
      }),
      storeSecretsField,
    ],
  },
  {
    types: ['OpenMetadata'],
    fields: [hostPort('http://localhost:8585'), storeSecretsField],
  },
  {
    types: ['GoogleDrive'],
    fields: [
      requiredText('credentialsJson', 'connection.credentialsJson', {
        testId: 'service-credentials-json',
        placeholder: '{"type": "service_account", ...}',
      }),
      text('delegatedEmail', 'connection.delegatedEmail', { testId: 'service-delegated-email' }),
      text('driveId', 'connection.driveId', { testId: 'service-drive-id' }),
      storeSecretsField,
    ],
  },
  {
    types: ['ElasticSearch'],
    fields: [
      hostPort('http://localhost:9200'),
      usernameOptional,
      passwordField,
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        testId: 'service-api-key',
        passwordPlaceholder: true,
      },
      storeSecretsField,
    ],
  },
  {
    types: ['OpenAI'],
    fields: [
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        testId: 'service-api-key',
        passwordPlaceholder: true,
        required: true,
      },
      text('organization', 'connection.organization', { testId: 'service-organization' }),
      text('baseUrl', 'connection.baseUrl', { testId: 'service-base-url', placeholder: 'https://api.openai.com/v1' }),
      storeSecretsField,
    ],
  },
  {
    types: ['Mcp'],
    fields: [
      text('registryUrl', 'connection.registryUrl', { testId: 'service-registry-url' }),
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        testId: 'service-connection-timeout',
        min: 1,
      },
      storeSecretsField,
    ],
  },
  {
    types: ['Ranger'],
    fields: [hostPort('http://localhost:6080'), usernameRequired, passwordField, storeSecretsField],
  },
];

/** True when the type has a connection form; false means the wizard must not create with it. */
export function hasConnectionForm(serviceType: string): boolean {
  return connectionFieldsForType(serviceType).length > 0;
}

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
