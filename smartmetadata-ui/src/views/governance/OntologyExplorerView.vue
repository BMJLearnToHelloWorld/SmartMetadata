<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Empty, Form, Input, Radio, Select, Space, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import {
  createOntology,
  getOntology,
  getOntologyConcept,
  getOntologyConceptBindings,
  getOntologyPackSample,
  listOntologyAxioms,
  listOntologyConcepts,
  listOntologyProperties,
  listOntologyPacks,
  listOntologyReleases,
} from '@/api/ontology';
import { getGlossaryTerm, getGlossaryTermAssets, getGlossaryTermsByIds, getOntologyDataGraph, getOntologySummary } from '@/api/glossaryTerms';
import { listAllRelationshipTypes, type RelationshipType } from '@/api/relationshipTypes';
import type {
  Ontology,
  OntologyAxiom,
  OntologyConcept,
  OntologyConceptBinding,
  OntologyPack,
  OntologyPackSample,
  OntologyProperty,
  OntologyRelease,
} from '@/types/ontology';
import type { Glossary, GlossaryTerm } from '@/types/governance';
import {
  ASSET_RELATION_TYPE,
  DATA_MODE_ASSET_LOAD_PAGE_SIZE,
  DATA_MODE_ASSET_MAX_LOAD,
  DATA_MODE_ASSET_PREVIEW_SIZE,
  DATA_MODE_CONNECTED_TERM_LIMIT,
  DATA_MODE_EDGE_LIMIT,
  DATA_MODE_SEED_PAGE_SIZE,
  DEFAULT_ONTOLOGY_GRAPH_SETTINGS,
  ONTOLOGY_HEALTH_PREVIEW_SIZE,
  type OntologyGraphSettings,
  type OntologySummary,
} from '@/types/ontologyDataGraph';
import { usePermissionStore } from '@/stores/permissions';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityRef } from '@/types/api';
import OntologyGraphCanvas from '@/features/ontology/OntologyGraphCanvas.vue';
import OntologyTreeView from '@/features/ontology/OntologyTreeView.vue';
import OntologyHealthPanel from '@/features/ontology/OntologyHealthPanel.vue';
import OntologyConceptInspector from '@/features/ontology/OntologyConceptInspector.vue';
import OntologyAuthoringInspector from '@/features/ontology/OntologyAuthoringInspector.vue';
import OntologyEntityPanel from '@/features/ontology/OntologyEntityPanel.vue';
import OntologyRelationDetailsPanel from '@/features/ontology/OntologyRelationDetailsPanel.vue';
import OntologyDataGraph from '@/features/ontology/OntologyDataGraph.vue';
import OntologyNativeDataMode from '@/features/ontology/OntologyNativeDataMode.vue';
import OntologyGraphModeTabs from '@/features/ontology/OntologyGraphModeTabs.vue';
import GraphSettingsPanel from '@/features/ontology/GraphSettingsPanel.vue';
import {
  AggregateCapacityError,
  buildAggregateGraph,
  listAllGlossaries,
  listAllOntologies,
  loadAggregateModels,
  loadOntologyModel,
} from '@/features/ontology/ontologyAggregate';
import {
  buildOntologyModelGraph,
  getModelRelations,
  type OntologyGraphData,
  type OntologyGraphEdge,
  type OntologyGraphNode,
  type OntologyStudioModel,
} from '@/features/ontology/ontologyGraph';
import { fetchAllGlossariesGraphData, fetchGlossaryGraphData } from '@/features/ontology/glossaryGraph';
import { computeOntologySearchHighlight } from '@/features/ontology/ontologySearchHighlight';
import { buildOntologyTreeIndex } from '@/features/ontology/ontologyTree';
import {
  composeOntologyHealthSummary,
  getOntologyHealthSummary,
  isolatedTermIdsToHydrate,
} from '@/features/ontology/ontologyHealth';
import { buildGraphFromOntologyData, ontologyAssetNode } from '@/features/ontology/nativeDataGraph';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

/**
 * Ontology browser (official pages/OntologyExplorerPage, view mode):
 * read-only aggregate graph + graph/tree toggle + scope menu. The page
 * defaults to the all-ontologies scope with the graph surface
 * (official getStudioScope default + viewSurface 'graph'); the studio
 * stays a separate route (E-D2) and editing stays there.
 *
 * Scope is URL-owned (official OntologyStudioScope.utils.ts):
 * no params -> all ontologies; ?ontology=<id> -> single ontology;
 * ?scope=glossary:<id> / glossary:all -> glossary scope. The scope menu
 * writes both scope and ontology params for single-ontology scopes.
 */
type OntologyBrowserScope =
  | { kind: 'allOntologies' }
  | { kind: 'ontology'; ontologyId: string }
  | { kind: 'glossaries'; glossaryId?: string };

function scopeKeyOf(scope: OntologyBrowserScope): string {
  if (scope.kind === 'allOntologies') {
    return 'ontology:all';
  }
  if (scope.kind === 'ontology') {
    return `ontology:${scope.ontologyId}`;
  }
  return scope.glossaryId ? `glossary:${scope.glossaryId}` : 'glossary:all';
}

function parseScopeKey(key: string): OntologyBrowserScope | undefined {
  if (key === 'ontology:all') {
    return { kind: 'allOntologies' };
  }
  if (key === 'glossary:all') {
    return { kind: 'glossaries' };
  }
  if (key.startsWith('glossary:')) {
    const id = key.slice('glossary:'.length);
    return id ? { kind: 'glossaries', glossaryId: id } : { kind: 'glossaries' };
  }
  if (key.startsWith('ontology:') && key !== 'ontology:new') {
    return { kind: 'ontology', ontologyId: key.slice('ontology:'.length) };
  }
  return undefined;
}

/** Official getStudioScope: ?ontology= wins; scope= only selects glossaries. */
function parseScopeFromRoute(): OntologyBrowserScope {
  const ontologyId = typeof route.query.ontology === 'string' ? route.query.ontology : undefined;
  if (ontologyId) {
    return { kind: 'ontology', ontologyId };
  }
  const scopeParam = typeof route.query.scope === 'string' ? route.query.scope : '';
  const explicit = parseScopeKey(scopeParam);
  if (explicit?.kind === 'glossaries') {
    return explicit;
  }
  if (scopeParam.startsWith('glossary:')) {
    return { kind: 'glossaries' };
  }
  return { kind: 'allOntologies' };
}

const scopesLoading = ref(false);
const graphLoading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref('');
const graphError = ref('');
const capacityExceeded = ref(false);
const ontologies = ref<Ontology[]>([]);
const glossaries = ref<Glossary[]>([]);
const scope = ref<OntologyBrowserScope>({ kind: 'allOntologies' });
const scopeKey = computed(() => scopeKeyOf(scope.value));
const surface = ref<'graph' | 'tree'>('graph');
const searchQuery = ref('');
const graphData = ref<OntologyGraphData | null>(null);
const selectedNodeId = ref<string | null>(null);
const selectedEdge = ref<OntologyGraphEdge | null>(null);

