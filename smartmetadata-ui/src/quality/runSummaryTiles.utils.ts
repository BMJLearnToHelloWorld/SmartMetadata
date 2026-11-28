/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official RunSummaryTiles.utils.ts.
 */
import type { TestCaseResult } from '@/types/quality';

export interface RunSummary {
  runs: number;
  passed: number;
  failed: number;
  aborted: number;
  successRate?: number;
}

export function getRunSummary(results: Pick<TestCaseResult, 'testCaseStatus'>[]): RunSummary {
  const count = (status: string) =>
    results.filter((result) => result.testCaseStatus === status).length;

  const passed = count('Success');
  const completed = results.length - count('Queued');

  return {
    runs: results.length,
    passed,
    failed: count('Failed'),
    aborted: count('Aborted'),
    successRate: completed > 0 ? Math.round((passed / completed) * 1000) / 10 : undefined,
  };
}