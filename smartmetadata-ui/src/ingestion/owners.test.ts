/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { effectiveOwnersForPipeline, isSettingsPipelineType } from './owners';

describe('effectiveOwnersForPipeline (official AddIngestion.component.tsx)', () => {
  const saved = [{ id: 'u1', type: 'user', name: 'alice' }];
  const service = [{ id: 'u2', type: 'user', name: 'bob' }];
  const current = { id: 'u3', name: 'carol', displayName: 'Carol' };

  it('prefers saved owners', () => {
    expect(effectiveOwnersForPipeline({ savedOwners: saved, serviceOwners: service, currentUser: current })).toEqual(
      saved,
    );
  });

  it('falls back to service owners', () => {
    expect(effectiveOwnersForPipeline({ savedOwners: [], serviceOwners: service, currentUser: current })).toEqual(
      service,
    );
  });

  it('falls back to the current user', () => {
    expect(effectiveOwnersForPipeline({ serviceOwners: [], currentUser: current })).toEqual([
      { id: 'u3', type: 'user', name: 'carol', displayName: 'Carol', fullyQualifiedName: 'carol' },
    ]);
  });

  it('is empty when nothing is known', () => {
    expect(effectiveOwnersForPipeline({})).toEqual([]);
  });
});

describe('isSettingsPipelineType', () => {
  it('treats only dataInsight and elasticSearchReindex as settings pipelines', () => {
    expect(isSettingsPipelineType('dataInsight')).toBe(true);
    expect(isSettingsPipelineType('elasticSearchReindex')).toBe(true);
    expect(isSettingsPipelineType('metadata')).toBe(false);
    expect(isSettingsPipelineType('TestSuite')).toBe(false);
  });
});