// Stage 2: graph mode, settings, health, inspectors, glossary data mode.
const graphMode = ref<'model' | 'data'>('model');
const hasOpenedData = ref(false);
const graphSettings = ref<OntologyGraphSettings>({ ...DEFAULT_ONTOLOGY_GRAPH_SETTINGS });
const ontologySummary = ref<OntologySummary | null>(null);
const summaryUnavailable = ref(false);
const hydratedLabels = ref<Record<string, string>>({});
const aggregateModels = ref<OntologyStudioModel[]>([]);
const singleModel = ref<OntologyStudioModel | null>(null);
const inspectorConcept = ref<OntologyConcept | null>(null);
const selectedTerm = ref<GlossaryTerm | null>(null);
const relationshipTypes = ref<RelationshipType[]>([]);
const relationshipTypesLoading = ref(false);
const glossaryDataGraph = ref<OntologyGraphData | null>(null);
const dataModeLoading = ref(false);
const dataModeLoadingMore = ref(false);
const dataModeNextOffset = ref(0);
const dataModeTotal = ref(0);
const dataModeError = ref('');
const termAssetCounts = ref<Record<string, number>>({});
const loadingTermIds = ref<Set<string>>(new Set());
const assetControllers = new Map<string, AbortController>();
let selectionToken = 0;
let healthToken = 0;
const ontology = ref<Ontology | null>(null);
const concepts = ref<OntologyConcept[]>([]);
const properties = ref<OntologyProperty[]>([]);
const conceptFilter = ref('');
const propertyFilter = ref('');
const conceptAfter = ref<string | undefined>(undefined);
const propertyAfter = ref<string | undefined>(undefined);
const loadingMoreConcepts = ref(false);
const loadingMoreProperties = ref(false);
const selectedConcept = ref<OntologyConcept | null>(null);
const conceptDetailLoading = ref(false);
const conceptBindings = ref<OntologyConceptBinding[]>([]);
const axioms = ref<OntologyAxiom[]>([]);
const releases = ref<OntologyRelease[]>([]);
const packs = ref<OntologyPack[]>([]);
const packsError = ref('');
const sampleByPack = ref<Record<string, OntologyPackSample>>({});
const samplingPack = ref<string | null>(null);

/**
 * E-D6 gate (ADR:2026-11-08-ontology-browser-studio-gate): the official
 * computeCanEditOntology four-item resource formula, fail-closed. The
 * studio's three-item entity formula must not be copied here.
 */
const canOpenStudio = ref(false);

async function loadStudioGate(): Promise<void> {
  try {
    const [glossaryOps, glossaryTermOps] = await Promise.all([
      permissionStore.getResourcePermission('glossary').catch(() => null),
      permissionStore.getResourcePermission('glossaryTerm').catch(() => null),
    ]);
    canOpenStudio.value =
      permissionStore.isAdminUser ||
      glossaryOps?.EditAll === true ||
      glossaryOps?.EditGlossaryTerms === true ||
      glossaryTermOps?.EditEntityRelationship === true;
  } catch {
    canOpenStudio.value = false;
  }
}

const treeIndex = computed(() => buildOntologyTreeIndex(graphData.value));

const highlightGroups = computed(() => {
  if (scope.value.kind === 'glossaries') {
    return glossaries.value.map((item) => ({
      description: item.description,
      displayName: item.displayName,
      fullyQualifiedName: item.fullyQualifiedName,
      id: item.id,
      name: item.name,
    }));
  }
  if (scope.value.kind === 'ontology') {
    const current = ontology.value;
    return current
      ? [
          {
            description: current.description,
            displayName: current.displayName,
            fullyQualifiedName: current.fullyQualifiedName,
            id: current.id,
            name: current.name,
          },
        ]
      : [];
  }
  return ontologies.value.map((item) => ({
    description: item.description,
    displayName: item.displayName,
    fullyQualifiedName: item.fullyQualifiedName,
    id: item.id,
    name: item.name,
  }));
});

const highlight = computed(() =>
  graphData.value
    ? computeOntologySearchHighlight(graphData.value.nodes, graphData.value.edges, searchQuery.value, highlightGroups.value)
    : null,
);

const searchNoHit = computed(
  () =>
    searchQuery.value.trim().length > 0 &&
    highlight.value !== null &&
    highlight.value.highlightedNodeIds.length === 0,
);

/** Official getStudioStatsLabel: counts come from the aggregate graph itself. */
const statsLabel = computed(() => {
  if (!graphData.value) {
    return '';
  }
  const relations = graphData.value.edges.length;
  if (scope.value.kind === 'glossaries') {
    return t('ontology.browser.statsTermsRelations', { relations, terms: graphData.value.nodes.length });
  }
  return t('ontology.browser.statsConceptsRelations', { concepts: graphData.value.nodes.length, relations });
});

// Stage 2: scope-derived helpers for the health panel, inspectors and data mode.
const isGlossaryScope = computed(() => scope.value.kind === 'glossaries');
const isSingleGlossaryScope = computed(
  () => scope.value.kind === 'glossaries' && Boolean(scope.value.glossaryId),
);
const selectedNode = computed<OntologyGraphNode | null>(() => {
  if (!selectedNodeId.value) return null;
  const data = graphMode.value === 'data' && isGlossaryScope.value ? glossaryDataGraph.value : graphData.value;
  return data?.nodes.find((node) => node.id === selectedNodeId.value)
    ?? graphData.value?.nodes.find((node) => node.id === selectedNodeId.value)
    ?? null;
});
const effectiveGraph = computed<OntologyGraphData | null>(() =>
  graphMode.value === 'data' && isGlossaryScope.value ? glossaryDataGraph.value : graphData.value,
);
const composedHealth = computed(() => {
  if (isGlossaryScope.value && ontologySummary.value) {
    return composeOntologyHealthSummary(ontologySummary.value);
  }
  return null;
});
const health = computed(() => {
  if (composedHealth.value) return composedHealth.value.health;
  const derived = getOntologyHealthSummary(graphData.value, {
    glossaryIds: isSingleGlossaryScope.value && scope.value.kind === 'glossaries' && scope.value.glossaryId
      ? [scope.value.glossaryId]
      : [],
  });
  if (Object.keys(hydratedLabels.value).length === 0) return derived;
  return {
    ...derived,
    isolatedTerms: derived.isolatedTerms.map((term) => {
      const label = hydratedLabels.value[term.id];
      return label ? { ...term, label } : term;
    }),
  };
});
const isolatedTermCount = computed<number | undefined>(() => composedHealth.value?.isolatedTermCount);
const inspectorModel = computed<OntologyStudioModel | null>(() => {
  if (scope.value.kind === 'ontology') return singleModel.value;
  if (scope.value.kind === 'allOntologies' && selectedNode.value?.ontologyId) {
    return aggregateModels.value.find((model) => model.ontology.id === selectedNode.value?.ontologyId) ?? null;
  }
  return null;
});
const inspectorRelations = computed(() => (inspectorModel.value ? getModelRelations(inspectorModel.value) : []));
const showHealth = computed(
  () => graphData.value !== null
    && surface.value === 'graph'
    && graphMode.value === 'model'
    && !selectedNodeId.value
    && !selectedEdge.value,
);
const showConceptInspector = computed(
  () => !isGlossaryScope.value
    && selectedNode.value?.type === 'ontologyConcept'
    && inspectorConcept.value !== null
    && inspectorModel.value !== null
    && surface.value === 'graph'
    && !selectedEdge.value,
);
const showAuthoringInspector = computed(
  () => isGlossaryScope.value
    && !isSingleGlossaryScope.value
    && selectedNode.value?.type === 'glossaryTerm'
    && !selectedNode.value.isDraft
    && surface.value === 'graph'
    && !selectedEdge.value,
);
const showEntityPanel = computed(
  () => selectedNode.value !== null
    && surface.value === 'graph'
    && !selectedEdge.value
    && !showConceptInspector.value
    && !showAuthoringInspector.value
    && (selectedNode.value.type === 'dataAsset'
      || (isSingleGlossaryScope.value && selectedNode.value.type === 'glossaryTerm')),
);
const showRail = computed(
  () => (showHealth.value && !isGlossaryScope.value)
    || showConceptInspector.value
    || showAuthoringInspector.value
    || showEntityPanel.value
    || (selectedEdge.value !== null && surface.value === 'graph'),
);
const nativeDataOntologyId = computed<string | null>(() => {
  if (scope.value.kind === 'ontology') return scope.value.ontologyId;
  if (scope.value.kind === 'allOntologies') {
    return selectedNode.value?.ontologyId ?? inspectorConcept.value?.ontology?.id ?? null;
  }
  return null;
});
const hasMoreDataTerms = computed(() => dataModeNextOffset.value > 0 && dataModeNextOffset.value < dataModeTotal.value);
const pageableTermNodes = computed(() => {
  if (!glossaryDataGraph.value || !isSingleGlossaryScope.value) return [];
  return glossaryDataGraph.value.nodes
    .filter((node) => node.type === 'glossaryTerm')
    .filter((node) => {
      const total = termAssetCounts.value[node.id] ?? node.assetCount ?? 0;
      const loaded = node.loadedAssetCount ?? 0;
      return total - loaded > 0;
    })
    .map((node) => ({
      id: node.id,
      label: node.label,
      remaining: (termAssetCounts.value[node.id] ?? node.assetCount ?? 0) - (node.loadedAssetCount ?? 0),
    }));
});
const remainingDataAssets = computed(() => pageableTermNodes.value.reduce((sum, term) => sum + term.remaining, 0));

