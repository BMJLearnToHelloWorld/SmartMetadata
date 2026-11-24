/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { hasLineageSection, LINEAGE_SECTION_ENTITY_TYPES } from './lineageSection';

describe('lineageSection type gate (Q-TAB-4)', () => {
  it('matches the pin LINEAGE_TABS_SET exactly', () => {
    expect([...LINEAGE_SECTION_ENTITY_TYPES]).toEqual([
      'apiEndpoint',
      'chart',
      'container',
      'dashboard',
      'dashboardDataModel',
      'directory',
      'mlmodel',
      'pipeline',
      'searchIndex',
      'table',
      'topic',
    ]);
  });

  it('admits the directory type and excludes file, spreadsheet, worksheet and metric', () => {
    expect(hasLineageSection('directory')).toBe(true);
    expect(hasLineageSection('file')).toBe(false);
    expect(hasLineageSection('spreadsheet')).toBe(false);
    expect(hasLineageSection('worksheet')).toBe(false);
    expect(hasLineageSection('metric')).toBe(false);
  });
});
