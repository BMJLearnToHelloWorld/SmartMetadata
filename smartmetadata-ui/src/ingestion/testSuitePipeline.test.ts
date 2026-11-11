/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import {
  buildTestSuiteIngestionPatch,
  buildTestSuiteIngestionPayload,
  getTestSuitePipelineFormDefaults,
  getTestSuitePipelineScope,
  normalizeSelectedTestCases,
  testCasePickerScope,
  toTestSuiteIngestionData,
} from './testSuitePipeline';

const basicSuite: TestSuite = {
  id: 'suite1',
  name: 'orders_suite',
  fullyQualifiedName: 'orders_suite',
  basic: true,
  basicEntityReference: 'svc.db.schema.orders',
  tests: [],
  owners: [],
};

const bundleSuite: TestSuite = {
  id: 'suite2',
  name: 'logical_suite',
  fullyQualifiedName: 'logical_suite',
  basic: false,
  tests: [],
  owners: [],
};

describe('toTestSuiteIngestionData (official TestSuitePipelineForm.utils.ts)', () => {
  it('turns an empty case list into undefined', () => {
    expect(
      toTestSuiteIngestionData({
        cron: '0 0 * * *',
        enableDebugLog: false,
        selectAllTestCases: false,
        testCases: [],
        raiseOnError: true,
      }).testCases,
    ).toBeUndefined();
  });

  it('keeps a non-empty case list', () => {
    expect(
      toTestSuiteIngestionData({
        cron: '0 0 * * *',
        enableDebugLog: false,
        selectAllTestCases: false,
        testCases: ['a', 'b'],
        raiseOnError: true,
      }).testCases,
    ).toEqual(['a', 'b']);
  });
});

