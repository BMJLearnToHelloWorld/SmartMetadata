/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';
import { MAX_RESPONSE_CHARS, defaultBudgetChars, fitWithin, serializedLength } from './budget.js';
import { clampInt } from './limits.js';

/**
 * `root_cause_analysis`: which upstream assets are failing, and what the
 * failures hit downstream.
 *
 * The data-quality lineage walk already returns only assets with failing
 * tests — the nodes in its response ARE the failing set — so the analysis
 * splits them into the root and the upstream failures, then reads each
 * node's failing test cases for the detail. Downstream impact is only
 * computed when something actually failed.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

export const RCA_DEPTH_DEFAULT = 3;
export const RCA_DEPTH_MIN = 1;
export const RCA_DEPTH_MAX = 10;
/** Cap on the failing test cases read per node. */
export const RCA_TEST_CASES_LIMIT = 100;

export function clampRcaDepth(value: unknown): number {
  return clampInt(
    typeof value === 'number' ? value : undefined,
    RCA_DEPTH_MIN,
    RCA_DEPTH_MAX,
    RCA_DEPTH_DEFAULT,
  );
}

/**
 * The entity FQN an entity link names: the second `::` segment, whether or
 * not the link also names a column.
 * `<#E::table::svc.db.schema.tbl>` → `svc.db.schema.tbl`
 * `<#E::table::svc.db.schema.tbl::columns::col>` → `svc.db.schema.tbl`
 */
export function entityFqnFromEntityLink(link: unknown): string | null {
  if (typeof link !== 'string') {
    return null;
  }
  const trimmed = link.trim();
  if (!trimmed.startsWith('<#E::')) {
    return null;
  }
  const segments = trimmed.slice(4, trimmed.endsWith('>') ? -1 : undefined).split('::');
  const fqn = segments[1];
  return segments.length >= 2 && fqn !== undefined && fqn !== '' ? fqn : null;
}

/** Search-document keys a data-quality node never needs. */
export const DETAILED_EXCLUDE_KEYS = [
  'id',
  'version',
  'updatedAt',
  'updatedBy',
  'usageSummary',
  'followers',
  'votes',
  'lifeCycle',
  'sourceHash',
  'processedLineage',
  'totalVotes',
  'fqnParts',
  'service_suggest',
  'column_suggest',
  'schema_suggest',
  'database_suggest',
  'upstreamLineage',
  'entityRelationship',
  'changeSummary',
  'fqnHash',
  'columns',
  'schemaDefinition',
  'queries',
  'sourceUrl',
  'locationPath',
  'customMetrics',
  'tierSources',
  'tagSources',
  'descriptionSources',
  'columnDescriptionStatus',
  'columnNamesFuzzy',
  'descriptionStatus',
  'domains',
  // Vector-index noise: chunk bookkeeping, never entity facts.
  'embeddings',
  'embedding',
  'textToEmbed',
  'textToLLMContext',
  'fingerprint',
  'chunkCount',
  'chunkIndex',
] as const;

const EXCLUDED = new Set<string>(DETAILED_EXCLUDE_KEYS);

/** The entity-level fields a lineage node keeps; the description stays whole. */
export function slimNodeEntity(doc: Record<string, unknown>): Record<string, unknown> {
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!EXCLUDED.has(key)) {
      slim[key] = value;
    }
  }
  return slim;
}

/** Per-node bulk a downstream node never reads: identity is the answer. */
export const NODE_BULK_FIELDS = [
  'aiContext',
  'columnNames',
  'columns',
  'schemaDefinition',
  'sampleData',
  'profile',
] as const;

