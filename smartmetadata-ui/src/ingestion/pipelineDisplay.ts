/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { convertMillisecondsToHumanReadableFormat } from '@/utils/workflowDateTime';
import type { IngestionPipeline, PipelineStatus } from '@/types/ingestion';

/**
 * Official renderTypeField (openmetadata-ui
 * utils/IngestionListTableUtils.tsx, pin a3012259ca): `dbt` verbatim,
 * everything else startCase — the product's minimal equivalent is a
 * capitalised first letter, and `TestSuite` renders as "Test Suite".
 */
export function renderPipelineType(pipelineType?: string): string {
  if (!pipelineType) {
    return '—';
  }
  if (pipelineType === 'dbt') {
    return 'dbt';
  }
  if (pipelineType === 'TestSuite') {
    return 'Test Suite';
  }
  return pipelineType.charAt(0).toUpperCase() + pipelineType.slice(1);
}

/** lodash startCase equivalent for pipeline states: 'partialSuccess' -> 'Partial Success'. */
export function startCaseState(value?: string): string {
  if (!value) {
    return '—';
  }
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Official renderStatusField (same file): enabled renders the Active
 * success badge, disabled the Paused badge. The badge text comes from
 * the caller's i18n keys; this helper only decides the branch.
 */
export function pipelineStatusBadge(pipeline: IngestionPipeline): 'active' | 'paused' {
  return pipeline.enabled === false ? 'paused' : 'active';
}

export interface IngestionStatusCount {
  label: 'success' | 'failed' | 'warning';
  value: number;
  type: 'success' | 'failed' | 'warning';
}

/**
 * Official getIngestionStatusCountData (openmetadata-ui
 * utils/IngestionConfigUtils.ts:299, pin a3012259ca), applied to the
 * latest run's first step summary (IngestionListTable.tsx:113-119):
 * success = records + updated_records, failed = errors,
 * warning = warnings.
 */
export function getIngestionStatusCount(pipeline: IngestionPipeline): IngestionStatusCount[] | null {
  const summary = pipeline.pipelineStatuses?.[0]?.status?.[0];
  if (!summary) {
    return null;
  }
  return [
    { label: 'success', value: (summary.records ?? 0) + (summary.updated_records ?? 0), type: 'success' },
    { label: 'failed', value: summary.errors ?? 0, type: 'failed' },
    { label: 'warning', value: summary.warnings ?? 0, type: 'warning' },
  ];
}

/** Official isPipelineRunActive (openmetadata-ui utils/logsPolling.ts): a run is live only while running or queued. */
export function isPipelineRunActive(state?: string): boolean {
  return state === 'running' || state === 'queued';
}

/** Badge colour for a run state (used by the list and service-detail recent-runs cells). */
export function runBadgeColor(state?: string): string {
  if (state === 'success' || state === 'successful') {
    return 'success';
  }
  if (state === 'failed') {
    return 'error';
  }
  if (state === 'running' || state === 'queued') {
    return 'processing';
  }
  if (state === 'partialSuccess') {
    return 'warning';
  }
  return 'default';
}

/** A run's state pill text: the raw state with its first letter capitalised, matching official upperFirst(pipelineState). */
export function renderPipelineState(pipelineState?: string): string {
  if (!pipelineState) {
    return '—';
  }
  return pipelineState.charAt(0).toUpperCase() + pipelineState.slice(1);
}

/**
 * P-37: trigger/deploy can surface the same runId twice (an optimistic
 * row plus the re-fetched row, ~40ms apart, converging on re-entry).
 * Deduplicate by runId, keeping the first occurrence.
 */
export function dedupeStatusesByRunId(statuses: PipelineStatus[]): PipelineStatus[] {
  const seen = new Set<string>();
  return statuses.filter((status) => {
    const key = status.runId ?? `ts:${status.timestamp ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Status-table timestamp render (P-21): local date-time string, '—' when missing. */
export function formatRunTimestamp(value?: number): string {
  return value ? new Date(value).toLocaleString() : '—';
}

/**
 * Status-table duration (P-21, official executionUtils getTableViewData):
 * endTime - startTime through the product's existing duration formatter
 * (the port of official DateTimeUtils.convertMillisecondsToHumanReadableFormat),
 * '—' when either end is missing.
 */
export function formatRunDuration(startDate?: number, endDate?: number): string {
  if (!startDate || !endDate) {
    return '—';
  }
  return convertMillisecondsToHumanReadableFormat(endDate - startDate);
}

/**
 * Official row-table search highlight (openmetadata-ui
 * utils/EntitySearchUtils highlightSearchText): split the text on the
 * search string (case-insensitive), marking the matching parts so the
 * caller can wrap them in <mark>.
 */
export function splitSearchHighlight(
  text: string,
  searchText: string,
): Array<{ text: string; match: boolean }> {
  if (!searchText) {
    return [{ text, match: false }];
  }
  const lower = text.toLowerCase();
  const needle = searchText.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) {
      parts.push({ text: text.slice(from, index), match: false });
    }
    parts.push({ text: text.slice(index, index + needle.length), match: true });
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from), match: false });
  }
  return parts;
}
