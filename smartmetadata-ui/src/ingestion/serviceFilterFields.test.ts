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
    expect(serviceFilterFieldsForKind('messaging').map((field) => field.key)).toEqual([
      'includeTopics',
      'generateSampleData',
    ]);
    expect(serviceFilterFieldsForKind('dashboard').map((field) => field.key)).toEqual([
      'includeDashboards',
      'includeCharts',
    ]);
    expect(serviceFilterFieldsForKind('storage').map((field) => field.key)).toEqual(['includeContainers']);
  });

  it('returns an empty table for the pipeline kind instead of inventing fields', () => {
    expect(serviceFilterFieldsForKind('pipeline')).toEqual([]);
  });

  it('exposes the sampler switch as a checkbox on messaging only', () => {
    const messaging = serviceFilterFieldsForKind('messaging');
    const sampler = messaging.find((field) => field.key === 'generateSampleData');
    expect(sampler).toMatchObject({
      control: 'checkbox',
      labelKey: 'ingestion.pipelines.generateSampleData',
      testId: 'filter-generate-sample-data',
    });
    expect(serviceFilterFieldsForKind('database').some((field) => field.key === 'generateSampleData')).toBe(false);
  });

  it('uses the same keys as the pipeline sourceConfig surface', () => {
    const keys = serviceFilterFieldsForKind('database').map((field) => field.key);
    expect(keys).toContain('includeSchemas');
    expect(serviceFilterFieldsForKind('messaging')[0].key).toBe('includeTopics');
  });
});
