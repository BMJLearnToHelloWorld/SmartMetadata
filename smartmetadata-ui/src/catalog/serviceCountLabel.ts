/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ServiceKind } from '@/types/ingestion';

/**
 * Pin getCountLabel (utils/ServicePureUtils.ts): the child-count
 * label for a service kind. The pin returns the translated label and
 * the tab key is its lowercase form (which carries spaces for
 * "ML Models" / "Search Indexes" and shifts with locale); the
 * product stabilizes the key as the English label lowercased with
 * spaces removed (ADR:2026-11-17-service-main-tab-key) and resolves
 * the display name through i18n. Kinds without a child list
 * (metadata, security, and the fork llm/mcp kinds) fall through to
 * the pin default branch, the database plural — the tab registry,
 * not this helper, decides which tabs exist.
 */
export interface ServiceCountLabel {
  key: string;
  labelKey: string;
}

const COUNT_LABEL_BY_KIND: Record<string, { key: string; labelKey: string }> = {
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

const DEFAULT_COUNT_LABEL = COUNT_LABEL_BY_KIND.database as { key: string; labelKey: string };

export function getCountLabel(kind: ServiceKind): ServiceCountLabel {
  return COUNT_LABEL_BY_KIND[kind] ?? DEFAULT_COUNT_LABEL;
}