function withoutBulkFields(entity: Record<string, unknown>): Record<string, unknown> {
  const slim = { ...entity };
  for (const field of NODE_BULK_FIELDS) {
    delete slim[field];
  }
  return slim;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function slimLineageRef(ref: unknown): Record<string, unknown> | undefined {
  if (!isRecord(ref)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  if (ref.id !== undefined && ref.id !== null) {
    out.id = ref.id;
  }
  if (ref.fullyQualifiedName !== undefined && ref.fullyQualifiedName !== null) {
    out.fullyQualifiedName = ref.fullyQualifiedName;
  }
  if (ref.type !== undefined && ref.type !== null) {
    out.type = ref.type;
  }
  return out;
}

function relationshipType(pipeline: unknown): string {
  if (isRecord(pipeline) && pipeline.type !== undefined && pipeline.type !== null && pipeline.name !== undefined && pipeline.name !== null) {
    return `${String(pipeline.type)}:${String(pipeline.name)}`;
  }
  return 'sql';
}

/**
 * An edge, slimmed: endpoints as identity triples, the pipeline folded
 * into `relationshipType`, the SQL kept in full (cutting it would hide the
 * transformation under investigation), and a `sqlQueryKey` pointer carried
 * when the backend deduplicated the SQL away.
 */
export function slimEdge(
  edge: Record<string, unknown>,
  includeColumns: boolean,
): Record<string, unknown> {
  const slim: Record<string, unknown> = {};
  const from = slimLineageRef(edge.fromEntity);
  if (from) {
    slim.fromEntity = from;
  }
  const to = slimLineageRef(edge.toEntity);
  if (to) {
    slim.toEntity = to;
  }
  slim.relationshipType = relationshipType(edge.pipeline);
  if (edge.source !== undefined && edge.source !== null) {
    slim.source = edge.source;
  }
  if (edge.assetEdges !== undefined && edge.assetEdges !== null) {
    slim.assetEdges = edge.assetEdges;
  }
  if (edge.tempLineageTables !== undefined && edge.tempLineageTables !== null) {
    slim.tempLineageTables = edge.tempLineageTables;
  }
  if (typeof edge.description === 'string' && edge.description !== '') {
    slim.description = edge.description;
  }
  if (typeof edge.sqlQuery === 'string' && edge.sqlQuery !== '') {
    slim.sqlQuery = edge.sqlQuery;
  }
  if (edge.sqlQueryKey !== undefined && edge.sqlQueryKey !== null) {
    slim.sqlQueryKey = edge.sqlQueryKey;
  }
  if (includeColumns && edge.columns !== undefined && edge.columns !== null) {
    slim.columns = edge.columns;
  }
  return slim;
}

export function slimEdges(
  rawEdges: unknown,
  includeColumns: boolean,
): Array<Record<string, unknown>> {
  if (!Array.isArray(rawEdges)) {
    return [];
  }
  return rawEdges
    .filter((edge): edge is Record<string, unknown> => isRecord(edge))
    .map((edge) => slimEdge(edge, includeColumns));
}

export function slimEdgeMap(
  rawEdges: unknown,
  includeColumns: boolean,
): Record<string, Record<string, unknown>> {
  const slim: Record<string, Record<string, unknown>> = {};
  if (isRecord(rawEdges)) {
    for (const [id, edge] of Object.entries(rawEdges)) {
      if (isRecord(edge)) {
        slim[id] = slimEdge(edge, includeColumns);
      }
    }
  }
  return slim;
}

export interface TestCaseResults {
  testCaseResults?: Array<Record<string, unknown>>;
  testSuiteId?: string;
  resultsTruncated?: boolean;
  note?: string;
  unavailable?: string;
  failingTestCount?: number;
  complete?: boolean;
  completeNote?: string;
}

interface TestCaseListResponse {
  data?: Array<Record<string, unknown>>;
  paging?: { total?: number };
}

/**
 * Failing tests for one node's suite, and — when it could not answer — why.
 * An empty result used to mean three different things (no suite attached,
 * the backend failed, no failing tests); next to a `status: "failed"`
 * verdict those are opposite meanings, so each case says which it is.
 *
 * The REST list filter matches on the test case's LATEST result status, so
 * a test case whose latest run passed is not reported as failing — the
 * "currently failing" reading. The server-side time-series filter applies
 * Failed before taking latest, which can surface a stale failure.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */
export async function failingTestsForNode(
  client: RestClient,
  node: Record<string, unknown>,
): Promise<TestCaseResults> {
  const result: TestCaseResults = {};
  const testSuite = isRecord(node.testSuite) ? node.testSuite : undefined;
  const testSuiteId = testSuite?.id;
  if (typeof testSuiteId !== 'string' || testSuiteId === '') {
    result.note = 'No test suite is attached to this asset, so no test results could be read.';
    return result;
  }
  const nodeFqn = typeof node.fullyQualifiedName === 'string' ? node.fullyQualifiedName : null;
  try {
    const response = await client.request<TestCaseListResponse>('/v1/dataQuality/testCases', {
      query: {
        testSuiteId,
        testCaseStatus: 'Failed',
        fields: 'testCaseResult',
        limit: RCA_TEST_CASES_LIMIT,
      },
    });
    const data = response.data ?? [];
    // The suite id alone cannot scope the search: suite membership can
    // change between a test case's results, so filter on the entity link.
    const matched = data.filter(
      (testCase) => entityFqnFromEntityLink(testCase.entityLink) === nodeFqn,
    );
    const results = matched
      .map((testCase) => testCase.testCaseResult)
      .filter((value): value is Record<string, unknown> => isRecord(value));
    if (results.length > 0) {
      result.testCaseResults = results;
      result.testSuiteId = testSuiteId;
      const total = response.paging?.total;
      if (typeof total === 'number' && total > data.length) {
        result.resultsTruncated = true;
      }
    }
  } catch {
    result.unavailable =
      'The test-result backend could not be reached, so which tests are failing here is' +
      ' unknown. This is not the same as none failing.';
  }
  return result;
}

/**
 * How many tests are failing and whether that is all of them. Only the
 * lookup knows whether it had to leave test cases out, so completeness
 * comes from it rather than from the count.
 */
export function annotateCompleteness(
  tests: TestCaseResults,
  failingCount: number,
  truncated: boolean,
): void {
  tests.failingTestCount = failingCount;
  tests.complete = !truncated;
  if (truncated) {
    tests.completeNote =
      `The test-result lookup stops at ${RCA_TEST_CASES_LIMIT} test cases and more matched, so more may be` +
      " failing. Use search_metadata with entityType='testCase' and a filter on" +
      ' originEntityFQN for the full set.';
  }
}

export function summarizeRca(fqn: string, upstreamFailures: number, rootFails: boolean): string {
  let origin: string;
  if (upstreamFailures > 0) {
    origin = `Found ${upstreamFailures} failing upstream entity(ies) — the likely root cause is upstream.`;
  } else if (rootFails) {
    origin = 'No upstream entity has failing tests, so the failures originate on this asset itself.';
  } else {
    origin = 'No failing tests found on this asset or upstream of it.';
  }
  return `Analyzed upstream causes and downstream impacts for '${fqn}'. ${origin}`;
}

export interface RcaArgs {
  fqn: string;
  entityType: string;
  upstreamDepth: number;
  downstreamDepth: number;
  queryFilter?: string;
  includeDeleted: boolean;
  includeColumnLineage: boolean;
}

export async function analyzeRootCause(
  client: RestClient,
  args: RcaArgs,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {
    fqn: args.fqn,
    upstreamDepth: args.upstreamDepth,
    downstreamDepth: args.downstreamDepth,
  };
  // The REST endpoint adds one to the depth it receives before calling the
  // service, while the tool contract counts levels upstream of the root —
  // so the REST call takes one less. Depth 1 means the root alone.
  const restUpstreamDepth = Math.max(0, args.upstreamDepth - 1);
  const dq = await client.request<Record<string, unknown>>('/v1/lineage/getDataQualityLineage', {
    query: {
      fqn: args.fqn,
      upstreamDepth: restUpstreamDepth,
      ...(args.queryFilter ? { query_filter: args.queryFilter } : {}),
      includeDeleted: args.includeDeleted,
    },
  });
  const upstreamAnalysis = await buildUpstreamAnalysis(client, dq, args);
  result.upstreamAnalysis = upstreamAnalysis;
  const failureCount = typeof upstreamAnalysis.failingUpstreamNodesCount === 'number'
    ? upstreamAnalysis.failingUpstreamNodesCount
    : 0;
  const rootFails = upstreamAnalysis.rootHasFailingTests === true;
  const hasFailures = failureCount > 0 || rootFails;
  result.downstreamAnalysis = hasFailures
    ? await buildDownstreamAnalysis(client, args)
    : { reason: 'No failures found in upstream analysis, downstream impact analysis not needed' };
  result.status = hasFailures ? 'failed' : 'success';
  result.summary = summarizeRca(args.fqn, failureCount, rootFails);
  return enforceSizeBudget(result);
}

async function buildUpstreamAnalysis(
  client: RestClient,
  dq: Record<string, unknown>,
  args: RcaArgs,
): Promise<Record<string, unknown>> {
  const upstreamAnalysis: Record<string, unknown> = {};
  const rawEdges = Array.isArray(dq.edges) ? dq.edges : [];
  const allNodes = (Array.isArray(dq.nodes) ? dq.nodes : [])
    .filter((node): node is Record<string, unknown> => isRecord(node))
    .map((node) => slimNodeEntity(node));
  const nodes: Array<Record<string, unknown>> = [];
  let rootNode: Record<string, unknown> | null = null;
  for (const node of allNodes) {
    if (node.fullyQualifiedName === args.fqn) {
      rootNode = node;
    } else {
      nodes.push(node);
    }
  }
  // The DQ walk includes the analysed entity among its own nodes when it
  // has failing tests; counting it as upstream would report an upstream
  // failure that does not exist.
  const rootFails = rootNode !== null;
  upstreamAnalysis.rootHasFailingTests = rootFails;
  if (rootNode) {
    const rootTests = await failingTestsForNode(client, rootNode);
    if (Array.isArray(rootTests.testCaseResults)) {
      annotateCompleteness(
        rootTests,
        rootTests.testCaseResults.length,
        rootTests.resultsTruncated === true,
      );
      delete rootTests.resultsTruncated;
    }
    upstreamAnalysis.rootFailingTests = rootTests;
  }
  upstreamAnalysis.failingUpstreamNodesCount = nodes.length;
  if (nodes.length > 0) {
    for (const node of nodes) {
      node.failingTestCases = await failingTestsForNode(client, node);
    }
    upstreamAnalysis.failingUpstreamNodes = nodes;
  }
  upstreamAnalysis.failingUpstreamEdgesCount = rawEdges.length;
  upstreamAnalysis.failingUpstreamEdges = slimEdges(rawEdges, args.includeColumnLineage);
  upstreamAnalysis.description = 'Upstream entities that may be causing data quality failures';
  if (nodes.length === 0) {
    await addUpstreamProducers(client, upstreamAnalysis, args);
  }
  return upstreamAnalysis;
}

/**
 * When nothing upstream is failing, the DQ walk returns no upstream edges
 * at all — so a caller asking "what could be causing this?" learns nothing
 * about what feeds the asset. The producers are context, not the answer:
 * a lineage lookup failure must not fail the analysis.
 */
async function addUpstreamProducers(
  client: RestClient,
  upstreamAnalysis: Record<string, unknown>,
  args: RcaArgs,
): Promise<void> {
  try {
    // The plain lineage endpoint takes the entity type itself in the path,
    // the same shape the existing get_lineage handler already uses.
    const lineage = await client.request<Record<string, unknown>>(
      `/v1/lineage/${encodeURIComponent(args.entityType)}/name/${encodeURIComponent(args.fqn)}`,
      { query: { upstreamDepth: args.upstreamDepth, downstreamDepth: 0 } },
    );
    const producers: Array<Record<string, unknown>> = [];
    if (Array.isArray(lineage.nodes)) {
      for (const node of lineage.nodes) {
        if (isRecord(node)) {
          producers.push({
            fullyQualifiedName: node.fullyQualifiedName,
            type: node.type,
          });
        }
      }
    }
    upstreamAnalysis.upstreamProducers = producers;
    upstreamAnalysis.upstreamProducersNote =
      'No upstream entity has failing tests. These are the assets that feed this one, so the' +
      ' cause is more likely to be local (a load, a transformation) than inherited.';
  } catch {
    // Producers are context, not the answer.
  }
}

async function buildDownstreamAnalysis(
  client: RestClient,
  args: RcaArgs,
): Promise<Record<string, unknown>> {
  const downstreamAnalysis: Record<string, unknown> = {
    description: 'Downstream entities that may be impacted by the identified failures',
  };
  try {
    const response = await client.request<Record<string, unknown>>(
      '/v1/lineage/getLineage/downstream',
      {
        query: {
          fqn: args.fqn,
          upstreamDepth: 0,
          downstreamDepth: args.downstreamDepth,
          ...(args.queryFilter ? { query_filter: args.queryFilter } : {}),
          includeDeleted: args.includeDeleted,
          type: args.entityType,
        },
      },
    );
    if (isRecord(response.nodes)) {
      const nodeIds = Object.keys(response.nodes);
      // The traversal includes the analysed asset itself at nodeDepth 0;
      // counting it would overstate the blast radius by one on every call.
      downstreamAnalysis.downstreamImpactedNodesCount = Math.max(0, nodeIds.length - 1);
      const slimNodes: Record<string, Record<string, unknown>> = {};
      for (const id of nodeIds) {
        const info = response.nodes[id];
        if (isRecord(info)) {
          const slim: Record<string, unknown> = {};
          if (isRecord(info.entity)) {
            slim.entity = withoutBulkFields(slimNodeEntity(info.entity));
          }
          if (info.nodeDepth !== undefined && info.nodeDepth !== null) {
            slim.nodeDepth = info.nodeDepth;
          }
          slimNodes[id] = slim;
        }
      }
      downstreamAnalysis.downstreamNodes = slimNodes;
    }
    if (response.downstreamEdges !== undefined && response.downstreamEdges !== null) {
      const edges = slimEdgeMap(response.downstreamEdges, args.includeColumnLineage);
      downstreamAnalysis.downstreamImpactedEdgesCount = Object.keys(edges).length;
      downstreamAnalysis.downstreamEdges = edges;
    }
  } catch (error) {
    downstreamAnalysis.error =
      `Failed to analyze downstream impact: ${error instanceof Error ? error.message : String(error)}`;
  }
  return downstreamAnalysis;
}

/**
 * Keeps RCA under the dispatch cap by returning fewer edges (the
 * SQL-bearing, heaviest part) in each direction, never by cutting an
 * edge's SQL or dropping the whole analysis to a bare hint. Nodes, counts
 * and summary are preserved, and a per-direction "...Returned" marker
 * records how many edges were withheld. Only when the non-edge content
 * alone already exceeds the budget does it fall back to the minimal
 * identity hint.
 */
export function enforceSizeBudget(result: Record<string, unknown>): Record<string, unknown> {
  if (serializedLength(result) <= MAX_RESPONSE_CHARS) {
    return result;
  }
  const upstream = isRecord(result.upstreamAnalysis) ? result.upstreamAnalysis : undefined;
  const downstream = isRecord(result.downstreamAnalysis) ? result.downstreamAnalysis : undefined;
  const available = defaultBudgetChars() - edgeFreeOverhead(result, upstream, downstream);
  if (available <= 0) {
    return oversizedHint(result);
  }
  fitEdgeLists(upstream, downstream, available);
  result.truncated = true;
  return result;
}

function edgeFreeOverhead(
  result: Record<string, unknown>,
  upstream: Record<string, unknown> | undefined,
  downstream: Record<string, unknown> | undefined,
): number {
  const upEdges = upstream?.failingUpstreamEdges;
  const downEdges = downstream?.downstreamEdges;
  if (upstream) {
    delete upstream.failingUpstreamEdges;
  }
  if (downstream) {
    delete downstream.downstreamEdges;
  }
  const overhead = serializedLength(result);
  if (upstream && upEdges !== undefined) {
    upstream.failingUpstreamEdges = upEdges;
  }
  if (downstream && downEdges !== undefined) {
    downstream.downstreamEdges = downEdges;
  }
  return overhead;
}

function edgeValues(
  analysis: Record<string, unknown> | undefined,
  key: string,
): Array<Record<string, unknown>> {
  if (!analysis) {
    return [];
  }
  const edges = analysis[key];
  if (Array.isArray(edges)) {
    return edges.filter((edge): edge is Record<string, unknown> => isRecord(edge));
  }
  if (isRecord(edges)) {
    return Object.values(edges).filter((edge): edge is Record<string, unknown> => isRecord(edge));
  }
  return [];
}

/**
 * Splits the budget across the two directions and reclaims the other
 * direction's unused budget, so an asymmetric analysis (RCA commonly has
 * only upstream failing edges) can use the whole budget instead of being
 * capped at half.
 */
function fitEdgeLists(
  upstream: Record<string, unknown> | undefined,
  downstream: Record<string, unknown> | undefined,
  available: number,
): void {
  const upEdges = edgeValues(upstream, 'failingUpstreamEdges');
  const downEdges = edgeValues(downstream, 'downstreamEdges');
  const half = Math.floor(available / 2);
  let up = fitWithin(upEdges, half);
  let down = fitWithin(downEdges, available - up.usedChars);
  if (down.usedChars < half && up.count < upEdges.length) {
    up = fitWithin(upEdges, available - down.usedChars);
  }
  trimEdges(upstream, 'failingUpstreamEdges', up.count);
  trimEdges(downstream, 'downstreamEdges', down.count);
}

function trimEdges(
  analysis: Record<string, unknown> | undefined,
  key: string,
  count: number,
): void {
  if (!analysis) {
    return;
  }
  const edges = analysis[key];
  if (Array.isArray(edges) && count < edges.length) {
    analysis[key] = edges.slice(0, count);
    analysis[`${key}Returned`] = count;
  } else if (isRecord(edges)) {
    const keys = Object.keys(edges);
    if (count < keys.length) {
      const kept: Record<string, unknown> = {};
      for (const k of keys.slice(0, count)) {
        kept[k] = edges[k];
      }
      analysis[key] = kept;
      analysis[`${key}Returned`] = count;
    }
  }
}

function oversizedHint(result: Record<string, unknown>): Record<string, unknown> {
  const hint: Record<string, unknown> = {};
  for (const key of ['fqn', 'upstreamDepth', 'downstreamDepth', 'status', 'summary']) {
    if (result[key] !== undefined) {
      hint[key] = result[key];
    }
  }
  hint.truncated = true;
  hint.message =
    'Root cause analysis result exceeds the size budget. Reduce upstreamDepth/downstreamDepth, ' +
    'or leave includeColumnLineage off, to get a smaller response.';
  return hint;
}
