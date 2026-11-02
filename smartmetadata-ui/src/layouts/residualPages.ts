/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface ResidualPageLink {
  routeName: string;
  titleKey: string;
}

export interface ResidualPageDef {
  name: string;
  path: string;
  titleKey: string;
  leadKey: string;
  emptyKey: string;
  testId: string;
  /**
   * Fix6: onward links to the nearest WORKING pages, so a residual page is a
   * signpost instead of a dead end. Rule: same-section working siblings first;
   * when the section has none, Explore + Home. The residual copy itself is
   * unchanged — links never pretend the shell page is available.
   */
  links?: ResidualPageLink[];
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
    links: [{ routeName: 'governance-domains', titleKey: 'nav.domains' }, { routeName: 'governance-data-products', titleKey: 'nav.dataProducts' }],
  },
  {
    name: 'ontology-explorer',
    path: 'govern/ontology',
    titleKey: 'shells.ontologyExplorer.title',
    leadKey: 'shells.ontologyExplorer.lead',
    emptyKey: 'shells.ontologyExplorer.empty',
    testId: 'residual-ontology-explorer',
    links: [{ routeName: 'governance-glossaries', titleKey: 'nav.glossary' }, { routeName: 'governance-classifications', titleKey: 'nav.classification' }],
  },
  {
    name: 'column-bulk-ops',
    path: 'govern/column-bulk-ops',
    titleKey: 'shells.columnBulkOps.title',
    leadKey: 'shells.columnBulkOps.lead',
    emptyKey: 'shells.columnBulkOps.empty',
    testId: 'residual-column-bulk-ops',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }],
  },
  {
    name: 'workflows',
    path: 'govern/workflows',
    titleKey: 'shells.workflows.title',
    leadKey: 'shells.workflows.lead',
    emptyKey: 'shells.workflows.empty',
    testId: 'residual-workflows',
    links: [{ routeName: 'admin-settings', titleKey: 'nav.settings' }],
  },
  {
    name: 'context-center-overview',
    path: 'context-center',
    titleKey: 'shells.contextOverview.title',
    leadKey: 'shells.contextOverview.lead',
    emptyKey: 'shells.contextOverview.empty',
    testId: 'residual-context-overview',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }, { routeName: 'home', titleKey: 'nav.home' }],
  },
  {
    name: 'context-center-articles',
    path: 'context-center/articles',
    titleKey: 'shells.contextArticles.title',
    leadKey: 'shells.contextArticles.lead',
    emptyKey: 'shells.contextArticles.empty',
    testId: 'residual-context-articles',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }, { routeName: 'home', titleKey: 'nav.home' }],
  },
  {
    name: 'context-center-documents',
    path: 'context-center/documents',
    titleKey: 'shells.contextDocuments.title',
    leadKey: 'shells.contextDocuments.lead',
    emptyKey: 'shells.contextDocuments.empty',
    testId: 'residual-context-documents',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }, { routeName: 'home', titleKey: 'nav.home' }],
  },
  {
    name: 'context-center-memories',
    path: 'context-center/memories',
    titleKey: 'shells.contextMemories.title',
    leadKey: 'shells.contextMemories.lead',
    emptyKey: 'shells.contextMemories.empty',
    testId: 'residual-context-memories',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }, { routeName: 'home', titleKey: 'nav.home' }],
  },
  {
    name: 'context-center-archive',
    path: 'context-center/archive',
    titleKey: 'shells.contextArchive.title',
    leadKey: 'shells.contextArchive.lead',
    emptyKey: 'shells.contextArchive.empty',
    testId: 'residual-context-archive',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }, { routeName: 'home', titleKey: 'nav.home' }],
  },
];
