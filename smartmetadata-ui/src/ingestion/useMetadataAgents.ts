/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, reactive, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import { getIngestionPipelineByFqn } from '@/api/ingestionPipelines';
import { applyProgressToAgent, isTerminalProgressUpdate, resetAgentProgress } from './agentsProgress';
import { mapPipelineToAgent, SERVICE_INGESTION_PIPELINE_TYPES } from './agentsDataMapper';
import { useServiceProgressStream } from './useServiceProgressStream';
import type { Agent, IngestionPipeline, ServiceProgressEvent } from '@/types/ingestion';

/**
 * Live agent list, ported from official hooks/useMetadataAgents.ts
 * (openmetadata-ui, pin a3012259ca): the parent pipelines list
 * merged with agents discovered over the progress stream, with live
 * progress overrides folded in per run.
 *
 * The parent owns the pipelines ref; the reconcile step merges a
 * refetched pipeline back into it (the same ref the service page
 * renders its tab count from), so the list and the cards can never
 * disagree about a run's final state. `pipelinesByFqn` exposes the
 * merged list for the card actions, which operate on the pipeline
 * entity behind each agent — including agents the stream discovered
 * before the parent list knew them.
 *
 * Ordering note: a terminal update is applied to the live override
 * first and the override is dropped only once the reconcile refetch
 * lands (or the parent list refreshes with final statuses). Dropping
 * it on the terminal event itself would fall back to the stale
 * parent-list statuses, which still report the run as running, and
 * the "no agent running" reconcile trigger would never fire.
 */
export function useMetadataAgents(
  pipelines: Ref<IngestionPipeline[]>,
  entityType: MaybeRefOrGetter<string | undefined>,
  serviceFqn: MaybeRefOrGetter<string | undefined>,
): {
  agents: ComputedRef<Agent[]>;
  discoveredCount: ComputedRef<number>;
  pipelinesByFqn: ComputedRef<Map<string, IngestionPipeline>>;
} {
  const discoveredPipelines = reactive(new Map<string, IngestionPipeline>());
  const liveOverrides = reactive(new Map<string, Agent>());
  const lastSeen = new Map<string, { runId: string; timestamp: number }>();
  const completedThisSession = new Set<string>();

  const mergedPipelines = computed<IngestionPipeline[]>(() => {
    const parentFqns = new Set(
      pipelines.value.map((pipeline) => pipeline.fullyQualifiedName ?? ''),
    );
    const merged = [...pipelines.value];
    for (const [fqn, pipeline] of discoveredPipelines) {
      if (!parentFqns.has(fqn)) {
        merged.push(pipeline);
      }
    }
    return merged;
  });

  const pipelinesByFqn = computed(
    () =>
      new Map(
        mergedPipelines.value.map(
          (pipeline) => [pipeline.fullyQualifiedName ?? '', pipeline] as const,
        ),
      ),
  );

  const agents = computed<Agent[]>(() =>
    mergedPipelines.value.map((pipeline) => {
      const base = mapPipelineToAgent(pipeline);
      return liveOverrides.get(base.fqn) ?? base;
    }),
  );

  const discoveredCount = computed(() => discoveredPipelines.size);

  // The parent list is authoritative for finished runs: once it
  // refreshes, discovered entries it now carries are pruned, and
  // live overrides for finished runs are dropped — only a running
  // override is re-applied over the refreshed list.
  watch(
    pipelines,
    (list) => {
      const parentFqns = new Set(list.map((pipeline) => pipeline.fullyQualifiedName ?? ''));
      for (const fqn of [...discoveredPipelines.keys()]) {
        if (parentFqns.has(fqn)) {
          discoveredPipelines.delete(fqn);
        }
      }
      for (const [fqn, live] of [...liveOverrides.entries()]) {
        if (live.status !== 'running') {
          liveOverrides.delete(fqn);
        }
      }
    },
  );

  async function reconcileCompleted(): Promise<void> {
    const fqns = [...completedThisSession];
    completedThisSession.clear();
    for (const fqn of fqns) {
      try {
        const fresh = await getIngestionPipelineByFqn(fqn);
        const index = pipelines.value.findIndex(
          (pipeline) => (pipeline.fullyQualifiedName ?? '') === fqn,
        );
        if (index >= 0) {
          pipelines.value = [
            ...pipelines.value.slice(0, index),
            fresh,
            ...pipelines.value.slice(index + 1),
          ];
        } else {
          pipelines.value = [...pipelines.value, fresh];
        }
        liveOverrides.delete(fqn);
      } catch {
        // Silent, as in official: the terminal update already applied
        // the run's final numbers to the override, so the card stays
        // correct even when the refetch fails.
      }
    }
  }

  // Once no agent is running, every run that completed over the
  // stream is refetched once so the list carries its final statuses.
  watch(agents, (list) => {
    if (completedThisSession.size > 0 && !list.some((agent) => agent.status === 'running')) {
      void reconcileCompleted();
    }
  });

  function handleProgressEvent(progressEvent: ServiceProgressEvent): void {
    const update = progressEvent.event;
    const fqn = progressEvent.pipelineFqn;

    // Stale-event guard: the same run reporting an older (or equal)
    // timestamp than already seen is a replay, not new information.
    const seen = lastSeen.get(fqn);
    if (seen && seen.runId === update.runId && update.timestamp <= seen.timestamp) {
      return;
    }
    lastSeen.set(fqn, { runId: update.runId, timestamp: update.timestamp });

    // Discovery: any event carrying the pipeline entity — not only
    // DISCOVERY updates — adds an unknown agent of a service agent
    // type to the discovered set.
    const carried = progressEvent.ingestionPipeline;
    if (
      carried &&
      SERVICE_INGESTION_PIPELINE_TYPES.includes(carried.pipelineType ?? '') &&
      !pipelines.value.some((pipeline) => (pipeline.fullyQualifiedName ?? '') === fqn) &&
      !discoveredPipelines.has(fqn)
    ) {
      discoveredPipelines.set(fqn, carried);
    }

    const pipeline =
      pipelines.value.find((item) => (item.fullyQualifiedName ?? '') === fqn) ??
      discoveredPipelines.get(fqn);
    if (!pipeline) {
      return;
    }
    const base = mapPipelineToAgent(pipeline);
    const current = liveOverrides.get(fqn) ?? base;
    // A new run starts from a clean slate; the previous run's totals
    // must not leak into it.
    const starting =
      current.currentRunId !== undefined && current.currentRunId !== update.runId
        ? resetAgentProgress(base)
        : current;
    liveOverrides.set(fqn, applyProgressToAgent(starting, update));

    if (isTerminalProgressUpdate(update.updateType)) {
      completedThisSession.add(fqn);
    }
  }

  useServiceProgressStream(entityType, serviceFqn, handleProgressEvent);

  return { agents, discoveredCount, pipelinesByFqn };
}
