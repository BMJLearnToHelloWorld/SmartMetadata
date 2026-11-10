/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { getNativeOntologyDataGraphPage } from '@/api/ontology';
import type {
  NativeDataGraph,
  NativeDataGraphFailure,
  NativeDataGraphRetry,
  NativeOntologyDataGraphPage,
  NativeOntologyDataGraphPageRequest,
  PageFailure,
} from '@/types/ontologyDataGraph';
import { EMPTY_NATIVE_DATA_GRAPH, EMPTY_NATIVE_TOPOLOGY } from '@/types/ontologyDataGraph';
import {
  applyBindingsPage,
  applyClustersPage,
  bindingsRequest,
  classifyPageFailure,
  clustersRequest,
  stageTopologyPage,
  topologyRequest,
} from '@/features/ontology/nativeDataGraph';

/**
 * Native data-mode state machine (official
 * hooks/governance/ontology/useNativeOntologyDataGraph.ts), ported exactly:
 *
 * - Requests run one at a time; each response replaces the `loaded`
 *   context the next request must carry.
 * - Clusters plan: offset paging; an empty-clusters tail continues while
 *   the offset advances (the server drops unviewable clusters but still
 *   advertises the next offset).
 * - Topology drain: follow `topology.after` until null; a 400 on the
 *   drain restarts the plan once, then fails RELOAD.
 * - Stale (412): ONE automatic reload per generation; a second stale
 *   fails RELOAD. Non-stale failures fail with the plan's retry kind
 *   (reload / clusters / assets).
 * - Reloads restore previously loaded cluster count + per-concept row
 *   counts (restore targets grow across superseded reloads).
 * - Binding-write / revision changes reload with keepGraph=true — but
 *   only while active: a hidden surface sends nothing.
 * - loadMoreAssets is guarded per concept (no double-load); it loops
 *   while pages keep arriving with an empty bindings tail.
 * - retry() follows the failure's retry kind.
 *
 * Vue adaptations: pin subscribes to binding writes via its query
 * client; the product has no binding-write bus, so the caller bumps
 * `revision` (or calls notifyBindingWrite) when the model changes.
 * The initial load runs on mount when active; the parent mounts this
 * composable's component lazily on first data-mode open, so a hidden
 * surface never loads — pin's mount-load and the hidden-sends-nothing
 * rule coincide under that mounting discipline.
 */

type Apply = (graph: NativeDataGraph, page: NativeOntologyDataGraphPage) => NativeDataGraph;
type Read = { ok: true; page: NativeOntologyDataGraphPage } | { ok: false; reason: PageFailure };
type Settled = 'ok' | 'continue' | 'failed' | 'cancelled';
type Attempt = { done: Settled } | { again: SelectionPlan };

interface Generation {
  controller: AbortController;
  hasRestartedTopology: boolean;
  staleReloads: number;
}

interface SelectionPlan {
  request: NativeOntologyDataGraphPageRequest;
  apply: Apply;
  readFailureRetry: NativeDataGraphRetry;
  continuesPast?: (page: NativeOntologyDataGraphPage) => boolean;
  followedBy?: (page: NativeOntologyDataGraphPage) => SelectionPlan | undefined;
}

interface RestoreTargets {
  clusterCount: number;
  rowCounts: ReadonlyMap<string, number>;
}

const NO_RESTORE: RestoreTargets = { clusterCount: 0, rowCounts: new Map() };
const RELOAD: NativeDataGraphRetry = { kind: 'reload' };
const CLUSTERS: NativeDataGraphRetry = { kind: 'clusters' };

const hasEmptyClustersTail = (page: NativeOntologyDataGraphPage): boolean =>
  (page.clusters ?? []).length === 0 && page.nextClusterOffset !== undefined && !page.contextFull;

const clustersPlan = (
  loaded: NativeOntologyDataGraphPageRequest['loaded'],
  offset: number,
  readFailureRetry: NativeDataGraphRetry,
  apply: Apply = applyClustersPage,
): SelectionPlan => ({
  request: clustersRequest(loaded, offset),
  apply,
  readFailureRetry,
  followedBy: (page) =>
    hasEmptyClustersTail(page) && (page.nextClusterOffset ?? 0) > offset
      ? clustersPlan(page.loaded, page.nextClusterOffset ?? 0, CLUSTERS)
      : undefined,
});

