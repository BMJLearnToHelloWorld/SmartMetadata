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
import type { TagLabelState, TagLabelType } from '@/types/api';
import type { EntityStyle, TagSource } from '@/types/governance';
import type {
  ServiceAttributes,
  ServiceTagLabel,
  TestConnectionResult,
  TestConnectionStepResult,
} from '@/types/ingestion';

/**
 * Shared mapper for a service entity's `tags` array (pin TagLabel).
 * Every stored field is preserved, including `style`, `reason`, and
 * the auto-classification provenance — a tier edit sends the retained
 * labels back verbatim, so a lossy mapper would strip them on save.
 * A missing or non-array value maps to `[]`; entries without a
 * `tagFQN` are dropped, since a label without an FQN cannot be
 * written back.
 */
export function mapServiceTags(value: unknown): ServiceTagLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    const tagFQN = rec ? asString(rec.tagFQN) : '';
    if (!rec || !tagFQN) {
      return [];
    }
    const styleRec = asRecord(rec.style);
    const style: EntityStyle | undefined = styleRec
      ? {
          color: asString(styleRec.color) || undefined,
          iconURL: asString(styleRec.iconURL) || undefined,
        }
      : undefined;
    const metadata = asRecord(rec.metadata);
    return [
      {
        tagFQN,
        name: asString(rec.name) || undefined,
        displayName: asString(rec.displayName) || undefined,
        description: asString(rec.description) || undefined,
        style,
        source: (asString(rec.source) || undefined) as TagSource | undefined,
        labelType: (asString(rec.labelType) || undefined) as TagLabelType | undefined,
        state: (asString(rec.state) || undefined) as TagLabelState | undefined,
        href: asString(rec.href) || undefined,
        reason: asString(rec.reason) || undefined,
        appliedAt: asString(rec.appliedAt) || undefined,
        appliedBy: asString(rec.appliedBy) || undefined,
        metadata: metadata ? { ...metadata } : undefined,
      },
    ];
  });
}

/**
 * Shared mapper for a service entity's `style` property (pin
 * generated/type/entityStyle.ts): color + iconURL, both optional. A
 * missing or malformed value maps to undefined; a present record maps
 * field by field. The logo resolver reads iconURL from here.
 */
export function mapServiceStyle(value: unknown): EntityStyle | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const style: EntityStyle = {
    color: asString(rec.color) || undefined,
    iconURL: asString(rec.iconURL) || undefined,
  };
  return style.color || style.iconURL ? style : undefined;
}

/**
 * Shared mapper for a service entity's `serviceAttributes` property
 * (pin generated/entity/services/serviceAttributes.ts). A missing or
 * malformed value maps to undefined; a present record maps field by
 * field, keeping any `environment` string verbatim.
 */
export function mapServiceAttributes(value: unknown): ServiceAttributes | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    environment: asString(rec.environment) || undefined,
    region: asString(rec.region) || undefined,
    deployment: asString(rec.deployment) || undefined,
  };
}

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
            resultSummary: asString(step.resultSummary) || undefined,
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
