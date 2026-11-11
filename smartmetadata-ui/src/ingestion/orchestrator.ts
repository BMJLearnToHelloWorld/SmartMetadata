/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { getOrchestratorStatus } from '@/api/ingestionPipelines';

/**
 * Port of official `AirflowStatusProvider.fetchAirflowStatus` (pin
 * a3012259ca): Airflow is available exactly when the orchestrator status
 * endpoint answers with code 200. A fetch failure is unavailable, not
 * "unknown" — every save flow gates its deploy on this and skips the
 * deploy (with a warning) when it is false.
 */
export async function isAirflowAvailable(): Promise<boolean> {
  try {
    const status = await getOrchestratorStatus();
    return status.code === 200;
  } catch {
    return false;
  }
}
