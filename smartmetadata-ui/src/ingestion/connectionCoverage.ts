/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ServiceKind } from '@/types/ingestion';

/**
 * T-2 stage matrix as code (preconditions/03-t2-stage-matrix.md §2,
 * t364 Q0–Q8): the 39-row ledger for the 11 non-AI categories, keyed
 * by (kind, type) — never by bare type name (VertexAI exists in both
 * the mlmodel and llm kinds with different schemas; §5.2).
 *
 * Baseline counts, locked by t364 Q0: covered 0 / pending-static 24 /
 * non-submittable 16. A row becomes `covered` only when its six matrix
 * cells are filled and its per-type tests pass (U-1); "has a schema
 * file" never counts as covered.
 *
 * A2 (2026-11-19, Bai ruling: A-class 5 rows in, WEBHOOK out): the
 * five A-class rows (VertexAI, Alation, Collibra, MetadataES,
 * SharePoint) are `covered` — their six cells are filled via the
 * product-side loader equivalent (`schemaPath` + a byte-identical public
 * copy of the official JSON; the product loader is ledger-driven and
 * fetches on `schemaPath`). `hasLoader` stays false for them: the
 * official loader tables have no entry, and that fact must not be
 * falsified. The t364 Q1 ban on inventing a loader equivalent for
 * loader-less types is superseded by this ruling for these five rows
 * only.
 *
 * T-2 (2026-11-20): the remaining 29 rows are `covered` — every row
 * now carries a six-grid `verdict` (schema source / conditional
 * branches / required / secret keep / serialization / test state) and
 * its oracle + builder tests pass. Counts: covered 39 / pending-static 0
 * / blocked 0; 5 types have no official loader entry; 8 types are
 * excluded from the official wizard — the wizard exposes 31 of the 39.
 * Named deviations live in the verdicts themselves (Snowflake
 * synthesized required, GoogleDrive/VertexAI credentials-object required,
 * OpenMetadata elasticsSearch.type conditional required).
 *
 * WEBHOOK has no row: the official UI bundle and the spec carry no
 * WEBHOOK connection file, loader entry, or schema to compare — the
 * type exists only in the API service enum, with no connection form —
 * so the row was a fork invention and was removed (2026-11-19 A2
 * ruling), not merely blocked. The `WEBHOOK: []` entry in
 * serviceFilterFields.ts stays: the empty mapping is still needed for
 * the wizard empty state.
 *
 * The ledger also carries the official loader/file facts and the
 * wizard-exposure sets: 5 types have no official loader entry (A
 * class, Q1 option (a): wizard does not expose them, edit keeps the
 * existing connection), and 8 types are excluded from the official
 * wizard (5 unSupportedServices + 3 excludedService, Q8) — the wizard
 * exposes 31 of the 39.
 *
 * Out-of-universe pairs (llm/mcp kinds, unknown types) are NOT rows:
 * `coverageFor` returns undefined and the guard passes through, so
 * the C-2 reserved surface (llm/mcp direct-visit edit) keeps its
 * existing behavior. T-2 must never expand scope into llm/mcp (§5.4).
 */

export type CoverageStatus = 'covered' | 'pending-static' | 'blocked';

/** Uncovered class (§3): A = no loader + file exists, B = neither, C = loader + file, no product coverage. */
export type UncoveredClass = 'A' | 'B' | 'C';

/**
 * The six T-2 matrix cells (A2 §1.4): a row is `covered` only when all
 * six are filled and its per-type tests pass. Deviations from the pin
 * are named here, never silently passed.
 */
export interface ConnectionCoverageVerdict {
  /** ① Official schema path + product copy status. */
  schemaSource: string;
  /** ② oneOf / auth branch coverage (selector, switch clearing, refill). */
  branches: string;
  /** ③ required对照, with per-leaf differences. */
  required: string;
  /** ④ Secret-leaf blank-keep / retype / masked-carry behavior. */
  secretKeep: string;
  /** ⑤ Form values → submitted config mapping. */
  serialization: string;
  /** ⑥ Automation: oracle + builder round-trip tests. */
  tests: string;
}

