/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  groupConnectionSections,
  type FormSection,
  type GroupableField,
  type GroupableSchema,
} from '@/ingestion/formSections';
import { isMaskedSecret, shouldPersistSecret } from '@/ingestion/secrets';
import type {
  AwsCredentialsConfig,
  AzureCredentialsConfig,
  GcpCloudSqlCredentialsConfig,
  ServiceConnectionConfig,
  ServiceFormValues,
} from '@/types/ingestion';

/**
 * Data-table driven connection fields (R4). The official connection form is
 * JSON-schema driven, not type-branched; the product has no connection schema
 * surface, so this table is the bridge: adding a service type means adding one
 * group entry below, never touching the renderer component.
 *
 * Live-issues S-09/S-15/S-16/S-17: each definition carries the pin JSON-schema
 * `title`/`description` verbatim (EN, shown untranslated in both locales —
 * pin renders field labels from schema titles, never locale keys) and the
 * top-level config property it groups under (`group`), so the renderer can
 * section the form with pin's `getPropertySections` rules via
 * `buildConnectionSections`. Field order inside a group follows the pin
 * schema's property order; the sectioning helper produces pin's section
 * order and boolean placement.
 */
export type ConnectionFieldControl =
  | 'text'
  | 'password'
  | 'select'
  | 'toggle'
  | 'number'
  | 'note'
  | 'textarea'
  | 'map'
  | 'fileOrInput'
  | 'authSelect';

export interface ConnectionFieldOption {
  value: string;
  labelKey?: string;
  /** Pin branch/enum title, shown verbatim (EN) instead of the label key. */
  title?: string;
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
  /** Optional: fields carrying a pin schema `title` need no label key. */
  labelKey?: string;
  /** Pin JSON-schema `title`, verbatim EN. Preferred over `labelKey`. */
  title?: string;
  /** Pin JSON-schema `description`, verbatim EN. Surfaces via the doc panel. */
  description?: string;
  /** Top-level config property for section grouping; defaults to `key`. */
  group?: string;
  /** Heading shown above a multi-field group (sslConfig triplets). */
  groupLabel?: string;
  /** JSON-schema `type` override for grouping (booleans/wide shapes). */
  schemaType?: string;
  /** JSON-schema `format` override for grouping (`password` → Authentication). */
  schemaFormat?: string;
  /** Full schema fragment for the field's group (object/combiner shapes). */
  groupSchema?: GroupableSchema;
  /** Auth branch this field belongs to; cleared when another branch is picked. */
  branch?: string;
  /** Display fallback for branch selectors when the form value is unset. */
  defaultValue?: string;
  /** Render the single-credential note under an `authSelect` selector. */
  authNote?: boolean;
  textKey?: string;
  required?: boolean;
  testId?: string;
  options?: readonly ConnectionFieldOption[];
  hintKey?: string;
  extraKey?: string;
  min?: number;
  max?: number;
  hideItemLabel?: boolean;
  showWhen?: ConnectionFieldShowWhen;
  /** Additional conditions; the field is visible only when ALL pass. */
  showWhenAll?: readonly ConnectionFieldShowWhen[];
  /** Schema `accept` list for `fileOrInput` fields. */
  acceptedFileTypes?: readonly string[];
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
  title: 'Password',
  testId: 'service-password',
  hintKey: 'connection.secretHint',
};

const hostPort = (description?: string): Field =>
  requiredText('hostPort', 'connection.hostPort', {
    testId: 'service-host-port',
    title: 'Host and Port',
    description,
  });

const usernameRequired: Field = requiredText('username', 'connection.username', {
  testId: 'service-username',
  title: 'Username',
});

const usernameOptional: Field = text('username', 'connection.username', {
  testId: 'service-username',
  title: 'Username',
});

const databaseNameDefault: Field = text('databaseName', 'connection.databaseName', {
  testId: 'service-database-name',
  title: 'Database Name',
  description:
    'Optional name to give to the database in OpenMetadata. If left blank, we will use default as the database name.',
});

const databaseSchema: Field = text('databaseSchema', 'connection.databaseSchema', {
  testId: 'service-database-schema',
  title: 'Database Schema',
  description:
    'Database Schema of the data source. This is optional parameter, if you would like to restrict the metadata reading to a single schema. When left blank, OpenMetadata Ingestion attempts to scan all the schemas.',
});

const ingestAllDatabases: Field = {
  key: 'ingestAllDatabases',
  control: 'toggle',
  labelKey: 'connection.ingestAllDatabases',
  title: 'Ingest All Databases',
  testId: 'service-ingest-all-dbs',
};

const bootstrapServers: Field = requiredText('bootstrapServers', 'connection.bootstrapServers', {
  testId: 'service-bootstrap-servers',
  title: 'Bootstrap Servers',
  description:
    'Kafka bootstrap servers. add them in comma separated values ex: host1:9092,host2:9092',
});

const schemaRegistry: Field = text('schemaRegistryURL', 'connection.schemaRegistry', {
  testId: 'service-schema-registry',
  title: 'Schema Registry URL',
  description: 'Confluent Kafka Schema Registry URL.',
});

// Shared by Kafka and Redpanda: official kafkaConnection.json (16 props) and
// redpandaConnection.json (14 props) both carry securityProtocol, in the same
// relative position (after the schema-registry fields in the lean form).
const securityProtocolField: Field = {
  key: 'securityProtocol',
  control: 'select',
  labelKey: 'connection.securityProtocol',
  title: 'Security Protocol',
  description: 'security.protocol consumer config property',
  testId: 'service-security-protocol',
  options: [{ value: 'PLAINTEXT' }, { value: 'SASL_PLAINTEXT' }, { value: 'SASL_SSL' }, { value: 'SSL' }],
};

const note = (textKey: string): Field => ({ key: '', control: 'note', labelKey: '', textKey });

// W2-5 lean-forms tier 2 (Kafka/Redpanda): SASL + schema-registry fields
// (kafkaConnection.json / redpandaConnection.json). No showWhen linkage:
// the specs do not gate these on securityProtocol.
const saslUsernameField: Field = text('saslUsername', 'connection.saslUsername', {
  testId: 'service-sasl-username',
  title: 'SASL Username',
  description: 'sasl.username consumer config property',
});

const saslPasswordField: Field = {
  key: 'saslPassword',
  control: 'password',
  labelKey: 'connection.saslPassword',
  title: 'SASL Password',
  description: 'sasl.password consumer config property',
  testId: 'service-sasl-password',
  hintKey: 'connection.secretHint',
};

const saslMechanismField: Field = {
  key: 'saslMechanism',
  control: 'select',
  labelKey: 'connection.saslMechanism',
  title: 'SASL Mechanism',
  description: 'sasl.mechanism Consumer Config property',
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
  title: 'Schema Registry Basic Auth User Info',
  description:
    'basic.auth.user.info schema registry config property, Client HTTP credentials in the form of username:password.',
  testId: 'service-basic-auth-user-info',
  hintKey: 'connection.secretHint',
};

const consumerConfigField: Field = {
  key: 'consumerConfig',
  control: 'textarea',
  labelKey: 'connection.consumerConfig',
  title: 'Consumer Config',
  description:
    'Confluent Kafka Consumer Config. From https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md',
  testId: 'service-consumer-config',
};

const schemaRegistryConfigField: Field = {
  key: 'schemaRegistryConfig',
  control: 'textarea',
  labelKey: 'connection.schemaRegistryConfig',
  title: 'Schema Registry Config',
  description:
    'Confluent Kafka Schema Registry Config. From https://docs.confluent.io/5.5.1/clients/confluent-kafka-python/index.html#confluent_kafka.schema_registry.SchemaRegistryClient',
  testId: 'service-schema-registry-config',
};

const schemaRegistryTopicSuffixNameField: Field = text(
  'schemaRegistryTopicSuffixName',
  'connection.schemaRegistryTopicSuffixName',
  {
    testId: 'service-schema-registry-topic-suffix',
    title: 'Schema Registry Topic Suffix Name',
    description:
      'Schema Registry Topic Suffix Name. The suffix to be appended to the topic name to get topic schema from registry.',
  },
);

