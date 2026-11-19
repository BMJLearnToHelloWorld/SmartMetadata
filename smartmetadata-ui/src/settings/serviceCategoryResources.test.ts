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
  getResourceEntityFromServiceCategory,
  getServiceNameForTab,
} from './serviceCategoryResources';
import { startCase } from '@/utils/text';

describe('getResourceEntityFromServiceCategory (pin ServicePureUtils.ts:135-174)', () => {
  it.each([
    ['dashboards', 'dashboardService'],
    ['dashboardServices', 'dashboardService'],
    ['databases', 'databaseService'],
    ['databaseServices', 'databaseService'],
    ['mlModels', 'mlmodelService'],
    ['mlmodelServices', 'mlmodelService'],
    ['messaging', 'messagingService'],
    ['messagingServices', 'messagingService'],
    ['pipelines', 'pipelineService'],
    ['pipelineServices', 'pipelineService'],
    ['metadata', 'metadataService'],
    ['metadataServices', 'metadataService'],
    ['storageServices', 'storageService'],
    ['searchIndex', 'searchService'],
    ['searchServices', 'searchService'],
    ['apiServices', 'apiService'],
    ['directories', 'driveService'],
    ['files', 'driveService'],
    ['spreadsheets', 'driveService'],
    ['worksheets', 'driveService'],
    ['driveServices', 'driveService'],
    ['securityServices', 'securityService'],
  ])('maps %j to %j', (category, expected) => {
    expect(getResourceEntityFromServiceCategory(category)).toBe(expected);
  });

  it.each([
    // Valid list segments absent from the pin map: the DATABASE_SERVICE
    // fallback applies (pin `??` at ServicePureUtils.ts:174).
    'mlmodels',
    'storages',
    'search',
    'security',
    'drives',
    // dataObservability is not in the pin map either.
    'dataObservability',
    // Anything else, including the C-2 rejected llm/mcp spellings.
    '',
    'bogus',
    'llmServices',
    'mcpServices',
  ])('falls back to databaseService for unmapped %j', (category) => {
    expect(getResourceEntityFromServiceCategory(category)).toBe('databaseService');
  });
});

describe('getServiceNameForTab (pin ServicesPage.tsx:72-88)', () => {
  it.each([
    ['databases', 'databaseServices'],
    ['messaging', 'messagingServices'],
    ['dashboards', 'dashboardServices'],
    ['pipelines', 'pipelineServices'],
    ['mlmodels', 'mlmodelServices'],
    ['metadata', 'metadataServices'],
    ['storages', 'storageServices'],
    ['search', 'searchServices'],
    ['apiServices', 'apiServices'],
    ['security', 'securityServices'],
    ['drives', 'driveServices'],
  ])('maps the SERVICE_CATEGORY key %j to %j', (tab, expected) => {
    expect(getServiceNameForTab(tab)).toBe(expected);
  });

  it.each([
    'databaseServices',
    'messagingServices',
    'dashboardServices',
    'pipelineServices',
    'mlmodelServices',
    'metadataServices',
    'storageServices',
    'searchServices',
    'securityServices',
    'driveServices',
  ])('maps the enum value %j to itself', (tab) => {
    expect(getServiceNameForTab(tab)).toBe(tab);
  });

  it('maps dataObservability to dataObservabilityServices', () => {
    expect(getServiceNameForTab('dataObservability')).toBe('dataObservabilityServices');
  });

  it.each(['', 'bogus', 'mlModels', 'searchIndex', 'directories', 'llmServices'])(
    'falls back to databaseServices for %j',
    (tab) => {
      expect(getServiceNameForTab(tab)).toBe('databaseServices');
    },
  );
});

describe('startCase (pin lodash startCase over serviceName)', () => {
  it.each([
    ['databaseServices', 'Database Services'],
    ['messagingServices', 'Messaging Services'],
    ['dashboardServices', 'Dashboard Services'],
    ['pipelineServices', 'Pipeline Services'],
    ['mlmodelServices', 'Mlmodel Services'],
    ['metadataServices', 'Metadata Services'],
    ['storageServices', 'Storage Services'],
    ['searchServices', 'Search Services'],
    ['apiServices', 'Api Services'],
    ['securityServices', 'Security Services'],
    ['driveServices', 'Drive Services'],
    ['dataObservabilityServices', 'Data Observability Services'],
  ])('renders %j as %j', (serviceName, expected) => {
    expect(startCase(serviceName)).toBe(expected);
  });
});
