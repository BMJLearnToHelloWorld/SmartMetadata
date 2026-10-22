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
import { buildSourceConfig } from './sourceConfig';

describe('pipeline sourceConfig', () => {
  it('maps database pipelines to DatabaseMetadata', () => {
    expect(
      buildSourceConfig({
        name: 'warehouse-metadata',
        pipelineType: 'metadata',
        serviceId: 'svc1',
        serviceKind: 'database',
        includeViews: true,
        includeSchemas: 'public, analytics',
      }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        includeViews: true,
        includeTables: true,
        schemaFilterPattern: { includes: ['public', 'analytics'] },
      },
    });
  });

  it('maps messaging pipelines to MessagingMetadata', () => {
    expect(
      buildSourceConfig({
        name: 'kafka-topics',
        pipelineType: 'metadata',
        serviceId: 'svc2',
        serviceKind: 'messaging',
        includeViews: true,
        includeTopics: 'orders',
      }),
    ).toEqual({
      config: {
        type: 'MessagingMetadata',
        topicFilterPattern: { includes: ['orders'] },
      },
    });
  });
});