// verifySSL (verifySSLConfig, default no-ssl): one shared form key for
// Superset (nested in connection) and Prefect (top level). Always visible,
// no showWhen linkage (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
// Per-type descriptions differ; groups spread their own.
const verifySSLField: Field = {
  key: 'verifySSL',
  control: 'select',
  labelKey: 'connection.verifySSL',
  title: 'Verify SSL',
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
  title: 'SSL Mode',
  description: 'SSL Mode to connect to database.',
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
// sslKey — pin renders them `uiFieldType: fileOrInput`, so the lean form uses
// the file-or-input control, not plain textareas (live-issues S-13). `gated`
// is true for types that also carry sslMode (leaves hidden while mode is
// disable); MySQL/Mssql/Doris have sslConfig but no sslMode, so theirs are
// always visible. Tier 2 groups pass their own key triplet: each sslConfig
// group in one form gets independent keys, or one group's PEM would be
// written into the other (ADR:2026-11-08-leanforms-tier2-kafka-ssl-groups).
// `group` is the top-level config property the triplet nests under;
// `groupLabel` is that property's pin title, shown above the triplet.
const SSL_LEAF_META = [
  {
    title: 'CA Certificate',
    description: 'The CA certificate used for SSL validation.',
  },
  {
    title: 'SSL Certificate',
    description: 'The SSL certificate used for client authentication.',
  },
  {
    title: 'SSL Key',
    description: 'The private key associated with the SSL certificate.',
  },
] as const;

const sslConfigLeavesFor = (
  leaves: readonly [key: Field['key'], labelKey: string, testId: string][],
  gated = false,
  group = 'sslConfig',
  groupLabel = 'SSL Config',
): Field[] =>
  leaves.map(([key, labelKey, testId], index): Field => ({
    key,
    control: 'fileOrInput',
    labelKey,
    testId,
    group,
    groupLabel,
    title: SSL_LEAF_META[index].title,
    description: SSL_LEAF_META[index].description,
    schemaFormat: 'password',
    acceptedFileTypes: ['.pem', '.crt', '.cer'],
    hintKey: 'connection.secretHint',
    groupSchema: { oneOf: [{ type: 'object' }] },
    ...(gated ? { showWhen: SSL_MODE_GATE } : {}),
  }));

const sslConfigLeaves = (gated: boolean, groupLabel = 'SSL Config'): Field[] =>
  sslConfigLeavesFor(
    [
      ['sslCaCertificate', 'connection.sslCaCertificate', 'service-ssl-ca-certificate'],
      ['sslCertificate', 'connection.sslCertificate', 'service-ssl-certificate'],
      ['sslKey', 'connection.sslKey', 'service-ssl-key'],
    ],
    gated,
    'sslConfig',
    groupLabel,
  );

// connectionOptions / connectionArguments are string maps
// (connectionBasicType.json); entered through the key/value map editor and
// kept as JSON strings in form state, parsed in buildServiceConnection
// (GoogleDrive credentialsJson precedent). Live-issues S-14 replaces the
// JSON textareas + fork-authored hints with the contracted map editor.
const connectionOptionsField: Field = {
  key: 'connectionOptions',
  control: 'map',
  labelKey: 'connection.connectionOptions',
  title: 'Connection Options',
  description:
    'Additional connection options to build the URL that can be sent to service during the connection.',
  testId: 'service-connection-options',
};

const connectionArgumentsField: Field = {
  key: 'connectionArguments',
  control: 'map',
  labelKey: 'connection.connectionArguments',
  title: 'Connection Arguments',
  description:
    'Additional connection arguments such as security or protocol configs that can be sent to service during connection.',
  testId: 'service-connection-arguments',
};

// W3-3A lean-forms tier 3A (Rest/Mlflow/OpenMetadata/GoogleDrive/
// ElasticSearch/OpenAI/Mcp/Ranger). Labels take the spec titles verbatim
// where the spec has one; hints take the spec descriptions. ShowWhen gates
// follow the spec oneOf branches (GoogleDrive gcpConfig, ElasticSearch
// authType / sslConfig certificates) — the same oneOf rendering the
// official schema-driven form does.
const GCP_VALUES_GATE: ConnectionFieldShowWhen = {
  field: 'gcpConfigType',
  equals: 'gcpValues',
  defaultValue: 'gcpValues',
};
const GCP_PATH_GATE: ConnectionFieldShowWhen = {
  field: 'gcpConfigType',
  equals: 'gcpCredentialsPath',
  defaultValue: 'gcpValues',
};
const GCP_EXTERNAL_GATE: ConnectionFieldShowWhen = {
  field: 'gcpConfigType',
  equals: 'gcpExternalAccount',
  defaultValue: 'gcpValues',
};
const ES_BASIC_AUTH_GATE: ConnectionFieldShowWhen = {
  field: 'elasticSearchAuthMode',
  equals: 'basicAuth',
  defaultValue: 'basicAuth',
};
const ES_API_AUTH_GATE: ConnectionFieldShowWhen = {
  field: 'elasticSearchAuthMode',
  equals: 'apiAuth',
  defaultValue: 'basicAuth',
};
const ES_SSL_PATHS_GATE: ConnectionFieldShowWhen = {
  field: 'sslCertMode',
  equals: 'paths',
  defaultValue: 'paths',
};
const ES_SSL_VALUES_GATE: ConnectionFieldShowWhen = {
  field: 'sslCertMode',
  equals: 'values',
  defaultValue: 'paths',
};

// gcpConfig branch titles are the spec file titles verbatim
// (gcpValues.json / gcpCredentialsPath / gcpExternalAccount.json / gcpADC).
const gcpConfigTypeField: Field = {
  key: 'gcpConfigType',
  control: 'select',
  labelKey: 'connection.gcpConfigType',
  title: 'GCP Credentials Configuration',
  description: 'GCP credentials to use. If not provided, Application Default Credentials will be used.',
  group: 'credentials',
  groupLabel: 'GCP Credentials',
  groupSchema: { type: 'object' },
  testId: 'service-gcp-config-type',
  options: [
    { value: 'gcpValues', labelKey: 'connection.gcpConfigTypeValues', title: 'GCP Credentials Values' },
    { value: 'gcpCredentialsPath', labelKey: 'connection.gcpConfigTypePath', title: 'GCP Credentials Path' },
    { value: 'gcpExternalAccount', labelKey: 'connection.gcpConfigTypeExternal', title: 'GCP External Account' },
    { value: 'gcpADC', labelKey: 'connection.gcpConfigTypeAdc', title: 'GCP Application Default Credentials' },
  ],
};

// authType branch titles are the spec file titles verbatim
// (basicAuth.json / apiAuth.json).
const elasticSearchAuthModeField: Field = {
  key: 'elasticSearchAuthMode',
  control: 'authSelect',
  labelKey: 'connection.authMode',
  title: 'Auth Configuration Type',
  description: 'Choose Auth Config Type.',
  group: 'authType',
  groupSchema: { oneOf: [{ type: 'object' }] },
  defaultValue: 'basicAuth',
  authNote: true,
  testId: 'service-elastic-auth-mode',
  options: [
    { value: 'basicAuth', labelKey: 'connection.elasticSearchAuthBasic', title: 'Basic Authentication' },
    { value: 'apiAuth', labelKey: 'connection.elasticSearchAuthApi', title: 'API Key Authentication' },
  ],
};

// certificates branch titles are the spec file titles verbatim
// (sslCertPaths.json / sslCertValues.json).
const sslCertModeField: Field = {
  key: 'sslCertMode',
  control: 'select',
  labelKey: 'connection.sslCertMode',
  title: 'SSL Certificates',
  description: 'SSL Certificates',
  group: 'sslConfig',
  groupLabel: 'SSL Config',
  groupSchema: { type: 'object' },
  testId: 'service-ssl-cert-mode',
  options: [
    { value: 'paths', labelKey: 'connection.sslCertModePaths', title: 'SSL Certificates By Path' },
    { value: 'values', labelKey: 'connection.sslCertModeValues', title: 'SSL Certificates By Values' },
  ],
};

// policyAgentConfig (connectionBasicType.json): four booleans; spec default
// is { enabled: true, supportsColumnAccess: false, supportsFullAccess: true,
// supportsMaskedAccess: true } (see createEmptyServiceForm).
const policyAgentFields: readonly Field[] = [
  {
    key: 'policyAgentEnabled',
    control: 'toggle',
    labelKey: 'connection.policyAgentEnabled',
    title: 'Enabled',
    description: 'Enable policy agent extraction.',
    group: 'policyAgentConfig',
    groupLabel: 'Policy Agent Config',
    groupSchema: { type: 'object' },
    testId: 'service-policy-agent-enabled',
  },
  {
    key: 'policyAgentSupportsColumnAccess',
    control: 'toggle',
    labelKey: 'connection.policyAgentSupportsColumnAccess',
    title: 'Supports Column Access',
    description: 'Supports column-level access policy extraction.',
    group: 'policyAgentConfig',
    testId: 'service-policy-agent-column-access',
  },
  {
    key: 'policyAgentSupportsFullAccess',
    control: 'toggle',
    labelKey: 'connection.policyAgentSupportsFullAccess',
    title: 'Supports Full Access',
    description: 'Supports full access policy extraction.',
    group: 'policyAgentConfig',
    testId: 'service-policy-agent-full-access',
  },
  {
    key: 'policyAgentSupportsMaskedAccess',
    control: 'toggle',
    labelKey: 'connection.policyAgentSupportsMaskedAccess',
    title: 'Supports Masked Access',
    description: 'Supports masked access policy extraction.',
    group: 'policyAgentConfig',
    testId: 'service-policy-agent-masked-access',
  },
];

// Live-issues S-12: authType oneOf branches (basicAuth.json /
// awsCredentials.json / azureCredentials.json / gcpCredentials.json, resolved
// through each connection schema's authType oneOf). Titles/descriptions are
// the pin schema strings verbatim. Branch fields live on dedicated `auth*`
// form keys so switching branches can discard the other branch's values
// (pin AuthSelectField sanitize); mergeAuthBranchIntoConfig folds the active
// branch into config.authType, and hydrateAuthBranchForm refills it on edit.
// Types with an authType oneOf: Mysql (4 branches), Postgres/Timescale (3),
// Greenplum/Redshift (2). Databricks/UnityCatalog, ElasticSearch and Prefect
// keep their existing fork selectors (authMode / elasticSearchAuthMode /
// prefectAuthMode) with pin branch titles; Snowflake gets the synthesized
// Password/Key-pair selector (pin getSchemaWithSynthesizedAuthType).
export const AUTH_BRANCH_TYPES = ['Mysql', 'Postgres', 'Greenplum', 'Redshift', 'Timescale'] as const;

export type AuthBranch = 'basic' | 'iam' | 'azure' | 'gcp';

const authBranchGate = (branch: string): ConnectionFieldShowWhen => ({
  field: 'authTypeBranch',
  equals: branch,
  defaultValue: 'basic',
});

export function authTypeSelectorField(
  branches: readonly { value: AuthBranch; title: string }[],
  description = 'Choose Auth Config Type.',
): Field {
  return {
    key: 'authTypeBranch',
    control: 'authSelect',
    labelKey: 'connection.authMode',
    title: 'Auth Configuration Type',
    description,
    group: 'authType',
    groupSchema: { oneOf: [{ type: 'object' }] },
    defaultValue: 'basic',
    authNote: true,
    testId: 'service-auth-type',
    options: branches.map((branch) => ({ value: branch.value, title: branch.title })),
  };
}

const basicAuthPasswordField: Field = {
  ...passwordField,
  group: 'authType',
  branch: 'basic',
  description: 'Password to connect to source.',
  showWhen: authBranchGate('basic'),
};

const iamBranchFields: readonly Field[] = [
  {
    key: 'authAwsEnabled',
    control: 'toggle',
    labelKey: 'connection.awsIamEnabled',
    title: 'Enable IAM Auth',
    description:
      'Enable AWS IAM authentication. When enabled, uses the default credential provider chain (environment variables, instance profile, etc.). Defaults to false for backward compatibility.',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-enabled',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsAccessKeyId',
    control: 'text',
    labelKey: 'connection.awsAccessKeyId',
    title: 'AWS Access Key ID',
    description: 'AWS Access key ID.',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-access-key',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsSecretAccessKey',
    control: 'password',
    labelKey: 'connection.awsSecretAccessKey',
    title: 'AWS Secret Access Key',
    description: 'AWS Secret Access Key.',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-secret-key',
    hintKey: 'connection.secretHint',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsRegion',
    control: 'text',
    labelKey: 'connection.awsRegion',
    title: 'AWS Region',
    description: 'AWS Region',
    group: 'authType',
    branch: 'iam',
    required: true,
    testId: 'service-auth-aws-region',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsSessionToken',
    control: 'password',
    labelKey: 'connection.awsSessionToken',
    title: 'AWS Session Token',
    description: 'AWS Session Token.',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-session-token',
    hintKey: 'connection.secretHint',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsEndPointURL',
    control: 'text',
    labelKey: 'connection.awsEndPointURL',
    title: 'Endpoint URL',
    description: 'EndPoint URL for the AWS',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-endpoint',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAwsProfileName',
    control: 'text',
    labelKey: 'connection.awsProfileName',
    title: 'Profile Name',
    description: 'The name of a profile to use with the boto session.',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-profile',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAssumeRoleArn',
    control: 'text',
    labelKey: 'connection.assumeRoleArn',
    title: 'Role Arn for Assume Role',
    description:
      'The Amazon Resource Name (ARN) of the role to assume. Required Field in case of Assume Role',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-role-arn',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAssumeRoleSessionName',
    control: 'text',
    labelKey: 'connection.assumeRoleSessionName',
    title: 'Role Session Name for Assume Role',
    description:
      'An identifier for the assumed role session. Use the role session name to uniquely identify a session when the same role is assumed by different principals or for different reasons. Required Field in case of Assume Role',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-role-session',
    showWhen: authBranchGate('iam'),
  },
  {
    key: 'authAssumeRoleSourceIdentity',
    control: 'text',
    labelKey: 'connection.assumeRoleSourceIdentity',
    title: 'Source Identity for Assume Role',
    description:
      'The Amazon Resource Name (ARN) of the role to assume. Optional Field in case of Assume Role',
    group: 'authType',
    branch: 'iam',
    testId: 'service-auth-aws-role-source',
    showWhen: authBranchGate('iam'),
  },
];

const azureBranchFields: readonly Field[] = [
  {
    key: 'authAzureClientId',
    control: 'text',
    labelKey: 'connection.azureClientId',
    title: 'Client ID',
    description: 'Your Service Principal App ID (Client ID)',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-client-id',
    showWhen: authBranchGate('azure'),
  },
  {
    key: 'authAzureClientSecret',
    control: 'password',
    labelKey: 'connection.azureClientSecret',
    title: 'Client Secret',
    description: 'Your Service Principal Password (Client Secret)',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-client-secret',
    hintKey: 'connection.secretHint',
    showWhen: authBranchGate('azure'),
  },
  {
    key: 'authAzureTenantId',
    control: 'text',
    labelKey: 'connection.azureTenantId',
    title: 'Tenant ID',
    description: 'Tenant ID of your Azure Subscription',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-tenant-id',
    showWhen: authBranchGate('azure'),
  },
  {
    key: 'authAzureAccountName',
    control: 'text',
    title: 'Storage Account Name',
    description: 'Account Name of your storage account',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-account-name',
    showWhen: authBranchGate('azure'),
  },
  {
    key: 'authAzureVaultName',
    control: 'text',
    title: 'Key Vault Name',
    description: 'Key Vault Name',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-vault-name',
    showWhen: authBranchGate('azure'),
  },
  {
    key: 'authAzureScopes',
    control: 'text',
    title: 'Scopes',
    description: 'Scopes to get access token, for e.g. api://6dfX33ab-XXXX-49df-XXXX-3459eX817d3e/.default',
    group: 'authType',
    branch: 'azure',
    testId: 'service-auth-azure-scopes',
    showWhen: authBranchGate('azure'),
  },
];

// GCP CloudSQL branch (Mysql only): password + IAM toggle + the gcpConfig
// oneOf (4 variants) + impersonation. Variant fields gate on
// authGcpConfigBranch and carry the variant as their branch tag so switching
// variants discards the other variant's values; the whole branch gates on
// authTypeBranch via the shared `gcp` branch tag on the selector-adjacent
// fields. projectId is a pin oneOf (single string / string array); the lean
// form renders the single-value form only.
const gcpVariantGate = (variant: string): ConnectionFieldShowWhen => ({
  field: 'authGcpConfigBranch',
  equals: variant,
  defaultValue: 'gcpValues',
});

const gcpBranchFields: readonly Field[] = [
  {
    key: 'authGcpPassword',
    control: 'password',
    labelKey: 'connection.password',
    title: 'Database Password',
    description: 'Database user password. Leave empty if using IAM database authentication.',
    group: 'authType',
    branch: 'gcp',
    testId: 'service-auth-gcp-password',
    hintKey: 'connection.secretHint',
    showWhen: authBranchGate('gcp'),
  },
  {
    key: 'authGcpEnableIamAuth',
    control: 'toggle',
    title: 'Enable IAM Authentication',
    description: 'Use GCP IAM for database authentication instead of a password.',
    group: 'authType',
    branch: 'gcp',
    testId: 'service-auth-gcp-iam',
    showWhen: authBranchGate('gcp'),
  },
  {
    key: 'authGcpConfigBranch',
    control: 'select',
    labelKey: 'connection.gcpConfigType',
    title: 'GCP Credentials Configuration',
    description: 'We support two ways of authenticating to GCP i.e via GCP Credentials Values or GCP Credentials Path',
    group: 'authType',
    branch: 'gcp',
    defaultValue: 'gcpValues',
    testId: 'service-auth-gcp-config-type',
    showWhen: authBranchGate('gcp'),
    options: [
      { value: 'gcpValues', title: 'GCP Credentials Values' },
      { value: 'gcpCredentialsPath', title: 'GCP Credentials Path' },
      { value: 'gcpExternalAccount', title: 'GCP External Account' },
      { value: 'gcpADC', title: 'GCP Application Default Credentials' },
    ],
  },
  {
    key: 'authGcpProjectId',
    control: 'text',
    title: 'Project ID',
    description: 'Project ID',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-project-id',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpPrivateKeyId',
    control: 'text',
    title: 'Private Key ID',
    description: 'Google Cloud private key id.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-private-key-id',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpPrivateKey',
    control: 'fileOrInput',
    labelKey: 'connection.privateKey',
    title: 'Private Key',
    description: 'Google Cloud private key.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-private-key',
    hintKey: 'connection.secretHint',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpClientEmail',
    control: 'text',
    title: 'Client Email',
    description: 'Google Cloud email.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-client-email',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpClientId',
    control: 'text',
    labelKey: 'connection.clientId',
    title: 'Client ID',
    description: 'Google Cloud Client ID.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-client-id',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpAuthUri',
    control: 'text',
    title: 'Authentication URI',
    description: 'Google Cloud auth uri.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-auth-uri',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpTokenUri',
    control: 'text',
    title: 'Token URI',
    description: 'Google Cloud token uri.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-token-uri',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpAuthProviderX509CertUrl',
    control: 'text',
    title: 'Authentication Provider x509 Certificate URL',
    description: 'Google Cloud auth provider certificate.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-auth-provider-cert-url',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpClientX509CertUrl',
    control: 'text',
    title: 'Client x509 Certificate URL',
    description: 'Google Cloud client certificate uri.',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-client-cert-url',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpUniverseDomain',
    control: 'text',
    title: 'Universe Domain',
    description:
      'Google Cloud service domain, used to override the default `googleapis.com` domain for sovereign or partner clouds (e.g. Trusted Partner Cloud service accounts).',
    group: 'authType',
    branch: 'gcpValues',
    testId: 'service-auth-gcp-universe-domain',
    showWhen: gcpVariantGate('gcpValues'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpPath',
    control: 'text',
    labelKey: 'connection.gcpCredentialsPath',
    title: 'Path',
    description: 'Path of the file containing the GCP credentials info',
    group: 'authType',
    branch: 'gcpCredentialsPath',
    testId: 'service-auth-gcp-path',
    showWhen: gcpVariantGate('gcpCredentialsPath'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpProjectId',
    control: 'text',
    title: 'GCP Project ID',
    description: 'GCP Project ID to parse metadata from',
    group: 'authType',
    branch: 'gcpCredentialsPath',
    testId: 'service-auth-gcp-project-id-path',
    showWhen: gcpVariantGate('gcpCredentialsPath'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpAudience',
    control: 'text',
    title: 'Audience',
    description:
      'Google Security Token Service audience which contains the resource name for the workload identity pool and the provider identifier in that pool.',
    group: 'authType',
    branch: 'gcpExternalAccount',
    testId: 'service-auth-gcp-audience',
    showWhen: gcpVariantGate('gcpExternalAccount'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpSubjectTokenType',
    control: 'text',
    title: 'Subject Token Type',
    description:
      'Google Security Token Service subject token type based on the OAuth 2.0 token exchange spec.',
    group: 'authType',
    branch: 'gcpExternalAccount',
    testId: 'service-auth-gcp-subject-token-type',
    showWhen: gcpVariantGate('gcpExternalAccount'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpTokenUrl',
    control: 'text',
    title: 'Token URL',
    description: 'Google Security Token Service token exchange endpoint.',
    group: 'authType',
    branch: 'gcpExternalAccount',
    testId: 'service-auth-gcp-token-url',
    showWhen: gcpVariantGate('gcpExternalAccount'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpCredentialSource',
    control: 'textarea',
    title: 'Credential Source',
    description:
      'This object defines the mechanism used to retrieve the external credential from the local environment so that it can be exchanged for a GCP access token via the STS endpoint',
    group: 'authType',
    branch: 'gcpExternalAccount',
    testId: 'service-auth-gcp-credential-source',
    showWhen: gcpVariantGate('gcpExternalAccount'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpProjectId',
    control: 'text',
    title: 'GCP Project ID',
    description: 'GCP Project ID to parse metadata from',
    group: 'authType',
    branch: 'gcpADC',
    testId: 'service-auth-gcp-project-id-adc',
    showWhen: gcpVariantGate('gcpADC'),
    showWhenAll: [authBranchGate('gcp')],
  },
  {
    key: 'authGcpImpersonateEmail',
    control: 'text',
    labelKey: 'connection.impersonateServiceAccount',
    title: 'Target Service Account Email',
    description: 'The impersonated service account email',
    group: 'authType',
    branch: 'gcp',
    testId: 'service-auth-gcp-impersonate-email',
    showWhen: authBranchGate('gcp'),
  },
  {
    key: 'authGcpImpersonateLifetime',
    control: 'number',
    labelKey: 'connection.impersonateLifetime',
    title: 'Lifetime',
    description: 'Number of seconds the delegated credential should be valid',
    group: 'authType',
    branch: 'gcp',
    testId: 'service-auth-gcp-impersonate-lifetime',
    showWhen: authBranchGate('gcp'),
  },
];

// Snowflake synthesized auth (pin getSchemaWithSynthesizedAuthType): the
// schema has flat secrets and no authType, so pin synthesizes a Password /
// Key-pair selector. Stored config stays flat; merge/hydrate translate.
const snowflakeAuthSelectorField: Field = {
  key: 'authTypeBranch',
  control: 'authSelect',
  labelKey: 'connection.authMode',
  title: 'Auth Configuration Type',
  group: 'authType',
  groupSchema: { oneOf: [{ type: 'object' }] },
  defaultValue: 'password',
  authNote: true,
  testId: 'service-auth-type',
  options: [
    { value: 'password', labelKey: 'forms.docPanel.passwordAuthTitle' },
    { value: 'keyPair', labelKey: 'forms.docPanel.keyPairAuthTitle' },
  ],
};

const snowflakePasswordGate: ConnectionFieldShowWhen = {
  field: 'authTypeBranch',
  equals: 'password',
  defaultValue: 'password',
};
const snowflakeKeyPairGate: ConnectionFieldShowWhen = {
  field: 'authTypeBranch',
  equals: 'keyPair',
  defaultValue: 'password',
};

// Live-issues S-11: scheme is a visible select in Advanced, including
// single-enum types whose builder emits a fixed value — the displayed option
// is the value the builder emits, so the field never fights the builder.
const schemeField = (values: readonly string[]): Field => ({
  key: 'scheme',
  control: 'select',
  labelKey: 'connection.scheme',
  title: 'Connection Scheme',
  description: 'SQLAlchemy driver scheme options.',
  testId: 'service-scheme',
  options: values.map((value) => ({ value })),
});

// Databricks / UnityCatalog share the authType oneOf (Personal Access Token /
// Databricks OAuth / Azure AD Setup). The fork `authMode` selector is kept,
// rendered as the branch selector with pin branch titles.
const databricksAuthFields: readonly Field[] = [
  {
    key: 'authMode',
    control: 'authSelect',
    labelKey: 'connection.authMode',
    title: 'Authentication Type',
    description: 'Choose between different authentication types for Databricks.',
    group: 'authType',
    groupSchema: { oneOf: [{ type: 'object' }] },
    defaultValue: 'pat',
    authNote: true,
    testId: 'service-auth-mode',
    required: true,
    options: [
      { value: 'pat', labelKey: 'connection.authPat', title: 'Personal Access Token' },
      { value: 'oauth', labelKey: 'connection.authOauth', title: 'Databricks OAuth' },
      { value: 'azure', labelKey: 'connection.authAzure', title: 'Azure AD Setup' },
    ],
  },
  {
    ...passwordField,
    labelKey: 'connection.token',
    title: 'Token',
    description:
      'Generated Personal Access Token for Databricks workspace authentication. This token is created from User Settings -> Developer -> Access Tokens in your Databricks workspace.',
    group: 'authType',
    branch: 'pat',
    showWhen: { field: 'authMode', equals: 'pat', defaultValue: 'pat' },
  },
  requiredText('clientId', 'connection.clientId', {
    testId: 'service-client-id',
    title: 'Client ID',
    description:
      'Service Principal Application ID created in your Databricks Account Console for OAuth Machine-to-Machine authentication.',
    group: 'authType',
    branch: 'oauth',
    showWhen: { field: 'authMode', equals: 'oauth' },
  }),
  {
    key: 'clientSecret',
    control: 'password',
    labelKey: 'connection.clientSecret',
    title: 'Client Secret',
    description:
      'OAuth Secret generated for the Service Principal in Databricks Account Console. Used for secure OAuth2 authentication.',
    group: 'authType',
    branch: 'oauth',
    testId: 'service-client-secret',
    hintKey: 'connection.secretHint',
    showWhen: { field: 'authMode', equals: 'oauth' },
  },
  requiredText('azureClientId', 'connection.azureClientId', {
    testId: 'service-azure-client-id',
    title: 'Azure Client ID',
    description:
      'Azure Service Principal Application (client) ID registered in your Azure Active Directory.',
    group: 'authType',
    branch: 'azure',
    showWhen: { field: 'authMode', equals: 'azure' },
  }),
  requiredText('azureTenantId', 'connection.azureTenantId', {
    testId: 'service-azure-tenant-id',
    title: 'Azure Tenant ID',
    description:
      'Azure Active Directory Tenant ID where your Service Principal is registered.',
    group: 'authType',
    branch: 'azure',
    showWhen: { field: 'authMode', equals: 'azure' },
  }),
  {
    key: 'azureClientSecret',
    control: 'password',
    labelKey: 'connection.azureClientSecret',
    title: 'Azure Client Secret',
    description: 'Azure Service Principal client secret created in Azure AD for authentication.',
    group: 'authType',
    branch: 'azure',
    testId: 'service-azure-client-secret',
    hintKey: 'connection.secretHint',
    showWhen: { field: 'authMode', equals: 'azure' },
  },
];

export const CONNECTION_FIELD_GROUPS: readonly ConnectionFieldGroup[] = [
  {
    types: ['Postgres'],
    // Pin postgresConnection.json property order: scheme, username, authType,
    // hostPort, database, ingestAllDatabases, sslMode, sslConfig,
    // classificationName, queryStatementSource, connectionOptions,
    // connectionArguments.
    fields: [
      schemeField(['postgresql+psycopg2', 'pgspider+psycopg2']),
      {
        ...usernameRequired,
        description:
          'Username to connect to Postgres. This user should have privileges to read all the metadata in Postgres.',
      },
      authTypeSelectorField([
        { value: 'basic', title: 'Basic Auth' },
        { value: 'iam', title: 'IAM Auth Configuration Source' },
        { value: 'azure', title: 'Azure Configuration Source' },
      ]),
      basicAuthPasswordField,
      ...iamBranchFields,
      ...azureBranchFields,
      hostPort('Host and port of the source service.'),
      requiredText('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Initial database to connect to. Metadata reading is restricted to this database unless Ingest All Databases is enabled, in which case this database is used as the entry point to discover and scan all databases.',
      }),
      {
        ...ingestAllDatabases,
        description:
          'Ingest data from all databases in Postgres. You can use databaseFilterPattern on top of this.',
      },
      sslModeField,
      ...sslConfigLeaves(true),
      text('classificationName', 'connection.classificationName', {
        testId: 'service-classification-name',
        title: 'Classification Name',
        description: 'Custom OpenMetadata Classification name for Postgres policy tags.',
      }),
      text('queryStatementSource', 'connection.queryStatementSource', {
        testId: 'service-query-statement-source',
        title: 'Query Statement Source',
        description:
          'Fully qualified name of the view or table to use for query logs. If not provided, defaults to pg_stat_statements. Use this to configure a custom view (e.g., my_schema.custom_pg_stat_statements) when direct access to pg_stat_statements is restricted.',
      }),
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['Mysql'],
    // Pin mysqlConnection.json property order: scheme, username, authType,
    // hostPort, databaseName, databaseSchema, sslConfig, connectionOptions,
    // connectionArguments, useSlowLogs, queryHistoryTable.
    fields: [
      schemeField(['mysql+pymysql']),
      {
        ...usernameRequired,
        description:
          'Username to connect to MySQL. This user should have privileges to read all the metadata in Mysql.',
      },
      authTypeSelectorField([
        { value: 'basic', title: 'Basic Auth' },
        { value: 'iam', title: 'IAM Auth Configuration Source' },
        { value: 'azure', title: 'Azure Configuration Source' },
        { value: 'gcp', title: 'GCP CloudSQL Configuration Source' },
      ]),
      basicAuthPasswordField,
      ...iamBranchFields,
      ...azureBranchFields,
      ...gcpBranchFields,
      hostPort(
        "Host and port of the MySQL service. For GCP CloudSQL, use the instance connection name in the format 'project_id:region:instance_name'.",
      ),
      databaseNameDefault,
      databaseSchema,
      // MySQL has sslConfig but no sslMode, so the leaves are always visible.
      ...sslConfigLeaves(false, 'SSL'),
      connectionOptionsField,
      connectionArgumentsField,
      {
        key: 'useSlowLogs',
        control: 'toggle',
        labelKey: 'connection.useSlowLogs',
        title: 'Use Slow Logs for Lineage',
        description: 'Use slow logs to extract lineage.',
        testId: 'service-use-slow-logs',
      },
      // M-Next B3 (reverse check): official mysqlConnection.json carries
      // queryHistoryTable; the product MySQL group was missing it.
      text('queryHistoryTable', 'connection.queryHistoryTable', {
        testId: 'service-query-history',
        title: 'Query History Table',
        description:
          "Table name to fetch the query history. When set, this overrides the default 'mysql.general_log' (or 'mysql.slow_log' when 'useSlowLogs' is enabled). The custom table must expose columns compatible with the selected log path.",
      }),
    ],
  },
  {
    types: ['Snowflake'],
    // Pin snowflakeConnection.json property order: scheme, username, password
    // (synthesized selector + branches), account, role, database, warehouse,
    // queryTag, accountUsageSchema, systemMetricsBatchSize, privateKey,
    // snowflakePrivatekeyPassphrase, include*, clientSessionKeepAlive,
    // useAccessHistory, accessHistoryChunkSize, connectionOptions,
    // connectionArguments, creditCost, snowflakeSourceHost, policyAgentConfig.
    fields: [
      schemeField(['snowflake']),
      {
        ...usernameRequired,
        description:
          'Username to connect to Snowflake. This user should have privileges to read all the metadata in Snowflake.',
      },
      snowflakeAuthSelectorField,
      {
        ...passwordField,
        group: 'authType',
        branch: 'password',
        description: 'Password to connect to Snowflake.',
        showWhen: snowflakePasswordGate,
      },
      requiredText('account', 'connection.account', {
        testId: 'service-account',
        title: 'Account',
        description:
          'If the Snowflake URL is https://xyz1234.us-east-1.gcp.snowflakecomputing.com, then the account is xyz1234.us-east-1.gcp',
      }),
      text('role', 'connection.role', {
        testId: 'service-role',
        title: 'Role',
        description: 'Snowflake Role.',
      }),
      text('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Database of the data source. This is optional parameter, if you would like to restrict the metadata reading to a single database. When left blank, OpenMetadata Ingestion attempts to scan all the databases.',
      }),
      requiredText('warehouse', 'connection.warehouse', {
        testId: 'service-warehouse',
        title: 'Warehouse',
        description: 'Snowflake warehouse.',
      }),
      text('queryTag', 'connection.queryTag', {
        testId: 'service-query-tag',
        title: 'Query Tag',
        description:
          'Session query tag used to monitor usage on snowflake. To use a query tag snowflake user should have enough privileges to alter the session.',
      }),
      text('accountUsageSchema', 'connection.accountUsageSchema', {
        testId: 'service-account-usage-schema',
        title: 'Account Usage Schema Name',
        description: 'Full name of the schema where the account usage data is stored.',
      }),
      {
        key: 'systemMetricsBatchSize',
        control: 'number',
        labelKey: 'connection.systemMetricsBatchSize',
        title: 'System Metrics Batch Size',
        description:
          'Number of tables whose DML history is read from QUERY_HISTORY with a single query when the profiler computes system metrics. Higher values issue fewer scans but hold more history in memory at once.',
        testId: 'service-system-metrics-batch-size',
        min: 1,
        max: 500,
      },
      {
        key: 'privateKey',
        control: 'fileOrInput',
        labelKey: 'connection.privateKey',
        title: 'Private Key',
        description: 'Connection to Snowflake instance via Private Key',
        group: 'authType',
        branch: 'keyPair',
        testId: 'service-private-key',
        acceptedFileTypes: ['.pem', '.key', '.p8'],
        hintKey: 'connection.secretHint',
        showWhen: snowflakeKeyPairGate,
      },
      {
        key: 'snowflakePrivatekeyPassphrase',
        control: 'password',
        labelKey: 'connection.snowflakePrivatekeyPassphrase',
        title: 'Snowflake Passphrase Key',
        description: 'Snowflake Passphrase Key used with Private Key',
        group: 'authType',
        branch: 'keyPair',
        testId: 'service-private-key-passphrase',
        showWhen: snowflakeKeyPairGate,
      },
      {
        key: 'includeTransientTables',
        control: 'toggle',
        labelKey: 'connection.includeTransientTables',
        title: 'Include Transient Tables',
        description: 'Ingest transient tables alongside permanent ones.',
        testId: 'service-include-transient-tables',
      },
      {
        key: 'includeStreams',
        control: 'toggle',
        labelKey: 'connection.includeStreams',
        title: 'Include Streams',
        description: 'Ingest Snowflake streams as data assets.',
        testId: 'service-include-streams',
      },
      {
        key: 'includeStages',
        control: 'toggle',
        labelKey: 'connection.includeStages',
        title: 'Include Stages',
        description: 'Ingest external and internal stages.',
        testId: 'service-include-stages',
      },
      {
        key: 'includeSemanticViews',
        control: 'toggle',
        labelKey: 'connection.includeSemanticViews',
        title: 'Include Semantic Views',
        description: 'Ingest Snowflake semantic views as data assets.',
        testId: 'service-include-semantic-views',
      },
      {
        key: 'clientSessionKeepAlive',
        control: 'toggle',
        labelKey: 'connection.clientSessionKeepAlive',
        title: 'Client Session Keep Alive',
        description: 'Keep the session alive for long-running scans.',
        testId: 'service-client-session-keep-alive',
      },
      {
        key: 'useAccessHistory',
        control: 'toggle',
        labelKey: 'connection.useAccessHistory',
        title: 'Use Access History for Lineage',
        description:
          "Use Snowflake's ACCOUNT_USAGE.ACCESS_HISTORY view as the source of query lineage. ACCESS_HISTORY provides Snowflake-computed table- and column-level lineage, including for queries OpenMetadata cannot parse. Enabled by default; if the configured role cannot read ACCESS_HISTORY, ingestion automatically falls back to the legacy query-log parser.",
        testId: 'service-use-access-history',
      },
      {
        key: 'accessHistoryChunkSize',
        control: 'number',
        labelKey: 'connection.accessHistoryChunkSize',
        title: 'Access History Chunk Size (Days)',
        description:
          "Number of days of ACCESS_HISTORY scanned per query when 'Use Access History for Lineage' is enabled. The lineage time window is split into chunks of this many days to keep each Snowflake query bounded and avoid client/server timeouts over long windows. Lower this value if queries still time out on very busy accounts.",
        testId: 'service-access-history-chunk-size',
        min: 1,
      },
      connectionOptionsField,
      connectionArgumentsField,
      {
        key: 'creditCost',
        control: 'number',
        labelKey: 'connection.creditCost',
        title: 'Cost of Credit',
        description: 'Cost of credit for the Snowflake account.',
        testId: 'service-credit-cost',
      },
      text('snowflakeSourceHost', 'connection.snowflakeSourceHost', {
        testId: 'service-snowflake-source-host',
        title: 'Snowflake Source Host',
        description: 'Snowflake source host for the Snowflake account.',
      }),
      ...policyAgentFields,
    ],
  },
  {
    types: ['Doris'],
    // Pin dorisConnection.json property order: scheme, username, password,
    // hostPort, databaseName, databaseSchema, sslConfig, connectionOptions,
    // connectionArguments.
    fields: [
      schemeField(['doris']),
      {
        ...usernameRequired,
        description:
          'Username to connect to Doris. This user should have privileges to read all the metadata in Doris.',
      },
      { ...passwordField, description: 'Password to connect to Doris.' },
      hostPort('Host and port of the Doris service.'),
      databaseNameDefault,
      databaseSchema,
      // Doris has sslConfig but no sslMode, so the leaves are always visible.
      ...sslConfigLeaves(false, 'SSL'),
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['Mssql'],
    // Pin mssqlConnection.json property order: scheme, username, password,
    // hostPort, database, driver, encrypt, trustServerCertificate, sslConfig,
    // ingestAllDatabases, includeSynonyms, connectionOptions,
    // connectionArguments.
    fields: [
      {
        key: 'scheme',
        control: 'select',
        labelKey: 'connection.scheme',
        title: 'Connection Scheme',
        description: 'SQLAlchemy driver scheme options.',
        testId: 'service-scheme',
        options: [{ value: 'mssql+pyodbc' }, { value: 'mssql+pytds' }, { value: 'mssql+pymssql' }],
      },
      {
        ...usernameRequired,
        description:
          'Username to connect to MSSQL. This user should have privileges to read all the metadata in MsSQL.',
      },
      { ...passwordField, description: 'Password to connect to MSSQL.' },
      hostPort('Host and port of the MSSQL service.'),
      requiredText('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Initial database to connect to. Metadata reading is restricted to this database unless Ingest All Databases is enabled, in which case this database is used as the entry point to discover and scan all databases.',
      }),
      {
        key: 'driver',
        control: 'text',
        labelKey: 'connection.driver',
        title: 'Driver',
        description: 'ODBC driver version in case of pyodbc connection.',
        testId: 'service-driver',
        showWhen: { field: 'scheme', equals: 'mssql+pyodbc' },
      },
      {
        key: 'encrypt',
        control: 'toggle',
        labelKey: 'connection.encrypt',
        title: 'Encrypt Connection',
        description:
          'Request SSL/TLS encryption for the MSSQL connection. Honoured directly by mssql+pyodbc. mssql+pytds encrypts only when a CA certificate is supplied in SSL Configuration, and logs a warning otherwise. mssql+pymssql takes no TLS settings at all - encryption is decided by FreeTDS configuration.',
        testId: 'service-encrypt',
      },
      {
        key: 'trustServerCertificate',
        control: 'toggle',
        labelKey: 'connection.trustServerCertificate',
        title: 'Trust Server Certificate',
        description:
          'Trust the server certificate without validation. Set to false in production to validate server certificates against the certificate authority. On mssql+pytds the certificate chain is always validated against the supplied CA certificate and only the host name check is dropped.',
        testId: 'service-trust-cert',
      },
      // Mssql has sslConfig but no sslMode, so the leaves are always visible.
      ...sslConfigLeaves(false, 'SSL Configuration'),
      {
        ...ingestAllDatabases,
        description:
          'Ingest data from all databases in Mssql. You can use databaseFilterPattern on top of this.',
      },
      {
        key: 'includeSynonyms',
        control: 'toggle',
        labelKey: 'connection.includeSynonyms',
        title: 'Include Synonyms',
        description:
          'Discover SQL Server synonyms and record them as alternate names (aliases) on the table they resolve to. Also enables alias resolution when building lineage.',
        testId: 'service-include-synonyms',
      },
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['MariaDB'],
    // Pin mariaDBConnection.json property order: scheme, username, password,
    // hostPort, databaseName, databaseSchema, connectionOptions,
    // connectionArguments.
    fields: [
      schemeField(['mysql+pymysql']),
      {
        ...usernameRequired,
        description:
          'Username to connect to MariaDB. This user should have privileges to read all the metadata in MariaDB.',
      },
      { ...passwordField, description: 'Password to connect to MariaDB.' },
      hostPort('Host and port of the MariaDB service.'),
      databaseNameDefault,
      databaseSchema,
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  // Wave 0 lean-forms: the shared Redshift/Greenplum/Timescale group is split
  // — the three specs differ (R-T1.9/10/11). Each group carries only its own
  // spec's fields, in pin property order.
  {
    types: ['Redshift'],
    fields: [
      schemeField(['redshift+psycopg2']),
      {
        ...usernameRequired,
        description:
          'Username to connect to Redshift. This user should have privileges to read all the metadata in Redshift.',
      },
      authTypeSelectorField(
        [
          { value: 'basic', title: 'Basic Auth' },
          { value: 'iam', title: 'IAM Auth Configuration Source' },
        ],
        'Choose Auth Configuration Type.',
      ),
      basicAuthPasswordField,
      ...iamBranchFields,
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        title: 'Host and Port',
        description: 'Host and port of the Redshift service.',
      }),
      text('clusterIdentifier', 'connection.clusterIdentifier', {
        testId: 'service-cluster-identifier',
        title: 'Cluster Identifier',
        description:
          "Redshift cluster identifier. Leave empty for standard Redshift hostnames (*.redshift.amazonaws.com) - it is derived automatically. Set this ONLY when using IAM authentication through a PrivateLink/VPC endpoint (vpce-...) or a custom DNS name. Find it in AWS Console -> Amazon Redshift -> Clusters ('Cluster identifier' column).",
      }),
      text('workgroupName', 'connection.workgroupName', {
        testId: 'service-workgroup-name',
        title: 'Workgroup Name',
        description:
          'Redshift Serverless workgroup name. Leave empty for standard Redshift Serverless hostnames (*.redshift-serverless.amazonaws.com) - it is derived automatically. Set this ONLY when using IAM authentication through a PrivateLink/VPC endpoint (vpce-...) or a custom DNS name. Find it in AWS Console -> Amazon Redshift -> Redshift Serverless -> Workgroups.',
      }),
      requiredText('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Initial Redshift database to connect to. If you want to ingest all databases, set ingestAllDatabases to true.',
      }),
      {
        ...ingestAllDatabases,
        description:
          'Ingest data from all databases in Redshift. You can use databaseFilterPattern on top of this.',
      },
      sslModeField,
      ...sslConfigLeaves(true),
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['Greenplum'],
    fields: [
      schemeField(['postgresql+psycopg2']),
      {
        ...usernameRequired,
        description:
          'Username to connect to Greenplum. This user should have privileges to read all the metadata in Greenplum.',
      },
      authTypeSelectorField([
        { value: 'basic', title: 'Basic Auth' },
        { value: 'iam', title: 'IAM Auth Configuration Source' },
      ]),
      basicAuthPasswordField,
      ...iamBranchFields,
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        title: 'Host and Port',
        description: 'Host and port of the source service.',
      }),
      requiredText('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Initial database to connect to. Metadata reading is restricted to this database unless Ingest All Databases is enabled, in which case this database is used as the entry point to discover and scan all databases.',
      }),
      sslModeField,
      ...sslConfigLeaves(true),
      {
        ...ingestAllDatabases,
        description:
          'Ingest data from all databases in Greenplum. You can use databaseFilterPattern on top of this.',
      },
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['Timescale'],
    fields: [
      schemeField(['postgresql+psycopg2']),
      {
        ...usernameRequired,
        description:
          'Username to connect to TimescaleDB. This user should have privileges to read all the metadata in TimescaleDB.',
      },
      authTypeSelectorField([
        { value: 'basic', title: 'Basic Auth' },
        { value: 'iam', title: 'IAM Auth Configuration Source' },
        { value: 'azure', title: 'Azure Configuration Source' },
      ]),
      basicAuthPasswordField,
      ...iamBranchFields,
      ...azureBranchFields,
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        title: 'Host and Port',
        description: 'Host and port of the TimescaleDB service.',
      }),
      requiredText('database', 'connection.database', {
        testId: 'service-database',
        title: 'Database',
        description:
          'Initial database to connect to. Metadata reading is restricted to this database unless Ingest All Databases is enabled, in which case this database is used as the entry point to discover and scan all databases.',
      }),
      {
        ...ingestAllDatabases,
        description:
          'Ingest data from all databases in TimescaleDB. You can use databaseFilterPattern on top of this.',
      },
      sslModeField,
      ...sslConfigLeaves(true),
      text('classificationName', 'connection.classificationName', {
        testId: 'service-classification-name',
        title: 'Classification Name',
        description: 'Custom OpenMetadata Classification name for TimescaleDB policy tags.',
      }),
      text('queryStatementSource', 'connection.queryStatementSource', {
        testId: 'service-query-statement-source',
        title: 'Query Statement Source',
        description:
          'Fully qualified name of the view or table to use for query logs. If not provided, defaults to pg_stat_statements. Use this to configure a custom view (e.g., my_schema.custom_pg_stat_statements) when direct access to pg_stat_statements is restricted.',
      }),
      connectionOptionsField,
      connectionArgumentsField,
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
      ...sslConfigLeavesFor(
        [
          ['consumerConfigSSLCaCertificate', 'connection.consumerConfigSSLCaCertificate', 'service-consumer-config-ssl-ca-certificate'],
          ['consumerConfigSSLCertificate', 'connection.consumerConfigSSLCertificate', 'service-consumer-config-ssl-certificate'],
          ['consumerConfigSSLKey', 'connection.consumerConfigSSLKey', 'service-consumer-config-ssl-key'],
        ],
        false,
        'consumerConfigSSL',
        'Consumer Config SSL',
      ),
      ...sslConfigLeavesFor(
        [
          ['schemaRegistrySSLCaCertificate', 'connection.schemaRegistrySSLCaCertificate', 'service-schema-registry-ssl-ca-certificate'],
          ['schemaRegistrySSLCertificate', 'connection.schemaRegistrySSLCertificate', 'service-schema-registry-ssl-certificate'],
          ['schemaRegistrySSLKey', 'connection.schemaRegistrySSLKey', 'service-schema-registry-ssl-key'],
        ],
        false,
        'schemaRegistrySSL',
        'Schema Registry SSL',
      ),
      note('connection.confluentNote'),
    ],
  },
  {
    types: ['Redpanda'],
    // W2-5 lean-forms tier 2: field order follows redpandaConnection.json —
    // the suffix sits before securityProtocol here (unlike Kafka), and there
    // are no SSL groups. Descriptions are the Redpanda schema's own.
    fields: [
      {
        ...bootstrapServers,
        description:
          'Redpanda bootstrap servers. add them in comma separated values ex: host1:9092,host2:9092',
      },
      { ...schemaRegistry, description: 'Confluent Redpanda Schema Registry URL.' },
      saslUsernameField,
      saslPasswordField,
      schemaRegistryTopicSuffixNameField,
      securityProtocolField,
      saslMechanismField,
      basicAuthUserInfoField,
      { ...consumerConfigField, description: 'Confluent Redpanda Consumer Config' },
      { ...schemaRegistryConfigField, description: 'Confluent Redpanda Schema Registry Config.' },
      note('connection.redpandaNote'),
    ],
  },
  {
    types: ['Superset'],
    // Pin supersetConnection.json: hostPort, then the `connection` oneOf
    // (SupersetApiConnection branch: provider, username, password, verifySSL,
    // sslConfig). All branch leaves group under `connection`.
    fields: [
      hostPort('URL for the superset instance.'),
      {
        key: 'provider',
        control: 'select',
        labelKey: 'connection.provider',
        title: 'Provider',
        description:
          "Authentication provider for the Superset service. For basic user/password authentication, the default value `db` can be used. This parameter is used internally to connect to Superset's REST API.",
        group: 'connection',
        groupLabel: 'Superset Connection',
        groupSchema: { oneOf: [{ type: 'object' }] },
        testId: 'service-provider',
        required: true,
        options: [
          { value: 'db', labelKey: 'connection.providerDb' },
          { value: 'ldap', labelKey: 'connection.providerLdap' },
        ],
      },
      {
        ...usernameRequired,
        group: 'connection',
        description: 'Username for Superset.',
      },
      note('connection.supersetApiNote'),
      {
        ...passwordField,
        group: 'connection',
        description: 'Password for Superset.',
      },
      // W2-5 lean-forms tier 2 (supersetApiConnection.json): verifySSL +
      // sslConfig live nested in connection. Always visible, no showWhen
      // linkage; the leaves use the Superset triplet, never the top-level
      // keys (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
      {
        ...verifySSLField,
        group: 'connection',
        description: 'Client SSL verification. Make sure to configure the SSLConfig if enabled.',
      },
      ...sslConfigLeavesFor(
        [
          ['supersetSSLCaCertificate', 'connection.supersetSSLCaCertificate', 'service-superset-ssl-ca-certificate'],
          ['supersetSSLCertificate', 'connection.supersetSSLCertificate', 'service-superset-ssl-certificate'],
          ['supersetSSLKey', 'connection.supersetSSLKey', 'service-superset-ssl-key'],
        ],
        false,
        'connection',
        'Superset Connection',
      ),
    ],
  },
  {
    types: ['S3'],
    // Pin s3Connection.json: awsConfig leaves in awsCredentials.json order,
    // bucketNames, connectionOptions, connectionArguments, consoleEndpointURL.
    fields: [
      {
        key: 'awsIamEnabled',
        control: 'toggle',
        labelKey: 'connection.awsIamEnabled',
        title: 'Enable IAM Auth',
        description:
          'Enable AWS IAM authentication. When enabled, uses the default credential provider chain (environment variables, instance profile, etc.). Defaults to false for backward compatibility.',
        group: 'awsConfig',
        groupLabel: 'AWS Credentials Configuration',
        groupSchema: { type: 'object' },
        testId: 'service-aws-iam-enabled',
      },
      text('awsAccessKeyId', 'connection.awsAccessKeyId', {
        testId: 'service-aws-access-key',
        title: 'AWS Access Key ID',
        description: 'AWS Access key ID.',
        group: 'awsConfig',
      }),
      {
        key: 'awsSecretAccessKey',
        control: 'password',
        labelKey: 'connection.awsSecretAccessKey',
        title: 'AWS Secret Access Key',
        description: 'AWS Secret Access Key.',
        group: 'awsConfig',
        testId: 'service-aws-secret-key',
        hintKey: 'connection.secretHint',
      },
      requiredText('awsRegion', 'connection.awsRegion', {
        testId: 'service-aws-region',
        title: 'AWS Region',
        description: 'AWS Region',
        group: 'awsConfig',
      }),
      {
        key: 'awsSessionToken',
        control: 'password',
        labelKey: 'connection.awsSessionToken',
        title: 'AWS Session Token',
        description: 'AWS Session Token.',
        group: 'awsConfig',
        testId: 'service-aws-session-token',
      },
      text('awsEndPointURL', 'connection.awsEndPointURL', {
        testId: 'service-aws-endpoint',
        title: 'Endpoint URL',
        description: 'EndPoint URL for the AWS',
        group: 'awsConfig',
      }),
      text('awsProfileName', 'connection.awsProfileName', {
        testId: 'service-aws-profile',
        title: 'Profile Name',
        description: 'The name of a profile to use with the boto session.',
        group: 'awsConfig',
      }),
      text('assumeRoleArn', 'connection.assumeRoleArn', {
        testId: 'service-aws-role-arn',
        title: 'Role Arn for Assume Role',
        description:
          'The Amazon Resource Name (ARN) of the role to assume. Required Field in case of Assume Role',
        group: 'awsConfig',
      }),
      text('assumeRoleSessionName', 'connection.assumeRoleSessionName', {
        testId: 'service-aws-role-session',
        title: 'Role Session Name for Assume Role',
        description:
          'An identifier for the assumed role session. Use the role session name to uniquely identify a session when the same role is assumed by different principals or for different reasons. Required Field in case of Assume Role',
        group: 'awsConfig',
      }),
      text('assumeRoleSourceIdentity', 'connection.assumeRoleSourceIdentity', {
        testId: 'service-aws-role-source',
        title: 'Source Identity for Assume Role',
        description:
          'The Amazon Resource Name (ARN) of the role to assume. Optional Field in case of Assume Role',
        group: 'awsConfig',
      }),
      text('bucketNames', 'connection.bucketNames', {
        testId: 'service-bucket-names',
        title: 'Bucket Names',
        description: 'Bucket Names of the data source.',
        schemaType: 'array',
      }),
      // W2-5 lean-forms tier 2 (s3Connection.json): string maps, spec order
      // (after bucketNames, before consoleEndpointURL).
      connectionOptionsField,
      connectionArgumentsField,
      text('consoleEndpointURL', 'connection.consoleEndpointURL', {
        testId: 'service-console-endpoint',
        title: 'Console Endpoint URL',
        description: 'Console EndPoint URL for S3-compatible services',
      }),
      note('connection.s3Note'),
    ],
  },
  {
    types: ['Prefect'],
    // Pin prefectConnection.json: hostPort, authType, numberOfStatus,
    // verifySSL, sslConfig.
    fields: [
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        title: 'Host and Port',
        description:
          "Prefect API base URL. Use https://api.prefect.cloud for Prefect Cloud, or your self-hosted server's URL, e.g. http://localhost:4200.",
      }),
      {
        key: 'prefectAuthMode',
        control: 'authSelect',
        labelKey: 'connection.prefectAuthMode',
        title: 'Authentication',
        description: 'Choose between Prefect Cloud or a self-hosted Prefect Server.',
        group: 'authType',
        groupSchema: { oneOf: [{ type: 'object' }] },
        defaultValue: 'server',
        authNote: true,
        testId: 'service-prefect-auth-mode',
        options: [
          { value: 'cloud', labelKey: 'connection.prefectCloud', title: 'Prefect Cloud' },
          { value: 'server', labelKey: 'connection.prefectServer', title: 'Prefect Server' },
        ],
      },
      requiredText('prefectAccountId', 'connection.prefectAccountId', {
        testId: 'service-prefect-account-id',
        title: 'Account ID',
        description: 'Prefect Cloud Account ID. Found in the URL: app.prefect.cloud/account/{accountId}.',
        group: 'authType',
        branch: 'cloud',
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      }),
      requiredText('prefectWorkspaceId', 'connection.prefectWorkspaceId', {
        testId: 'service-prefect-workspace-id',
        title: 'Workspace ID',
        description: 'Prefect Cloud Workspace ID. Found in the URL after /workspaces/{workspaceId}.',
        group: 'authType',
        branch: 'cloud',
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        title: 'Prefect API Key',
        description: 'Prefect Cloud API key for authentication.',
        group: 'authType',
        branch: 'cloud',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
        showWhen: { field: 'prefectAuthMode', equals: 'cloud' },
      },
      {
        key: 'prefectAuthString',
        control: 'password',
        labelKey: 'connection.prefectAuthString',
        title: 'Basic Auth String',
        description:
          "Self-hosted Prefect Server Basic Auth credential (PREFECT_SERVER_API_AUTH_STRING), format 'user:password'. Leave empty if the server has no auth enabled.",
        group: 'authType',
        branch: 'server',
        testId: 'service-prefect-auth-string',
        showWhen: { field: 'prefectAuthMode', notEquals: 'cloud' },
      },
      {
        key: 'numberOfStatus',
        control: 'number',
        labelKey: 'connection.numberOfStatus',
        title: 'Number of Status',
        description: 'Number of past flow run statuses to ingest per flow.',
        testId: 'service-number-of-status',
        min: 1,
        max: 100,
      },
      // W2-5 lean-forms tier 2 (prefectConnection.json): verifySSL + sslConfig
      // live top level. Always visible, no showWhen linkage
      // (ADR:2026-11-08-leanforms-tier2-superset-verify-ssl-always-visible).
      // Prefect has a single sslConfig, so it uses the single-group keys.
      {
        ...verifySSLField,
        description: 'Client SSL verification. Make sure to configure the SSLConfig if enabled.',
      },
      ...sslConfigLeaves(false, 'SSL Configuration'),
      note('connection.prefectNote'),
    ],
  },
  {
    types: ['Dagster'],
    // Pin dagsterConnection.json: host, token, timeout,
    // stripAssetKeyPrefixLength. The form key stays `hostPort` (the builder
    // reads it); the group carries the pin property name.
    fields: [
      requiredText('hostPort', 'connection.host', {
        testId: 'service-host-port',
        group: 'host',
        title: 'Host',
        description: 'URL to the Dagster instance',
      }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.token',
        title: 'Token',
        description: 'To Connect to Dagster Cloud',
        group: 'token',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
      },
      {
        key: 'dagsterTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        title: 'Time Out',
        description: 'Connection Time Limit Between OM and Dagster Graphql API in second',
        group: 'timeout',
        testId: 'service-dagster-timeout',
        min: 1,
      },
      {
        key: 'stripAssetKeyPrefixLength',
        control: 'number',
        labelKey: 'connection.stripAssetKeyPrefixLength',
        title: 'Strip Asset Key Prefix Length',
        description:
          "Number of leading segments to remove from asset key paths before resolving to tables. For example, if your asset keys follow the pattern 'project/environment/schema/table' but you only need 'schema/table', set this to 2.",
        testId: 'service-strip-prefix',
        min: 0,
      },
      note('connection.dagsterNote'),
    ],
  },
  {
    types: ['Metabase'],
    // Pin metabaseConnection.json: username, password, apiKey, hostPort.
    fields: [
      {
        ...usernameOptional,
        description: 'Username to connect to Metabase. Required for basic authentication.',
      },
      // M-Next B6: official metabaseConnection.json lists password and apiKey
      // as two parallel auth modes; the form only offered apiKey.
      { ...passwordField, description: 'Password to connect to Metabase. Required for basic authentication.' },
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        title: 'API Token',
        description:
          'API token to connect to Metabase. Use this instead of username/password for token-based authentication.',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
      },
      hostPort('Host and Port of the Metabase instance.'),
    ],
  },
  {
    types: ['Databricks'],
    // Pin databricksConnection.json: scheme, hostPort, authType, httpPath,
    // catalog, databaseSchema, connectionTimeout, queryHistoryTable,
    // connectionOptions, connectionArguments, policyAgentConfig.
    fields: [
      schemeField(['databricks']),
      hostPort('Host and port of the Databricks service.'),
      ...databricksAuthFields,
      requiredText('httpPath', 'connection.httpPath', {
        testId: 'service-http-path',
        title: 'Http Path',
        description: 'Databricks compute resources URL.',
      }),
      text('catalog', 'connection.catalog', {
        testId: 'service-catalog',
        title: 'Catalog',
        description:
          'Catalog of the data source(Example: hive_metastore). This is optional parameter, if you would like to restrict the metadata reading to a single catalog. When left blank, OpenMetadata Ingestion attempts to scan all the catalog.',
      }),
      databaseSchema,
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        title: 'Connection Timeout',
        description:
          'The maximum amount of time (in seconds) to wait for a successful connection to the data source. If the connection attempt takes longer than this timeout period, an error will be returned.',
        testId: 'service-connection-timeout',
      },
      text('queryHistoryTable', 'connection.queryHistoryTable', {
        testId: 'service-query-history',
        title: 'Query History Table',
        description: 'Table name to fetch the query history.',
      }),
      connectionOptionsField,
      connectionArgumentsField,
      ...policyAgentFields,
    ],
  },
  {
    types: ['UnityCatalog'],
    // Pin unityCatalogConnection.json: scheme, hostPort, authType, httpPath,
    // catalog, databaseSchema, includeMetricViews, connectionTimeout,
    // connectionOptions, connectionArguments, policyAgentConfig.
    // M-Next B3: queryHistoryTable removed — official unityCatalogConnection.json
    // (23 props) has no such field; it was copied in from the Databricks group.
    // Databricks keeps its own (official databricksConnection.json has it).
    fields: [
      schemeField(['databricks']),
      hostPort('Host and port of the Databricks service.'),
      ...databricksAuthFields,
      text('httpPath', 'connection.httpPath', {
        testId: 'service-http-path',
        title: 'Http Path',
        description: 'Databricks compute resources URL.',
      }),
      text('catalog', 'connection.catalog', {
        testId: 'service-catalog',
        title: 'Catalog',
        description:
          'Catalog of the data source(Example: hive_metastore). This is optional parameter, if you would like to restrict the metadata reading to a single catalog. When left blank, OpenMetadata Ingestion attempts to scan all the catalog.',
      }),
      databaseSchema,
      {
        key: 'includeMetricViews',
        control: 'toggle',
        labelKey: 'connection.includeMetricViews',
        title: 'Include Metric Views',
        description:
          'Ingest the measures of a Unity Catalog metric view as Metric entities, and the lineage from the relations it reads.',
        testId: 'service-include-metric-views',
      },
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        title: 'Connection Timeout',
        description:
          'The maximum amount of time (in seconds) to wait for a successful connection to the data source. If the connection attempt takes longer than this timeout period, an error will be returned.',
        testId: 'service-connection-timeout',
      },
      connectionOptionsField,
      connectionArgumentsField,
      ...policyAgentFields,
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
  // must not offer them a silent undefined connection
  // (connectionFieldsForType returns no fields for them).
  {
    types: ['Rest'],
    // Pin restConnection.json: openAPISchemaConnection, token, docURL,
    // verifySSL, sslConfig.
    fields: [
      requiredText('openApiSchemaUrl', 'connection.openApiSchemaUrl', {
        testId: 'service-openapi-schema-url',
        group: 'openAPISchemaConnection',
        title: 'OpenAPI Schema Connection',
        description: 'OpenAPI Schema source config. Either a URL or a file path must be provided.',
      }),
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.token',
        title: 'Token',
        description: 'Generated Token to connect to OpenAPI Schema.',
        group: 'token',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
      },
      text('docURL', 'connection.docURL', {
        testId: 'service-doc-url',
        title: 'docURL',
        description: 'Documentation URL for the schema.',
      }),
      {
        ...verifySSLField,
        description: 'Client SSL verification. Make sure to configure the SSLConfig if enabled.',
      },
      ...sslConfigLeavesFor(
        [
          ['restSSLCaCertificate', 'connection.restSSLCaCertificate', 'service-rest-ssl-ca-certificate'],
          ['restSSLCertificate', 'connection.restSSLCertificate', 'service-rest-ssl-certificate'],
          ['restSSLKey', 'connection.restSSLKey', 'service-rest-ssl-key'],
        ],
        false,
      ),
    ],
  },
  {
    types: ['Mlflow'],
    fields: [
      requiredText('trackingUri', 'connection.trackingUri', {
        testId: 'service-tracking-uri',
        title: 'Tracking URI',
        description: 'Mlflow Experiment tracking URI. E.g., http://localhost:5000',
      }),
      // W3-3A: registryUri is a password-format field in the spec, but the
      // whole URI refills in plaintext (condition 5) — it is the registry
      // address, not a pure secret.
      {
        key: 'registryUri',
        control: 'password',
        labelKey: 'connection.registryUri',
        title: 'Registry URI',
        description:
          'Mlflow Model registry backend. E.g., mysql+pymysql://mlflow:password@localhost:3307/experiments. The entire URI is protected as a secret, including URIs without credentials. Secret references must resolve to the entire URI.',
        testId: 'service-registry-uri',
        required: true,
      },
    ],
  },
  {
    types: ['OpenMetadata'],
    fields: [
      // W3-3A: A group (openMetadataConnection.json), spec order. The B
      // group (16 switches) is not modelled (R-W3-3A-2). Several properties
      // carry no pin title; those keep the i18n label and only the pin
      // description is attached.
      text('clusterName', 'connection.clusterName', {
        testId: 'service-cluster-name',
        description: 'Cluster name to differentiate OpenMetadata Server instance',
      }),
      requiredText('hostPort', 'connection.hostPort', {
        testId: 'service-host-port',
        description: 'OpenMetadata Server Config. Must include API end point ex: http://localhost:8585/api',
      }),
      {
        key: 'authProvider',
        control: 'select',
        labelKey: 'connection.authProvider',
        description: 'OpenMetadata Server Authentication Provider.',
        testId: 'service-auth-provider',
        options: [
          { value: 'basic' },
          { value: 'azure' },
          { value: 'google' },
          { value: 'okta' },
          { value: 'auth0' },
          { value: 'aws-cognito' },
          { value: 'custom-oidc' },
          { value: 'ldap' },
          { value: 'saml' },
          { value: 'openmetadata' },
        ],
      },
      {
        ...verifySSLField,
        description: 'Flag to verify SSL Certificate for OpenMetadata Server.',
      },
      ...sslConfigLeavesFor(
        [
          ['openMetadataSSLCaCertificate', 'connection.openMetadataSSLCaCertificate', 'service-om-ssl-ca-certificate'],
          ['openMetadataSSLCertificate', 'connection.openMetadataSSLCertificate', 'service-om-ssl-certificate'],
          ['openMetadataSSLKey', 'connection.openMetadataSSLKey', 'service-om-ssl-key'],
        ],
        false,
      ),
      {
        key: 'jwtToken',
        control: 'password',
        labelKey: 'connection.jwtToken',
        group: 'securityConfig',
        groupSchema: { type: 'object' },
        testId: 'service-jwt-token',
        hintKey: 'connection.secretHint',
      },
      {
        key: 'secretsManagerProvider',
        control: 'select',
        labelKey: 'connection.secretsManagerProvider',
        title: 'Secrets Manager Provider',
        description: 'Secrets Manager Provider for OpenMetadata Server.',
        testId: 'service-secrets-manager-provider',
        options: [
          { value: 'db' },
          { value: 'managed-aws' },
          { value: 'aws' },
          { value: 'managed-aws-ssm' },
          { value: 'aws-ssm' },
          { value: 'managed-azure-kv' },
          { value: 'azure-kv' },
          { value: 'in-memory' },
          { value: 'gcp' },
          { value: 'kubernetes' },
        ],
      },
      {
        key: 'secretsManagerLoader',
        control: 'select',
        labelKey: 'connection.secretsManagerLoader',
        title: 'Secrets Manager Client Loader',
        description: 'Secrets Manager Loader for the Pipeline Service Client.',
        testId: 'service-secrets-manager-loader',
        options: [{ value: 'noop' }, { value: 'airflow' }, { value: 'env' }],
      },
      text('apiVersion', 'connection.apiVersion', {
        testId: 'service-api-version',
        description: 'OpenMetadata server API version to use.',
      }),
      {
        key: 'enableVersionValidation',
        control: 'toggle',
        labelKey: 'connection.enableVersionValidation',
        description: 'Validate Openmetadata Server & Client Version.',
        testId: 'service-enable-version-validation',
      },
      {
        key: 'omStoreServiceConnection',
        control: 'toggle',
        labelKey: 'connection.omStoreServiceConnection',
        description:
          'If set to true, when creating a service during the ingestion we will store its Service Connection. Otherwise, the ingestion will create a bare service without connection details.',
        group: 'storeServiceConnection',
        testId: 'service-om-store-service-connection',
      },
      {
        key: 'extraHeaders',
        control: 'textarea',
        labelKey: 'connection.extraHeaders',
        title: 'Extra Headers',
        description: 'Additional headers to be sent to the API endpoint.',
        schemaType: 'object',
        testId: 'service-extra-headers',
      },
    ],
  },
  {
    types: ['GoogleDrive'],
    // Pin googleDriveConnection.json: credentials (gcpConfig oneOf +
    // impersonation), delegatedEmail, driveId, includeTeamDrives,
    // includeGoogleSheets, connectionOptions, connectionArguments.
    fields: [
      // W3-3A: gcpConfig oneOf branches (gcpCredentials.json). A branch input
      // is required only when its branch is selected — hidden fields are
      // not rendered, so their required rules do not apply.
      gcpConfigTypeField,
      {
        key: 'credentialsJson',
        control: 'textarea',
        labelKey: 'connection.credentialsJson',
        group: 'credentials',
        branch: 'gcpValues',
        testId: 'service-credentials-json',
        required: true,
        showWhen: GCP_VALUES_GATE,
      },
      text('gcpCredentialsPath', 'connection.gcpCredentialsPath', {
        testId: 'service-gcp-credentials-path',
        required: true,
        title: 'Path',
        description: 'Path of the file containing the GCP credentials info',
        group: 'credentials',
        branch: 'gcpCredentialsPath',
        showWhen: GCP_PATH_GATE,
      }),
      {
        key: 'gcpExternalAccountJson',
        control: 'textarea',
        labelKey: 'connection.gcpExternalAccountJson',
        group: 'credentials',
        branch: 'gcpExternalAccount',
        testId: 'service-gcp-external-account-json',
        required: true,
        showWhen: GCP_EXTERNAL_GATE,
      },
      text('impersonateServiceAccount', 'connection.impersonateServiceAccount', {
        testId: 'service-impersonate-service-account',
        title: 'Target Service Account Email',
        description: 'The impersonated service account email',
        group: 'credentials',
      }),
      {
        key: 'impersonateLifetime',
        control: 'number',
        labelKey: 'connection.impersonateLifetime',
        title: 'Lifetime',
        description: 'Number of seconds the delegated credential should be valid',
        group: 'credentials',
        testId: 'service-impersonate-lifetime',
      },
      text('delegatedEmail', 'connection.delegatedEmail', {
        testId: 'service-delegated-email',
        title: 'Delegated Email',
        description: 'Email to impersonate using domain-wide delegation',
      }),
      text('driveId', 'connection.driveId', {
        testId: 'service-drive-id',
        title: 'Drive ID',
        description: 'Specific shared drive ID to connect to',
      }),
      {
        key: 'includeTeamDrives',
        control: 'toggle',
        labelKey: 'connection.includeTeamDrives',
        title: 'Include Team Drives',
        description: 'Include shared/team drives in metadata extraction',
        testId: 'service-include-team-drives',
      },
      {
        key: 'includeGoogleSheets',
        control: 'toggle',
        labelKey: 'connection.includeGoogleSheets',
        title: 'Include Google Sheets',
        description: 'Extract metadata only for Google Sheets files',
        testId: 'service-include-google-sheets',
      },
      connectionOptionsField,
      connectionArgumentsField,
    ],
  },
  {
    types: ['ElasticSearch'],
    // Pin elasticSearchConnection.json: hostPort, authType, sslConfig,
    // connectionTimeoutSecs, connectionArguments.
    fields: [
      hostPort('Host and port of the ElasticSearch service.'),
      elasticSearchAuthModeField,
      {
        ...usernameOptional,
        group: 'authType',
        branch: 'basicAuth',
        showWhen: ES_BASIC_AUTH_GATE,
      },
      {
        ...passwordField,
        group: 'authType',
        branch: 'basicAuth',
        description: 'Elastic Search Password for Login',
        showWhen: ES_BASIC_AUTH_GATE,
      },
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        title: 'API Key',
        description: 'Elastic Search API Key for API Authentication',
        group: 'authType',
        branch: 'apiAuth',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
        showWhen: ES_API_AUTH_GATE,
      },
      text('apiKeyId', 'connection.apiKeyId', {
        testId: 'service-api-key-id',
        group: 'authType',
        branch: 'apiAuth',
        showWhen: ES_API_AUTH_GATE,
      }),
      sslCertModeField,
      text('sslCaCertPath', 'connection.sslCaCertPath', {
        testId: 'service-ssl-ca-cert-path',
        title: 'CA Certificate Path',
        description: 'CA Certificate Path',
        group: 'sslConfig',
        branch: 'paths',
        showWhen: ES_SSL_PATHS_GATE,
      }),
      text('sslClientCertPath', 'connection.sslClientCertPath', {
        testId: 'service-ssl-client-cert-path',
        title: 'Client Certificate Path',
        description: 'Client Certificate Path',
        group: 'sslConfig',
        branch: 'paths',
        showWhen: ES_SSL_PATHS_GATE,
      }),
      text('sslPrivateKeyPath', 'connection.sslPrivateKeyPath', {
        testId: 'service-ssl-private-key-path',
        title: 'Private Key Path',
        description: 'Private Key Path',
        group: 'sslConfig',
        branch: 'paths',
        showWhen: ES_SSL_PATHS_GATE,
      }),
      {
        key: 'sslCaCertValue',
        control: 'fileOrInput',
        labelKey: 'connection.sslCaCertValue',
        title: 'CA Certificate Value',
        description: 'CA Certificate Value',
        group: 'sslConfig',
        branch: 'values',
        testId: 'service-ssl-ca-cert-value',
        acceptedFileTypes: ['.pem', '.crt', '.cer'],
        hintKey: 'connection.secretHint',
        showWhen: ES_SSL_VALUES_GATE,
      },
      {
        key: 'sslClientCertValue',
        control: 'fileOrInput',
        labelKey: 'connection.sslClientCertValue',
        title: 'Client Certificate Value',
        description: 'Client Certificate Value',
        group: 'sslConfig',
        branch: 'values',
        testId: 'service-ssl-client-cert-value',
        acceptedFileTypes: ['.pem', '.crt', '.cer'],
        hintKey: 'connection.secretHint',
        showWhen: ES_SSL_VALUES_GATE,
      },
      {
        key: 'sslPrivateKeyValue',
        control: 'fileOrInput',
        labelKey: 'connection.sslPrivateKeyValue',
        title: 'Private Key Value',
        description: 'Private Key Value',
        group: 'sslConfig',
        branch: 'values',
        testId: 'service-ssl-private-key-value',
        acceptedFileTypes: ['.pem', '.key'],
        hintKey: 'connection.secretHint',
        showWhen: ES_SSL_VALUES_GATE,
      },
      text('sslStagingDir', 'connection.sslStagingDir', {
        testId: 'service-ssl-staging-dir',
        title: 'Staging Directory Path',
        description: 'Staging Directory Path',
        group: 'sslConfig',
        branch: 'values',
        showWhen: ES_SSL_VALUES_GATE,
      }),
      {
        key: 'connectionTimeoutSecs',
        control: 'number',
        labelKey: 'connection.connectionTimeoutSecs',
        title: 'Connection Timeout in Seconds',
        description: 'Connection Timeout in Seconds',
        testId: 'service-connection-timeout-secs',
      },
      connectionArgumentsField,
    ],
  },
  {
    types: ['OpenAI'],
    // Pin openAIConnection.json: apiKey, organization, baseURL, timeout,
    // maxRetries.
    fields: [
      {
        key: 'apiKey',
        control: 'password',
        labelKey: 'connection.apiKey',
        title: 'API Key',
        description: 'OpenAI API Key',
        testId: 'service-api-key',
        hintKey: 'connection.secretHint',
        required: true,
      },
      text('organization', 'connection.organization', {
        testId: 'service-organization',
        title: 'Organization ID',
        description: 'Optional OpenAI Organization ID',
      }),
      text('baseUrl', 'connection.baseUrl', {
        testId: 'service-base-url',
        group: 'baseURL',
        title: 'Base URL',
        description: 'Optional custom base URL for OpenAI API (for compatible services)',
      }),
      {
        key: 'openAITimeout',
        control: 'number',
        labelKey: 'connection.openAITimeout',
        title: 'Timeout',
        description: 'Request timeout in seconds',
        group: 'timeout',
        testId: 'service-openai-timeout',
      },
      {
        key: 'openAIMaxRetries',
        control: 'number',
        labelKey: 'connection.openAIMaxRetries',
        title: 'Max Retries',
        description: 'Maximum number of retries for failed requests',
        group: 'maxRetries',
        testId: 'service-openai-max-retries',
      },
    ],
  },
  {
    types: ['Mcp'],
    fields: [
      // W3-3A: discoveryMethod + configFilePaths + servers + registryUrl +
      // timeouts + fetch flags (mcpConnection.json), spec order. No showWhen
      // linkage: the spec defines none — all three inputs stay visible. No
      // fields for the deprecated stdio leaves (command/args/env).
      {
        key: 'discoveryMethod',
        control: 'select',
        labelKey: 'connection.discoveryMethod',
        title: 'Discovery Method',
        description: 'How to discover MCP servers',
        testId: 'service-discovery-method',
        options: [{ value: 'ConfigFile' }, { value: 'DirectConnection' }, { value: 'Registry' }],
      },
      {
        key: 'configFilePaths',
        control: 'textarea',
        labelKey: 'connection.configFilePaths',
        title: 'Config File Paths',
        description:
          'Paths to MCP configuration files to scan for server definitions. Supports Claude Desktop config, VS Code settings, etc.',
        schemaType: 'array',
        testId: 'service-config-file-paths',
      },
      {
        key: 'servers',
        control: 'textarea',
        labelKey: 'connection.servers',
        title: 'Direct Server Connections',
        description:
          'List of MCP servers to connect to directly (when discoveryMethod is DirectConnection)',
        schemaType: 'array',
        testId: 'service-servers',
      },
      text('registryUrl', 'connection.registryUrl', {
        testId: 'service-registry-url',
        title: 'Registry URL',
        description: 'URL of MCP registry to query for server discovery (when discoveryMethod is Registry)',
      }),
      {
        key: 'connectionTimeout',
        control: 'number',
        labelKey: 'connection.timeout',
        title: 'Connection Timeout',
        description: 'Timeout in seconds for connecting to MCP servers',
        testId: 'service-connection-timeout',
      },
      {
        key: 'initializationTimeout',
        control: 'number',
        labelKey: 'connection.initializationTimeout',
        title: 'Initialization Timeout',
        description: 'Timeout in seconds for MCP server initialization handshake',
        testId: 'service-initialization-timeout',
      },
      {
        key: 'fetchTools',
        control: 'toggle',
        labelKey: 'connection.fetchTools',
        title: 'Fetch Tools',
        description: 'Whether to fetch and catalog tools from MCP servers',
        testId: 'service-fetch-tools',
      },
      {
        key: 'fetchResources',
        control: 'toggle',
        labelKey: 'connection.fetchResources',
        title: 'Fetch Resources',
        description: 'Whether to fetch and catalog resources from MCP servers',
        testId: 'service-fetch-resources',
      },
      {
        key: 'fetchPrompts',
        control: 'toggle',
        labelKey: 'connection.fetchPrompts',
        title: 'Fetch Prompts',
        description: 'Whether to fetch and catalog prompts from MCP servers',
        testId: 'service-fetch-prompts',
      },
    ],
  },
  {
    types: ['Ranger'],
    // Pin rangerConnection.json: hostPort, authType (single branch
    // "Ranger Basic Auth" — no selector, fields render directly).
    fields: [
      hostPort('Apache Ranger Admin URL.'),
      {
        ...usernameRequired,
        group: 'authType',
        description: 'Ranger user to authenticate to the API.',
      },
      {
        ...passwordField,
        group: 'authType',
        description: 'Ranger password to authenticate to the API.',
      },
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
  const passes = (condition: ConnectionFieldShowWhen): boolean => {
    const raw = form[condition.field];
    const effective = (raw === undefined || raw === '' ? condition.defaultValue : raw) as
      | string
      | undefined;
    if (condition.equals !== undefined) {
      return effective === condition.equals;
    }
    if (condition.notEquals !== undefined) {
      return effective !== condition.notEquals;
    }
    return true;
  };
  if (field.showWhen && !passes(field.showWhen)) {
    return false;
  }
  return (field.showWhenAll ?? []).every(passes);
}

/**
 * Live-issues S-09/S-10: section the lean-forms table with pin's
 * getPropertySections rules. Fields group under their top-level config
 * property (`group`, defaulting to the form key); one GroupableField per
 * group, in first-appearance order, feeds INFRA's groupConnectionSections.
 * Notes render after all sections (pin has no notes); hiddenUnsectioned
 * passes through for callers that keep hidden scope fields mounted.
 */
export function connectionFieldGroupName(field: ConnectionFieldDef): string {
  return field.group ?? (field.key as string);
}

/** Control-derived schema fragment: grouping reads type/format/combiner only. */
export function connectionFieldSchema(field: ConnectionFieldDef): GroupableSchema {
  if (field.groupSchema) {
    return field.groupSchema;
  }
  const schema: GroupableSchema = {};
  if (field.schemaType) {
    schema.type = field.schemaType;
  } else if (field.control === 'toggle') {
    schema.type = 'boolean';
  } else if (field.control === 'map') {
    schema.type = 'object';
  } else if (field.control === 'number') {
    schema.type = 'number';
  } else if (field.control === 'authSelect') {
    schema.oneOf = [{}];
  } else {
    schema.type = 'string';
  }
  if (field.schemaFormat) {
    schema.format = field.schemaFormat;
  } else if (field.control === 'password' || field.control === 'fileOrInput') {
    schema.format = 'password';
  }
  return schema;
}

export interface ConnectionFormGroup {
  name: string;
  label?: string;
  wide: boolean;
  fields: ConnectionFieldDef[];
}

export interface ConnectionFormSection {
  key: string;
  titleKey: string;
  descriptionKey: string;
  collapsible: boolean;
  defaultOpen: boolean;
  index?: number;
  layout: 'grid' | 'stack';
  badge: FormSection['badge'];
  focusName?: string;
  groups: ConnectionFormGroup[];
}

export interface BuildConnectionSectionsResult {
  sections: ConnectionFormSection[];
  notes: ConnectionFieldDef[];
  hiddenUnsectioned: string[];
}

function isFilledValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export function buildConnectionSections(
  serviceType: string,
  form: Record<string, unknown>,
): BuildConnectionSectionsResult {
  const defs = connectionFieldsForType(serviceType);
  const notes = defs.filter((field) => field.control === 'note');
  const grouped = new Map<string, ConnectionFieldDef[]>();
  for (const field of defs) {
    if (field.control === 'note' || !field.key) {
      continue;
    }
    const name = connectionFieldGroupName(field);
    const list = grouped.get(name) ?? [];
    list.push(field);
    grouped.set(name, list);
  }
  const groupFields: GroupableField[] = [...grouped.entries()].map(([name, fields]) => ({
    name,
    schema: fields[0].groupSchema ?? connectionFieldSchema(fields[0]),
  }));
  const requiredKeys = [...new Set(
    defs
      .filter((field) => field.required && field.key)
      .map((field) => connectionFieldGroupName(field)),
  )];
  // Badge counting reads group names; alias each group to a filled marker
  // when any of its fields holds a value (form keys differ from group names
  // for nested properties: host, token, timeout, awsConfig, ...).
  const formData: Record<string, unknown> = { ...form };
  for (const [name, fields] of grouped) {
    const filled = fields.some((field) => {
      const value = field.key ? form[field.key as string] : undefined;
      return isFilledValue(value ?? field.defaultValue);
    });
    formData[name] = filled ? 'filled' : undefined;
  }
  const { sections, hiddenUnsectioned } = groupConnectionSections(
    groupFields,
    requiredKeys,
    formData,
  );
  return {
    sections: sections.map((section) => ({
      key: section.key,
      titleKey: section.titleKey,
      descriptionKey: section.descriptionKey,
      collapsible: section.collapsible,
      defaultOpen: section.defaultOpen,
      index: section.index,
      layout: section.layout,
      badge: section.badge,
      focusName: section.focusName,
      groups: section.fields.map((name) => {
        const fields = grouped.get(name) ?? [];
        return {
          name,
          label: fields[0]?.groupLabel,
          wide: section.wideFields.includes(name),
          fields,
        };
      }),
    })),
    notes,
    hiddenUnsectioned,
  };
}

/**
 * Visible required fields left blank, branch-aware (hidden branch fields do
 * not count). Approximates pin's RJSF validateForm count for the
 * test-connection card; the card's validator uses this, not the section
 * badges (which count selector presence for auth groups).
 */
export function missingRequiredConnectionFields(
  serviceType: string,
  form: ServiceFormValues,
): number {
  const record = form as unknown as Record<string, unknown>;
  return connectionFieldsForType(serviceType).filter((field) => {
    if (!field.required || !field.key || !isConnectionFieldVisible(field, record)) {
      return false;
    }
    const value = record[field.key as string] ?? field.defaultValue;
    return !isFilledValue(value);
  }).length;
}

/** Map-editor adapter: form values stay JSON strings (the builder parses). */
export function parseMapFieldValue(value: string | undefined): Record<string, string> {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export function stringifyMapFieldValue(value: Record<string, string> | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return '';
  }
  return JSON.stringify(value);
}

/**
 * Pin schema `default.excludes` for filter-pattern properties, by service
 * type and field name — for the types in the fork's declared filter-field
 * set (`serviceFilterFields.ts`) only. Pin reads these defaults from the
 * connection schema at runtime, so it covers every declaring schema;
 * this literal map must gain an entry when a type joins the declared
 * set, or that type's cards lose their system excludes. Every other
 * (type, field) pair defaults to []. The Snowflake sample-database rule
 * is applied on top by INFRA's addSnowflakeSystemExcludes.
 */
export const FILTER_PATTERN_DEFAULT_EXCLUDES: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  Postgres: {
    schemaFilterPattern: ['^information_schema$'],
    databaseFilterPattern: ['^template1$', '^template0$'],
  },
  Mysql: {
    schemaFilterPattern: ['^information_schema$', '^performance_schema$'],
  },
  Snowflake: {
    schemaFilterPattern: ['^information_schema$'],
    databaseFilterPattern: ['^snowflake$'],
  },
  Doris: {
    schemaFilterPattern: ['^information_schema$', '^performance_schema$', '^__internal_schema$'],
  },
  Mssql: {
    schemaFilterPattern: ['^db_.*', '^guest$', '^information_schema$', '^sys$'],
    databaseFilterPattern: ['^msdb$', '^model$', '^tempdb$'],
    storedProcedureFilterPattern: ['^sp_', '^xp_', '^ms_'],
  },
  MariaDB: {
    schemaFilterPattern: ['^information_schema$', '^performance_schema$'],
  },
  Redshift: {
    schemaFilterPattern: ['^information_schema$'],
    tableFilterPattern: ['^(?:.*\\.)?mv_tbl__.*__\\d+$'],
    databaseFilterPattern: ['^template1$'],
  },
  Greenplum: {
    schemaFilterPattern: ['^information_schema$', '^gp_toolkit$'],
    databaseFilterPattern: ['^template1$', '^template0$'],
  },
  Timescale: {
    schemaFilterPattern: ['^information_schema$', '^_timescaledb_.*$'],
    databaseFilterPattern: ['^template1$', '^template0$'],
  },
  Databricks: {
    schemaFilterPattern: ['^information_schema$'],
    databaseFilterPattern: ['^system$'],
  },
  UnityCatalog: {
    schemaFilterPattern: ['^information_schema$'],
    databaseFilterPattern: ['^system$'],
  },
  Kafka: {
    topicFilterPattern: ['^__.*', '^_schemas$', '^_confluent.*'],
  },
  Redpanda: {
    topicFilterPattern: ['^__.*', '^_schemas$', '^_confluent.*'],
  },
  S3: {
    containerFilterPattern: ['_SUCCESS'],
  },
};

export function filterPatternDefaultExcludes(
  serviceType: string,
  fieldName: string,
): readonly string[] {
  return FILTER_PATTERN_DEFAULT_EXCLUDES[serviceType]?.[fieldName] ?? [];
}

/** Port of pin getConnectionDisplayHost (FiltersConfigForm.utils). */
export function connectionDisplayHost(
  config: ServiceConnectionConfig,
  serviceType: string,
): string {
  const record = config as unknown as Record<string, unknown>;
  const hostKeys = ['hostPort', 'host', 'server', 'sourceUrl', 'url', 'hostName', 'endpointURL'];
  let host: string | undefined;
  for (const key of hostKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      host = value.trim();
      break;
    }
  }
  if (serviceType.toLowerCase() === 'snowflake' && typeof record['account'] === 'string') {
    const account = (record['account'] as string).trim();
    if (account) {
      return snowflakeAccountDisplayHost(account);
    }
  }
  if (host) {
    return host;
  }
  if (typeof record['account'] === 'string' && (record['account'] as string).trim()) {
    return (record['account'] as string).trim();
  }
  return serviceType;
}

