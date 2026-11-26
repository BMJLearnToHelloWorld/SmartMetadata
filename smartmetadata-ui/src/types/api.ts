/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SearchFacet } from '@/catalog/searchFacets';

export interface JwtResponse {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiryDuration?: number;
}

export interface LoginUser {
  id?: string;
  name?: string;
  email?: string;
  displayName?: string;
  /**
   * Full-profile fields from GET /v1/users/loggedInUser. The login call
   * itself returns a JWT only; these arrive with the profile, and the
   * permission chain (isAdminUser line) reads isAdmin from here, exactly
   * as official useAuth reads currentUser?.isAdmin.
   */
  isAdmin?: boolean;
  roles?: EntityRef[];
  teams?: EntityRef[];
  /**
   * Official User.isFirstTimeUser (v210 migration): the server clears it
   * to false the first time the user is seen, so the first-login welcome
   * shows exactly once. The login call returns a JWT only; this arrives
   * with the profile, like isAdmin above.
   */
  isFirstTimeUser?: boolean;
  /**
   * Official User.defaultPersona: the persona a user falls back to when
   * no persona is selected. The profile endpoint returns it; the persona
   * store uses it as the selection fallback.
   */
  defaultPersona?: EntityRef;
  /**
   * Official User.personas: the personas assigned to the user. Read
   * with fields=personas; the persona detail page refreshes the current
   * user with this field after membership changes (PER-D8).
   */
  personas?: EntityRef[];
}

export interface EntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  fullyQualifiedName?: string;
  /**
   * R13: the remaining optional EntityReference schema subfields
   * (pin `type/entityReference.json`, generated `entityReference.ts`):
   * soft-delete flag, optional description, inherited-relationship
   * flag, and the resource link. No index signature: the schema
   * forbids additional properties.
   */
  deleted?: boolean;
  description?: string;
  inherited?: boolean;
  href?: string;
  /**
   * Typed relation of a glossary-term relatedTerms entry (official
   * TermRelation.relationType, default 'relatedTo'). Carried only by
   * glossaryTerms.mapRelatedTerms; other EntityRef producers leave it unset.
   */
  relationType?: string;
  /**
   * Stored TermRelation passthrough (official type/termRelation.json),
   * carried only by glossaryTerms.mapRelatedTerms: the relation's own id
   * (the graph edge key), the relationship-type entity, provenance,
   * status, and audit fields. The graph builder and the relation
   * details panel read them; no other producer sets them.
   */
  relationId?: string;
  relationshipType?: EntityRef;
  provenance?: 'AiSuggested' | 'Imported' | 'Inferred' | 'Manual';
  relationStatus?: string;
  createdBy?: string;
  createdAt?: number;
}

/** Official votes shape (openmetadata-spec type/votes.json). */
export interface EntityVotes {
  upVotes: number;
  downVotes: number;
  upVoters?: EntityRef[];
  downVoters?: EntityRef[];
}

/**
 * LabelType (official generated type/tagLabel.ts LabelType enum): how a tag
 * label was applied. Optional on TagRef: the pin type requires it, but fork
 * payloads are unverified and may omit it, so absence must stay representable.
 */
export type TagLabelType = 'Automated' | 'Derived' | 'Generated' | 'Manual' | 'Propagated';

/**
 * Tag label state (official generated type/tagLabel.ts State enum): a
 * label is Suggested until the entity owner confirms it. Optional on
 * TagRef like labelType: payloads may omit it, and absence must stay
 * representable so a save can default it without rewriting a carried
 * Suggested label to Confirmed.
 */
export type TagLabelState = 'Confirmed' | 'Suggested';

export interface TagRef {
  tagFQN: string;
  name: string;
  source?: 'Classification' | 'Glossary';
  labelType?: TagLabelType;
  state?: TagLabelState;
}

/** Official UsageStats (openmetadata-spec type/usageDetails.json). */
export interface UsageStats {
  count?: number;
  percentileRank?: number;
}

/** Official UsageDetails: daily stats plus optional weekly/monthly rollups. */
export interface UsageDetails {
  date?: string;
  dailyStats?: UsageStats;
  weeklyStats?: UsageStats;
  monthlyStats?: UsageStats;
}

