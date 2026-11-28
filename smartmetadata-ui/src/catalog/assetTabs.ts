/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Tabs that have a GET payload or a shared secondary API for this entity type. */
export type AssetTabKey =
  | 'overview'
  | 'schema'
  | 'charts'
  | 'children'
  | 'worksheets'
  | 'features'
  | 'tasks'
  | 'executions'
  | 'code'
  | 'lineage'
  | 'activity'
  | 'customProperties'
  | 'contract';

const SHARED_TAIL: AssetTabKey[] = ['lineage', 'activity', 'customProperties'];

export function assetTabKeys(entityType: string): AssetTabKey[] {
  // Official TabsIds with no OVERVIEW: Pipeline, Directory, Spreadsheet,
  // Worksheet (t418u). Chart keeps overview because it aliases official DETAILS.
  // File keeps official OVERVIEW. Query stays on overview until official TabsIds
  // are evidenced (QueryClassBase has none).
  const noOverviewFallback = new Set(['pipeline', 'directory', 'spreadsheet', 'worksheet']);
  const keys: AssetTabKey[] = noOverviewFallback.has(entityType) ? [] : ['overview'];
  switch (entityType) {
    case 'table':
    case 'topic':
    case 'container':
    case 'searchIndex':
    case 'dashboardDataModel':
      keys.push('schema');
      break;
    case 'dashboard':
      keys.push('charts');
      break;
    case 'mlmodel':
      keys.push('features');
      break;
    case 'pipeline':
      keys.push('tasks', 'executions');
      break;
    case 'directory':
      keys.push('children');
      break;
    case 'spreadsheet':
      keys.push('worksheets');
      break;
    case 'worksheet':
      keys.push('schema');
      break;
    case 'storedProcedure':
    case 'metric':
      keys.push('code');
      break;
    default:
      break;
  }
  keys.push(...SHARED_TAIL);
  if (entityType === 'pipeline') {
    const customIdx = keys.indexOf('customProperties');
    if (customIdx >= 0) {
      keys.splice(customIdx, 0, 'contract');
    } else {
      keys.push('contract');
    }
  }
  return keys;
}
