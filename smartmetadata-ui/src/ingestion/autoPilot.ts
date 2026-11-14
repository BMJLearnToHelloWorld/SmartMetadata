/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * AutoPilot constants, ported from official (openmetadata-ui, pin
 * a3012259ca): the application name the wizard and the service header
 * trigger, the workflow definition whose instances gate the header
 * button, and the service entity types AutoPilot applies to. The fork
 * has two service kinds outside the pin list — `llmService` and
 * `mcpService` — which therefore get no Trigger AutoPilot button
 * (the wizard trigger is exclusion-only, so it still applies to them,
 * matching the pin).
 */

export const AUTO_PILOT_APP_NAME = 'AutoPilotApplication';

export const AUTO_PILOT_WORKFLOW_NAME = 'AutoPilotWorkflow';

/** Official constants/ServiceType.constant.ts `SERVICE_TYPES` (11 entity types). */
export const AUTO_PILOT_SERVICE_TYPES: readonly string[] = [
  'databaseService',
  'dashboardService',
  'messagingService',
  'pipelineService',
  'mlmodelService',
  'metadataService',
  'storageService',
  'searchService',
  'apiService',
  'securityService',
  'driveService',
];

/** Official constants/ServiceType.constant.ts `EXCLUDE_AUTO_PILOT_SERVICE_TYPES`. */
export const EXCLUDE_AUTO_PILOT_SERVICE_TYPES: readonly string[] = ['securityService'];

export function isAutoPilotServiceType(entityType: string): boolean {
  return (AUTO_PILOT_SERVICE_TYPES as readonly string[]).includes(entityType);
}

export function isExcludedAutoPilotServiceType(entityType: string): boolean {
  return (EXCLUDE_AUTO_PILOT_SERVICE_TYPES as readonly string[]).includes(entityType);
}

/**
 * Start of the day `days` ago, in GMT, as epoch millis — ported from
 * official utils/date-time/DateTimeUtils.ts
 * `getDayAgoStartGMTinMillis` (Luxon `now in GMT, minus days, startOf
 * day`). Plain UTC date math: the product has no Luxon, and the GMT
 * day boundary is exactly the UTC day boundary.
 */
export function getDayAgoStartGMTinMillis(days: number): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days);
}