export interface ConnectionCoverageRow {
  kind: ServiceKind;
  type: string;
  status: CoverageStatus;
  /** The six T-2 verdict cells; present on every covered row. */
  verdict?: ConnectionCoverageVerdict;
  /** Official loader-table entry exists for this (kind, type). */
  hasLoader: boolean;
  /** Expanded runtime JSON file exists in the official public bundle. */
  hasJsonFile: boolean;
  /** Product static field group + builder branch exist. */
  hasStaticGroup: boolean;
  /** Uncovered class, for blocked rows only. */
  uncoveredClass?: UncoveredClass;
  /** The official wizard exposes this type (31 of 39). */
  wizardExposed: boolean;
  /**
   * Relative schema path under jsons/connectionSchemas/: set when an
   * official loader entry exists, or — for the five A-class rows covered
   * by the 2026-11-19 A2 ruling only — when the product-side loader
   * equivalent (byte-identical public copy) exists. `hasLoader` stays
   * false for the A-class rows: the path is the product equivalent,
   * never a claim that official has a loader entry.
   */
  schemaPath?: string;
}

function row(
  kind: ServiceKind,
  type: string,
  status: CoverageStatus,
  facts: {
    hasLoader: boolean;
    hasJsonFile: boolean;
    hasStaticGroup: boolean;
    uncoveredClass?: UncoveredClass;
    wizardExposed: boolean;
    schemaPath?: string;
    verdict?: ConnectionCoverageVerdict;
  },
): ConnectionCoverageRow {
  return { kind, type, status, ...facts };
}