function snowflakeAccountDisplayHost(account: string): string {
  const snowflakeHost = 'snowflakecomputing.com';
  let hostname = account;
  try {
    const url = new URL(/^https?:\/\//i.test(account) ? account : `https://${account}`);
    hostname = url.hostname;
  } catch {
    hostname = account.split(':')[0].split('/')[0];
  }
  if (hostname === snowflakeHost || hostname.endsWith(`.${snowflakeHost}`)) {
    return account;
  }
  return `${account}.${snowflakeHost}`;
}

// --- Auth branch merge / hydrate / clear (live-issues S-12) ---

type BranchKeySet = readonly (keyof ServiceFormValues)[];

const AUTH_BRANCH_KEY_SETS: Readonly<Record<string, BranchKeySet>> = {
  basic: ['password'],
  iam: [
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
  ],
  azure: [
    'authAzureClientId',
    'authAzureClientSecret',
    'authAzureTenantId',
    'authAzureAccountName',
    'authAzureVaultName',
    'authAzureScopes',
  ],
  gcp: [
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
    'authGcpAudience',
    'authGcpSubjectTokenType',
    'authGcpTokenUrl',
    'authGcpCredentialSource',
    'authGcpImpersonateEmail',
    'authGcpImpersonateLifetime',
  ],
  password: ['password'],
  keyPair: ['privateKey', 'snowflakePrivatekeyPassphrase'],
};

function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

/** Typed literal wins; a blank field preserves a masked stored secret. */
function secretOrCarried(
  typed: string | undefined,
  previous: unknown,
): string | undefined {
  const value = trimmed(typed);
  if (shouldPersistSecret(value)) {
    return value;
  }
  if (!value && typeof previous === 'string' && isMaskedSecret(previous)) {
    return previous;
  }
  return undefined;
}

function assignIfPresent<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (value !== undefined && value !== '') {
    (target as Record<string, unknown>)[key as string] = value;
  }
}

