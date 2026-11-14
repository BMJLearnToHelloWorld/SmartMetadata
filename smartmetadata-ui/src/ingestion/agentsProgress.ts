/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  Agent,
  GlobalCounter,
  ProgressNode,
  ProgressUpdate,
  ProgressUpdateType,
} from '@/types/ingestion';
import { getShortRelativeTime } from '@/utils/relativeTime';

/**
 * Live progress application, ported from official
 * utils/AgentsProgressPureUtils.ts (openmetadata-ui, pin
 * a3012259ca): pure functions that fold one ProgressUpdate into an
 * Agent view-model. No fetching, no timers — the stream consumer
 * owns those.
 */

export function isTerminalProgressUpdate(updateType: ProgressUpdateType): boolean {
  return updateType === 'PIPELINE_COMPLETE' || updateType === 'ERROR';
}

/** Run-level counters survive scope pruning, so they are the first asset source. */
export function sumGlobalCounters(counters?: readonly GlobalCounter[]): number {
  return (counters ?? []).reduce((sum, counter) => sum + (counter.done ?? 0), 0);
}

/** Leaf-processed counts of the progress tree — the fallback asset source. */
export function sumLeafProcessed(node?: ProgressNode): number {
  if (node === undefined) {
    return 0;
  }
  const children = node.children ?? [];
  if (children.length === 0) {
    return node.processed ?? 0;
  }
  return children.reduce((sum, child) => sum + sumLeafProcessed(child), 0);
}

function computeAssets(update: ProgressUpdate): number {
  if (update.totalAssetsIngested !== undefined && update.totalAssetsIngested !== null) {
    return update.totalAssetsIngested;
  }
  if (update.globalCounters?.length) {
    return sumGlobalCounters(update.globalCounters);
  }
  return sumLeafProcessed(update.progress);
}

/**
 * Sum of every counter's `total`, but only when all totals are known. Returns
 * null when there are no counters or any total is still unknown, so callers can
 * distinguish "no reliable target yet" from a genuine zero.
 */
function sumKnownCounterTotals(counters?: readonly GlobalCounter[]): number | null {
  return counters?.length &&
    counters.every((counter) => counter.total !== null && counter.total !== undefined)
    ? counters.reduce((sum, counter) => sum + (counter.total ?? 0), 0)
    : null;
}

function computeTarget(agent: Agent, update: ProgressUpdate, assets: number): number {
  const knownTotal = sumKnownCounterTotals(update.globalCounters);
  let target = agent.target;
  if (knownTotal !== null) {
    target = knownTotal;
  } else if (target === 0 && assets > 0) {
    target = Math.max(assets, 1);
  }
  return target;
}

/**
 * Percent comes ONLY from the global counters, and only when every
 * counter's total is known; it never moves backwards.
 */
function computePct(agent: Agent, update: ProgressUpdate): number {
  const counters = update.globalCounters ?? [];
  const total = sumKnownCounterTotals(counters);
  let raw = agent.pct;
  if (total !== null && total > 0) {
    raw = Math.min(100, Math.round((sumGlobalCounters(counters) / total) * 100));
  }
  return Math.max(raw, agent.pct);
}

function computeEta(agent: Agent, update: ProgressUpdate): number | null {
  return update.estimatedSecondsRemaining === undefined
    ? agent.eta
    : update.estimatedSecondsRemaining;
}

export function resetAgentProgress(agent: Agent): Agent {
  return {
    ...agent,
    pct: 0,
    assets: 0,
    target: 0,
    eta: null,
    finishedAt: undefined,
  };
}

export function applyProgressToAgent(agent: Agent, update: ProgressUpdate): Agent {
  const assets = Math.max(computeAssets(update), agent.assets);
  const target = computeTarget(agent, update, assets);
  const eta = computeEta(agent, update);

  if (update.updateType === 'PIPELINE_COMPLETE') {
    return {
      ...agent,
      status: 'success',
      pct: 100,
      eta: 0,
      assets,
      target: Math.max(assets, 1),
      finishedAt: getShortRelativeTime(update.timestamp),
      currentRunId: update.runId,
    };
  }

  if (update.updateType === 'ERROR') {
    return {
      ...agent,
      status: 'failed',
      eta: null,
      assets,
      target,
      finishedAt: getShortRelativeTime(update.timestamp),
      currentRunId: update.runId,
    };
  }

  return {
    ...agent,
    status: 'running',
    pct: computePct(agent, update),
    eta,
    assets,
    target,
    finishedAt: undefined,
    currentRunId: update.runId,
  };
}
