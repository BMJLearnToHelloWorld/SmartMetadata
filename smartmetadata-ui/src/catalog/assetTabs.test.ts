/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { assetTabKeys } from './assetTabs';

describe('assetTabKeys', () => {
  it('keeps table tabs plus shared chrome', () => {
    expect(assetTabKeys('table')).toEqual([
      'overview',
      'schema',
      'lineage',
      'quality',
      'activity',
      'customProperties',
    ]);
  });

  it('adds only payload-backed type tabs', () => {
    expect(assetTabKeys('dashboard')).toContain('charts');
    expect(assetTabKeys('dashboard')).not.toContain('schema');
    expect(assetTabKeys('pipeline')).toEqual([
      'overview',
      'tasks',
      'executions',
      'lineage',
      'quality',
      'activity',
      'customProperties',
    ]);
    expect(assetTabKeys('mlmodel')).toContain('features');
    expect(assetTabKeys('storedProcedure')).toContain('code');
    expect(assetTabKeys('container')).toContain('schema');
    expect(assetTabKeys('searchIndex')).toContain('schema');
  });

  it('does not invent a schema tab for types without a schema payload', () => {
    expect(assetTabKeys('chart')).toEqual(['overview', 'lineage', 'quality', 'activity', 'customProperties']);
  });
});