const filteredConcepts = computed(() => {
  const q = conceptFilter.value.trim().toLowerCase();
  if (!q) {
    return concepts.value;
  }
  return concepts.value.filter((item) =>
    [item.displayName, item.name, item.iri, item.description]
      .filter(Boolean)
      .some((text) => (text as string).toLowerCase().includes(q)),
  );
});

const filteredProperties = computed(() => {
  const q = propertyFilter.value.trim().toLowerCase();
  if (!q) {
    return properties.value;
  }
  return properties.value.filter((item) =>
    [item.displayName, item.name, item.iri, item.kind, item.domain, item.range]
      .filter(Boolean)
      .some((text) => (text as string).toLowerCase().includes(q)),
  );
});

const showCreateModal = ref(false);
const creating = ref(false);
const formError = ref('');
const createForm = ref({ name: '', displayName: '', description: '', iri: '', namespace: '' });

const conceptColumns = computed(() => [
  { title: t('ontology.concepts.name'), dataIndex: 'name', key: 'name' },
  { title: t('ontology.concepts.type'), dataIndex: 'conceptType', key: 'conceptType' },
  { title: t('ontology.concepts.iri'), dataIndex: 'iri', key: 'iri' },
  { title: t('ontology.concepts.status'), dataIndex: 'lifecycleStatus', key: 'lifecycleStatus' },
  { title: t('ontology.concepts.description'), dataIndex: 'description', key: 'description' },
]);

const propertyColumns = computed(() => [
  { title: t('ontology.properties.name'), dataIndex: 'name', key: 'name' },
  { title: t('ontology.properties.kind'), dataIndex: 'kind', key: 'kind' },
  { title: t('ontology.properties.domain'), dataIndex: 'domain', key: 'domain' },
  { title: t('ontology.properties.range'), dataIndex: 'range', key: 'range' },
  { title: t('ontology.properties.description'), dataIndex: 'description', key: 'description' },
]);

async function loadDetail(id: string): Promise<Ontology | null> {
  detailLoading.value = true;
  errorMessage.value = '';
  selectedConcept.value = null;
  conceptBindings.value = [];
  try {
    const detail = await getOntology(id);
    ontology.value = detail;
    const fqn = detail.fullyQualifiedName || detail.name;
    const [conceptPage, propertyPage, axiomPage, releasePage] = await Promise.all([
      listOntologyConcepts({ ontology: fqn, limit: 50 }),
      listOntologyProperties({ ontology: fqn, limit: 50 }),
      listOntologyAxioms({ ontologyId: id, limit: 50 }).catch(() => ({ data: [], after: undefined })),
      listOntologyReleases({ ontologyId: id, limit: 50 }).catch(() => ({ data: [], after: undefined })),
    ]);
    concepts.value = conceptPage.data;
    conceptAfter.value = conceptPage.after;
    properties.value = propertyPage.data;
    propertyAfter.value = propertyPage.after;
    axioms.value = axiomPage.data;
    releases.value = releasePage.data;
    return detail;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    ontology.value = null;
    concepts.value = [];
    properties.value = [];
    axioms.value = [];
    releases.value = [];
    return null;
  } finally {
    detailLoading.value = false;
  }
}

async function loadMoreConcepts(): Promise<void> {
  if (!ontology.value || !conceptAfter.value || loadingMoreConcepts.value) {
    return;
  }
  loadingMoreConcepts.value = true;
  try {
    const page = await listOntologyConcepts({
      ontology: ontology.value.fullyQualifiedName || ontology.value.name,
      limit: 50,
      after: conceptAfter.value,
    });
    concepts.value = [...concepts.value, ...page.data];
    conceptAfter.value = page.after;
  } finally {
    loadingMoreConcepts.value = false;
  }
}

async function loadMoreProperties(): Promise<void> {
  if (!ontology.value || !propertyAfter.value || loadingMoreProperties.value) {
    return;
  }
  loadingMoreProperties.value = true;
  try {
    const page = await listOntologyProperties({
      ontology: ontology.value.fullyQualifiedName || ontology.value.name,
      limit: 50,
      after: propertyAfter.value,
    });
    properties.value = [...properties.value, ...page.data];
    propertyAfter.value = page.after;
  } finally {
    loadingMoreProperties.value = false;
  }
}

async function openConceptDetail(id: string): Promise<void> {
  conceptDetailLoading.value = true;
  try {
    const [detail, bindings] = await Promise.all([
      getOntologyConcept(id),
      getOntologyConceptBindings(id).catch(() => ({ assets: [], after: undefined })),
    ]);
    selectedConcept.value = detail;
    conceptBindings.value = bindings.assets;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    conceptDetailLoading.value = false;
  }
}

function openConceptRef(ref: EntityRef): void {
  if (ref.id) {
    void openConceptDetail(ref.id);
  }
}

async function loadPacks(): Promise<void> {
  try {
    packs.value = await listOntologyPacks();
    packsError.value = '';
  } catch (error) {
    packs.value = [];
    packsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  }
}

async function onSamplePack(pack: OntologyPack): Promise<void> {
  const moduleIds = pack.modules.map((item) => item.id ?? item.name).filter(Boolean);
  if (!pack.id && !pack.name) {
    return;
  }
  samplingPack.value = pack.name;
  try {
    sampleByPack.value = {
      ...sampleByPack.value,
      [pack.name]: await getOntologyPackSample(pack.id ?? pack.name, moduleIds),
    };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    samplingPack.value = null;
  }
}

let graphLoadToken = 0;

