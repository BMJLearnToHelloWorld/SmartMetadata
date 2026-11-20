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
import {
  ALL_SERVICES_CATEGORY,
  getEntityTypeFromServiceCategory,
  getResourceEntityFromServiceCategory,
  getSearchIndexFromService,
  getServiceEmptyStateKeys,
  getServicePageHeaderKeys,
  resolveServiceCategoryParam,
  SERVICE_CATEGORY_ROWS,
  serviceCategoryByKind,
  serviceCategoryBySegment,
  WIZARD_CATEGORY_ORDER,
} from './serviceCategories';

describe('serviceCategories', () => {
  it('has exactly the 11 official categories, in wizard title order', () => {
    expect(SERVICE_CATEGORY_ROWS.map((row) => row.kind)).toEqual([
      'database',
      'dashboard',
      'messaging',
      'pipeline',
      'storage',
      'api',
      'mlmodel',
      'metadata',
      'search',
      'drive',
      'security',
    ]);
    expect(WIZARD_CATEGORY_ORDER).toBe(SERVICE_CATEGORY_ROWS);
  });

  it('maps segments to enum values per SERVICE_CATEGORY', () => {
    expect(serviceCategoryBySegment('databases')?.enumValue).toBe('databaseServices');
    expect(serviceCategoryBySegment('messaging')?.enumValue).toBe('messagingServices');
    expect(serviceCategoryBySegment('dashboards')?.enumValue).toBe('dashboardServices');
    expect(serviceCategoryBySegment('pipelines')?.enumValue).toBe('pipelineServices');
    expect(serviceCategoryBySegment('mlmodels')?.enumValue).toBe('mlmodelServices');
    expect(serviceCategoryBySegment('metadata')?.enumValue).toBe('metadataServices');
    expect(serviceCategoryBySegment('storages')?.enumValue).toBe('storageServices');
    expect(serviceCategoryBySegment('search')?.enumValue).toBe('searchServices');
    expect(serviceCategoryBySegment('apiServices')?.enumValue).toBe('apiServices');
    expect(serviceCategoryBySegment('security')?.enumValue).toBe('securityServices');
    expect(serviceCategoryBySegment('drives')?.enumValue).toBe('driveServices');
    expect(serviceCategoryByKind('llm')).toBeUndefined();
    expect(serviceCategoryByKind('mcp')).toBeUndefined();
  });

  it('resolves route params: segment, enum value, all; rejects llm/mcp', () => {
    expect(resolveServiceCategoryParam('databases')).toEqual(
      expect.objectContaining({ kind: 'database' }),
    );
    expect(resolveServiceCategoryParam('databaseServices')).toEqual(
      expect.objectContaining({ kind: 'database' }),
    );
    expect(resolveServiceCategoryParam('all')).toBe(ALL_SERVICES_CATEGORY);
    expect(resolveServiceCategoryParam('llm')).toBeUndefined();
    expect(resolveServiceCategoryParam('mcp')).toBeUndefined();
    expect(resolveServiceCategoryParam('llmServices')).toBeUndefined();
    expect(resolveServiceCategoryParam('mcpServices')).toBeUndefined();
    expect(resolveServiceCategoryParam('nope')).toBeUndefined();
    expect(resolveServiceCategoryParam(undefined)).toBeUndefined();
  });

  it('evaluates resource entities with the official segment-key gaps', () => {
    // Present segment keys hit their resource.
    expect(getResourceEntityFromServiceCategory('databases')).toBe('databaseService');
    expect(getResourceEntityFromServiceCategory('messaging')).toBe('messagingService');
    expect(getResourceEntityFromServiceCategory('dashboards')).toBe('dashboardService');
    expect(getResourceEntityFromServiceCategory('pipelines')).toBe('pipelineService');
    expect(getResourceEntityFromServiceCategory('metadata')).toBe('metadataService');
    expect(getResourceEntityFromServiceCategory('apiServices')).toBe('apiService');
    // Drive alias segments hit drive.
    expect(getResourceEntityFromServiceCategory('directories')).toBe('driveService');
    expect(getResourceEntityFromServiceCategory('files')).toBe('driveService');
    expect(getResourceEntityFromServiceCategory('spreadsheets')).toBe('driveService');
    expect(getResourceEntityFromServiceCategory('worksheets')).toBe('driveService');
    expect(getResourceEntityFromServiceCategory('searchIndex')).toBe('searchService');
    // The five missing segment keys fall back to DATABASE_SERVICE.
    expect(getResourceEntityFromServiceCategory('storages')).toBe('databaseService');
    expect(getResourceEntityFromServiceCategory('search')).toBe('databaseService');
    expect(getResourceEntityFromServiceCategory('security')).toBe('databaseService');
    expect(getResourceEntityFromServiceCategory('drives')).toBe('databaseService');
    expect(getResourceEntityFromServiceCategory('mlmodels')).toBe('databaseService');
    // Enum-value evaluation hits all 11.
    expect(getResourceEntityFromServiceCategory('storageServices')).toBe('storageService');
    expect(getResourceEntityFromServiceCategory('searchServices')).toBe('searchService');
    expect(getResourceEntityFromServiceCategory('securityServices')).toBe('securityService');
    expect(getResourceEntityFromServiceCategory('driveServices')).toBe('driveService');
    expect(getResourceEntityFromServiceCategory('mlmodelServices')).toBe('mlmodelService');
    expect(getResourceEntityFromServiceCategory('unknown')).toBe('databaseService');
  });

  it('maps entity types for all 11 enum values, fallback database', () => {
    expect(getEntityTypeFromServiceCategory('databaseServices')).toBe('databaseService');
    expect(getEntityTypeFromServiceCategory('mlmodelServices')).toBe('mlmodelService');
    expect(getEntityTypeFromServiceCategory('securityServices')).toBe('securityService');
    expect(getEntityTypeFromServiceCategory('databases')).toBe('databaseService');
    expect(getEntityTypeFromServiceCategory('nope')).toBe('databaseService');
  });

  it('maps search indexes with the official security fallback quirk', () => {
    expect(getSearchIndexFromService('databaseServices')).toBe('databaseService');
    expect(getSearchIndexFromService('dashboardServices')).toBe('dashboardService');
    expect(getSearchIndexFromService('messagingServices')).toBe('messagingService');
    expect(getSearchIndexFromService('pipelineServices')).toBe('pipelineService');
    expect(getSearchIndexFromService('mlmodelServices')).toBe('mlModelService');
    expect(getSearchIndexFromService('storageServices')).toBe('storageService');
    expect(getSearchIndexFromService('searchServices')).toBe('searchService');
    expect(getSearchIndexFromService('apiServices')).toBe('apiService');
    expect(getSearchIndexFromService('driveServices')).toBe('driveService');
    expect(getSearchIndexFromService('metadataServices')).toBe('metadataService');
    // No SECURITY_SERVICES entry: falls back to the database index.
    expect(getSearchIndexFromService('securityServices')).toBe('databaseService');
    expect(getSearchIndexFromService('unknown')).toBe('databaseService');
  });

  it('falls back to DATABASES headers and empty state for unknown categories', () => {
    expect(getServicePageHeaderKeys('databaseServices')).toEqual({
      headerKey: 'settings.services.header.database',
      subHeaderKey: 'settings.services.subheader.database',
    });
    expect(getServicePageHeaderKeys('securityServices')).toEqual({
      headerKey: 'settings.services.header.security',
      subHeaderKey: 'settings.services.subheader.security',
    });
    expect(getServicePageHeaderKeys('nope')).toEqual({
      headerKey: 'settings.services.header.database',
      subHeaderKey: 'settings.services.subheader.database',
    });
    expect(getServiceEmptyStateKeys('driveServices')).toEqual({
      titleKey: 'settings.services.empty.drive.title',
      descriptionKey: 'settings.services.empty.drive.description',
    });
    expect(getServiceEmptyStateKeys('nope')).toEqual({
      titleKey: 'settings.services.empty.database.title',
      descriptionKey: 'settings.services.empty.database.description',
    });
  });

  it('records child entity types only for the 9 categories that have them', () => {
    expect(serviceCategoryByKind('database')?.childEntityType).toBe('database');
    expect(serviceCategoryByKind('messaging')?.childEntityType).toBe('topic');
    expect(serviceCategoryByKind('api')?.childEntityType).toBe('apiCollection');
    expect(serviceCategoryByKind('drive')?.childEntityType).toBe('directory');
    expect(serviceCategoryByKind('metadata')?.childEntityType).toBeUndefined();
    expect(serviceCategoryByKind('security')?.childEntityType).toBeUndefined();
  });
});