export const CONNECTION_COVERAGE_ROWS: readonly ConnectionCoverageRow[] = [
  row('database', 'Postgres', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/postgresConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/postgresConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf basic/iam/azure via authTypeBranch (default basic); sslConfig single-branch triplet; switch clears via clearInactiveAuthBranchFields + generic clearInactiveBranchFields; refill infers the branch in hydrateAuthBranchForm from stored authType.',
      required: 'required [hostPort, username, database] + IAM-branch awsRegion; matches JSON exactly (0 diff).',
      secretKeep: 'Secrets: basic password, IAM awsSecretAccessKey/awsSessionToken, Azure clientSecret — password-control discipline: blank means keep on edit (masked carried), retype replaces.',
      serialization: 'buildServiceConnection Postgres branch: flat leaves + authType folded by mergeAuthBranchIntoConfig; scheme default postgresql+psycopg2; sslConfig via sslConfigFromFormKeys.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Postgres matches postgresConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Mysql', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/mysqlConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/mysqlConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf basic/iam/azure/gcp via authTypeBranch; GCP variant selector authGcpConfigBranch (gcpValues/path/external/ADC); sslConfig triplet; same clear/refill as Postgres.',
      required: 'required [hostPort, username] + IAM-branch awsRegion; matches JSON exactly (0 diff; A2 counted 51 vs this lane 50 — a counting-method difference, see BENCHMARK §5).',
      secretKeep: 'Secrets: basic password, IAM awsSecretAccessKey/awsSessionToken, Azure clientSecret, GCP privateKey (fileOrInput) — same blank-keep discipline.',
      serialization: 'Same as Postgres; scheme default mysql+pymysql; databaseName/databaseSchema; useSlowLogs / queryHistoryTable (Mysql-only leaves).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Mysql matches mysqlConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Snowflake', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/snowflakeConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/snowflakeConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'Flat schema (no authType oneOf): pin synthesizes a Password / Key-pair selector (getSchemaWithSynthesizedAuthType); product authTypeBranch password/keyPair with the snowflakePasswordGate / snowflakeKeyPairGate; refill via hydrateAuthBranchForm.',
      required: 'required [username, account, warehouse] per the flat JSON; the synthesized branch required (password / privateKey) is NOT counted — named deviation, BENCHMARK §6①, needs Bai ruling (a)/(b).',
      secretKeep: 'Secrets: password + privateKey (fileOrInput) + snowflakePrivatekeyPassphrase — blank-keep on edit.',
      serialization: 'buildServiceConnection Snowflake branch: flat leaves; policyAgentConfig emitted with spec defaults (supportsMaskedAccess true for Snowflake).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Snowflake matches snowflakeConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Databricks', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/databricksConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/databricksConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf PAT / OAuth / Azure via authMode (pat/oauth/azure, default pat); no sslConfig oneOf.',
      required: 'required [hostPort, httpPath, authType] + branch required: PAT token, OAuth clientId/clientSecret, Azure azureClientId/azureClientSecret/azureTenantId — all marked required in the T-2 §3.1 fix; Azure order fixed to clientId, clientSecret, tenantId.',
      secretKeep: 'Secrets: PAT password, clientSecret, azureClientSecret — password control, blank-keep on edit.',
      serialization: 'applyDatabricksAuth folds the branch; policyAgentConfig emitted with supportsMaskedAccess false (spec default, T-2 §3.2 fix).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Databricks matches databricksConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'UnityCatalog', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/unityCatalogConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/unityCatalogConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf PAT / OAuth / Azure via authMode (pat/oauth/azure, default pat); no sslConfig oneOf.',
      required: 'required [hostPort, authType] (httpPath NOT required) + the same branch required as Databricks (T-2 §3.1 fix).',
      secretKeep: 'Secrets: PAT password, clientSecret, azureClientSecret — password control, blank-keep on edit.',
      serialization: 'Same as Databricks (shared branch); policyAgentConfig emitted with supportsMaskedAccess false (spec default, T-2 §3.2 fix); includeMetricViews leaf.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'UnityCatalog matches unityCatalogConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Doris', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/dorisConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/dorisConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No auth oneOf; sslConfig single-branch triplet.',
      required: 'required [hostPort, username]; matches JSON exactly.',
      secretKeep: 'Secret: password only — blank-keep.',
      serialization: 'Flat branch; scheme default doris; sslConfig via sslConfigFromFormKeys.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Doris matches dorisConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Mssql', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/mssqlConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/mssqlConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No auth oneOf; sslConfig single-branch triplet.',
      required: 'required [database] only (T-2 §3.1: username/hostPort de-required).',
      secretKeep: 'Secret: password only — blank-keep.',
      serialization: 'Flat branch; scheme enum mssql+pyodbc/pytds/pymssql.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Mssql matches mssqlConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Redshift', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/redshiftConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/redshiftConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType basic/iam via authTypeBranch; sslMode + sslConfig triplet.',
      required: 'required [hostPort, username, database] + IAM-branch awsRegion.',
      secretKeep: 'Secrets: password, IAM awsSecretAccessKey/awsSessionToken — blank-keep.',
      serialization: 'Same as Postgres; scheme redshift+psycopg2; clusterIdentifier/workgroupName.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Redshift matches redshiftConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'MariaDB', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/mariaDBConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/mariaDBConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf at all (flat 8 leaves).',
      required: 'required [hostPort, username]; exact match.',
      secretKeep: 'Secret: password only — blank-keep.',
      serialization: 'Flat branch; scheme mysql+pymysql.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'MariaDB matches mariaDBConnection.json exactly\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Greenplum', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/greenplumConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/greenplumConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType basic/iam via authTypeBranch; sslMode + sslConfig triplet.',
      required: 'required [hostPort, username, database] + IAM-branch awsRegion.',
      secretKeep: 'Secrets: password, IAM awsSecretAccessKey/awsSessionToken — blank-keep.',
      serialization: 'Same as Postgres; scheme postgresql+psycopg2.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Greenplum matches greenplumConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('database', 'Timescale', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/database/timescaleConnection.json',
    verdict: {
      schemaSource: 'Official connections/database/timescaleConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType basic/iam/azure via authTypeBranch; sslMode + sslConfig triplet.',
      required: 'required [hostPort, username, database] + IAM-branch awsRegion.',
      secretKeep: 'Secrets: password, IAM awsSecretAccessKey/awsSessionToken, Azure clientSecret — blank-keep.',
      serialization: 'Same as Postgres; classificationName/queryStatementSource.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Timescale matches timescaleConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('messaging', 'Kafka', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/messaging/kafkaConnection.json',
    verdict: {
      schemaSource: 'Official connections/messaging/kafkaConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'consumerConfigSSL / schemaRegistrySSL single-branch triplets; no auth oneOf.',
      required: 'required [bootstrapServers]; matches JSON exactly.',
      secretKeep: 'Secret: saslPassword (password control) — blank-keep.',
      serialization: 'Flat branch; securityProtocol/saslMechanism enums; consumerConfig/schemaRegistryConfig maps.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Kafka matches kafkaConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('messaging', 'Redpanda', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/messaging/redpandaConnection.json',
    verdict: {
      schemaSource: 'Official connections/messaging/redpandaConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No ssl oneOf (no sslConfig leaves).',
      required: 'required [bootstrapServers]; matches JSON exactly.',
      secretKeep: 'Secret: saslPassword only — blank-keep.',
      serialization: 'Flat branch; same enums as Kafka.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Redpanda matches redpandaConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('dashboard', 'Superset', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/dashboard/supersetConnection.json',
    verdict: {
      schemaSource: 'Official connections/dashboard/supersetConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'connection oneOf api/postgres/mysql via supersetConnectionBranch (default api) + supersetDbAuthBranch (basic/iam/azure; mysql adds gcp); switch clears via clearInactiveSupersetDbAuthBranchFields + generic clear; refill infers the branch from stored connection (provider → api, scheme postgresql → postgres, mysql → mysql).',
      required: 'required [hostPort, connection] + branch required: api [provider, password, username], Postgres [hostPort, username, database], Mysql [hostPort, username] — all enforced via the supersetDb* keys; api password required, DB password not (split keys).',
      secretKeep: 'Secrets: api password (connection.password), DB password (supersetDbPassword), IAM pair, Azure clientSecret, GCP privateKey — all blank-keep; NO_GENERIC_PASSWORD stops a stale api password leaking into a DB branch.',
      serialization: 'buildSupersetDbConnection(form, prev, branch) for the DB branches; api branch builds nested {provider, username, password, verifySSL, sslConfig}; scheme defaults per branch.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Superset matches supersetConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (api / postgres / mysql-GCP / leak / edit-keep / round-trip).',
    },
  }),
  row('dashboard', 'Metabase', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/dashboard/metabaseConnection.json',
    verdict: {
      schemaSource: 'Official connections/dashboard/metabaseConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'required [hostPort]; exact match.',
      secretKeep: 'Secret: apiKey (password control) — blank-keep.',
      serialization: 'Flat branch; apiKey via shouldPersistSecret.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Metabase matches metabaseConnection.json exactly\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('storage', 'S3', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/storage/s3Connection.json',
    verdict: {
      schemaSource: 'Official connections/storage/s3Connection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'awsConfig is a plain object (not a oneOf): the ten aws* leaves; no branch selector.',
      required: 'required [awsConfig] (the object itself); the only required inner leaf is awsRegion.',
      secretKeep: 'Secrets: awsSecretAccessKey/awsSessionToken — blank-keep (masked carried).',
      serialization: 'buildTopLevelAwsConfig(form, existing): enabled/region/keys/endPoint/profile/assumeRole*; secrets via shouldPersistSecret.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'S3 matches s3Connection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('pipeline', 'Prefect', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/pipeline/prefectConnection.json',
    verdict: {
      schemaSource: 'Official connections/pipeline/prefectConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf Cloud/Server via prefectAuthMode.',
      required: 'required [authType, hostPort] + Cloud branch [apiKey, accountId, workspaceId] (T-2 §3.1: apiKey marked required and moved before accountId/workspaceId).',
      secretKeep: 'Secret: apiKey (Cloud branch) + prefectAuthString (Server branch) — password control, blank-keep.',
      serialization: 'Prefect branch: cloud → authType {accountId, workspaceId, apiKey}; server → authType {authString}; sslConfig triplet.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Prefect matches prefectConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('pipeline', 'Dagster', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/pipeline/dagsterConnection.json',
    verdict: {
      schemaSource: 'Official connections/pipeline/dagsterConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'required [host] → hostPort (rename).',
      secretKeep: 'Secret: apiKey (token rename) — blank-keep.',
      serialization: 'Flat branch; host → hostPort, token → apiKey, timeout → dagsterTimeout renames.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Dagster matches dagsterConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('api', 'Rest', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/api/restConnection.json',
    verdict: {
      schemaSource: 'Official connections/api/restConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'openAPISchemaConnection oneOf url/filePath/s3 via restSchemaBranch (default url); the S3 branch reuses the shared authAws* keys with the branch relabelled \'s3\' so the generic cleaner does not delete them on switch; refill infers the branch from the stored leaf.',
      required: 'required [openAPISchemaConnection] + branch required: url [openAPISchemaURL], filePath [openAPISchemaFilePath], s3 [openAPISchemaS3URL, awsCredentials → awsRegion].',
      secretKeep: 'Secrets: token (apiKey) + S3 awsSecretAccessKey/awsSessionToken — blank-keep.',
      serialization: 'Rest branch builds openAPISchemaConnection per branch; apiEndpointFilterPattern via nonEmptyFilterPattern (not one of the 19 filter fields — rendered in the connection form).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Rest matches restConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (url / filePath / S3 / filter-pattern / round-trip).',
    },
  }),
  row('mlmodel', 'CustomMlModel', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/customMlModelConnection.json',
    verdict: {
      schemaSource: 'Official connections/mlmodel/customMlModelConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'required [type] (hidden) — nothing required in the form.',
      secretKeep: 'No secret leaves.',
      serialization: 'Direct: sourcePythonClass + connectionOptions; a type-only body is valid (Q4 exemption).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'CustomMlModel matches customMlModelConnection.json exactly\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (type-only test).',
    },
  }),
  row('mlmodel', 'Mlflow', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/mlflowConnection.json',
    verdict: {
      schemaSource: 'Official connections/mlmodel/mlflowConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'required [trackingUri, registryUri]; exact match.',
      secretKeep: 'No secret leaves.',
      serialization: 'Flat branch.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Mlflow matches mlflowConnection.json exactly\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
  row('mlmodel', 'SageMaker', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/sageMakerConnection.json',
    verdict: {
      schemaSource: 'Official connections/mlmodel/sageMakerConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'awsConfig plain object (not a oneOf): the ten aws* leaves shared with S3.',
      required: 'required [awsConfig] (the object itself); only awsRegion required inside.',
      secretKeep: 'Secrets: awsSecretAccessKey/awsSessionToken — blank-keep.',
      serialization: 'buildTopLevelAwsConfig reused (same as S3).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'SageMaker matches sageMakerConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (SageMaker test).',
    },
  }),
  row('mlmodel', 'Sklearn', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/mlmodel/sklearnConnection.json',
    verdict: {
      schemaSource: 'Official connections/mlmodel/sklearnConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf; no leaves at all.',
      required: 'No required (JSON required is empty).',
      secretKeep: 'No secret leaves.',
      serialization: 'Empty group; builder returns {type: \'Sklearn\'}; a type-only body is valid (Q4 exemption).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Sklearn matches sklearnConnection.json: no form leaves\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (type-only test).',
    },
  }),
  row('mlmodel', 'VertexAI', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/mlmodel/vertexaiConnection.json',
    verdict: {
      schemaSource: 'Official connections/mlmodel/vertexaiConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification). Product-side loader equivalent (schemaPath + byte-identical public copy) per the 2026-11-19 A2 ruling; hasLoader stays false — the official loader tables have no entry.',
      branches: 'credentials.gcpConfig oneOf 4 variants via authGcpConfigBranch (gcpValues/path/external/ADC); impersonate block; refill via hydrateGcpVariantForm.',
      required: 'required [credentials, location]; the credentials object is represented by the variant selector (no leaf required — named deviation, BENCHMARK §6②); location required.',
      secretKeep: 'Secret: privateKey (fileOrInput) + impersonate — blank-keep; masked carried.',
      serialization: 'buildGcpVariant + buildGcpImpersonateServiceAccount; credentials stays nested under credentials.gcpConfig.',
      tests: 'Oracle: connectionFields.test.ts \'A2 JSON-oracle field parity (§1.4 ⑥, covered fix)\' \'VertexAI matches vertexaiConnection.json…\'; builders: connections.test.ts \'A2 A-class builders (T-2)\' (values / path / impersonate / keep-replace).',
    },
  }),
  row('metadata', 'Alation', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/alationConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/alationConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification). Product-side loader equivalent per the 2026-11-19 A2 ruling; hasLoader stays false.',
      branches: 'authType oneOf basicAuth/apiToken via alationAuthBranch + connection oneOf postgres/mysql/none via alationConnectionBranch + nested alationDbAuthBranch; dedicated clearInactiveAlationDbAuthBranchFields; refill infers both branches.',
      required: 'required [hostPort, authType] + basicAuth [username, password], apiToken [accessToken], Postgres [hostPort, username, database], Mysql [hostPort, username].',
      secretKeep: 'Secrets: top password/accessToken, nested alationDbPassword — blank-keep.',
      serialization: 'buildAlationDbConnection + top-level authType oneOf; scheme defaults per branch.',
      tests: 'Oracle: connectionFields.test.ts \'A2 JSON-oracle field parity (§1.4 ⑥, covered fix)\' \'Alation matches alationConnection.json…\'; builders: connections.test.ts \'A2 A-class builders (T-2)\' (Postgres / Mysql-GCP / apiToken / none / leak / keep).',
    },
  }),
  row('metadata', 'AlationSink', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/metadata/alationSinkConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/alationSinkConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf basicAuth/apiToken via alationSinkAuthBranch (default basicAuth); sslConfig triplet; refill infers the branch from stored accessToken.',
      required: 'required [hostPort, authType] + basicAuth [username, password], apiToken [accessToken].',
      secretKeep: 'Secrets: password / accessToken — blank-keep.',
      serialization: 'AlationSink branch: authType oneOf + projectName (default AlationAPI) + paginationLimit (default 10) + datasourceLinks map + verifySSL + sslConfig triplet.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'AlationSink matches alationSinkConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (basic / apiToken / keep).',
    },
  }),
  row('metadata', 'Amundsen', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/metadata/amundsenConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/amundsenConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf; flat.',
      required: 'required [username, password, hostPort]; exact match.',
      secretKeep: 'Secret: flat config.password — blank-keep.',
      serialization: 'Flat branch; maxConnectionLifeTime 50, validateSSL false, encrypted false defaults.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Amundsen matches amundsenConnection.json exactly\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (Amundsen test).',
    },
  }),
  row('metadata', 'Atlas', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/metadata/atlasConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/atlasConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf; flat.',
      required: 'required [entity_type, username, password]; hostPort NOT required (T-2 fix — the product used to over-require it).',
      secretKeep: 'Secret: flat config.password — blank-keep.',
      serialization: 'Flat branch; databaseServiceName/messagingServiceName parsed as JSON string arrays; entity_type top-level key (pin spelling).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Atlas matches atlasConnection.json: hostPort is NOT required\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (Atlas test, incl. arrays).',
    },
  }),
  row('metadata', 'Collibra', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/collibraConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/collibraConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification). Product-side loader equivalent per the 2026-11-19 A2 ruling; hasLoader stays false.',
      branches: 'No oneOf.',
      required: 'required [username, password, hostPort]; glossary/domain filter leaves are NOT in the 19 (rendered).',
      secretKeep: 'Secret: password — blank-keep.',
      serialization: 'Flat branch.',
      tests: 'Oracle: connectionFields.test.ts \'A2 JSON-oracle field parity (§1.4 ⑥, covered fix)\' \'Collibra matches collibraConnection.json…\'; builders: connections.test.ts \'A2 A-class builders (T-2)\'.',
    },
  }),
  row('metadata', 'MetadataES', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/metadataESConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/metadataESConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification). Product-side loader equivalent per the 2026-11-19 A2 ruling; hasLoader stays false.',
      branches: 'No oneOf.',
      required: 'No required; entities renamed to metadataESEntities.',
      secretKeep: 'No secret leaves.',
      serialization: 'Flat branch; runMode/searchIndexMappingLanguage enums.',
      tests: 'Oracle: connectionFields.test.ts \'A2 JSON-oracle field parity (§1.4 ⑥, covered fix)\' \'MetadataES matches metadataESConnection.json…\'; builders: connections.test.ts \'A2 A-class builders (T-2)\'.',
    },
  }),
  row('metadata', 'OpenMetadata', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/openMetadataConnection.json',
    verdict: {
      schemaSource: 'Official connections/metadata/openMetadataConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'sslConfig triplet; securityConfig object (jwtToken leaf); elasticsSearch object.',
      required: 'required [hostPort] only; jwtToken NOT required — conditionally required inside the optional securityConfig object (T-2 correction of the A2 §4.3 label); elasticsSearch.type conditionally required — named deviation: the form models it as optional text and the builder emits the whole object only when a type is typed.',
      secretKeep: 'Secret: jwtToken — emitted only when set (blank-keep via secretFieldValue).',
      serialization: 'OpenMetadata branch: A group + B group (13 include* default true, limitRecords 1000, forceEntityOverwriting false, storeServiceConnection) + conditional elasticsSearch + securityConfig.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'OpenMetadata matches openMetadataConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (B group / elasticsSearch + jwtToken conditional).',
    },
  }),
  row('drive', 'CustomDrive', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/drive/customDriveConnection.json',
    verdict: {
      schemaSource: 'Official connections/drive/customDriveConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'No required.',
      secretKeep: 'No secret leaves.',
      serialization: 'Direct: connectionOptions + connectionArguments only; a type-only body is valid (Q4 exemption).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'CustomDrive matches customDriveConnection.json exactly\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (type-only test).',
    },
  }),
  row('drive', 'GoogleDrive', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/drive/googleDriveConnection.json',
    verdict: {
      schemaSource: 'Official connections/drive/googleDriveConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'credentials.gcpConfig oneOf 4 variants via gcpConfigType (shared authGcp* keys, re-gated); impersonate leaves; refill via hydrateGcpVariantForm(..., \'gcpConfigType\'); legacy bare credentials read compatibly.',
      required: 'required [credentials] (the object) — represented by the variant selector, no leaf required (named deviation, BENCHMARK §6②, same as VertexAI).',
      secretKeep: 'Secret: privateKey (fileOrInput) — blank-keep; a blank edit preserves stored credentials (a variant with only its type means nothing new was entered); the ADC branch emits {type: \'gcp_adc\'} even when empty.',
      serialization: 'buildGcpVariant(form, storedGcpConfig, gcpConfigType) + buildGcpImpersonateServiceAccount (only when an email is present); the old credentialsJson / gcpExternalAccountJson blob fields were deleted as fork inventions.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'GoogleDrive matches googleDriveConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (values / ADC / path / blank-keep).',
    },
  }),
  row('drive', 'Sftp', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/drive/sftpConnection.json',
    verdict: {
      schemaSource: 'Official connections/drive/sftpConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf usernamePassword/privateKey via sftpAuthBranch (default usernamePassword); username shared across branches (two mutually-exclusive copies); refill infers the branch from stored privateKey.',
      required: 'required [host, authType] + UP [username, password], PK [username, privateKey].',
      secretKeep: 'Secrets: password / privateKey (fileOrInput) + privateKeyPassphrase — blank-keep; missingRequiredConnectionFields exempts blank fileOrInput secrets on edit (T-2; create still requires).',
      serialization: 'Sftp branch: host/port as separate leaves (no hostPort merge); authType oneOf; rootDirectories parsed as a JSON array (default [\'/\']).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Sftp matches sftpConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (UP / PK / keep).',
    },
  }),
  row('drive', 'SharePoint', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/drive/sharePointConnection.json',
    verdict: {
      schemaSource: 'Official connections/drive/sharePointConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification). Product-side loader equivalent per the 2026-11-19 A2 ruling; hasLoader stays false.',
      branches: 'No oneOf.',
      required: 'required [clientId, clientSecret, tenantId, siteUrl]; directory/file/spreadsheet/worksheet leaves are 19-item filter fields (filter step only).',
      secretKeep: 'Secret: clientSecret — blank-keep.',
      serialization: 'Flat branch.',
      tests: 'Oracle: connectionFields.test.ts \'A2 JSON-oracle field parity (§1.4 ⑥, covered fix)\' \'SharePoint matches sharePointConnection.json…\'; builders: connections.test.ts \'A2 A-class builders (T-2)\'.',
    },
  }),
  row('search', 'CustomSearch', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/search/customSearchConnection.json',
    verdict: {
      schemaSource: 'Official connections/search/customSearchConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'No oneOf.',
      required: 'required [type] (hidden) — nothing required in the form.',
      secretKeep: 'No secret leaves.',
      serialization: 'Direct: sourcePythonClass + connectionOptions; a type-only body is valid (Q4 exemption).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'CustomSearch matches customSearchConnection.json exactly\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (type-only test).',
    },
  }),
  row('search', 'ElasticSearch', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/search/elasticSearchConnection.json',
    verdict: {
      schemaSource: 'Official connections/search/elasticSearchConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf Basic / API-Key via elasticSearchAuthMode; sslConfig certificates oneOf paths/values via sslCertMode.',
      required: 'No required at all (T-2 §3.1: hostPort de-required).',
      secretKeep: 'Secrets: password (basic) / apiKey (apiAuth) — blank-keep; masked carried.',
      serialization: 'ES branch: mode decides the authType shape; elasticSearchSslConfigFromForm for the cert oneOf; connectionTimeoutSecs default 30.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'ElasticSearch matches elasticSearchConnection.json…\'; builders: existing tests in connections.test.ts + the T-2 ConnectionConfigForm minimal-body test (all passing).',
    },
  }),
  row('search', 'OpenSearch', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/search/openSearchConnection.json',
    verdict: {
      schemaSource: 'Official connections/search/openSearchConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType oneOf basicAuth/awsCredentials via openSearchAuthBranch (default basicAuth); sslConfig certificates oneOf paths/values via sslCertMode (shared ES keys); refill infers the branch from stored authType.awsConfig.',
      required: 'No top-level required; the AWS branch requires awsRegion; hostPort NOT required (T-2 fix).',
      secretKeep: 'Secrets: password (basic) / awsSecretAccessKey/awsSessionToken (AWS) — blank-keep; redactConnectionForDisplay masks top-level authType.awsConfig (gap fixed in this lane via maskAuthTypeSecrets).',
      serialization: 'OpenSearch branch: authType oneOf + verifySSL + elasticSearchSslConfigFromForm + connectionTimeoutSecs (default 30) + connectionArguments (no connectionOptions).',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'OpenSearch matches openSearchConnection.json…\'; builders: connections.test.ts \'T-2 builders (remaining rows)\' (basic / AWS / round-trip).',
    },
  }),
  row('security', 'Ranger', 'covered', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/security/rangerConnection.json',
    verdict: {
      schemaSource: 'Official connections/security/rangerConnection.json. Product public copy byte-identical to pin a3012259ca (T-2 cmp verification).',
      branches: 'authType single-branch oneOf (Ranger Basic Auth) — no selector.',
      required: 'required [hostPort, authType] + branch [username, password] (T-2 §3.1: password marked required).',
      secretKeep: 'Secret: password — blank-keep.',
      serialization: 'Flat branch with authType {username, password}.',
      tests: 'Oracle: connectionFields.test.ts \'T-2 JSON-oracle field parity (remaining 29 rows)\' \'Ranger matches rangerConnection.json…\'; builders: existing tests in connections.test.ts (all passing at the T-2 gate).',
    },
  }),
];

