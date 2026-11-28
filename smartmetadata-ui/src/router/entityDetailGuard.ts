/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { NavigationGuard } from 'vue-router';

/**
 * Official EntityRouter only mounts a detail page when
 * `entityUtilClassBase.getEntityDetailComponent(entityType)` returns a
 * component; otherwise it navigates to NOT_FOUND. QueryClassBase has no
 * detail component — official Query detail is QueryPage at
 * /query-view/:fqn/:queryId, not /query/:fqn.
 */
/**
 * Entity types official EntityRouter would mount a detail page for.
 * Used as a Vue Router param regex so `/:entityType/:fqn` cannot
 * swallow unrelated first segments (marketplace, settings leftovers,
 * /assets, /query, ...). Query is excluded: official QueryPage is
 * /query-view/:fqn/:queryId.
 */
export const OFFICIAL_ENTITY_DETAIL_TYPES = [
  'table',
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
  'directory',
  'file',
  'spreadsheet',
  'worksheet',
] as const;

export const OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN = OFFICIAL_ENTITY_DETAIL_TYPES.join('|');

export function isOfficialEntityRouterType(entityType: string): boolean {
  return (OFFICIAL_ENTITY_DETAIL_TYPES as readonly string[]).includes(entityType);
}

export const officialEntityDetailGuard: NavigationGuard = (to) => {
  const entityType = to.params.entityType;
  if (typeof entityType !== 'string' || !isOfficialEntityRouterType(entityType)) {
    return { name: 'not-found' };
  }
  return true;
};