/** Official JoinedWith (generated entity/data/table.ts). */
export interface JoinedWith {
  fullyQualifiedName: string;
  joinCount: number;
}

/** Official ColumnJoins: one column's joined-with list. */
export interface ColumnJoins {
  columnName?: string;
  joinedWith?: JoinedWith[];
}

/** Official TableJoins: the table entity's `joins` field. */
export interface TableJoins {
  columnJoins?: ColumnJoins[];
  directTableJoins?: JoinedWith[];
  dayCount?: number;
  startDate?: number;
}

export interface SearchHit {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  entityType: string;
  description?: string;
  serviceType?: string;
  serviceName?: string;
  databaseName?: string;
  schemaName?: string;
  // Parent FQNs for the card breadcrumbs (D18), read from the ES
  // `_source` nested refs (`service` / `database` / `databaseSchema`
  // `fullyQualifiedName`). Absent when the source carries no such ref;
  // never derived by trimming the hit FQN.
  serviceFqn?: string;
  databaseFqn?: string;
  schemaFqn?: string;
  /**
   * ES highlight fragments per field (`hit.highlight`), carried through
   * for the card name/description highlighting (D19) and the Matches
   * section (D20). Absent when the response carries no highlight node.
   */
  highlight?: Record<string, string[]>;
  tier?: string;
  owners: EntityRef[];
  tags: TagRef[];
  domains?: EntityRef[];
  dataProducts?: EntityRef[];
  dataType?: string;
  /** Domain type (official Domain.domainType), from the ES `_source`. */
  domainType?: string;
  tableName?: string;
  // Parent table FQN for tableColumn hits, from the ES source's embedded
  // `table` reference (official column cards link to the parent table, not
  // to a column detail page, which does not exist). Absent when the source
  // carries no table reference; never derived by trimming the column FQN.
  tableFqn?: string;
  constraint?: string;
  updatedAt?: number;
  /**
   * Metric lifecycle status (official EntityStatus value, e.g. "In
   * Review") and direct parent reference, read from the ES `_source`.
   * The metrics list's flat mode renders its status column from here;
   * the tree search reads parent links through the metrics API's
   * `_source` helper instead. Absent for entity types that carry
   * neither field.
   */
  entityStatus?: string;
  parent?: EntityRef;
  /**
   * HTTP method of an API endpoint (`GET`/`POST`/…), read from the ES
   * `_source`. The endpoints list renders its request-method column
   * from here in search mode; absent for other entity types.
   */
  requestMethod?: string;
  /** Metric type / granularity / variant count, for the metrics list name column. */
  metricType?: string;
  granularity?: string;
  childrenCount?: number;
  /**
   * Usage summary from the ES `_source`, set only when the source carries
   * the `usageSummary` key (the pin explore card's `'usageSummary' in
   * source` rule). The percentile display reads weeklyStats only.
   */
  usageSummary?: UsageDetails;
  /**
   * Ranking payload (Explore D12), carried only when the search request
   * asked for it (`explain: true`): the ES `_score`, the `_explanation`
   * tree, and the `matched_queries` names. Pin's `SearchedData` passes
   * these to the card only while the ranking-details toggle is on;
   * without `explain` the server omits them and these stay absent.
   */
  score?: number;
  explanation?: SearchExplanation;
  matchedQueries?: string[];
}

/**
 * One node of an Elasticsearch `_explanation` tree (pin
 * `SearchExplanation`): the contribution value, the human-readable
 * description, and the child nodes that sum into it.
 */
export interface SearchExplanation {
  value: number;
  description: string;
  details?: SearchExplanation[];
}

export interface SearchPage {
  total: number;
  hits: SearchHit[];
  facets: SearchFacet[];
  /**
   * NLQ echo (Explore D11): pin's SearchResponse carries
   * `applied_quick_filters` on NLQ responses (a QueryFilterInterface;
   * only `fieldList` is surfaced — it names the backend-detected
   * filters). The server only sends it when it detected filters, so it
   * stays absent on keyword searches and on NLQ searches with none.
   */
  appliedQuickFilters?: { fieldList?: string[] };
}

export interface TablePartitionColumn {
  columnName: string;
  interval?: string;
  intervalType?: string;
}

export interface TablePartition {
  columns: TablePartitionColumn[];
}

