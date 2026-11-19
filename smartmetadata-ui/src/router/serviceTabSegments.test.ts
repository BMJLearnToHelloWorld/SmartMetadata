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
import { SERVICE_ENTITY_TYPE_BY_KIND } from '@/ingestion/connections';
import {
  DATA_OBSERVABILITY_SEGMENT,
  SERVICE_ENUM_SEGMENTS,
  SERVICE_KIND_SEGMENTS,
  isServiceListKind,
  isValidServiceTab,
  kindToSegment,
  resolveServiceTab,
} from './serviceTabSegments';

describe('service list-segment validation (§4.3 / D-18, C-2 A-1)', () => {
  it('accepts all eleven mapping-key segments', () => {
    const expected: Record<string, string> = {
      databases: 'database',
      messaging: 'messaging',
      dashboards: 'dashboard',
      pipelines: 'pipeline',
      mlmodels: 'mlmodel',
      metadata: 'metadata',
      storages: 'storage',
      search: 'search',
      apiServices: 'api',
      security: 'security',
      drives: 'drive',
    };
    expect(SERVICE_KIND_SEGMENTS).toEqual({
      database: 'databases',
      messaging: 'messaging',
      dashboard: 'dashboards',
      pipeline: 'pipelines',
      mlmodel: 'mlmodels',
      metadata: 'metadata',
      storage: 'storages',
      search: 'search',
      api: 'apiServices',
      security: 'security',
      drive: 'drives',
    });
    for (const [segment, kind] of Object.entries(expected)) {
      expect(isValidServiceTab(segment)).toBe(true);
      expect(resolveServiceTab(segment)).toEqual({ kind });
    }
  });

  it('accepts all eleven enum-value segments and normalizes them to the same kind', () => {
    expect(SERVICE_ENUM_SEGMENTS).toEqual({
      databaseServices: 'database',
      messagingServices: 'messaging',
      dashboardServices: 'dashboard',
      pipelineServices: 'pipeline',
      mlmodelServices: 'mlmodel',
      metadataServices: 'metadata',
      storageServices: 'storage',
      searchServices: 'search',
      apiServices: 'api',
      securityServices: 'security',
      driveServices: 'drive',
    });
    for (const [segment, kind] of Object.entries(SERVICE_ENUM_SEGMENTS)) {
      expect(isValidServiceTab(segment)).toBe(true);
      expect(resolveServiceTab(segment)).toEqual({ kind });
    }
    // apiServices is both a mapping key and an enum value; both agree.
    expect(resolveServiceTab('apiServices')).toEqual({ kind: 'api' });
  });

  it('accepts dataObservability as the kindless segment', () => {
    expect(DATA_OBSERVABILITY_SEGMENT).toBe('dataObservability');
    expect(isValidServiceTab('dataObservability')).toBe(true);
    expect(resolveServiceTab('dataObservability')).toEqual({ dataObservability: true });
  });

  it('rejects llm/mcp in every spelling (C-2)', () => {
    for (const segment of ['llm', 'mcp', 'llmServices', 'mcpServices']) {
      expect(isValidServiceTab(segment)).toBe(false);
      expect(resolveServiceTab(segment)).toBeNull();
    }
    expect(kindToSegment('llm')).toBeUndefined();
    expect(kindToSegment('mcp')).toBeUndefined();
    expect(isServiceListKind('llm')).toBe(false);
    expect(isServiceListKind('mcp')).toBe(false);
  });

  it('rejects unknown segments', () => {
    for (const segment of ['', 'all', 'databases2', 'DatabaseServices', 'data-observability']) {
      expect(isValidServiceTab(segment)).toBe(false);
      expect(resolveServiceTab(segment)).toBeNull();
    }
  });

  it('maps every listable kind to its segment and back', () => {
    for (const [kind, segment] of Object.entries(SERVICE_KIND_SEGMENTS)) {
      expect(kindToSegment(kind)).toBe(segment);
      expect(isServiceListKind(kind)).toBe(true);
      expect(resolveServiceTab(segment)).toEqual({ kind });
    }
  });

  it('keeps detail permission evaluation on llmService/mcpService, never DATABASE (C-2)', () => {
    // The segment table constrains list segments only; detail direct
    // access keeps evaluating llm/mcp services under their own keys.
    expect(SERVICE_ENTITY_TYPE_BY_KIND.llm).toBe('llmService');
    expect(SERVICE_ENTITY_TYPE_BY_KIND.mcp).toBe('mcpService');
    expect(SERVICE_ENTITY_TYPE_BY_KIND.database).toBe('databaseService');
  });
});
