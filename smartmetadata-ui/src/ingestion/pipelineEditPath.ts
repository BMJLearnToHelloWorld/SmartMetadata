/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official PipelineActionsDropdown.handleUpdate destination:
 * TestSuite pipelines go to getTestSuiteIngestionPath; every other
 * type goes to getEditIngestionPath.
 */
import { SERVICE_COLLECTION_BY_KIND } from '@/api/serviceVersions';
import { SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
import type { IngestionPipeline } from '@/types/ingestion';
import {
  getEditIngestionPath,
  getTestSuiteFQN,
  getTestSuiteIngestionPath,
} from '@/utils/fqnPaths';

export function serviceCategoryFromPipeline(pipeline: Pick<IngestionPipeline, 'service'>): string {
  const entityType = pipeline.service?.type;
  if (!entityType) {
    return '';
  }
  const kind = SERVICE_KIND_BY_ENTITY_TYPE[entityType];
  return kind ? SERVICE_COLLECTION_BY_KIND[kind] : '';
}

/**
 * Official handleUpdate path. `serviceCategory` / `serviceFqn` are the
 * official PipelineActionsDropdown props (service page context). When
 * omitted, they are derived from the pipeline's service reference, or
 * the official FQN fallback `${serviceName}.${ingestion.name}`.
 */
export function getPipelineEditPath(
  pipeline: Pick<IngestionPipeline, 'name' | 'fullyQualifiedName' | 'pipelineType' | 'service'>,
  serviceCategory?: string,
  serviceFqn?: string,
): string {
  const resolvedServiceFqn =
    serviceFqn || pipeline.service?.fullyQualifiedName || pipeline.service?.name || '';
  const fullyQualifiedName = pipeline.fullyQualifiedName
    ?? (resolvedServiceFqn ? `${resolvedServiceFqn}.${pipeline.name}` : pipeline.name);

  if (pipeline.pipelineType === 'TestSuite') {
    return getTestSuiteIngestionPath(getTestSuiteFQN(fullyQualifiedName), fullyQualifiedName);
  }

  return getEditIngestionPath(
    serviceCategory || serviceCategoryFromPipeline(pipeline),
    resolvedServiceFqn,
    fullyQualifiedName,
    pipeline.pipelineType ?? '',
  );
}
