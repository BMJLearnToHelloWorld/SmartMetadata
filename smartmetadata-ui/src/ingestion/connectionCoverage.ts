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
 * cells are filled and its per-type tests pass (U-1); no row is
 * covered at this baseline, and "has a schema file" never counts as
 * covered.
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
 * only. Counts after A2: covered 5 / pending-static 24 / blocked 10
 * (all class C); 5 types have no official loader entry; 8 types are
 * excluded from the official wizard — the wizard exposes 31 of the 39.
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
  // A2 (2026-11-19): covered via the product-side loader equivalent
  // (schemaPath + byte-identical public copy). hasLoader stays false:
  // the official loader tables have no entry for these types.
  row('mlmodel', 'VertexAI', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/mlmodel/vertexaiConnection.json',
  }),
  row('metadata', 'Alation', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/alationConnection.json',
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
  row('metadata', 'Collibra', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/collibraConnection.json',
  }),
  row('metadata', 'MetadataES', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/metadata/metadataESConnection.json',
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
  row('drive', 'SharePoint', 'covered', {
    hasLoader: false,
    hasJsonFile: true,
    hasStaticGroup: true,
    wizardExposed: false,
    schemaPath: 'connections/drive/sharePointConnection.json',
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
 * - present + covered: the schema-driven form (five A-class rows are
 *   covered since the 2026-11-19 A2 ruling; the schema-form area
 *   renders the static form until the schema-driven renderer lands
 *   under U-1 — see ConnectionConfigForm).
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