const BY_PAIR = new Map(
  CONNECTION_COVERAGE_ROWS.map((entry) => [`${entry.kind}:${entry.type}`, entry]),
);

/** Ledger lookup by (kind, type). Undefined for out-of-universe pairs. */
export function coverageFor(kind: string, type: string): ConnectionCoverageRow | undefined {
  return BY_PAIR.get(`${kind}:${type}`);
}

export interface CoverageCounts {
  covered: number;
  pending: number;
  blocked: number;
  total: number;
  wizardExposed: number;
  wizardExcluded: number;
  noLoader: number;
}

export function coverageCounts(): CoverageCounts {
  let covered = 0;
  let pending = 0;
  let blocked = 0;
  let wizardExposed = 0;
  let noLoader = 0;
  for (const entry of CONNECTION_COVERAGE_ROWS) {
    if (entry.status === 'covered') covered++;
    if (entry.status === 'pending-static') pending++;
    if (entry.status === 'blocked') blocked++;
    if (entry.wizardExposed) wizardExposed++;
    if (!entry.hasLoader) noLoader++;
  }
  return {
    covered,
    pending,
    blocked,
    total: CONNECTION_COVERAGE_ROWS.length,
    wizardExposed,
    wizardExcluded: CONNECTION_COVERAGE_ROWS.length - wizardExposed,
    noLoader,
  };
}

