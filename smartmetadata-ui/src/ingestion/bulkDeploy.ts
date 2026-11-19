/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { isPipelineDeployed } from '@/api/ingestionPipelines';
import type { PipelineServiceClientResponse } from '@/types/ingestion';

/**
 * T-1 bulk-deploy outcome (precondition 07 §1.4, t364 Q-T1-1). The
 * caller owns the toast text and the reload; this helper owns only
 * the counting decision, so the matrix is testable without a DOM.
 *
 * - `all-deployed` (M-1): every result strictly deployed, lengths
 *   match — success toast, reload after 500ms.
 * - `partial` (M-3/M-4): some deployed — one error toast with both
 *   counts, reload after 500ms.
 * - `none-deployed` (M-2/M-4): nothing deployed — one error toast
 *   with both counts; when every failure shares one non-empty
 *   reason, `sharedReason` carries it verbatim for the caller to
 *   append. No reload.
 * - `unverifiable` (M-6): non-array response or a length mismatch —
 *   failure path, no success, no reload, never index-paired.
 *
 * Callers guard the empty target set (M-7) before invoking — no
 * request, no toast; this helper assumes at least one target.
 */
export type BulkDeployOutcome = 'all-deployed' | 'partial' | 'none-deployed' | 'unverifiable';

export interface BulkDeploySummary {
  outcome: BulkDeployOutcome;
  deployed: number;
  failed: number;
  /** Verbatim server reason, only when every failure shares one non-empty reason. */
  sharedReason?: string;
  /** True exactly when at least one pipeline was truly deployed. */
  shouldReload: boolean;
}

export function summarizeBulkDeploy(
  targetCount: number,
  results: unknown,
): BulkDeploySummary {
  if (!Array.isArray(results) || results.length !== targetCount) {
    return { outcome: 'unverifiable', deployed: 0, failed: targetCount, shouldReload: false };
  }
  const typed = results as PipelineServiceClientResponse[];
  const deployed = typed.filter((result) => isPipelineDeployed(result)).length;
  const failed = targetCount - deployed;
  if (deployed === targetCount) {
    return { outcome: 'all-deployed', deployed, failed: 0, shouldReload: true };
  }
  if (deployed === 0) {
    const reasons = typed.map((result) => result.reason ?? '');
    const shared = reasons[0];
    return {
      outcome: 'none-deployed',
      deployed: 0,
      failed,
      sharedReason: shared !== '' && reasons.every((reason) => reason === shared) ? shared : undefined,
      shouldReload: false,
    };
  }
  return { outcome: 'partial', deployed, failed, shouldReload: true };
}

/**
 * M-2 failure text: the counts line, with the shared server reason
 * appended verbatim when one exists. The reason is never translated
 * or rewritten (precondition 07 §1.4); an absent reason adds nothing.
 */
export function formatBulkDeployFailureText(countsText: string, sharedReason?: string): string {
  return sharedReason ? `${countsText} — ${sharedReason}` : countsText;
}
