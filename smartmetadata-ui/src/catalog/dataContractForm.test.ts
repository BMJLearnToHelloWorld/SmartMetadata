/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  filterInheritedContract,
  mergeQualityExpectations,
  parseAvailabilityTime,
  semanticRuleValidator,
  validSemantics,
  validSecurity,
} from './dataContractForm';
import type { DataContract } from '@/api/dataContracts';

describe('dataContractForm official helpers', () => {
  it('rejects empty semantic rules', () => {
    expect(semanticRuleValidator(undefined)).toBe('required');
    expect(semanticRuleValidator('')).toBe('required');
    expect(semanticRuleValidator('""')).toBe('required');
    expect(semanticRuleValidator('{}')).toBe('required');
    expect(semanticRuleValidator('{"==":[{"var":"displayName"},"x"]}')).toBe(true);
  });

  it('drops placeholder semantics that have no name or rule', () => {
    expect(validSemantics([{ enabled: true, name: '', rule: '' }])).toBeUndefined();
    expect(validSemantics([{ enabled: true, name: 'r1', rule: '{"==":[1,1]}' }])).toEqual([
      { enabled: true, name: 'r1', rule: '{"==":[1,1]}' },
    ]);
  });

  it('strips inherited sla/security/terms/semantics so patches add instead of replace', () => {
    const contract = {
      id: 'c1',
      name: 'orders',
      sla: { inherited: true, availabilityTime: '09:00' },
      security: { inherited: true, dataClassification: 'PII' },
      termsOfUse: { inherited: true, content: 'parent' },
      semantics: [
        { name: 'own', rule: '{}', inherited: false },
        { name: 'parent', rule: '{}', inherited: true },
      ],
    } as DataContract;
    const filtered = filterInheritedContract(contract);
    expect(filtered?.sla).toBeUndefined();
    expect(filtered?.security).toBeUndefined();
    expect(filtered?.termsOfUse).toBeUndefined();
    expect(filtered?.semantics).toEqual([{ name: 'own', rule: '{}', inherited: false }]);
  });

  it('preserves off-page quality expectations when merging paged selections', () => {
    const stored = new Map([
      ['off-page-test', { id: 'off-page-test', name: 'Off Page Test Case', type: 'testCase' }],
      ['test-1', { id: 'test-1', name: 'Test Case 1', type: 'testCase' }],
    ]);
    const merged = mergeQualityExpectations(
      ['test-2', 'off-page-test'],
      [{ id: 'test-2', name: 'Test Case 2' }],
      stored,
    );
    expect(merged).toEqual([
      { id: 'test-2', name: 'Test Case 2', description: undefined, type: 'testCase' },
      { id: 'off-page-test', name: 'Off Page Test Case', type: 'testCase' },
    ]);
  });

  it('parses official availabilityTime prefixes such as 09:00 UTC', () => {
    expect(parseAvailabilityTime('09:00 UTC')).toEqual({ hour: 9, minute: 0 });
    expect(parseAvailabilityTime('not-a-time')).toBeUndefined();
  });

  it('filters empty security row filters', () => {
    const security = validSecurity({
      dataClassification: 'PII',
      policies: [{ accessPolicy: 'p', identities: ['g1'], rowFilters: [{ columnName: '', values: [] }, { columnName: 'country', values: ['US'] }] }],
    });
    expect(security?.policies?.[0].rowFilters).toEqual([{ columnName: 'country', values: ['US'] }]);
  });
});
