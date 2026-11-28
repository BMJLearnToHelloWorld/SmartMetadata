/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Official DataQualityPureUtils.aggregateTestResultsByEntity: flatten
 * the entityFQN × testCaseResult.testCaseStatus report rows that
 * fetchTestCaseResultByTestSuiteId returns, and expose a `total`
 * rollup that QualityTab reads for the four summary cards.
 */
export interface TestCaseCountByStatus {
  failed: number;
  success: number;
  aborted: number;
  total: number;
}

export function emptyTestCaseCountByStatus(): TestCaseCountByStatus {
  return {
    failed: 0,
    success: 0,
    aborted: 0,
    total: 0,
  };
}

export function aggregateTestResultsByEntity(
  data: Array<{
    document_count?: string;
    entityFQN?: string;
    'testCaseResult.testCaseStatus'?: string;
  }>,
): Record<string, TestCaseCountByStatus> {
  const overallTotal = emptyTestCaseCountByStatus();

  const entities = data.reduce((acc, item) => {
    const entity = item.entityFQN;
    const status = item['testCaseResult.testCaseStatus'] as
      | 'failed'
      | 'success'
      | 'aborted';
    const count = parseInt(item.document_count ?? '', 10);

    if (!entity || !Number.isFinite(count)) {
      return acc;
    }

    if (!acc[entity]) {
      acc[entity] = emptyTestCaseCountByStatus();
    }

    acc[entity][status] = (acc[entity][status] || 0) + count;
    acc[entity].total += count;

    overallTotal[status] = (overallTotal[status] || 0) + count;
    overallTotal.total += count;

    return acc;
  }, {} as Record<string, TestCaseCountByStatus>);

  return {
    ...entities,
    total: overallTotal,
  };
}