const replaceClusters: Apply = (graph, page) =>
  applyClustersPage({ ...EMPTY_NATIVE_DATA_GRAPH, topology: graph.topology }, page);

const reloadPlan = (): SelectionPlan => clustersPlan([], 0, RELOAD, replaceClusters);

const newGeneration = (): Generation => ({
  controller: new AbortController(),
  hasRestartedTopology: false,
  staleReloads: 0,
});

const findCluster = (graph: NativeDataGraph, conceptId: string): NativeDataGraph['clusters'][number] | undefined =>
  graph.clusters.find((item) => item.concept.id === conceptId);

const hasEmptyBindingsTail = (page: NativeOntologyDataGraphPage): boolean =>
  Boolean(page.bindings?.after) && (page.bindings?.assets.length ?? 0) === 0;

const mergeRestoreTargets = (
  targets: RestoreTargets,
  graph: NativeDataGraph,
  pagedConceptIds: ReadonlySet<string>,
): RestoreTargets => {
  const rowCounts = new Map(targets.rowCounts);
  graph.clusters
    .filter((item) => pagedConceptIds.has(item.concept.id ?? ''))
    .forEach((item) =>
      rowCounts.set(item.concept.id ?? '', Math.max(rowCounts.get(item.concept.id ?? '') ?? 0, item.assets.length)),
    );
  return { clusterCount: Math.max(targets.clusterCount, graph.clusters.length), rowCounts };
};

export interface UseNativeOntologyDataGraphOptions {
  isActive?: boolean | (() => boolean);
  revision?: number | (() => number);
}

export interface UseNativeOntologyDataGraphResult {
  graph: Ref<NativeDataGraph>;
  isLoading: Ref<boolean>;
  isLoadingClusters: Ref<boolean>;
  loadingConceptIds: Ref<ReadonlySet<string>>;
  failure: Ref<NativeDataGraphFailure | undefined>;
  loadMoreAssets: (conceptId: string) => void;
  loadMoreClusters: () => void;
  retry: () => void;
  notifyBindingWrite: () => void;
}

