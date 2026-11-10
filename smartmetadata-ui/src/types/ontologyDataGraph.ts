/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';
import type { OntologyGraphData } from '@/features/ontology/ontologyGraph';

/**
 * Data-mode + inspector types for the ontology browser (G-18 stage 2).
 * The product has no `generated/` tree, so the shapes are hand-added with
 * their spec citations (REVIEW-W3-G-STAGES §2.4 conditions 8/9); the field
 * mapping is live-verify-before-trust (ADR:2026-11-10-g18-stage2-data-mode).
 *
 * Official prototypes (pin a3012259ca, openmetadata-ui):
 * - generated/type/termRelation.ts — TermRelation
 * - generated/api/data/ontologySummary.ts — OntologySummary
 * - generated/api/data/ontologyDataGraph.ts — OntologyDataGraph
 * - generated/api/data/nativeOntologyDataGraphPage.ts (+ PageRequest) —
 *   NativeOntologyDataGraphPage / LoadedPrefix / AssetBinding
 * - components/OntologyExplorer/OntologyExplorer.interface.ts — graph
 *   node/edge shapes incl. LineageNote, GraphSettings
 * - utils/governance/ontology/OntologyNativeDataGraph.utils.ts — page
 *   failure / retry / view shapes
 * - components/OntologyExplorer/OntologyInferenceExplanationPanel.tsx —
 *   OntologyInferenceExplanation
 */

/** TermRelation (openmetadata-spec type/termRelation.json). */
export interface TermRelation {
  id?: string;
  term: EntityRef;
  /** Typed relation of the entry (default 'relatedTo'). */
  relationType?: string;
  relationshipType?: EntityRef;
  provenance?: 'AiSuggested' | 'Imported' | 'Inferred' | 'Manual';
  status?: string;
  createdAt?: number;
  createdBy?: string;
}

/** One ranked term-to-asset cluster (ontologyDataGraph.json). */
export interface OntologyAssetCluster {
  term: EntityRef;
  assetCount: number;
  assets: EntityRef[];
}

/** One bounded relation edge (api/data/glossaryTermRelationGraphEdge.json). */
export interface OntologyDataGraphEdge {
  id: string;
  from: string;
  to: string;
  relationType: string;
  relationshipType?: EntityRef;
  provenance?: 'AiSuggested' | 'Imported' | 'Inferred' | 'Manual';
  status?: string;
  createdBy?: string;
  createdAt?: number;
}

/** OntologyDataGraph (openmetadata-spec api/data/ontologyDataGraph.json). */
export interface OntologyDataGraph {
  clusters: OntologyAssetCluster[];
  seedTermIds: string[];
  edges: OntologyDataGraphEdge[];
  lineageEdges: Array<{ fromEntity: string; toEntity: string }>;
  paging: { total?: number; offset?: number; limit?: number; after?: string };
}

/** OntologySummary (openmetadata-spec api/data/ontologySummary.json). */
export interface OntologySummary {
  totalTerms: number;
  totalRelations: number;
  isolatedTerms: number;
  connectedPercentage: number;
  isolatedPreview: EntityRef[];
  paging?: { total?: number; offset?: number; limit?: number };
}

/** Graph settings (OntologyExplorer.interface.ts: GraphSettings). */
export interface OntologyGraphSettings {
  layout: 'Hierarchical' | 'Circular';
  showEdgeLabels: boolean;
}

export const DEFAULT_ONTOLOGY_GRAPH_SETTINGS: OntologyGraphSettings = {
  layout: 'Hierarchical',
  showEdgeLabels: true,
};

/** Data-mode constants (OntologyExplorer.constants.ts). */
export const DATA_MODE_SEED_PAGE_SIZE = 12;
export const DATA_MODE_ASSET_PREVIEW_SIZE = 4;
export const DATA_MODE_CONNECTED_TERM_LIMIT = 48;
export const DATA_MODE_EDGE_LIMIT = 100;
export const DATA_MODE_ASSET_LOAD_PAGE_SIZE = 6;
export const DATA_MODE_ASSET_MAX_LOAD = 100;
export const DATA_MODE_MAX_RENDER_COUNT = 60;
export const ONTOLOGY_HEALTH_PREVIEW_SIZE = 5;
export const NATIVE_CLUSTER_PAGE_SIZE = 12;
/** The server leaves this size to the client (pin ADR 2026-10-19). */
export const NATIVE_ASSET_PAGE_SIZE = 25;
export const NATIVE_CONTEXT_CONCEPT_LIMIT = 60;
export const NATIVE_INFERRED_RELATION_TYPE = 'inferred';
export const NATIVE_LINEAGE_RELATION_TYPE = 'observedLineage';
/** Pin ASSET_RELATION_TYPE (graphBuilders.ts): the tagged-with relation. */
export const ASSET_RELATION_TYPE = 'hasGlossaryTerm';
export const ASSET_BINDING_EDGE_KIND = 'assetBinding';

