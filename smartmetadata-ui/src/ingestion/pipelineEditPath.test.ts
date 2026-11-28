/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { getPipelineEditPath } from '@/ingestion/pipelineEditPath';
import type { IngestionPipeline } from '@/types/ingestion';

function pipeline(overrides: Partial<IngestionPipeline> = {}): IngestionPipeline {
  return {
    id: 'p1',
    name: 'warehouse-metadata',
    fullyQualifiedName: 'warehouse.warehouse-metadata',
    pipelineType: 'metadata',
    service: {
      id: 's1',
      type: 'databaseService',
      name: 'warehouse',
      fullyQualifiedName: 'warehouse',
    },
    ...overrides,
  };
}

describe('getPipelineEditPath (official PipelineActionsDropdown.handleUpdate)', () => {
  it('builds official EDIT_INGESTION for a service pipeline', () => {
    expect(getPipelineEditPath(pipeline())).toBe(
      '/service/databaseServices/warehouse/edit-ingestion/warehouse.warehouse-metadata/metadata',
    );
  });

  it('uses official service context when provided', () => {
    expect(
      getPipelineEditPath(
        pipeline({ service: { id: 's1', type: 'databaseService', name: 'warehouse' } }),
        'databaseServices',
        'svc/prod',
      ),
    ).toBe(
      '/service/databaseServices/svc%2Fprod/edit-ingestion/warehouse.warehouse-metadata/metadata',
    );
  });

  it('falls back to serviceName.ingestion.name when fullyQualifiedName is missing', () => {
    expect(
      getPipelineEditPath(pipeline({ fullyQualifiedName: undefined }), 'databaseServices', 'warehouse'),
    ).toBe(
      '/service/databaseServices/warehouse/edit-ingestion/warehouse.warehouse-metadata/metadata',
    );
  });

  it('routes TestSuite pipelines to official TEST_SUITES_EDIT_INGESTION', () => {
    expect(
      getPipelineEditPath(
        pipeline({
          name: 'pipeline',
          fullyQualifiedName: 'suite.fqn.pipeline',
          pipelineType: 'TestSuite',
        }),
      ),
    ).toBe('/test-suites/suite.fqn/edit-ingestion/suite.fqn.pipeline');
  });
});
