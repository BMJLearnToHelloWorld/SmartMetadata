/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface ResidualPageDef {
  name: string;
  path: string;
  titleKey: string;
  leadKey: string;
  emptyKey: string;
  testId: string;
}

/** Nav shells with no product API in this console. Honest Empty, no fake rows. */
export const RESIDUAL_PAGES: ResidualPageDef[] = [
  {
    name: 'marketplace-overview',
    path: 'marketplace',
    titleKey: 'shells.marketplaceOverview.title',
    leadKey: 'shells.marketplaceOverview.lead',
    emptyKey: 'shells.marketplaceOverview.empty',
    testId: 'residual-marketplace-overview',
  },
  {
    name: 'ontology-explorer',
    path: 'govern/ontology',
    titleKey: 'shells.ontologyExplorer.title',
    leadKey: 'shells.ontologyExplorer.lead',
    emptyKey: 'shells.ontologyExplorer.empty',
    testId: 'residual-ontology-explorer',
  },
  {
    name: 'column-bulk-ops',
    path: 'govern/column-bulk-ops',
    titleKey: 'shells.columnBulkOps.title',
    leadKey: 'shells.columnBulkOps.lead',
    emptyKey: 'shells.columnBulkOps.empty',
    testId: 'residual-column-bulk-ops',
  },
  {
    name: 'workflows',
    path: 'govern/workflows',
    titleKey: 'shells.workflows.title',
    leadKey: 'shells.workflows.lead',
    emptyKey: 'shells.workflows.empty',
    testId: 'residual-workflows',
  },
  {
    name: 'context-center-overview',
    path: 'context-center',
    titleKey: 'shells.contextOverview.title',
    leadKey: 'shells.contextOverview.lead',
    emptyKey: 'shells.contextOverview.empty',
    testId: 'residual-context-overview',
  },
  {
    name: 'context-center-articles',
    path: 'context-center/articles',
    titleKey: 'shells.contextArticles.title',
    leadKey: 'shells.contextArticles.lead',
    emptyKey: 'shells.contextArticles.empty',
    testId: 'residual-context-articles',
  },
  {
    name: 'context-center-documents',
    path: 'context-center/documents',
    titleKey: 'shells.contextDocuments.title',
    leadKey: 'shells.contextDocuments.lead',
    emptyKey: 'shells.contextDocuments.empty',
    testId: 'residual-context-documents',
  },
  {
    name: 'context-center-memories',
    path: 'context-center/memories',
    titleKey: 'shells.contextMemories.title',
    leadKey: 'shells.contextMemories.lead',
    emptyKey: 'shells.contextMemories.empty',
    testId: 'residual-context-memories',
  },
  {
    name: 'context-center-archive',
    path: 'context-center/archive',
    titleKey: 'shells.contextArchive.title',
    leadKey: 'shells.contextArchive.lead',
    emptyKey: 'shells.contextArchive.empty',
    testId: 'residual-context-archive',
  },
];
