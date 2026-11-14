/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_PILOT_APP_NAME,
  AUTO_PILOT_SERVICE_TYPES,
  AUTO_PILOT_WORKFLOW_NAME,
  EXCLUDE_AUTO_PILOT_SERVICE_TYPES,
  getDayAgoStartGMTinMillis,
  isAutoPilotServiceType,
  isExcludedAutoPilotServiceType,
} from './autoPilot';

describe('autoPilot constants (official ServiceType / Applications constants)', () => {
  it('names the AutoPilot application and workflow', () => {
    expect(AUTO_PILOT_APP_NAME).toBe('AutoPilotApplication');
    expect(AUTO_PILOT_WORKFLOW_NAME).toBe('AutoPilotWorkflow');
  });

  it('lists exactly the pin eleven service entity types', () => {
    expect([...AUTO_PILOT_SERVICE_TYPES]).toEqual([
      'databaseService',
      'dashboardService',
      'messagingService',
      'pipelineService',
      'mlmodelService',
      'metadataService',
      'storageService',
      'searchService',
      'apiService',
      'securityService',
      'driveService',
    ]);
  });

  it('excludes only security services from AutoPilot', () => {
    expect([...EXCLUDE_AUTO_PILOT_SERVICE_TYPES]).toEqual(['securityService']);
  });

  it('classifies every fork entity type, including the two outside the pin list', () => {
    const entityTypes = [
      'databaseService',
      'dashboardService',
      'messagingService',
      'pipelineService',
      'mlmodelService',
      'metadataService',
      'storageService',
      'searchService',
      'apiService',
      'securityService',
      'driveService',
      'llmService',
      'mcpService',
    ];
    for (const entityType of entityTypes) {
      expect(isAutoPilotServiceType(entityType)).toBe(
        entityType !== 'llmService' && entityType !== 'mcpService',
      );
      expect(isExcludedAutoPilotServiceType(entityType)).toBe(entityType === 'securityService');
    }
    expect(isAutoPilotServiceType('unknownService')).toBe(false);
    expect(isExcludedAutoPilotServiceType('unknownService')).toBe(false);
  });
});

describe('getDayAgoStartGMTinMillis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T15:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns UTC midnight N days ago', () => {
    expect(getDayAgoStartGMTinMillis(6)).toBe(Date.UTC(2026, 10, 8));
    expect(getDayAgoStartGMTinMillis(0)).toBe(Date.UTC(2026, 10, 14));
    expect(getDayAgoStartGMTinMillis(1)).toBe(Date.UTC(2026, 10, 13));
  });
});
