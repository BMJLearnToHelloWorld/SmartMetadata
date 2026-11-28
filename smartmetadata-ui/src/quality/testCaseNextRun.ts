/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official IncidentManagerDetailPage.utils.ts next-run helpers.
 */
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestCase } from '@/types/quality';
import { getNextCronRunTimestamp } from '@/quality/cronUtils';

const TEST_SUITE_PIPELINE_FIELDS = 'airflowConfig';
const TEST_SUITE_PIPELINE_LIMIT = 100;

async function getPipelineNextRunTimestamp(pipeline: IngestionPipeline): Promise<number | undefined> {
  const scheduleInterval = pipeline.airflowConfig?.scheduleInterval;
  if (
    pipeline.enabled === false ||
    pipeline.airflowConfig?.pausePipeline ||
    !scheduleInterval
  ) {
    return undefined;
  }
  return getNextCronRunTimestamp(scheduleInterval, pipeline.airflowConfig?.pipelineTimezone);
}

export async function fetchNextTestCaseRunTimestamp(
  testSuiteFqns: string[],
): Promise<number | null | undefined> {
  if (!testSuiteFqns.length) {
    return null;
  }
  const responses = await Promise.all(
    testSuiteFqns.map((testSuite) =>
      listIngestionPipelines({
        fields: TEST_SUITE_PIPELINE_FIELDS,
        limit: TEST_SUITE_PIPELINE_LIMIT,
        pipelineType: 'TestSuite',
        testSuite,
      }),
    ),
  );
  const nextRuns = (
    await Promise.all(
      responses.flatMap(({ data }) => data).map(getPipelineNextRunTimestamp),
    )
  ).filter((nextRun): nextRun is number => nextRun !== undefined);

  return nextRuns.length ? Math.min(...nextRuns) : null;
}

export function getTestSuiteFqns(testCase?: TestCase): string[] {
  const fqns = [
    testCase?.testSuite?.fullyQualifiedName ?? testCase?.testSuite?.name,
    ...(testCase?.testSuites?.map((suite) => suite.fullyQualifiedName ?? suite.name) ?? []),
  ].filter((fqn): fqn is string => Boolean(fqn));
  return [...new Set(fqns)];
}

export function shouldFetchNextRun(options: {
  activeTab: string;
  testSuiteFqns: string[];
}): boolean {
  return Boolean(
    options.testSuiteFqns.length && options.activeTab === 'test-case-results',
  );
}