export function useNativeOntologyDataGraph(
  ontologyId: string | (() => string),
  options: UseNativeOntologyDataGraphOptions = {},
): UseNativeOntologyDataGraphResult {
  const resolveId = (): string => (typeof ontologyId === 'function' ? ontologyId() : ontologyId);
  const resolveActive = (): boolean =>
    typeof options.isActive === 'function' ? options.isActive() : (options.isActive ?? true);
  const resolveRevision = (): number =>
    typeof options.revision === 'function' ? options.revision() : (options.revision ?? 0);

  const graph: Ref<NativeDataGraph> = ref(EMPTY_NATIVE_DATA_GRAPH);
  const isLoading = ref(true);
  const isLoadingClusters = ref(false);
  const loadingConceptIds: Ref<ReadonlySet<string>> = ref(new Set());
  const failure: Ref<NativeDataGraphFailure | undefined> = ref(undefined);

  let bindingWrites = 0;
  const staleKey = (): string => `${resolveRevision()}:${bindingWrites}`;
  let loadedKey = staleKey();
  let graphState: NativeDataGraph = EMPTY_NATIVE_DATA_GRAPH;
  let isLoadingState = true;
  let isLoadingClustersState = false;
  let loadingConceptIdsState: ReadonlySet<string> = new Set();
  const pagedConceptIds = new Set<string>();
  let restoreTargets: RestoreTargets = NO_RESTORE;
  let failureState: NativeDataGraphFailure | undefined;
  let generation: Generation = newGeneration();
  let queue: Promise<void> = Promise.resolve();

  const publish = (): void => {
    graph.value = graphState;
    isLoading.value = isLoadingState;
    isLoadingClusters.value = isLoadingClustersState;
    loadingConceptIds.value = loadingConceptIdsState;
    failure.value = failureState;
  };

  const isCurrent = (candidate: Generation): boolean => generation === candidate;

  const read = async (
    candidate: Generation,
    request: NativeOntologyDataGraphPageRequest,
  ): Promise<Read> => {
    try {
      const page = await getNativeOntologyDataGraphPage(resolveId(), request, candidate.controller.signal);
      return { ok: true, page };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, reason: 'other' };
      }
      return { ok: false, reason: classifyPageFailure(error) };
    }
  };

  const drainTopology = async (
    candidate: Generation,
    page: NativeOntologyDataGraphPage,
  ): Promise<PageFailure | 'done' | 'cancelled'> => {
    let staged = stageTopologyPage(EMPTY_NATIVE_TOPOLOGY, page.topology);
    let after = page.topology.after;
    while (after) {
      const next = await read(candidate, topologyRequest(page.loaded, after));
      if (!isCurrent(candidate)) {
        return 'cancelled';
      }
      if (!next.ok) {
        return next.reason;
      }
      staged = stageTopologyPage(staged, next.page.topology);
      after = next.page.topology.after;
    }
    graphState = { ...graphState, topology: staged };
    return 'done';
  };

  const fail = (reason: PageFailure, retry: NativeDataGraphRetry): Settled => {
    isLoadingState = false;
    failureState = { reason, retry };
    publish();
    return 'failed';
  };

  const failAttempt = (
    candidate: Generation,
    reason: PageFailure,
    retry: NativeDataGraphRetry,
  ): Attempt => {
    if (reason !== 'stale') {
      return { done: fail(reason, retry) };
    }
    if (candidate.staleReloads >= 1) {
      return { done: fail(reason, RELOAD) };
    }
    candidate.staleReloads += 1;
    isLoadingState = true;
    publish();
    return { again: reloadPlan() };
  };

  const attempt = async (candidate: Generation, plan: SelectionPlan): Promise<Attempt> => {
    const first = await read(candidate, plan.request);
    if (!isCurrent(candidate)) {
      return { done: 'cancelled' };
    }
    if (!first.ok) {
      return failAttempt(candidate, first.reason, plan.readFailureRetry);
    }
    graphState = plan.apply(graphState, first.page);
    const followed = plan.followedBy?.(first.page);
    isLoadingState = isLoadingState && Boolean(followed);
    publish();
    if (followed) {
      return { again: followed };
    }
    if (plan.continuesPast?.(first.page)) {
      return { done: 'continue' };
    }
    const drained = await drainTopology(candidate, first.page);
    if (drained === 'cancelled') {
      return { done: 'cancelled' };
    }
    if (drained === 'done') {
      candidate.staleReloads = 0;
      publish();
      return { done: 'ok' };
    }
    if (drained === 'invalid' && !candidate.hasRestartedTopology) {
      candidate.hasRestartedTopology = true;
      return { again: plan };
    }
    return failAttempt(candidate, drained, RELOAD);
  };

  const runSelection = async (candidate: Generation, initialPlan: SelectionPlan): Promise<Settled> => {
    let next: Attempt = { again: initialPlan };
    while ('again' in next) {
      next = await attempt(candidate, next.again);
    }
    return next.done;
  };

  const runMoreAssets = async (candidate: Generation, conceptId: string): Promise<void> => {
    const markLoading = (loading: boolean): void => {
      const ids = new Set(loadingConceptIdsState);
      if (loading) {
        ids.add(conceptId);
      } else {
        ids.delete(conceptId);
      }
      loadingConceptIdsState = ids;
      publish();
    };
    markLoading(true);
    pagedConceptIds.add(conceptId);
    let previousCursor: string | undefined;
    try {
      for (;;) {
        const cluster = findCluster(graphState, conceptId);
        if (!cluster?.after || cluster.after === previousCursor) {
          return;
        }
        previousCursor = cluster.after;
        const settled = await runSelection(candidate, {
          request: bindingsRequest(graphState.loaded, conceptId, cluster.after),
          apply: (graphValue, page) => applyBindingsPage(graphValue, conceptId, page),
          readFailureRetry: { kind: 'assets', conceptId },
          continuesPast: hasEmptyBindingsTail,
        });
        if (settled !== 'continue') {
          return;
        }
      }
    } finally {
      markLoading(false);
    }
  };

  const runMoreClusters = async (candidate: Generation): Promise<void> => {
    const { nextClusterOffset, contextFull, loaded } = graphState;
    if (nextClusterOffset === undefined || contextFull) {
      return;
    }
    isLoadingClustersState = true;
    publish();
    try {
      await runSelection(candidate, clustersPlan(loaded, nextClusterOffset, CLUSTERS));
    } finally {
      isLoadingClustersState = false;
      publish();
    }
  };

  const enqueue = (candidate: Generation, task: () => Promise<void>): void => {
    queue = queue.then(async () => {
      if (!isCurrent(candidate)) {
        return;
      }
      try {
        await task();
      } catch {
        if (isCurrent(candidate)) {
          fail('other', RELOAD);
        }
      }
    });
  };

  const beginGeneration = (): Generation => {
    generation.controller.abort();
    const next = newGeneration();
    generation = next;
    queue = Promise.resolve();
    return next;
  };

  const restoreClusters = async (candidate: Generation, clusterCount: number): Promise<boolean> => {
    let offset: number | undefined;
    for (;;) {
      const { clusters, contextFull, loaded, nextClusterOffset } = graphState;
      if (
        clusters.length >= clusterCount ||
        contextFull ||
        nextClusterOffset === undefined ||
        nextClusterOffset === offset
      ) {
        return true;
      }
      offset = nextClusterOffset;
      const settled = await runSelection(candidate, clustersPlan(loaded, offset, CLUSTERS));
      if (settled !== 'ok') {
        return false;
      }
    }
  };

  const restoreRows = async (candidate: Generation, conceptId: string, rowCount: number): Promise<void> => {
    for (;;) {
      const before = findCluster(graphState, conceptId);
      if (!isCurrent(candidate) || failureState || !before?.after || before.assets.length >= rowCount) {
        return;
      }
      await runMoreAssets(candidate, conceptId);
      const after = findCluster(graphState, conceptId);
      if ((after?.assets.length ?? 0) <= before.assets.length) {
        return;
      }
    }
  };

  const reload = (candidate: Generation, keepGraph = false): void => {
    enqueue(candidate, async () => {
      restoreTargets = keepGraph
        ? mergeRestoreTargets(restoreTargets, graphState, pagedConceptIds)
        : NO_RESTORE;
      pagedConceptIds.clear();
      if (!keepGraph) {
        graphState = EMPTY_NATIVE_DATA_GRAPH;
      }
      isLoadingState = true;
      loadingConceptIdsState = new Set();
      isLoadingClustersState = false;
      publish();
      if ((await runSelection(candidate, reloadPlan())) !== 'ok') {
        return;
      }
      const { clusterCount, rowCounts } = restoreTargets;
      if (!(await restoreClusters(candidate, clusterCount))) {
        return;
      }
      for (const [conceptId, rowCount] of rowCounts) {
        await restoreRows(candidate, conceptId, rowCount);
      }
      if (isCurrent(candidate) && !failureState) {
        restoreTargets = NO_RESTORE;
      }
    });
  };

  const loadMoreClusters = (): void => {
    const candidate = generation;
    enqueue(candidate, () => runMoreClusters(candidate));
  };

  const loadMoreAssets = (conceptId: string): void => {
    if (loadingConceptIdsState.has(conceptId)) {
      return;
    }
    const candidate = generation;
    enqueue(candidate, () => runMoreAssets(candidate, conceptId));
  };

  const retry = (): void => {
    const currentFailure = failureState;
    if (!currentFailure) {
      return;
    }
    failureState = undefined;
    const candidate = beginGeneration();
    publish();
    if (currentFailure.retry.kind === 'reload') {
      reload(candidate);
    } else if (currentFailure.retry.kind === 'clusters') {
      enqueue(candidate, () => runMoreClusters(candidate));
    } else {
      const { conceptId } = currentFailure.retry;
      enqueue(candidate, () => runMoreAssets(candidate, conceptId));
    }
  };

  const notifyBindingWrite = (): void => {
    bindingWrites += 1;
    if (!resolveActive() || loadedKey === staleKey()) {
      return;
    }
    loadedKey = staleKey();
    failureState = undefined;
    reload(beginGeneration(), true);
  };

  const startInitialLoad = (): void => {
    failureState = undefined;
    graphState = EMPTY_NATIVE_DATA_GRAPH;
    isLoadingState = true;
    loadedKey = staleKey();
    reload(beginGeneration());
  };

  onMounted(() => {
    if (resolveActive()) {
      startInitialLoad();
    }
  });

  watch(
    () => [resolveActive(), staleKey()] as [boolean, string],
    ([active, key]) => {
      if (!active || loadedKey === key) {
        return;
      }
      loadedKey = key;
      failureState = undefined;
      reload(beginGeneration(), true);
    },
  );

  onBeforeUnmount(() => {
    generation.controller.abort();
    const dead = newGeneration();
    dead.controller.abort();
    generation = dead;
  });

  return {
    graph,
    isLoading,
    isLoadingClusters,
    loadingConceptIds,
    failure,
    loadMoreAssets,
    loadMoreClusters,
    retry,
    notifyBindingWrite,
  };
}