function buildIamAuthType(
  form: ServiceFormValues,
  existing: ServiceConnectionConfig | undefined,
): { awsConfig: AwsCredentialsConfig } | undefined {
  const prev = existing?.authType?.awsConfig;
  const awsConfig: AwsCredentialsConfig = {};
  if (typeof form.authAwsEnabled === 'boolean') {
    awsConfig.enabled = form.authAwsEnabled;
  }
  assignIfPresent(awsConfig, 'awsAccessKeyId', trimmed(form.authAwsAccessKeyId) || undefined);
  assignIfPresent(
    awsConfig,
    'awsSecretAccessKey',
    secretOrCarried(form.authAwsSecretAccessKey, prev?.awsSecretAccessKey),
  );
  assignIfPresent(awsConfig, 'awsRegion', trimmed(form.authAwsRegion) || undefined);
  assignIfPresent(
    awsConfig,
    'awsSessionToken',
    secretOrCarried(form.authAwsSessionToken, prev?.awsSessionToken),
  );
  assignIfPresent(awsConfig, 'endPointURL', trimmed(form.authAwsEndPointURL) || undefined);
  assignIfPresent(awsConfig, 'profileName', trimmed(form.authAwsProfileName) || undefined);
  assignIfPresent(awsConfig, 'assumeRoleArn', trimmed(form.authAssumeRoleArn) || undefined);
  assignIfPresent(
    awsConfig,
    'assumeRoleSessionName',
    trimmed(form.authAssumeRoleSessionName) || undefined,
  );
  assignIfPresent(
    awsConfig,
    'assumeRoleSourceIdentity',
    trimmed(form.authAssumeRoleSourceIdentity) || undefined,
  );
  return Object.keys(awsConfig).length > 0 ? { awsConfig } : undefined;
}