async function applyScope(next: OntologyBrowserScope, options: { updateRoute?: boolean } = {}): Promise<void> {
  const token = ++graphLoadToken;
  scope.value = next;
  selectedNodeId.value = null;
  selectedEdge.value = null;
  graphData.value = null;
  graphError.value = '';
  capacityExceeded.value = false;
  // Stage 2 state resets with the scope.
  graphMode.value = 'model';
  hasOpenedData.value = false;
  glossaryDataGraph.value = null;
  dataModeLoading.value = false;
  dataModeLoadingMore.value = false;
  dataModeNextOffset.value = 0;
  dataModeTotal.value = 0;
  dataModeError.value = '';
  termAssetCounts.value = {};
  loadingTermIds.value = new Set();
  ontologySummary.value = null;
  summaryUnavailable.value = false;
  hydratedLabels.value = {};
  aggregateModels.value = [];
  singleModel.value = null;
  inspectorConcept.value = null;
  selectedTerm.value = null;
  if (options.updateRoute !== false) {
    const query: Record<string, string | undefined> = { ...route.query, scope: scopeKeyOf(next) };
    if (next.kind === 'ontology') {
      query.ontology = next.ontologyId;
    } else {
      delete query.ontology;
    }
    void router.replace({ query });
  }
  graphLoading.value = true;
  try {
    if (next.kind === 'allOntologies') {
      ontology.value = null;
      concepts.value = [];
      properties.value = [];
      axioms.value = [];
      releases.value = [];
      const models = await loadAggregateModels(ontologies.value);
      if (token !== graphLoadToken) {
        return;
      }
      aggregateModels.value = models;
      graphData.value = buildAggregateGraph(models);
    } else if (next.kind === 'ontology') {
      const detail = await loadDetail(next.ontologyId);
      if (token !== graphLoadToken) {
        return;
      }
      if (!detail) {
        graphError.value = t('crud.loadFailed');
        return;
      }
      const model = await loadOntologyModel(detail);
      if (token !== graphLoadToken) {
        return;
      }
      if (!model) {
        graphError.value = t('crud.loadFailed');
        return;
      }
      singleModel.value = model;
      graphData.value = buildOntologyModelGraph(model);
    } else if (next.kind === 'glossaries' && next.glossaryId) {
      ontology.value = null;
      concepts.value = [];
      properties.value = [];
      axioms.value = [];
      releases.value = [];
      const data = await fetchGlossaryGraphData(next.glossaryId);
      if (token !== graphLoadToken) {
        return;
      }
      graphData.value = data;
      void loadHealthSummary();
    } else {
      ontology.value = null;
      concepts.value = [];
      properties.value = [];
      axioms.value = [];
      releases.value = [];
      const data = await fetchAllGlossariesGraphData(glossaries.value);
      if (token !== graphLoadToken) {
        return;
      }
      graphData.value = data;
      void loadHealthSummary();
    }
  } catch (error) {
    if (token !== graphLoadToken) {
      return;
    }
    if (error instanceof AggregateCapacityError) {
      capacityExceeded.value = true;
    } else {
      graphError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    graphData.value = null;
  } finally {
    if (token === graphLoadToken) {
      graphLoading.value = false;
    }
  }
}

function onScopeChange(value: string | number | undefined): void {
  if (value === undefined) {
    return;
  }
  const next = parseScopeKey(String(value));
  if (next) {
    void applyScope(next);
  }
}

function onSelectNode(nodeId: string | null): void {
  selectedNodeId.value = nodeId;
  if (nodeId !== null) {
    selectedEdge.value = null;
    void loadSelectionDetails(nodeId);
  }
}

async function loadSelectionDetails(nodeId: string): Promise<void> {
  const token = ++selectionToken;
  inspectorConcept.value = null;
  selectedTerm.value = null;
  const node = selectedNode.value;
  if (!node) return;
  if (node.type === 'ontologyConcept' && node.ontologyId) {
    try {
      const detail = await getOntologyConcept(nodeId);
      if (token !== selectionToken) return;
      inspectorConcept.value = detail;
    } catch {
      // Inspector stays hidden when the full concept cannot be loaded.
    }
    return;
  }
  if (node.type === 'glossaryTerm') {
    try {
      const term = await getGlossaryTerm(nodeId);
      if (token !== selectionToken) return;
      selectedTerm.value = term;
    } catch {
      // The authoring inspector / entity panel still renders from the node.
    }
  }
}

function onSelectEdge(edge: OntologyGraphEdge | null): void {
  selectedEdge.value = edge;
  if (edge !== null) {
    selectedNodeId.value = null;
    if (edge.provenance === 'Inferred') {
      void ensureRelationshipTypes();
    }
  }
}

async function ensureRelationshipTypes(): Promise<void> {
  if (relationshipTypes.value.length > 0 || relationshipTypesLoading.value) return;
  relationshipTypesLoading.value = true;
  try {
    relationshipTypes.value = await listAllRelationshipTypes();
  } catch {
    relationshipTypes.value = [];
  } finally {
    relationshipTypesLoading.value = false;
  }
}

function onGraphNodeDblClick(nodeId: string): void {
  const node = graphData.value?.nodes.find((item) => item.id === nodeId)
    ?? glossaryDataGraph.value?.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.type === 'glossaryTerm' || (node.glossaryId && !node.ontologyId)) {
    void router.push({ name: 'governance-term', params: { id: nodeId } });
    return;
  }
  if (node.ontologyId) {
    void openConceptDetail(nodeId);
  }
}

function onInspectorEdit(concept: OntologyConcept): void {
  const ontologyId = concept.ontology?.id ?? inspectorModel.value?.ontology.id;
  void router.push({ name: 'ontology-studio', query: ontologyId ? { ontology: ontologyId } : {} });
}

function onInspectorOpenData(): void {
  graphMode.value = 'data';
  hasOpenedData.value = true;
}

function openTermDetails(termId: string): void {
  void router.push({ name: 'governance-term', params: { id: termId } });
}

function onConnect(term: { id: string }): void {
  onSelectNode(term.id);
}

function changeGraphMode(mode: 'model' | 'data'): void {
  if (graphMode.value === mode) return;
  graphMode.value = mode;
  if (mode === 'data') {
    hasOpenedData.value = true;
    if (isGlossaryScope.value && !glossaryDataGraph.value) {
      void loadDataModeTerms(0);
    }
  }
}

function onSettingsChange(next: OntologyGraphSettings): void {
  graphSettings.value = next;
}

async function loadHealthSummary(): Promise<void> {
  const token = ++healthToken;
  summaryUnavailable.value = false;
  ontologySummary.value = null;
  const glossaryId = scope.value.kind === 'glossaries' ? scope.value.glossaryId : undefined;
  const parent = glossaries.value.find((item) => item.id === glossaryId)?.fullyQualifiedName;
  try {
    const summary = await getOntologySummary({ limit: ONTOLOGY_HEALTH_PREVIEW_SIZE, offset: 0, parent });
    if (token !== healthToken) return;
    ontologySummary.value = summary;
  } catch {
    if (token !== healthToken) return;
    summaryUnavailable.value = true;
    // Fallback: derive health from the model graph and hydrate unresolved
    // isolated-term labels (those whose label is still their id).
    const derived = getOntologyHealthSummary(graphData.value, {
      glossaryIds: glossaryId ? [glossaryId] : [],
    });
    const ids = isolatedTermIdsToHydrate(derived);
    if (ids.length === 0) return;
    try {
      const terms = await getGlossaryTermsByIds(ids);
      if (token !== healthToken) return;
      const labels: Record<string, string> = {};
      terms.forEach((term) => {
        if (term.id) labels[term.id] = term.displayName || term.name || term.id;
      });
      hydratedLabels.value = labels;
    } catch {
      // Labels stay unresolved; the panel still shows the term ids.
    }
  }
}