/**
 * One table constraint (spec `entity/data/table.json#/definitions/tableConstraint`).
 * `constraintType` is one of PRIMARY_KEY / FOREIGN_KEY / UNIQUE /
 * DIST_KEY / CLUSTER_KEY / SORT_KEY; anything else is dropped at map
 * time because pin never renders it.
 */
export interface TableConstraint {
  constraintType: string;
  columns?: string[];
  referredColumns?: string[];
  relationshipType?: string;
}

export interface SchemaRow {
  /** Dotted path (parent.child), unique across nested rows: Ant Table needs
      a row key that cannot collide between same-named children of different
      STRUCT parents, which a bare column name cannot guarantee. */
  key: string;
  name: string;
  /** Display name when the payload carries one (pin renders
      `getEntityName` = displayName || name). */
  displayName?: string;
  /** Column constraint (pin `prepareConstraintIcon` input). */
  constraint?: string;
  dataType: string;
  description?: string;
  /** Column-level extension (pin custom-property columns). */
  extension?: Record<string, unknown>;
  /** Nested columns of a STRUCT column; absent when there are none, so no
      expand icon is drawn for leaf columns. */
  children?: SchemaRow[];
  /** Column/field tags carried by the detail payload (D-F2 read side):
      Classification and Glossary labels together, split by `source` at
      render time, following the official SchemaTable's single `TAGS`
      dataIndex shared by its Tags and Glossary Terms columns. */
  tags?: TagRef[];
  /** Fully qualified column/field name, used by the D-F2 single-column PUT
      (`PUT /v1/columns/name/{fqn}`); absent when the payload carries none. */
  fullyQualifiedName?: string;
  /** Positional path into the detail payload's row array (top-level index,
      then one index per nested `children` level): the D-F2 PATCH group
      (topic / container / searchIndex) builds its JSON Patch path from
      this instead of re-deriving indexes from the flattened rows. */
  indexPath?: number[];
}

export interface PipelineTask {
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  taskType?: string;
  sourceUrl?: string;
  downstreamTasks: string[];
  /** Classification and Glossary tags on the task (official Task.tags). */
  tags?: TagRef[];
  /** Task owners (official Task.owners). */
  owners?: EntityRef[];
}

export interface PipelineTaskStatus {
  name: string;
  executionStatus: string;
  startTime?: number;
  endTime?: number;
}

export interface CatalogPipelineStatus {
  timestamp: number;
  executionStatus: string;
  executionId?: string;
  endTime?: number;
  /** Error details when the execution failed (official PipelineStatus.error). */
  error?: { errorMessage?: string };
  taskStatus: PipelineTaskStatus[];
}

export interface MlHyperParameter {
  name: string;
  value?: string;
  description?: string;
}

export interface StoredProcedureCode {
  language?: string;
  code?: string;
}

/**
 * Table partition column (official `PartitionColumnDetails`,
 * openmetadata-spec table.json `tablePartition.columns`): the column
 * name plus its partition interval type. `interval` is not carried:
 * the PartitionedKeys widget renders name/type only.
 */
export interface PartitionColumnDetails {
  columnName: string;
  intervalType?: string;
}

/**
 * Table constraint (official generated `TableConstraint`,
 * openmetadata-spec table.json `tableConstraints`): the constraint
 * type, its columns, and — for foreign keys — the referred columns
 * plus the relationship type.
 */
export type TableConstraintType =
  | 'PRIMARY_KEY'
  | 'UNIQUE'
  | 'FOREIGN_KEY'
  | 'SORT_KEY'
  | 'DIST_KEY'
  | 'CLUSTER_KEY';

