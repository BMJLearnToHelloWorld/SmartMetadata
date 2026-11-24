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
import { DatabaseOutlined } from '@ant-design/icons-vue';
import { entityIconFor } from './entityIcons';

describe('entityIconFor', () => {
  it('maps every Explore tab entity type to a distinct icon component', () => {
    for (const entityType of [
      'table',
      'tableColumn',
      'topic',
      'dashboard',
      'pipeline',
      'mlmodel',
      'container',
      'searchIndex',
      'storedProcedure',
      'chart',
      'metric',
      'dashboardDataModel',
      'database',
      'databaseSchema',
      'apiCollection',
      'apiEndpoint',
      'glossaryTerm',
      'tag',
      'dataProduct',
      'directory',
      'file',
      'spreadsheet',
      'worksheet',
      'page',
      'query',
    ]) {
      expect(entityIconFor(entityType)).toBeDefined();
    }
  });

  it('falls back to the generic database icon for unknown types', () => {
    expect(entityIconFor('something-new')).toBe(DatabaseOutlined);
    expect(entityIconFor('')).toBe(DatabaseOutlined);
  });
});
