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

/**
 * Nav shells with no product API in this console. Honest Empty, no fake rows.
 * P2 B2 removed marketplace-overview, ontology-explorer and workflows with
 * their real pages; column-bulk-ops stays until its fate is adjudicated
 * (the original "no counterpart" judgment for it was correct).
 */
export const RESIDUAL_PAGES: ResidualPageDef[] = [
  {
    name: 'column-bulk-ops',
    path: 'govern/column-bulk-ops',
    titleKey: 'shells.columnBulkOps.title',
    leadKey: 'shells.columnBulkOps.lead',
    emptyKey: 'shells.columnBulkOps.empty',
    testId: 'residual-column-bulk-ops',
    links: [{ routeName: 'search', titleKey: 'nav.explore' }],
  },
];
