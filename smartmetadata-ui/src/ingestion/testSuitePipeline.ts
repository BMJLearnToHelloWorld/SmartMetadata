/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official
 * `components/DataQuality/AddDataQualityTest/components/TestSuitePipelineForm.utils.ts`
 * (pin a3012259ca).
 *
 * A TestSuite pipeline belongs to the suite itself (`service: { id:
 * testSuiteId, type: 'testSuite' }`); its config carries the table under
 * test as `entityFullyQualifiedName` — `undefined` for a bundle (logical)
 * suite — and the selected test case names, or `undefined` when the
 * selection is empty (select-all or nothing chosen means "every test case
 * of the suite"). Edits go through the P-07 JSON Patch with
 * `buildTestSuiteIngestionPatch`, which only touches displayName,
 * scheduleInterval, raiseOnError, loggerLevel and testCases.
 */
import { compare, type Operation } from 'fast-json-patch';
import type { CreateIngestionPipelineRequest, IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import { generateUUID, getIngestionName, replaceAllSpacialCharWith_ } from './uuid';

export interface TestSuiteIngestionData {
  cron?: string;
  enableDebugLog: boolean;
  name?: string;
  selectAllTestCases: boolean;
  testCases?: string[];
  raiseOnError?: boolean;
}

export interface TestSuitePipelineFormValues {
  cron?: string;
  enableDebugLog: boolean;
  name?: string;
  selectAllTestCases: boolean;
  testCases?: string[];
  raiseOnError?: boolean;
}

/** Official `normalizeSelectedTestProp`: a single name, a list, or nothing → a list. */
export function normalizeSelectedTestCases(value: unknown): string[] {
  if (typeof value === 'string') {
    return value ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export const toTestSuiteIngestionData = ({
  cron,
  enableDebugLog,
  testCases,
  name,
  selectAllTestCases,
  raiseOnError,
}: TestSuitePipelineFormValues): TestSuiteIngestionData => {
  const testCaseNames = normalizeSelectedTestCases(testCases);

  return {
    cron,
    enableDebugLog,
    name,
    selectAllTestCases,
    testCases: testCaseNames.length > 0 ? testCaseNames : undefined,
    raiseOnError,
  };
};

function getNameFromFqn(fqn: string): string {
  return fqn.split('.').at(-1) ?? fqn;
}

export const buildTestSuiteIngestionPayload = (
  data: TestSuiteIngestionData,
  {
    testSuiteId,
    nameFqn,
    entityFqn,
  }: {
    testSuiteId: string;
    /** FQN whose last part names the pipeline when the user leaves Name empty. */
    nameFqn: string;
    /** The table under test; undefined for a logical suite. */
    entityFqn?: string;
  },
): CreateIngestionPipelineRequest => {
  const tableName = replaceAllSpacialCharWith_(getNameFromFqn(nameFqn));

  return {
    airflowConfig: {
      scheduleInterval: data.cron,
    },
    displayName: data.name || getIngestionName(tableName, 'TestSuite'),
    name: generateUUID(),
    loggerLevel: data.enableDebugLog ? 'DEBUG' : 'INFO',
    pipelineType: 'TestSuite',
    raiseOnError: data.raiseOnError ?? true,
    service: {
      id: testSuiteId,
      type: 'testSuite',
    },
    sourceConfig: {
      config: {
        type: 'TestSuite',
        entityFullyQualifiedName: entityFqn,
        testCases: data.testCases,
      },
    },
  };
};

export interface TestSuitePipelineScope {
  testSuiteId: string;
  /** The table under test; undefined for a logical (bundle) suite. */
  tableFqn?: string;
  /** FQN whose last part names the pipeline when Name is left empty. */
  nameFqn: string;
}

/**
 * Resolves which suite a pipeline belongs to and which table it tests.
 * A basic suite owns exactly its table's test cases, so the table FQN is
 * the suite's `basicEntityReference`; a bundle suite has no table. The
 * suite id is the pipeline's service id in both cases (a basic suite IS
 * its table's testSuite).
 */
export const getTestSuitePipelineScope = ({
  testSuite,
  ingestionPipeline,
}: {
  testSuite?: TestSuite;
  ingestionPipeline?: IngestionPipeline;
}): TestSuitePipelineScope => {
  const tableFqn =
    ingestionPipeline?.sourceConfig?.config?.entityFullyQualifiedName ??
    (testSuite?.basic ? testSuite.basicEntityReference : undefined);

  return {
    testSuiteId: testSuite?.id ?? ingestionPipeline?.service?.id ?? '',
    tableFqn,
    nameFqn: tableFqn ?? testSuite?.fullyQualifiedName ?? '',
  };
};

/** Form values for a new pipeline, or the pipeline being edited. */
export const getTestSuitePipelineFormDefaults = (
  ingestionPipeline: IngestionPipeline | undefined,
  defaultCron: string | undefined,
): TestSuitePipelineFormValues => {
  if (!ingestionPipeline) {
    return {
      cron: defaultCron,
      enableDebugLog: false,
      raiseOnError: true,
      selectAllTestCases: false,
    };
  }
  const testCases = ingestionPipeline.sourceConfig?.config?.testCases as string[] | undefined;

  return {
    cron: ingestionPipeline.airflowConfig?.scheduleInterval,
    enableDebugLog: ingestionPipeline.loggerLevel === 'DEBUG',
    name: ingestionPipeline.displayName,
    raiseOnError: ingestionPipeline.raiseOnError ?? true,
    // A pipeline without a test case list runs every test case of the suite.
    selectAllTestCases: testCases === undefined,
    testCases,
  };
};

export const buildTestSuiteIngestionPatch = (
  ingestionPipeline: IngestionPipeline,
  data: TestSuiteIngestionData,
): Operation[] =>
  compare(ingestionPipeline, {
    ...ingestionPipeline,
    displayName: data.name || ingestionPipeline.displayName,
    airflowConfig: {
      ...ingestionPipeline.airflowConfig,
      scheduleInterval: data.cron,
    },
    raiseOnError: data.raiseOnError ?? true,
    loggerLevel: data.enableDebugLog ? 'DEBUG' : 'INFO',
    sourceConfig: {
      ...ingestionPipeline.sourceConfig,
      config: {
        ...ingestionPipeline.sourceConfig?.config,
        testCases: data.testCases,
      },
    },
  });

/**
 * Official `testCasePickerScope` (`TestSuitePipelineFormFields.tsx`): the
 * case picker is scoped by `testSuiteId`, and a basic suite is further
 * scoped by the table's `entityLink`. The list endpoint parses the free
 * text as a literal term, so the suite scope travels as first-class
 * filter params.
 */
export function testCasePickerScope({
  testSuiteId,
  tableFqn,
}: {
  testSuiteId?: string;
  tableFqn?: string;
}): { testSuiteId?: string; entityLink?: string; includeAllTests?: boolean } {
  return {
    testSuiteId,
    ...(tableFqn
      ? {
          entityLink: `<#E::table::${tableFqn}>`,
          includeAllTests: true,
        }
      : {}),
  };
}