describe('normalizeSelectedTestCases', () => {
  it('normalizes a single name, a list, and nothing', () => {
    expect(normalizeSelectedTestCases('a')).toEqual(['a']);
    expect(normalizeSelectedTestCases(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(normalizeSelectedTestCases(undefined)).toEqual([]);
  });
});

describe('buildTestSuiteIngestionPayload (official TestSuitePipelineForm.utils.ts)', () => {
  it('names the pipeline with a UUID and scopes it to the suite', () => {
    const payload = buildTestSuiteIngestionPayload(
      {
        cron: '0 0 * * *',
        enableDebugLog: false,
        selectAllTestCases: false,
        testCases: ['row_count'],
        raiseOnError: true,
      },
      { testSuiteId: 'suite1', nameFqn: 'svc.db.schema.orders', entityFqn: 'svc.db.schema.orders' },
    );
    expect(payload.name).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(payload.displayName).toMatch(/^orders_TestSuite_[A-Za-z0-9]{8}$/);
    expect(payload.pipelineType).toBe('TestSuite');
    expect(payload.service).toEqual({ id: 'suite1', type: 'testSuite' });
    expect(payload.sourceConfig.config).toEqual({
      type: 'TestSuite',
      entityFullyQualifiedName: 'svc.db.schema.orders',
      testCases: ['row_count'],
    });
    expect(payload.loggerLevel).toBe('INFO');
    expect(payload.raiseOnError).toBe(true);
    expect('pausePipeline' in payload.airflowConfig).toBe(false);
  });

  it('sends DEBUG when debug logging is enabled', () => {
    const payload = buildTestSuiteIngestionPayload(
      {
        cron: '0 0 * * *',
        enableDebugLog: true,
        selectAllTestCases: true,
        raiseOnError: true,
      },
      { testSuiteId: 'suite2', nameFqn: 'logical_suite' },
    );
    expect(payload.loggerLevel).toBe('DEBUG');
    expect(payload.sourceConfig.config?.entityFullyQualifiedName).toBeUndefined();
    expect(payload.sourceConfig.config?.testCases).toBeUndefined();
  });

  it('defaults the display name from the table name for a basic suite', () => {
    const payload = buildTestSuiteIngestionPayload(
      { enableDebugLog: false, selectAllTestCases: false, raiseOnError: true },
      { testSuiteId: 'suite1', nameFqn: 'svc.db.schema.orders', entityFqn: 'svc.db.schema.orders' },
    );
    expect(payload.displayName).toMatch(/^orders_TestSuite_[A-Za-z0-9]{8}$/);
  });
});

describe('getTestSuitePipelineScope (official TestSuitePipelineForm.utils.ts)', () => {
  it('scopes a basic suite to its table', () => {
    expect(getTestSuitePipelineScope({ testSuite: basicSuite })).toEqual({
      testSuiteId: 'suite1',
      tableFqn: 'svc.db.schema.orders',
      nameFqn: 'svc.db.schema.orders',
    });
  });

  it('leaves a bundle suite without a table', () => {
    expect(getTestSuitePipelineScope({ testSuite: bundleSuite })).toEqual({
      testSuiteId: 'suite2',
      tableFqn: undefined,
      nameFqn: 'logical_suite',
    });
  });

  it('falls back to the pipeline service id when the suite is unknown', () => {
    const pipeline: IngestionPipeline = {
      id: 'p1',
      name: 'x',
      service: { id: 'suite9', type: 'testSuite', name: 's' },
      sourceConfig: { config: { type: 'TestSuite', entityFullyQualifiedName: 't.orders' } },
    };
    expect(getTestSuitePipelineScope({ ingestionPipeline: pipeline })).toEqual({
      testSuiteId: 'suite9',
      tableFqn: 't.orders',
      nameFqn: 't.orders',
    });
  });
});

describe('getTestSuitePipelineFormDefaults (official TestSuitePipelineForm.utils.ts)', () => {
  it('defaults a new pipeline to daily cron, debug off, raise on, select-all off', () => {
    expect(getTestSuitePipelineFormDefaults(undefined, '0 0 * * *')).toEqual({
      cron: '0 0 * * *',
      enableDebugLog: false,
      raiseOnError: true,
      selectAllTestCases: false,
    });
  });

  it('prefills an edit from the saved pipeline', () => {
    const pipeline: IngestionPipeline = {
      id: 'p1',
      name: 'x',
      displayName: 'My Suite Pipeline',
      pipelineType: 'TestSuite',
      airflowConfig: { scheduleInterval: '0 12 * * *' },
      loggerLevel: 'DEBUG',
      raiseOnError: false,
      sourceConfig: { config: { type: 'TestSuite', testCases: ['a'] } },
    };
    expect(getTestSuitePipelineFormDefaults(pipeline, '0 0 * * *')).toEqual({
      cron: '0 12 * * *',
      enableDebugLog: true,
      name: 'My Suite Pipeline',
      raiseOnError: false,
      selectAllTestCases: false,
      testCases: ['a'],
    });
  });

  it('treats a missing test case list as select-all', () => {
    const pipeline: IngestionPipeline = {
      id: 'p1',
      name: 'x',
      airflowConfig: {},
      sourceConfig: { config: { type: 'TestSuite' } },
    };
    expect(getTestSuitePipelineFormDefaults(pipeline, undefined).selectAllTestCases).toBe(true);
  });
});

describe('buildTestSuiteIngestionPatch (official TestSuitePipelineForm.utils.ts)', () => {
  it('only touches displayName, schedule, raiseOnError, loggerLevel and testCases', () => {
    const pipeline: IngestionPipeline = {
      id: 'p1',
      name: 'uuid-1',
      displayName: 'Old',
      pipelineType: 'TestSuite',
      airflowConfig: { scheduleInterval: '0 0 * * *' },
      loggerLevel: 'INFO',
      raiseOnError: true,
      service: { id: 'suite1', type: 'testSuite', name: 's' },
      sourceConfig: { config: { type: 'TestSuite', entityFullyQualifiedName: 't.orders' } },
    };
    const ops = buildTestSuiteIngestionPatch(pipeline, {
      cron: '0 12 * * *',
      enableDebugLog: true,
      name: 'New',
      selectAllTestCases: false,
      testCases: ['a'],
      raiseOnError: false,
    });
    const paths = ops.map((op) => op.path);
    expect(paths).toContain('/displayName');
    expect(paths).toContain('/airflowConfig/scheduleInterval');
    expect(paths).toContain('/raiseOnError');
    expect(paths).toContain('/loggerLevel');
    expect(paths).toContain('/sourceConfig/config/testCases');
    expect(paths).not.toContain('/name');
    expect(paths).not.toContain('/service');
    expect(paths).not.toContain('/sourceConfig/config/entityFullyQualifiedName');
  });
});

describe('testCasePickerScope (official TestSuitePipelineFormFields.tsx)', () => {
  it('scopes a basic suite by testSuiteId and the table entityLink', () => {
    expect(
      testCasePickerScope({ testSuiteId: 'suite1', tableFqn: 'svc.db.schema.orders' }),
    ).toEqual({
      testSuiteId: 'suite1',
      entityLink: '<#E::table::svc.db.schema.orders>',
      includeAllTests: true,
    });
  });

  it('scopes a bundle suite by testSuiteId alone', () => {
    expect(testCasePickerScope({ testSuiteId: 'suite2' })).toEqual({ testSuiteId: 'suite2' });
  });
});
