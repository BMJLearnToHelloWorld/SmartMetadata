/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { DataContract, DataContractResult } from '@/api/dataContracts';
import {
  getConstraintStatus,
  getContractStatusType,
  getSlaStatusLabel,
  getUpdatedContractDetails,
  processContractExecutionData,
  generateMonthTickPositions,
} from '@/utils/dataContract';

describe('official DataContract VIEW utils', () => {
  it('getConstraintStatus maps schema, semantic, quality, and SLA', () => {
    const status = getConstraintStatus({
      contractExecutionStatus: 'Failed',
      timestamp: 1,
      schemaValidation: { failed: 1 },
      semanticsValidation: { failed: 0 },
      qualityValidation: { failed: 2 },
      slaValidation: { refreshFrequencyMet: true, latencyMet: true, availabilityMet: true },
    });
    expect(status.schema).toBe('label.failed');
    expect(status.semantic).toBe('label.passed');
    expect(status.quality).toBe('label.failed');
    expect(status.sla).toBe('label.passed');
  });

  it('getSlaStatusLabel reports not-evaluated when nothing was checked', () => {
    expect(getSlaStatusLabel({})).toBe('label.not-evaluated');
    expect(getSlaStatusLabel({ refreshFrequencyMet: false })).toBe('label.failed');
  });

  it('getContractStatusType follows official passed/failed/warning/pending', () => {
    expect(getContractStatusType('label.passed')).toBe('success');
    expect(getContractStatusType('Failed')).toBe('failure');
    expect(getContractStatusType('warning')).toBe('warning');
    expect(getContractStatusType('label.not-evaluated')).toBe('pending');
  });

  it('getUpdatedContractDetails omits server fields and flattens termsOfUse', () => {
    const contract = {
      id: 'c1',
      name: 'orders',
      version: 0.1,
      inherited: true,
      testSuite: { id: 'ts1', type: 'testSuite' },
      latestResult: { resultId: 'r1' },
      termsOfUse: { content: 'hello', inherited: true },
      description: 'd',
    } as DataContract;
    const updated = getUpdatedContractDetails(contract);
    expect(updated.id).toBeUndefined();
    expect(updated.version).toBeUndefined();
    expect(updated.inherited).toBeUndefined();
    expect(updated.testSuite).toBeUndefined();
    expect(updated.latestResult).toBeUndefined();
    expect(updated.name).toBe('orders');
    expect(updated.termsOfUse).toBe('hello');
  });

  it('processContractExecutionData and month ticks follow official unique-name rules', () => {
    const rows: DataContractResult[] = [
      { contractExecutionStatus: 'Success', timestamp: Date.UTC(2026, 0, 15), dataContractFQN: 'c' },
      { contractExecutionStatus: 'Failed', timestamp: Date.UTC(2026, 0, 20), dataContractFQN: 'c' },
      { contractExecutionStatus: 'Aborted', timestamp: Date.UTC(2026, 1, 1), dataContractFQN: 'c' },
    ];
    const processed = processContractExecutionData(rows);
    expect(processed[0].name).toBe(`${rows[0].timestamp}_0`);
    expect(processed[0].value).toBe(1);
    expect(processed[0].success).toBe(1);
    expect(processed[1].failed).toBe(1);
    const ticks = generateMonthTickPositions(processed);
    expect(ticks).toEqual([processed[0].name, processed[2].name]);
  });
});