function buildAzureAuthType(
  form: ServiceFormValues,
  existing: ServiceConnectionConfig | undefined,
): { azureConfig: AzureCredentialsConfig } | undefined {
  const prev = existing?.authType?.azureConfig;
  const azureConfig: AzureCredentialsConfig = {};
  assignIfPresent(azureConfig, 'clientId', trimmed(form.authAzureClientId) || undefined);
  assignIfPresent(
    azureConfig,
    'clientSecret',
    secretOrCarried(form.authAzureClientSecret, prev?.clientSecret),
  );
  assignIfPresent(azureConfig, 'tenantId', trimmed(form.authAzureTenantId) || undefined);
  assignIfPresent(azureConfig, 'accountName', trimmed(form.authAzureAccountName) || undefined);
  assignIfPresent(azureConfig, 'vaultName', trimmed(form.authAzureVaultName) || undefined);
  assignIfPresent(azureConfig, 'scopes', trimmed(form.authAzureScopes) || undefined);
  return Object.keys(azureConfig).length > 0 ? { azureConfig } : undefined;
}

const GCP_VARIANT_TYPES = {
  gcpValues: 'service_account',
  gcpCredentialsPath: 'gcp_credential_path',
  gcpExternalAccount: 'external_account',
  gcpADC: 'gcp_adc',
} as const;

