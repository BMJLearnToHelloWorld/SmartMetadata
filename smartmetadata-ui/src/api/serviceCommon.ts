/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString } from '@/api/json';
import type { TestConnectionResult, TestConnectionStepResult } from '@/types/ingestion';

/**
 * Shared mapper for the stored TestConnectionResult carried on every
 * service entity (openmetadata-spec
 * entity/services/connections/testConnectionResult.json). A missing or
 * malformed value maps to undefined — the UI then shows "never tested",
 * never an invented outcome.
 */
export function mapTestConnectionResult(value: unknown): TestConnectionResult | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const stepsRaw = rec.steps;
  const steps: TestConnectionStepResult[] = Array.isArray(stepsRaw)
    ? stepsRaw.flatMap((item) => {
        const step = asRecord(item);
        if (!step || !asString(step.name)) {
          return [];
        }
        const diagnosis = asRecord(step.diagnosis);
        return [
          {
            name: asString(step.name),
            mandatory: asBoolean(step.mandatory),
            passed: asBoolean(step.passed),
            message: asString(step.message) || undefined,
            errorLog: asString(step.errorLog) || undefined,
            status: asString(step.status) || undefined,
            skipReason: asString(step.skipReason) || undefined,
            diagnosisTitle: diagnosis ? asString(diagnosis.title) || undefined : undefined,
            diagnosisRemediation: diagnosis ? asString(diagnosis.remediation) || undefined : undefined,
          },
        ];
      })
    : [];
  return {
    lastUpdatedAt: asNumber(rec.lastUpdatedAt),
    status: asString(rec.status) || undefined,
    steps,
  };
}