// --- Guard decision table (precondition 03 §4.3) ---------------------------

/** Schema load result: the S signal. */
export type SchemaLoadState = 'loading' | 'failed' | 'empty' | 'present';

export type ConnectionFormArea =
  | 'loader'
  | 'load-failed'
  | 'no-config'
  | 'read-only-prompt'
  | 'static-form'
  | 'schema-form';

export interface ConnectionGuardDecision {
  /** Which form area renders. */
  formArea: ConnectionFormArea;
  /** Whether a new connection body may be submitted. */
  connectionSubmitBlocked: boolean;
}

/**
 * The single guard evaluation source (§4.3 dual-enforcement rule):
 * both the button disabled state and the submit-handler assertion
 * must call this function — never separate copies of the condition.
 *
 * - loading/failed/empty schema: submit blocked whatever the row state;
 * - present + blocked: read-only prompt, submit blocked (no row is
 *   blocked since T-2; the branch stays for the guard table);
 * - present + pending-static: the existing static form, whose own
 *   required/secret rules decide submittability (no row is
 *   pending-static since T-2);
 * - present + covered: the schema-driven form (all 39 rows are covered
 *   since T-2; the schema-form area renders the static form until the
 *   schema-driven renderer lands under U-1 — see ConnectionConfigForm).
 *
 * This deliberately differs from official ConnectionConfigForm, where
 * an empty schema leaves submit enabled (§4.1): the safety deviation
 * is required by the T-2 ruling (R4) and documented, never presented
 * as a verbatim port.
 */