function buildGcpVariant(
  form: ServiceFormValues,
  existing: ServiceConnectionConfig | undefined,
): Record<string, unknown> {
  const variant = form.authGcpConfigBranch ?? 'gcpValues';
  const prev = existing?.authType?.gcpConfig?.gcpConfig;
  const prevVariant =
    prev && typeof prev === 'object' && prev['type'] === GCP_VARIANT_TYPES[variant]
      ? (prev as Record<string, unknown>)
      : undefined;
  const projectId = trimmed(form.authGcpProjectId) || undefined;
  if (variant === 'gcpCredentialsPath') {
    return {
      type: GCP_VARIANT_TYPES.gcpCredentialsPath,
      ...(trimmed(form.authGcpPath) ? { path: trimmed(form.authGcpPath) } : {}),
      ...(projectId ? { projectId } : {}),
    };
  }
  if (variant === 'gcpExternalAccount') {
    let credentialSource: Record<string, unknown> | undefined;
    const raw = trimmed(form.authGcpCredentialSource);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          credentialSource = parsed as Record<string, unknown>;
        }
      } catch {
        credentialSource = undefined;
      }
    }
    return {
      type: GCP_VARIANT_TYPES.gcpExternalAccount,
      ...(trimmed(form.authGcpAudience) ? { audience: trimmed(form.authGcpAudience) } : {}),
      ...(trimmed(form.authGcpSubjectTokenType)
        ? { subjectTokenType: trimmed(form.authGcpSubjectTokenType) }
        : {}),
      ...(trimmed(form.authGcpTokenUrl) ? { tokenURL: trimmed(form.authGcpTokenUrl) } : {}),
      ...(credentialSource ? { credentialSource } : {}),
    };
  }
  if (variant === 'gcpADC') {
    return {
      type: GCP_VARIANT_TYPES.gcpADC,
      ...(projectId ? { projectId } : {}),
    };
  }
  const values: Record<string, unknown> = { type: GCP_VARIANT_TYPES.gcpValues };
  assignIfPresent(values, 'projectId', projectId);
  assignIfPresent(values, 'privateKeyId', trimmed(form.authGcpPrivateKeyId) || undefined);
  assignIfPresent(
    values,
    'privateKey',
    secretOrCarried(form.authGcpPrivateKey, prevVariant?.['privateKey']),
  );
  assignIfPresent(values, 'clientEmail', trimmed(form.authGcpClientEmail) || undefined);
  assignIfPresent(values, 'clientId', trimmed(form.authGcpClientId) || undefined);
  assignIfPresent(values, 'authUri', trimmed(form.authGcpAuthUri) || undefined);
  assignIfPresent(values, 'tokenUri', trimmed(form.authGcpTokenUri) || undefined);
  assignIfPresent(
    values,
    'authProviderX509CertUrl',
    trimmed(form.authGcpAuthProviderX509CertUrl) || undefined,
  );
  assignIfPresent(
    values,
    'clientX509CertUrl',
    trimmed(form.authGcpClientX509CertUrl) || undefined,
  );
  assignIfPresent(values, 'universeDomain', trimmed(form.authGcpUniverseDomain) || undefined);
  return values;
}