function mergeDataGraph(next: OntologyGraphData): void {
  const current = glossaryDataGraph.value;
  if (!current) {
    glossaryDataGraph.value = next;
    return;
  }
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));
  next.nodes.forEach((node) => nodes.set(node.id, node));
  const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
  next.edges.forEach((edge) => edges.set(edge.id, edge));
  glossaryDataGraph.value = { nodes: [...nodes.values()], edges: [...edges.values()] };
}

async function loadDataModeTerms(offset: number): Promise<void> {
  if (offset === 0) {
    dataModeLoading.value = true;
  } else {
    dataModeLoadingMore.value = true;
  }
  dataModeError.value = '';
  const glossaryId = scope.value.kind === 'glossaries' ? scope.value.glossaryId : undefined;
  const parent = glossaries.value.find((item) => item.id === glossaryId)?.fullyQualifiedName;
  try {
    const response = await getOntologyDataGraph({
      assetPreviewSize: DATA_MODE_ASSET_PREVIEW_SIZE,
      connectedTermLimit: DATA_MODE_CONNECTED_TERM_LIMIT,
      edgeLimit: DATA_MODE_EDGE_LIMIT,
      limit: DATA_MODE_SEED_PAGE_SIZE,
      offset,
      parent,
    });
    const built = buildGraphFromOntologyData(response, glossaries.value);
    mergeDataGraph(built);
    const counts: Record<string, number> = { ...termAssetCounts.value };
    built.nodes.forEach((node) => {
      if (node.type === 'glossaryTerm' && node.assetCount !== undefined) {
        counts[node.id] = node.assetCount;
      }
    });
    termAssetCounts.value = counts;
    dataModeNextOffset.value = (response.paging.offset ?? offset) + (response.paging.limit ?? DATA_MODE_SEED_PAGE_SIZE);
    dataModeTotal.value = response.paging.total ?? 0;
  } catch (error) {
    dataModeError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    dataModeLoading.value = false;
    dataModeLoadingMore.value = false;
  }
}

function loadMoreDataTerms(): void {
  if (dataModeLoading.value || dataModeLoadingMore.value || !hasMoreDataTerms.value) return;
  void loadDataModeTerms(dataModeNextOffset.value);
}

async function handleLoadMoreAssets(termId: string): Promise<void> {
  const node = glossaryDataGraph.value?.nodes.find((item) => item.id === termId);
  if (!node || node.type !== 'glossaryTerm') return;
  assetControllers.get(termId)?.abort();
  const controller = new AbortController();
  assetControllers.set(termId, controller);
  loadingTermIds.value = new Set([...loadingTermIds.value, termId]);
  const size = Math.min(DATA_MODE_ASSET_MAX_LOAD, Math.max(1, DATA_MODE_ASSET_LOAD_PAGE_SIZE));
  const fromOffset = node.loadedAssetCount ?? 0;
  try {
    const response = await getGlossaryTermAssets(termId, size, fromOffset, controller.signal);
    if (controller.signal.aborted) return;
    const assets = response.data ?? [];
    const nodes = glossaryDataGraph.value?.nodes ?? [];
    const edges = glossaryDataGraph.value?.edges ?? [];
    const nodeIds = new Set(nodes.map((item) => item.id));
    const edgeIds = new Set(edges.map((item) => item.id));
    const nextNodes = [...nodes];
    const nextEdges = [...edges];
    // Same node/edge construction as buildGraphFromOntologyData: asset nodes
    // carry the bare asset id, tagged-with edges run asset -> term.
    assets.forEach((asset) => {
      const assetNode = ontologyAssetNode(asset);
      if (!nodeIds.has(assetNode.id)) {
        nodeIds.add(assetNode.id);
        nextNodes.push(assetNode);
      }
      const edgeId = `${assetNode.id}|${termId}|${ASSET_RELATION_TYPE}`;
      if (!edgeIds.has(edgeId)) {
        edgeIds.add(edgeId);
        nextEdges.push({
          edgeKind: 'assetBinding',
          id: edgeId,
          label: 'tagged-with',
          relationType: ASSET_RELATION_TYPE,
          source: assetNode.id,
          target: termId,
        });
      }
    });
    const nextNodesWithCounts = nextNodes.map((item) => {
      if (item.id !== termId) return item;
      return {
        ...item,
        assetCount: response.total ?? item.assetCount,
        isLoadingAssets: false,
        loadedAssetCount: fromOffset + assets.length,
      };
    });
    glossaryDataGraph.value = { nodes: nextNodesWithCounts, edges: nextEdges };
    termAssetCounts.value = {
      ...termAssetCounts.value,
      [termId]: response.total ?? node.assetCount ?? 0,
    };
  } catch (error) {
    if (!controller.signal.aborted) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    const next = new Set(loadingTermIds.value);
    next.delete(termId);
    loadingTermIds.value = next;
    if (assetControllers.get(termId) === controller) {
      assetControllers.delete(termId);
    }
  }
}

async function loadScopes(): Promise<void> {
  scopesLoading.value = true;
  errorMessage.value = '';
  try {
    ontologies.value = await listAllOntologies();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    ontologies.value = [];
  } finally {
    scopesLoading.value = false;
  }
  try {
    glossaries.value = await listAllGlossaries();
  } catch {
    glossaries.value = [];
  }
}

