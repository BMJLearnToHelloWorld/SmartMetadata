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
import type { ServiceKind } from '@/types/ingestion';
import { getCountLabel } from './serviceCountLabel';

describe('getCountLabel (pin getCountLabel)', () => {
  it('maps each child-bearing kind to its stable key and count label', () => {
    const expected: Record<string, { key: string; labelKey: string }> = {
      database: { key: 'databases', labelKey: 'serviceDetail.countLabels.database' },
      messaging: { key: 'topics', labelKey: 'serviceDetail.countLabels.topic' },
      dashboard: { key: 'dashboards', labelKey: 'serviceDetail.countLabels.dashboard' },
      pipeline: { key: 'pipelines', labelKey: 'serviceDetail.countLabels.pipeline' },
      mlmodel: { key: 'mlmodels', labelKey: 'serviceDetail.countLabels.mlmodel' },
      storage: { key: 'containers', labelKey: 'serviceDetail.countLabels.container' },
      search: { key: 'searchindexes', labelKey: 'serviceDetail.countLabels.searchIndex' },
      api: { key: 'collections', labelKey: 'serviceDetail.countLabels.apiCollection' },
      drive: { key: 'directories', labelKey: 'serviceDetail.countLabels.directory' },
    };
    for (const [kind, label] of Object.entries(expected)) {
      expect(getCountLabel(kind as ServiceKind)).toEqual(label);
    }
  });

  it('falls through to the database plural for kinds without a child list', () => {
    for (const kind of ['metadata', 'security', 'llm', 'mcp'] as const) {
      expect(getCountLabel(kind)).toEqual({
        key: 'databases',
        labelKey: 'serviceDetail.countLabels.database',
      });
    }
  });
});