function buildGcpAuthType(
  form: ServiceFormValues,
  existing: ServiceConnectionConfig | undefined,
): ServiceConnectionConfig['authType'] {
  const auth: NonNullable<ServiceConnectionConfig['authType']> = {};
  assignIfPresent(
    auth,
    'password',
    secretOrCarried(form.authGcpPassword, existing?.authType?.password),
  );
  if (typeof form.authGcpEnableIamAuth === 'boolean') {
    auth.enableIamAuth = form.authGcpEnableIamAuth;
  }
  const gcpConfig: GcpCloudSqlCredentialsConfig = {
    gcpConfig: buildGcpVariant(form, existing),
  };
  const email = trimmed(form.authGcpImpersonateEmail);
  if (email || typeof form.authGcpImpersonateLifetime === 'number') {
    gcpConfig.gcpImpersonateServiceAccount = {
      ...(email ? { impersonateServiceAccount: email } : {}),
      ...(typeof form.authGcpImpersonateLifetime === 'number'
        ? { lifetime: form.authGcpImpersonateLifetime }
        : {}),
    };
  }
  auth.gcpConfig = gcpConfig;
  return auth;
}

/**
 * Fold the active auth branch into a builder-produced config, replacing
 * `config.authType` wholesale (pin sanitize: one credential, never both).
 * The Basic branch is a no-op — the builder already wrote `{password}` with
 * blank-means-keep. Snowflake's synthesized branches work on flat keys:
 * the password branch drops privateKey/passphrase the builder carried, the
 * key-pair branch drops the password. Types without an `authTypeBranch`
 * selector (Databricks/ES/Prefect branch-aware builders, flat-secret types)
 * pass through unchanged. Mutates and returns `builtConfig`.
 */