async function onCreate(): Promise<void> {
  const name = createForm.value.name.trim();
  const iri = createForm.value.iri.trim();
  const namespace = createForm.value.namespace.trim();
  if (!name || !iri || !namespace) {
    formError.value = t('ontology.createRequired');
    return;
  }
  formError.value = '';
  creating.value = true;
  try {
    const created = await createOntology({
      name,
      iri,
      namespace,
      displayName: createForm.value.displayName.trim() || undefined,
      description: createForm.value.description.trim() || undefined,
    });
    showCreateModal.value = false;
    message.success(t('ontology.created', { name: created.name }));
    ontologies.value = await listAllOntologies();
    if (created.id) {
      await applyScope({ kind: 'ontology', ontologyId: created.id });
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    creating.value = false;
  }
}

watch(
  () => [route.query.scope, route.query.ontology] as const,
  () => {
    const parsed = parseScopeFromRoute();
    if (scopeKeyOf(parsed) !== scopeKey.value) {
      void applyScope(parsed, { updateRoute: false });
    }
  },
);

onMounted(() => {
  void (async () => {
    await loadScopes();
    await applyScope(parseScopeFromRoute(), { updateRoute: false });
  })();
  void loadPacks();
  void loadStudioGate();
});
</script>

<template>
  <div data-testid="ontology-explorer" data-tour-step="ontology-studio" data-tour-page>
    <PageHeader :header="t('ontology.title')" :sub-header="t('ontology.lead')" />
    <Typography.Text v-if="errorMessage" type="danger" data-testid="ontology-error">
      {{ errorMessage }}
    </Typography.Text>
    <Space style="margin-bottom: 16px" data-testid="ontology-controls">
      <Select
        :value="scopeKey"
        data-testid="ontology-scope-select"
        :placeholder="t('ontology.selectPlaceholder')"
        style="min-width: 260px"
        :loading="scopesLoading"
        @change="onScopeChange"
      >
        <Select.OptGroup :label="t('ontology.browser.scopeOntologies')">
          <Select.Option value="ontology:all">{{ t('ontology.browser.scopeAllOntologies') }}</Select.Option>
          <Select.Option v-for="item in ontologies" :key="item.id" :value="`ontology:${item.id}`">
            {{ entityLabel(item) }}
          </Select.Option>
        </Select.OptGroup>
        <Select.OptGroup :label="t('ontology.browser.scopeGlossaries')">
          <Select.Option value="glossary:all">{{ t('ontology.browser.scopeAllGlossaries') }}</Select.Option>
          <Select.Option v-for="item in glossaries" :key="item.id" :value="`glossary:${item.id}`">
            {{ entityLabel(item) }}
          </Select.Option>
        </Select.OptGroup>
      </Select>
      <Radio.Group v-model:value="surface" data-testid="ontology-surface" button-style="solid">
        <Radio.Button value="graph">{{ t('ontology.browser.surfaceGraph') }}</Radio.Button>
        <Radio.Button value="tree">{{ t('ontology.browser.surfaceTree') }}</Radio.Button>
      </Radio.Group>
      <OntologyGraphModeTabs v-if="surface === 'graph'" :mode="graphMode" :data-disabled="graphLoading" @change="changeGraphMode" />
      <GraphSettingsPanel v-if="isSingleGlossaryScope && surface === 'graph'" :settings="graphSettings" @settings-change="onSettingsChange" />
      <Input
        v-if="graphMode === 'model'"
        v-model:value="searchQuery"
        allow-clear
        data-testid="ontology-graph-search"
        :placeholder="t('ontology.browser.searchPlaceholder')"
        style="width: 240px"
      />
      <Button type="primary" data-testid="ontology-create" @click="showCreateModal = true">
        {{ t('ontology.create') }}
      </Button>
      <Button v-if="canOpenStudio" data-testid="ontology-open-studio" @click="router.push({ name: 'ontology-studio' })">
        {{ t('ontology.edit.openStudio') }}
      </Button>
    </Space>
    <Typography.Text v-if="statsLabel" type="secondary" data-testid="ontology-stats" style="display: block; margin-bottom: 12px">
      {{ statsLabel }}
    </Typography.Text>
    <Card v-if="graphLoading" :loading="true" data-testid="ontology-graph-loading" style="margin-bottom: 16px" />
    <Empty
      v-if="!scopesLoading && !graphLoading && ontologies.length === 0 && !errorMessage && !graphError && !capacityExceeded"
      :description="t('ontology.empty')"
      data-testid="ontology-empty"
    >
      <Button type="primary" data-testid="ontology-empty-create" @click="showCreateModal = true">
        {{ t('ontology.create') }}
      </Button>
    </Empty>
    <Card v-if="graphError" data-testid="ontology-graph-error" style="margin-bottom: 16px">
      <Typography.Text type="danger">{{ graphError }}</Typography.Text>
      <div style="margin-top: 12px">
        <Button type="primary" data-testid="ontology-graph-retry" @click="applyScope(scope, { updateRoute: false })">
          {{ t('crud.refresh') }}
        </Button>
        <span v-if="ontologies.length" style="margin-left: 12px">
          <Button
            v-for="item in ontologies"
            :key="item.id"
            style="margin-right: 8px; margin-bottom: 8px"
            :data-testid="`ontology-error-open-${item.id}`"
            @click="applyScope({ kind: 'ontology', ontologyId: item.id })"
          >
            {{ entityLabel(item) }}
          </Button>
        </span>
      </div>
    </Card>
    <Card v-if="capacityExceeded" data-testid="ontology-capacity" style="margin-bottom: 16px">
      <Typography.Text strong>{{ t('ontology.browser.capacityTitle') }}</Typography.Text>
      <Typography.Paragraph type="secondary">
        {{ t('ontology.browser.capacityBody') }}
      </Typography.Paragraph>
      <span v-if="ontologies.length">
        <Button
          v-for="item in ontologies"
          :key="item.id"
          style="margin-right: 8px; margin-bottom: 8px"
          :data-testid="`ontology-capacity-open-${item.id}`"
          @click="applyScope({ kind: 'ontology', ontologyId: item.id })"
        >
          {{ entityLabel(item) }}
        </Button>
      </span>
    </Card>
    <div v-if="searchNoHit" data-testid="ontology-search-empty" style="margin-bottom: 16px">
      <Empty :description="t('ontology.browser.searchEmpty')" />
    </div>
    <div v-if="graphData && !graphLoading && !graphError && !capacityExceeded && !searchNoHit">
      <div style="display: flex; gap: 16px; align-items: flex-start">
        <div style="flex: 1; min-width: 0; position: relative">
          <OntologyGraphCanvas
            v-if="surface === 'graph' && graphMode === 'model'"
            :graph="graphData"
            :can-edit="false"
            :highlight="highlight"
            :scope-key="scopeKey"
            :selected-node-id="selectedNodeId"
            :selected-edge-id="selectedEdge?.id ?? null"
            :settings="isGlossaryScope ? graphSettings : undefined"
            @select-node="onSelectNode"
            @node-dblclick="onGraphNodeDblClick"
            @select-edge="onSelectEdge"
            @canvas-click="onSelectNode(null)"
          />
          <OntologyTreeView
            v-if="surface === 'tree'"
            :index="treeIndex"
            :selected-node-id="selectedNodeId"
            :search-query="searchQuery"
            @select-node="onSelectNode"
          />
          <div v-if="surface === 'graph' && graphMode === 'data' && isGlossaryScope">
            <Card v-if="dataModeError" data-testid="ontology-data-error" style="margin-bottom: 16px">
              <Typography.Text type="danger">{{ dataModeError }}</Typography.Text>
              <div style="margin-top: 12px">
                <Button type="primary" data-testid="ontology-data-retry" @click="loadDataModeTerms(0)">
                  {{ t('crud.refresh') }}
                </Button>
              </div>
            </Card>
            <Card v-if="dataModeLoading && !glossaryDataGraph" :loading="true" data-testid="ontology-data-loading" style="margin-bottom: 16px" />
            <OntologyDataGraph
              v-if="glossaryDataGraph"
              variant="glossary"
              :data="glossaryDataGraph"
              :has-more-terms="hasMoreDataTerms"
              :is-loading-more-terms="dataModeLoadingMore"
              :selected-node-id="selectedNodeId"
              @load-more="handleLoadMoreAssets"
              @load-more-terms="loadMoreDataTerms"
              @pane-click="onSelectNode(null)"
              @select-node="onSelectNode"
            />
            <Card
              v-if="pageableTermNodes.length > 0"
              data-testid="ontology-data-pagination"
              :title="t('ontology.browser.dataLoadMoreAssets', { count: remainingDataAssets })"
              style="margin-bottom: 16px"
            >
              <Space wrap>
                <Button
                  v-for="term in pageableTermNodes"
                  :key="term.id"
                  :loading="loadingTermIds.has(term.id)"
                  :data-testid="`ontology-data-load-more-${term.id}`"
                  @click="handleLoadMoreAssets(term.id)"
                >
                  {{ t('ontology.browser.dataLoadMoreAssetsFor', { label: term.label, remaining: term.remaining }) }}
                </Button>
              </Space>
            </Card>
          </div>
          <div v-if="surface === 'graph' && graphMode === 'data' && !isGlossaryScope">
            <Typography.Text
              v-if="!nativeDataOntologyId"
              data-testid="ontology-data-select-concept"
              type="secondary"
              style="display: block; margin-bottom: 16px"
            >
              {{ t('ontology.browser.dataSelectConcept') }}
            </Typography.Text>
            <OntologyNativeDataMode
              v-if="nativeDataOntologyId && hasOpenedData"
              :key="nativeDataOntologyId"
              :ontology-id="nativeDataOntologyId"
              :selected-concept-id="selectedNodeId"
              :is-active="graphMode === 'data'"
              @select-concept="onSelectNode"
            />
          </div>
          <OntologyHealthPanel
            v-if="showHealth && isGlossaryScope"
            placement="floating"
            :health="health"
            :isolated-term-count="isolatedTermCount"
            @connect="onConnect"
          />
        </div>
        <div v-if="showRail" style="width: 320px; flex-shrink: 0">
          <OntologyHealthPanel
            v-if="showHealth && !isGlossaryScope"
            placement="sidebar"
            :health="health"
            @connect="onConnect"
          />
          <OntologyConceptInspector
            v-if="showConceptInspector && inspectorConcept && inspectorModel"
            :concept="inspectorConcept"
            :model="inspectorModel"
            :relations="inspectorRelations"
            @close="onSelectNode(null)"
            @edit="onInspectorEdit"
            @open-data="onInspectorOpenData"
            @select-concept="onSelectNode"
          />
          <OntologyAuthoringInspector
            v-if="showAuthoringInspector && selectedNode"
            :node="selectedNode"
            :nodes="effectiveGraph?.nodes ?? []"
            :edges="effectiveGraph?.edges ?? []"
            :term="selectedTerm"
            @close="onSelectNode(null)"
            @select-node="onSelectNode"
            @show-full-details="openTermDetails"
          />
          <OntologyEntityPanel
            v-if="showEntityPanel && selectedNode"
            :node="selectedNode"
            :nodes="effectiveGraph?.nodes ?? []"
            :edges="effectiveGraph?.edges ?? []"
            :term="selectedTerm"
            @close="onSelectNode(null)"
            @select-node="onSelectNode"
          />
          <OntologyRelationDetailsPanel
            v-if="selectedEdge && surface === 'graph'"
            :edge="selectedEdge"
            :nodes="effectiveGraph?.nodes ?? []"
            :relationship-types="relationshipTypes"
            @close="onSelectEdge(null)"
          />
        </div>
      </div>
    </div>
    <div v-if="scope.kind === 'ontology' && ontology" data-testid="ontology-detail">
      <Card :loading="detailLoading" :title="entityLabel(ontology)" style="margin-bottom: 16px">
        <Typography.Paragraph v-if="ontology.description" type="secondary">
          {{ ontology.description }}
        </Typography.Paragraph>
        <Space direction="vertical">
          <Typography.Text v-if="ontology.iri">{{ t('ontology.iri') }}: {{ ontology.iri }}</Typography.Text>
          <Typography.Text v-if="ontology.namespace">{{ t('ontology.namespace') }}: {{ ontology.namespace }}</Typography.Text>
          <Typography.Text v-if="ontology.layer">{{ t('ontology.layer') }}: {{ ontology.layer }}</Typography.Text>
          <Typography.Text v-if="ontology.publicationStatus">{{ t('ontology.publicationStatus') }}: {{ ontology.publicationStatus }}</Typography.Text>
          <Typography.Text v-if="ontology.owners.length > 0">{{ t('ontology.owners') }}: {{ joinRefNames(ontology.owners) }}</Typography.Text>
          <Typography.Text v-if="ontology.reviewers.length > 0">{{ t('ontology.reviewers') }}: {{ joinRefNames(ontology.reviewers) }}</Typography.Text>
        </Space>
      </Card>
      <Card
        v-if="selectedConcept"
        :loading="conceptDetailLoading"
        :title="entityLabel(selectedConcept)"
        style="margin-bottom: 16px"
        data-testid="ontology-concept-detail"
      >
        <template #extra>
          <Button size="small" data-testid="ontology-concept-close" @click="selectedConcept = null">
            {{ t('crud.close') }}
          </Button>
        </template>
        <Typography.Paragraph v-if="selectedConcept.description" type="secondary">
          {{ selectedConcept.description }}
        </Typography.Paragraph>
        <Space direction="vertical">
          <Typography.Text v-if="selectedConcept.iri">
            {{ t('ontology.iri') }}: {{ selectedConcept.iri }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.conceptType">
            {{ t('ontology.concepts.type') }}: {{ selectedConcept.conceptType }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.lifecycleStatus">
            {{ t('ontology.concepts.status') }}: {{ selectedConcept.lifecycleStatus }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.synonyms?.length">
            {{ t('ontology.concepts.synonyms') }}: {{ selectedConcept.synonyms.join(', ') }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.superClasses?.length">
            {{ t('ontology.concepts.superClasses') }}:
            <span v-for="(ref, index) in selectedConcept.superClasses" :key="ref.id || ref.name">
              <a v-if="ref.id" href="#" @click.prevent="openConceptRef(ref)">{{ entityLabel(ref) }}</a>
              <span v-else>{{ entityLabel(ref) }}</span>
              <span v-if="index < (selectedConcept.superClasses?.length ?? 0) - 1">, </span>
            </span>
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.subClasses?.length">
            {{ t('ontology.concepts.subClasses') }}:
            <span v-for="(ref, index) in selectedConcept.subClasses" :key="ref.id || ref.name">
              <a v-if="ref.id" href="#" @click.prevent="openConceptRef(ref)">{{ entityLabel(ref) }}</a>
              <span v-else>{{ entityLabel(ref) }}</span>
              <span v-if="index < (selectedConcept.subClasses?.length ?? 0) - 1">, </span>
            </span>
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.owners.length">
            {{ t('ontology.owners') }}: {{ joinRefNames(selectedConcept.owners) }}
          </Typography.Text>
        </Space>
        <div v-if="conceptBindings.length" style="margin-top: 12px" data-testid="ontology-concept-bindings">
          <Typography.Title :level="5">{{ t('ontology.concepts.bindingsTitle') }}</Typography.Title>
          <SmTable
            row-key="assetId"
            size="small"
            :columns="[
              { title: t('crud.name'), key: 'name' },
              { title: t('crud.type'), key: 'type', width: 140 },
              { title: t('ontology.concepts.bindingColumns'), key: 'columns', width: 110 },
            ]"
            :data-source="conceptBindings"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                {{ entityLabel((record as OntologyConceptBinding).asset) }}
              </template>
              <template v-else-if="column.key === 'type'">
                {{ (record as OntologyConceptBinding).assetType || '—' }}
              </template>
              <template v-else-if="column.key === 'columns'">
                {{ (record as OntologyConceptBinding).columnCount ?? '—' }}
              </template>
            </template>
          </SmTable>
        </div>
      </Card>
      <Card :title="`${t('ontology.concepts.title')} (${concepts.length})`" style="margin-bottom: 16px" data-testid="ontology-concepts">
        <Input
          v-model:value="conceptFilter"
          allow-clear
          data-testid="ontology-concepts-search"
          :placeholder="t('ontology.concepts.searchPlaceholder')"
          style="margin-bottom: 12px"
        />
        <SmTable
          row-key="id"
          test-id="ontology-concepts-table"
          size="small"
          :columns="conceptColumns"
          :data-source="filteredConcepts"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.concepts.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a href="#" @click.prevent="openConceptDetail((record as OntologyConcept).id)">
                {{ entityLabel(record as OntologyConcept) }}
              </a>
            </template>
            <template v-else-if="column.key === 'description'">
              {{ (record as OntologyConcept).description || '—' }}
            </template>
            <template v-else-if="column.key === 'conceptType'">
              {{ (record as OntologyConcept).conceptType || '—' }}
            </template>
            <template v-else-if="column.key === 'iri'">
              {{ (record as OntologyConcept).iri || '—' }}
            </template>
            <template v-else-if="column.key === 'lifecycleStatus'">
              {{ (record as OntologyConcept).lifecycleStatus || '—' }}
            </template>
          </template>
        </SmTable>
        <Button
          v-if="conceptAfter"
          style="margin-top: 12px"
          data-testid="ontology-concepts-load-more"
          :loading="loadingMoreConcepts"
          @click="loadMoreConcepts"
        >
          {{ t('ontology.loadMore') }}
        </Button>
      </Card>
      <Card :title="`${t('ontology.properties.title')} (${properties.length})`" style="margin-bottom: 16px" data-testid="ontology-properties">
        <Input
          v-model:value="propertyFilter"
          allow-clear
          data-testid="ontology-properties-search"
          :placeholder="t('ontology.properties.searchPlaceholder')"
          style="margin-bottom: 12px"
        />
        <SmTable
          row-key="id"
          test-id="ontology-properties-table"
          size="small"
          :columns="propertyColumns"
          :data-source="filteredProperties"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.properties.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyProperty) }}
            </template>
            <template v-else-if="column.key === 'description'">
              {{ (record as OntologyProperty).description || '—' }}
            </template>
            <template v-else-if="column.key === 'kind'">
              {{ (record as OntologyProperty).kind || '—' }}
            </template>
            <template v-else-if="column.key === 'domain'">
              {{ (record as OntologyProperty).domain || '—' }}
            </template>
            <template v-else-if="column.key === 'range'">
              {{ (record as OntologyProperty).range || '—' }}
            </template>
          </template>
        </SmTable>
        <Button
          v-if="propertyAfter"
          style="margin-top: 12px"
          data-testid="ontology-properties-load-more"
          :loading="loadingMoreProperties"
          @click="loadMoreProperties"
        >
          {{ t('ontology.loadMore') }}
        </Button>
      </Card>
      <Card :title="`${t('ontology.axioms.title')} (${axioms.length})`" style="margin-bottom: 16px" data-testid="ontology-axioms">
        <SmTable
          row-key="id"
          test-id="ontology-axioms-table"
          size="small"
          :columns="[
            { title: t('ontology.axioms.name'), key: 'name' },
            { title: t('ontology.axioms.type'), key: 'axiomType', width: 160 },
            { title: t('ontology.axioms.subject'), key: 'subject' },
            { title: t('ontology.axioms.target'), key: 'target' },
          ]"
          :data-source="axioms"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.axioms.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyAxiom) }}
            </template>
            <template v-else-if="column.key === 'axiomType'">
              {{ (record as OntologyAxiom).axiomType || '—' }}
            </template>
            <template v-else-if="column.key === 'subject'">
              {{ (record as OntologyAxiom).subjectIri || '—' }}
            </template>
            <template v-else-if="column.key === 'target'">
              {{ (record as OntologyAxiom).targetIri || (record as OntologyAxiom).literal || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
      <Card :title="`${t('ontology.releases.title')} (${releases.length})`" style="margin-bottom: 16px" data-testid="ontology-releases">
        <SmTable
          row-key="id"
          test-id="ontology-releases-table"
          size="small"
          :columns="[
            { title: t('ontology.releases.name'), key: 'name' },
            { title: t('ontology.releases.version'), key: 'version', width: 140 },
            { title: t('ontology.releases.members'), key: 'members', width: 110 },
            { title: t('ontology.releases.status'), key: 'status', width: 140 },
          ]"
          :data-source="releases"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.releases.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyRelease) }}
            </template>
            <template v-else-if="column.key === 'version'">
              {{ (record as OntologyRelease).semanticVersion || '—' }}
            </template>
            <template v-else-if="column.key === 'members'">
              {{ (record as OntologyRelease).memberCount ?? '—' }}
            </template>
            <template v-else-if="column.key === 'status'">
              {{ (record as OntologyRelease).entityStatus || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
      <Card :title="t('ontology.packs.title')" data-testid="ontology-packs">
        <Typography.Text v-if="packsError" type="danger" data-testid="ontology-packs-error">
          {{ packsError }}
        </Typography.Text>
        <SmTable
          row-key="name"
          test-id="ontology-packs-table"
          size="small"
          :columns="[
            { title: t('ontology.packs.name'), key: 'name' },
            { title: t('ontology.packs.standard'), key: 'standard', width: 160 },
            { title: t('ontology.packs.modules'), key: 'modules', width: 110 },
            { title: '', key: 'actions', width: 130 },
          ]"
          :data-source="packs"
          :pagination="false"
          :empty-text="t('ontology.packs.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyPack) }}
            </template>
            <template v-else-if="column.key === 'standard'">
              {{ (record as OntologyPack).standard || '—' }}
            </template>
            <template v-else-if="column.key === 'modules'">
              {{ (record as OntologyPack).modules.length }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Button
                size="small"
                :data-testid="`ontology-pack-sample-${(record as OntologyPack).name}`"
                :loading="samplingPack === (record as OntologyPack).name"
                :disabled="!(record as OntologyPack).modules.length"
                @click="onSamplePack(record as OntologyPack)"
              >
                {{ t('ontology.packs.sample') }}
              </Button>
            </template>
          </template>
        </SmTable>
        <template v-for="pack in packs" :key="pack.name">
          <div v-if="sampleByPack[pack.name]" style="margin-top: 12px" :data-testid="`ontology-pack-sample-result-${pack.name}`">
            <Typography.Title :level="5">
              {{ t('ontology.packs.sampleTitle', { name: pack.name }) }}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {{
                t('ontology.packs.sampleSummary', {
                  concepts: sampleByPack[pack.name]?.conceptCount ?? sampleByPack[pack.name]?.concepts.length ?? 0,
                  relations: sampleByPack[pack.name]?.relationCount ?? 0,
                })
              }}
            </Typography.Paragraph>
            <ul>
              <li v-for="concept in sampleByPack[pack.name]?.concepts ?? []" :key="concept.name">
                {{ concept.name }}<span v-if="concept.iri"> ({{ concept.iri }})</span>
              </li>
            </ul>
          </div>
        </template>
      </Card>
    </div>
    <FormModal
      :get-container="false"
      :open="showCreateModal"
      :title="t('ontology.create')"
      :ok-text="t('crud.create')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
      @cancel="showCreateModal = false"
    >
      <Typography.Text v-if="formError" type="danger" data-testid="ontology-form-error">{{ formError }}</Typography.Text>
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="createForm.name" data-testid="ontology-create-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="createForm.displayName" />
        </Form.Item>
        <Form.Item :label="t('crud.description')">
          <Input.TextArea v-model:value="createForm.description" :rows="3" data-testid="ontology-create-description" />
        </Form.Item>
        <Form.Item :label="t('ontology.iri')" required>
          <Input v-model:value="createForm.iri" data-testid="ontology-create-iri" />
        </Form.Item>
        <Form.Item :label="t('ontology.namespace')" required>
          <Input v-model:value="createForm.namespace" data-testid="ontology-create-namespace" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>