export function decideConnectionGuard(
  schemaState: SchemaLoadState,
  coverage: CoverageStatus,
): ConnectionGuardDecision {
  if (schemaState === 'loading') {
    return { formArea: 'loader', connectionSubmitBlocked: true };
  }
  if (schemaState === 'failed') {
    return { formArea: 'load-failed', connectionSubmitBlocked: true };
  }
  if (schemaState === 'empty') {
    return { formArea: 'no-config', connectionSubmitBlocked: true };
  }
  if (coverage === 'blocked') {
    return { formArea: 'read-only-prompt', connectionSubmitBlocked: true };
  }
  if (coverage === 'pending-static') {
    return { formArea: 'static-form', connectionSubmitBlocked: false };
  }
  return { formArea: 'schema-form', connectionSubmitBlocked: false };
}

/**
 * Payload defense, the last line (§4.4 item 4, Q4): a connection body
 * that is empty or carries only the hidden `type` key is never a
 * submittable new connection — an empty required set or a type-only
 * required set is not evidence the user filled anything in. Filter
 * -pattern keys are excluded by the caller when checking a merged
 * payload: they belong to the scope step, not the connection body.
 */
export function connectionBodyIsEmpty(
  config: Record<string, unknown> | undefined,
  ignoreKeys: readonly string[] = [],
): boolean {
  if (!config) {
    return true;
  }
  const keys = Object.keys(config).filter(
    (key) => key !== 'type' && !ignoreKeys.includes(key) && config[key] !== undefined,
  );
  return keys.length === 0;
}
