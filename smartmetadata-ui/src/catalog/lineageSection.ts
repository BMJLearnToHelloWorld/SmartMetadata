/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * The entity types that show a lineage section in the explore summary
 * panel (Q-TAB-4 item 1).
 *
 * Pin `components/Entity/EntityRightPanel/EntityRightPanelVerticalNav.
 * constants.ts:30-42` (a3012259ca) `LINEAGE_TABS_SET`, gated by
 * `hasLineageTab` (`utils/EntityPermissionUtils.ts:26-27`): API_ENDPOINT,
 * CHART, CONTAINER, DASHBOARD, DASHBOARD_DATA_MODEL, DIRECTORY, MLMODEL,
 * PIPELINE, SEARCH_INDEX, TABLE, TOPIC. File, spreadsheet, worksheet,
 * metric and storedProcedure have NO lineage section in pin — the
 * directory type is the only DriveService type in the set, matching the
 * D-TAB-2 host pages (the lineage tab itself is mounted by a later lane).
 */
export const LINEAGE_SECTION_ENTITY_TYPES: readonly string[] = [
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
] as const;

export function hasLineageSection(entityType: string): boolean {
  return (LINEAGE_SECTION_ENTITY_TYPES as readonly string[]).includes(entityType);
}