export function mergeAuthBranchIntoConfig(
  serviceType: string,
  form: ServiceFormValues,
  builtConfig: ServiceConnectionConfig,
  existingConfig?: ServiceConnectionConfig,
): ServiceConnectionConfig {
  if ((AUTH_BRANCH_TYPES as readonly string[]).includes(serviceType)) {
    const branch = form.authTypeBranch ?? 'basic';
    if (branch === 'iam') {
      const auth = buildIamAuthType(form, existingConfig);
      if (auth) {
        builtConfig.authType = auth;
      } else {
        delete builtConfig.authType;
      }
    } else if (branch === 'azure') {
      const auth = buildAzureAuthType(form, existingConfig);
      if (auth) {
        builtConfig.authType = auth;
      } else {
        delete builtConfig.authType;
      }
    } else if (branch === 'gcp') {
      builtConfig.authType = buildGcpAuthType(form, existingConfig);
    }
    return builtConfig;
  }
  if (serviceType === 'Snowflake') {
    const branch = form.authTypeBranch ?? 'password';
    if (branch === 'keyPair') {
      delete builtConfig.password;
    } else {
      delete builtConfig.privateKey;
      delete builtConfig.snowflakePrivatekeyPassphrase;
    }
    return builtConfig;
  }
  return builtConfig;
}

function storedText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Refill the auth-branch selector and non-secret branch fields from a stored
 * config. Secrets stay blank (blank-means-keep is enforced at build time).
 * Snowflake picks the key-pair branch when a private key is stored
 * (pin getFlatAuthTypeData: the private key wins over the password).
 * Mutates and returns `form`.
 */
export function hydrateAuthBranchForm(
  serviceType: string,
  storedConfig: ServiceConnectionConfig,
  form: ServiceFormValues,
): ServiceFormValues {
  if ((AUTH_BRANCH_TYPES as readonly string[]).includes(serviceType)) {
    const auth = storedConfig.authType;
    if (auth?.gcpConfig) {
      form.authTypeBranch = 'gcp';
      if (typeof auth.enableIamAuth === 'boolean') {
        form.authGcpEnableIamAuth = auth.enableIamAuth;
      }
      const inner = auth.gcpConfig.gcpConfig;
      const typeValue =
        inner && typeof inner === 'object' ? (inner as Record<string, unknown>)['type'] : undefined;
      const variant =
        (Object.entries(GCP_VARIANT_TYPES).find(([, type]) => type === typeValue)?.[0] as
          | ServiceFormValues['authGcpConfigBranch']
          | undefined) ?? 'gcpValues';
      form.authGcpConfigBranch = variant;
      if (inner && typeof inner === 'object') {
        const record = inner as Record<string, unknown>;
        const projectId = record['projectId'];
        form.authGcpProjectId =
          typeof projectId === 'string'
            ? projectId
            : Array.isArray(projectId) && typeof projectId[0] === 'string'
              ? projectId[0]
              : undefined;
        form.authGcpPrivateKeyId = storedText(record['privateKeyId']);
        form.authGcpClientEmail = storedText(record['clientEmail']);
        form.authGcpClientId = storedText(record['clientId']);
        form.authGcpAuthUri = storedText(record['authUri']);
        form.authGcpTokenUri = storedText(record['tokenUri']);
        form.authGcpAuthProviderX509CertUrl = storedText(record['authProviderX509CertUrl']);
        form.authGcpClientX509CertUrl = storedText(record['clientX509CertUrl']);
        form.authGcpUniverseDomain = storedText(record['universeDomain']);
        form.authGcpPath = storedText(record['path']);
        form.authGcpAudience = storedText(record['audience']);
        form.authGcpSubjectTokenType = storedText(record['subjectTokenType']);
        form.authGcpTokenUrl = storedText(record['tokenURL']);
        const source = record['credentialSource'];
        form.authGcpCredentialSource =
          source && typeof source === 'object' ? JSON.stringify(source) : undefined;
      }
      const impersonate = auth.gcpConfig.gcpImpersonateServiceAccount;
      form.authGcpImpersonateEmail = storedText(impersonate?.impersonateServiceAccount);
      form.authGcpImpersonateLifetime =
        typeof impersonate?.lifetime === 'number' ? impersonate.lifetime : undefined;
    } else if (auth?.awsConfig) {
      form.authTypeBranch = 'iam';
      const aws = auth.awsConfig;
      if (typeof aws.enabled === 'boolean') {
        form.authAwsEnabled = aws.enabled;
      }
      form.authAwsAccessKeyId = storedText(aws.awsAccessKeyId);
      form.authAwsRegion = storedText(aws.awsRegion);
      form.authAwsEndPointURL = storedText(aws.endPointURL);
      form.authAwsProfileName = storedText(aws.profileName);
      form.authAssumeRoleArn = storedText(aws.assumeRoleArn);
      form.authAssumeRoleSessionName = storedText(aws.assumeRoleSessionName);
      form.authAssumeRoleSourceIdentity = storedText(aws.assumeRoleSourceIdentity);
    } else if (auth?.azureConfig) {
      form.authTypeBranch = 'azure';
      const azure = auth.azureConfig;
      form.authAzureClientId = storedText(azure.clientId);
      form.authAzureTenantId = storedText(azure.tenantId);
      form.authAzureAccountName = storedText(azure.accountName);
      form.authAzureVaultName = storedText(azure.vaultName);
      form.authAzureScopes = storedText(azure.scopes);
    } else {
      form.authTypeBranch = 'basic';
    }
    return form;
  }
  if (serviceType === 'Snowflake') {
    form.authTypeBranch = storedText(
      (storedConfig as unknown as Record<string, unknown>)['privateKey'],
    )
      ? 'keyPair'
      : 'password';
    return form;
  }
  return form;
}

/**
 * Pin AuthSelectField sanitize: switching branches discards the other
 * branches' values. Clears every branch key set except the active one.
 */
export function clearInactiveAuthBranchFields(
  serviceType: string,
  form: ServiceFormValues,
  activeBranch: string,
): void {
  const branches =
    serviceType === 'Snowflake'
      ? ['password', 'keyPair']
      : (AUTH_BRANCH_TYPES as readonly string[]).includes(serviceType)
        ? ['basic', 'iam', 'azure', 'gcp']
        : [];
  const record = form as unknown as Record<string, unknown>;
  for (const branch of branches) {
    if (branch === activeBranch) {
      continue;
    }
    for (const key of AUTH_BRANCH_KEY_SETS[branch] ?? []) {
      record[key as string] = undefined;
    }
  }
}

/**
 * Generic branch sanitize for the other oneOf selectors (authMode,
 * elasticSearchAuthMode, prefectAuthMode, gcpConfigType, sslCertMode,
 * authGcpConfigBranch): clear fields tagged with a branch other than the
 * newly selected value, gated on that selector.
 */
export function clearInactiveBranchFields(
  fields: readonly ConnectionFieldDef[],
  form: ServiceFormValues,
  selectorKey: string,
  activeValue: string,
): void {
  const record = form as unknown as Record<string, unknown>;
  for (const field of fields) {
    if (
      field.branch !== undefined &&
      field.key &&
      field.showWhen?.field === selectorKey &&
      field.branch !== activeValue
    ) {
      record[field.key as string] = undefined;
    }
  }
}

// --- Stored credential presence for file-or-input fields (S-13) ---

/** Config paths for file-or-input leaves, keyed by form key. */
const STORED_FILE_FIELD_PATHS: Readonly<Record<string, readonly string[]>> = {
  sslCaCertificate: ['sslConfig', 'caCertificate'],
  sslCertificate: ['sslConfig', 'sslCertificate'],
  sslKey: ['sslConfig', 'sslKey'],
  consumerConfigSSLCaCertificate: ['consumerConfigSSL', 'caCertificate'],
  consumerConfigSSLCertificate: ['consumerConfigSSL', 'sslCertificate'],
  consumerConfigSSLKey: ['consumerConfigSSL', 'sslKey'],
  schemaRegistrySSLCaCertificate: ['schemaRegistrySSL', 'caCertificate'],
  schemaRegistrySSLCertificate: ['schemaRegistrySSL', 'sslCertificate'],
  schemaRegistrySSLKey: ['schemaRegistrySSL', 'sslKey'],
  supersetSSLCaCertificate: ['connection', 'sslConfig', 'caCertificate'],
  supersetSSLCertificate: ['connection', 'sslConfig', 'sslCertificate'],
  supersetSSLKey: ['connection', 'sslConfig', 'sslKey'],
  restSSLCaCertificate: ['sslConfig', 'caCertificate'],
  restSSLCertificate: ['sslConfig', 'sslCertificate'],
  restSSLKey: ['sslConfig', 'sslKey'],
  openMetadataSSLCaCertificate: ['sslConfig', 'caCertificate'],
  openMetadataSSLCertificate: ['sslConfig', 'sslCertificate'],
  openMetadataSSLKey: ['sslConfig', 'sslKey'],
  privateKey: ['privateKey'],
  authGcpPrivateKey: ['authType', 'gcpConfig', 'gcpConfig', 'privateKey'],
  sslCaCertValue: ['sslConfig', 'certificates', 'caCertValue'],
  sslClientCertValue: ['sslConfig', 'certificates', 'clientCertValue'],
  sslPrivateKeyValue: ['sslConfig', 'certificates', 'privateKeyValue'],
};

/** True when the stored config holds a value for a file-or-input leaf. */
export function hasStoredFileFieldValue(
  storedConfig: ServiceConnectionConfig | undefined,
  formKey: string,
): boolean {
  const path = STORED_FILE_FIELD_PATHS[formKey];
  if (!path || !storedConfig) {
    return false;
  }
  let current: unknown = storedConfig;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current.trim() !== '' : current !== undefined && current !== null;
}

/**
 * Pin schema titles/descriptions for filter-pattern properties, by field
 * name. Titles are uniform across types; descriptions use the canonical
 * wording verified against the pin schema that declares each field.
 * Fields without a verified entry fall back to the translated label.
 */
export const FILTER_PATTERN_SCHEMA_META: Readonly<
  Record<string, Readonly<{ title: string; description: string }>>
> = {
  schemaFilterPattern: {
    title: 'Default Schema Filter Pattern',
    description: 'Regex to only include/exclude schemas that matches the pattern.',
  },
  tableFilterPattern: {
    title: 'Default Table Filter Pattern',
    description: 'Regex to only include/exclude tables that matches the pattern.',
  },
  databaseFilterPattern: {
    title: 'Default Database Filter Pattern',
    description: 'Regex to only include/exclude databases that matches the pattern.',
  },
  storedProcedureFilterPattern: {
    title: 'Default Stored Procedure Filter Pattern',
    description: 'Regex to only include/exclude stored procedures that matches the pattern.',
  },
  topicFilterPattern: {
    title: 'Default Topic Filter Pattern',
    description: 'Regex to only fetch topics that matches the pattern.',
  },
  containerFilterPattern: {
    title: 'Default Storage container Filter Pattern',
    description: 'Regex to only fetch containers that matches the pattern.',
  },
  dashboardFilterPattern: {
    title: 'Default Dashboard Filter Pattern',
    description: 'Regex to exclude or include dashboards that matches the pattern.',
  },
  chartFilterPattern: {
    title: 'Default Chart Filter Pattern',
    description: 'Regex exclude or include charts that matches the pattern.',
  },
  dataModelFilterPattern: {
    title: 'Default Data Model Filter Pattern',
    description: 'Regex exclude or include data models that matches the pattern.',
  },
  projectFilterPattern: {
    title: 'Default Project Filter Pattern',
    description: 'Regex to exclude or include projects that matches the pattern.',
  },
  pipelineFilterPattern: {
    title: 'Default Pipeline Filter Pattern',
    description: 'Regex exclude pipelines.',
  },
  searchIndexFilterPattern: {
    title: 'Default Search Index Filter Pattern',
    description: 'Regex to only fetch search indexes that matches the pattern.',
  },
  mlModelFilterPattern: {
    title: 'Default ML Model Filter Pattern',
    description: 'Regex to only fetch MlModels with names matching the pattern.',
  },
  modelFilterPattern: {
    title: 'Model Filter Pattern',
    description: 'Regex to only fetch models with names matching the pattern',
  },
  serverFilterPattern: {
    title: 'Server Filter Pattern',
    description: 'Regex to only fetch servers with names matching the pattern',
  },
  directoryFilterPattern: {
    title: 'Default Directory Filter Pattern',
    description: 'Regex to only include/exclude directories that matches the pattern.',
  },
  fileFilterPattern: {
    title: 'Default File Filter Pattern',
    description: 'Regex to only include/exclude files that matches the pattern.',
  },
  spreadsheetFilterPattern: {
    title: 'Default Spreadsheet Filter Pattern',
    description: 'Regex to only include/exclude spreadsheets that matches the pattern.',
  },
  worksheetFilterPattern: {
    title: 'Default Worksheet Filter Pattern',
    description: 'Regex to only include/exclude worksheets that matches the pattern.',
  },
  apiCollectionFilterPattern: {
    title: 'Default API Collection Filter Pattern',
    description: 'Regex to only fetch api collections with names matching the pattern.',
  },
  apiEndpointFilterPattern: {
    title: 'Default API Endpoint Filter Pattern',
    description: 'Regex to only fetch api endpoints with names matching the pattern.',
  },
};

export function filterPatternSchemaMeta(
  fieldName: string,
): Readonly<{ title: string; description: string }> | undefined {
  return FILTER_PATTERN_SCHEMA_META[fieldName];
}
