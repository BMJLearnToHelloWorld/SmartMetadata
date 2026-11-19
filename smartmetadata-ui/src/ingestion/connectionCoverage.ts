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
 * t364 Q0–Q8): the 40-row ledger for the 11 non-AI categories, keyed
 * by (kind, type) — never by bare type name (VertexAI exists in both
 * the mlmodel and llm kinds with different schemas; §5.2).
 *
 * Baseline counts, locked by t364 Q0: covered 0 / pending-static 24 /
 * non-submittable 16. A row becomes `covered` only when its six matrix
 * cells are filled and its per-type tests pass (U-1); no row is
 * covered at this baseline, and "has a schema file" never counts as
 * covered.
 *
 * The ledger also carries the official loader/file facts and the
 * wizard-exposure sets: 6 types have no official loader entry (A/B
 * classes, Q1 option (a): wizard does not expose them, edit keeps the
 * existing connection), and 9 types are excluded from the official
 * wizard (6 unSupportedServices + 3 excludedService, Q8) — the wizard
 * exposes 31 of the 40.
 *
 * Out-of-universe pairs (llm/mcp kinds, unknown types) are NOT rows:
 * `coverageFor` returns undefined and the guard passes through, so
 * the C-2 reserved surface (llm/mcp direct-visit edit) keeps its
 * existing behavior. T-2 must never expand scope into llm/mcp (§5.4).
 */

export type CoverageStatus = 'covered' | 'pending-static' | 'blocked';

/** Uncovered class (§3): A = no loader + file exists, B = neither, C = loader + file, no product coverage. */
export type UncoveredClass = 'A' | 'B' | 'C';

export interface ConnectionCoverageRow {
  kind: ServiceKind;
  type: string;
  status: CoverageStatus;
  /** Official loader-table entry exists for this (kind, type). */
  hasLoader: boolean;
  /** Expanded runtime JSON file exists in the official public bundle. */
  hasJsonFile: boolean;
  /** Product static field group + builder branch exist. */
  hasStaticGroup: boolean;
  /** Uncovered class, for blocked rows only. */
  uncoveredClass?: UncoveredClass;
  /** The official wizard exposes this type (31 of 40). */
  wizardExposed: boolean;
  /** Relative schema path under jsons/connectionSchemas/, when a loader entry exists. */
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
  },
): ConnectionCoverageRow {
  return { kind, type, status, ...facts };
}

const DB = (type: string, schemaPath: string): ConnectionCoverageRow =>
  row('database', type, 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: `connections/database/${schemaPath}`,
  });

export const CONNECTION_COVERAGE_ROWS: readonly ConnectionCoverageRow[] = [
  DB('Postgres', 'postgresConnection.json'),
  DB('Mysql', 'mysqlConnection.json'),
  DB('Snowflake', 'snowflakeConnection.json'),
  DB('Databricks', 'databricksConnection.json'),
  DB('UnityCatalog', 'unityCatalogConnection.json'),
  DB('Doris', 'dorisConnection.json'),
  DB('Mssql', 'mssqlConnection.json'),
  DB('Redshift', 'redshiftConnection.json'),
  DB('MariaDB', 'mariaDBConnection.json'),
  DB('Greenplum', 'greenplumConnection.json'),
  DB('Timescale', 'timescaleConnection.json'),
  row('messaging', 'Kafka', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/messaging/kafkaConnection.json',
  }),
  row('messaging', 'Redpanda', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/messaging/redpandaConnection.json',
  }),
  row('dashboard', 'Superset', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/dashboard/supersetConnection.json',
  }),
  row('dashboard', 'Metabase', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/dashboard/metabaseConnection.json',
  }),
  row('storage', 'S3', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/storage/s3Connection.json',
  }),
  row('pipeline', 'Prefect', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/pipeline/prefectConnection.json',
  }),
  row('pipeline', 'Dagster', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/pipeline/dagsterConnection.json',
  }),
  row('api', 'Rest', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/api/restConnection.json',
  }),
  row('api', 'WEBHOOK', 'blocked', {
    hasLoader: false,
    hasJsonFile: false,
    hasStaticGroup: false,
    uncoveredClass: 'B',
    wizardExposed: false,
  }),
  row('mlmodel', 'CustomMlModel', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/customMlModelConnection.json',
  }),
  row('mlmodel', 'Mlflow', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/mlflowConnection.json',
  }),
  row('mlmodel', 'SageMaker', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/mlmodel/sageMakerConnection.json',
  }),
  row('mlmodel', 'Sklearn', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: false,
    schemaPath: 'connections/mlmodel/sklearnConnection.json',
  }),
  row('mlmodel', 'VertexAI', 'blocked', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'A',
    wizardExposed: false,
  }),
  row('metadata', 'Alation', 'blocked', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'A',
    wizardExposed: false,
  }),
  row('metadata', 'AlationSink', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/metadata/alationSinkConnection.json',
  }),
  row('metadata', 'Amundsen', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/metadata/amundsenConnection.json',
  }),
  row('metadata', 'Atlas', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/metadata/atlasConnection.json',
  }),
  row('metadata', 'Collibra', 'blocked', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'A',
    wizardExposed: false,
  }),
  row('metadata', 'MetadataES', 'blocked', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'A',
    wizardExposed: false,
  }),
  row('metadata', 'OpenMetadata', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/openMetadataConnection.json',
  }),
  row('drive', 'CustomDrive', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/drive/customDriveConnection.json',
  }),
  row('drive', 'GoogleDrive', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/drive/googleDriveConnection.json',
  }),
  row('drive', 'Sftp', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/drive/sftpConnection.json',
  }),
  row('drive', 'SharePoint', 'blocked', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'A',
    wizardExposed: false,
  }),
  row('search', 'CustomSearch', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/search/customSearchConnection.json',
  }),
  row('search', 'ElasticSearch', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: true,
    schemaPath: 'connections/search/elasticSearchConnection.json',
  }),
  row('search', 'OpenSearch', 'blocked', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: false,
    uncoveredClass: 'C',
    wizardExposed: true,
    schemaPath: 'connections/search/openSearchConnection.json',
  }),
  row('security', 'Ranger', 'pending-static', {
    hasLoader: true,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/security/rangerConnection.json',
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
 * - present + blocked: read-only prompt, submit blocked;
 * - present + pending-static: the existing static form, whose own
 *   required/secret rules decide submittability;
 * - present + covered: the schema-driven form (no row is covered yet).
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
