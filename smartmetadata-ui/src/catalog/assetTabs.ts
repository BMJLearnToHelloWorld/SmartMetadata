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
  | 'features'
  | 'tasks'
  | 'executions'
  | 'code'
  | 'lineage'
  | 'quality'
  | 'activity'
  | 'customProperties';

const SHARED_TAIL: AssetTabKey[] = ['lineage', 'quality', 'activity', 'customProperties'];

export function assetTabKeys(entityType: string): AssetTabKey[] {
  const keys: AssetTabKey[] = ['overview'];
  switch (entityType) {
    case 'table':
    case 'topic':
    case 'container':
    case 'searchIndex':
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
    case 'storedProcedure':
      keys.push('code');
      break;
    default:
      break;
  }
  keys.push(...SHARED_TAIL);
  return keys;
}
