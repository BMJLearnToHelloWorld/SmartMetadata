/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { serviceFilterFieldsForKind } from './serviceFilterFields';

describe('serviceFilterFields', () => {
  it('maps database to includeViews plus includeSchemas', () => {
    expect(serviceFilterFieldsForKind('database').map((field) => field.key)).toEqual([
      'includeViews',
      'includeSchemas',
    ]);
  });

  it('maps messaging, dashboard, and storage to their include fields', () => {
    expect(serviceFilterFieldsForKind('messaging').map((field) => field.key)).toEqual(['includeTopics']);
    expect(serviceFilterFieldsForKind('dashboard').map((field) => field.key)).toEqual([
      'includeDashboards',
      'includeCharts',
    ]);
    expect(serviceFilterFieldsForKind('storage').map((field) => field.key)).toEqual(['includeContainers']);
  });

  it('returns an empty table for the pipeline kind instead of inventing fields', () => {
    expect(serviceFilterFieldsForKind('pipeline')).toEqual([]);
  });

  it('uses the same keys as the pipeline sourceConfig surface', () => {
    const keys = serviceFilterFieldsForKind('database').map((field) => field.key);
    expect(keys).toContain('includeSchemas');
    expect(serviceFilterFieldsForKind('messaging')[0].key).toBe('includeTopics');
  });
});