export interface AssetDetail {
  entityType: string;
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  description?: string;
  tableType?: string;
  serviceType?: string;
  service?: EntityRef;
  database?: EntityRef;
  databaseSchema?: EntityRef;
  partitions?: number;
  /**
   * E-3a preview overview rows (pin DataAssetSummaryPanelUtils
   * explore-visible builders): topic sizing, drive counts/versions, and
   * the API endpoint's parent collection. Requested via the DETAIL_ENDPOINTS
   * field sets and mapped in `api/entities.ts`; absent when the server
   * returned nothing for them.
   */
  replicationFactor?: number;
  retentionSize?: number;
  cleanupPolicies?: string[];
  maximumMessageSize?: number;
  messageSchemaType?: string;
  numberOfFiles?: number;
  numberOfSubDirectories?: number;
  fileExtension?: string;
  fileType?: string;
  fileVersion?: string;
  rowCount?: number;
  apiCollection?: EntityRef;
  sourceUrl?: string;
  scheduleInterval?: string;
  pipelineState?: string;
  project?: string;
  dashboardType?: string;
  chartType?: string;
  metricType?: string;
  unitOfMeasurement?: string;
  /** Custom unit shown when unitOfMeasurement is "Other" (official Metric.customUnitOfMeasurement). */
  customUnitOfMeasurement?: string;
  granularity?: string;
  dataModelType?: string;
  algorithm?: string;
  target?: string;
  /** ML model server URL (pin getMlModelOverview `server` row). */
  server?: string;
  /** ML model dashboard ref (pin getMlModelOverview `dashboard` row). */
  dashboard?: EntityRef;
  prefix?: string;
  numberOfObjects?: number;
  size?: number;
  fileFormats?: string[];
  indexType?: string;
  storedProcedureType?: string;
  storedProcedureCode?: StoredProcedureCode;
  apiEndpointUrl?: string;
  apiRequestMethod?: string;
  apiRequestSchema?: Record<string, unknown>;
  apiResponseSchema?: Record<string, unknown>;
  parent?: EntityRef;
  children?: EntityRef[];
  charts?: EntityRef[];
  dataModels?: EntityRef[];
  mlFeatures?: SchemaRow[];
  /** Raw mlFeatures payload (full feature objects): the mapped
      SchemaRow drops `featureAlgorithm` / `source`, so a feature
      write-back that must preserve them patches from this copy. */
  mlFeaturesRaw?: unknown[];
  mlHyperParameters?: MlHyperParameter[];
  tasks?: PipelineTask[];
  pipelineStatus?: CatalogPipelineStatus;
  owners: EntityRef[];
  followers?: EntityRef[];
  votes?: EntityVotes;
  tags: TagRef[];
  domains: EntityRef[];
  /**
   * Data products the asset belongs to (spec `dataProducts`,
   * entityReferenceList). Requested via DETAIL_ENDPOINTS and mapped by
   * `fetchAssetDetail`; D-2 batch 2 added the mapping (A7 §5 called the
   * field absent — the server carries it, the product never asked).
   */
  dataProducts?: EntityRef[];
  /**
   * Certification (spec `certification`, assetCertification
   * `{tagLabel}`). Requested and mapped like `dataProducts`; pin reads
   * the field, not the `Certification.*` tag in `tags`.
   */
  certification?: { tagLabel?: TagRef };
  schemaRows: SchemaRow[];
  schemaLabel: string;
  /** Topic message-schema text (TEXT view source). */
  schemaText?: string;
  extension?: Record<string, unknown>;
  /**
   * Usage summary (VIEW_USAGE-gated field, requested only when the
   * viewer may see usage, on the four header-percentile entity types)
   * and table joins (VIEW_BASIC field, requested unconditionally for
   * table detail). Both feed the C-14 surfaces: the header percentile
   * and the Frequently Joined widget.
   */
  usageSummary?: UsageDetails;
  joins?: TableJoins;
  /**
   * Table widgets (D-2 batch 5a): partition columns, constraints, and
   * aliases, requested via the table field set and mapped in
   * `api/entities.ts`. All three are table-only; absent when the server
   * returned nothing for them.
   */
  tablePartition?: TablePartition;
  tableConstraints?: TableConstraint[];
  aliases?: string[];
  /**
   * Owning test suite (spec `table.json#/testSuite`): the AssetHealth
   * data-quality / observability rows read their summary and incidents
   * through this suite id. Requested via the table field set.
   */
  testSuite?: EntityRef;
  /**
   * Related metrics (spec `metric.json#/relatedMetrics`): the
   * RelatedMetrics widget's rows. Requested via the metric field set.
   */
  relatedMetrics?: EntityRef[];
  /** Soft-delete flag; the table_queries tab skips its fetch for deleted tables (pin isTableDeleted). */
  deleted?: boolean;
}