/** Native page request (generated/api/data/nativeOntologyDataGraphPageRequest.ts). */
export interface LoadedPrefix {
  bindingRevision: number;
  conceptId: string;
  throughAssetId?: string;
}

export type NativePageKind = 'bindings' | 'clusters' | 'topology';

export interface NativeOntologyDataGraphPageRequest {
  loaded: LoadedPrefix[];
  page: {
    kind: NativePageKind;
    after?: string;
    conceptId?: string;
    limit?: number;
    offset?: number;
  };
}

/** One bound column on a native asset row. */
export interface NativeColumnBinding {
  columnPath: string[];
  propertyId: string;
  property?: EntityRef;
  state?: string;
}

export interface NativeAssetBinding {
  asset: EntityRef;
  assetId: string;
  assetType: string;
  columns: NativeColumnBinding[];
  serviceType?: string;
}

export interface NativeOntologyAssetCluster {
  concept: EntityRef;
  assetCount: number;
  assets: Array<{ asset: EntityRef; columnCount: number; serviceType?: string }>;
  after?: string;
}

export interface NativeConceptEdge {
  fromConceptId: string;
  toConceptId: string;
  propertyIri: string;
  label?: string;
}

export interface NativeTopologyPage {
  edges: NativeConceptEdge[];
  lineageEdges: Array<{ fromEntity: string; toEntity: string }>;
  after?: string;
}

/** Native page response (generated/api/data/nativeOntologyDataGraphPage.ts). */
export interface NativeOntologyDataGraphPage {
  bindings?: { after?: string; assets: NativeAssetBinding[]; revision: number };
  clusters?: NativeOntologyAssetCluster[];
  contextFull: boolean;
  loaded: LoadedPrefix[];
  nextClusterOffset?: number;
  topology: NativeTopologyPage;
}

export interface NativeAssetRow {
  id: string;
  asset: EntityRef;
  columnCount: number;
  serviceType?: string;
}

export interface NativeCluster {
  concept: EntityRef;
  assetCount: number;
  assets: NativeAssetRow[];
  after?: string;
}

export interface NativeTopology {
  conceptEdges: NativeConceptEdge[];
  lineageEdges: Array<{ fromEntity: string; toEntity: string }>;
}

export interface NativeDataGraph {
  clusters: NativeCluster[];
  loaded: LoadedPrefix[];
  nextClusterOffset?: number;
  contextFull: boolean;
  topology: NativeTopology;
}

export const EMPTY_NATIVE_TOPOLOGY: NativeTopology = { conceptEdges: [], lineageEdges: [] };

export const EMPTY_NATIVE_DATA_GRAPH: NativeDataGraph = {
  clusters: [],
  loaded: [],
  contextFull: false,
  topology: EMPTY_NATIVE_TOPOLOGY,
};

export type PageFailure = 'invalid' | 'stale' | 'other';

export type NativeDataGraphRetry =
  | { kind: 'reload' }
  | { kind: 'clusters' }
  | { kind: 'assets'; conceptId: string };

export interface NativeDataGraphFailure {
  reason: PageFailure;
  retry: NativeDataGraphRetry;
}

export interface NativeDataGraphView {
  graph: NativeDataGraph;
  isLoading: boolean;
  isLoadingClusters: boolean;
  loadingConceptIds: ReadonlySet<string>;
  failure?: NativeDataGraphFailure;
}

/** Lineage note on a data-mode asset row (OntologyExplorer.interface.ts). */
export interface LineageNote {
  direction: 'downstream' | 'upstream';
  label: string;
}

/** Health summary (OntologyStudio.utils.ts: getOntologyHealthSummary). */
export interface OntologyHealthSummary {
  connectedPercent: number;
  connectedTermCount: number;
  isolatedTerms: OntologyGraphData['nodes'];
  totalTermCount: number;
}

/** One data-property row of the concept inspector. */
export interface OntologyConceptPropertyRow {
  property: { id: string; name: string; displayName?: string; iri?: string; datatype?: string };
  datatype: string;
  inheritedFrom?: { id: string; name: string; displayName?: string };
}

/** One relation row of the concept inspector. */
export interface OntologyConceptRelationRow {
  direction: 'outgoing' | 'incoming';
  other: { id: string; name: string; displayName?: string };
  relation: { key: string; kind: string; label: string };
}

/** Inference explanation (api/data/ontologyInferenceExplanation.json). */
export interface OntologyInferenceExplanation {
  glossary?: EntityRef;
  statement?: { subject?: string; predicate?: string; object?: string };
  asserted?: boolean;
  inferred?: boolean;
  explanations: Array<{
    graphUri: string;
    rule: { name: string; displayName?: string; description?: string };
    tripleCount: number;
    lastMaterializedAt?: number;
  }>;
}

export interface OntologyInferenceExplanationRequest {
  glossaryId: string;
  statement: {
    subjectIri: string;
    predicateIri: string;
    objectIri: string;
    objectKind: 'IRI';
  };
}
