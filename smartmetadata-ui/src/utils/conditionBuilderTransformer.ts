/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  WorkflowCheckChangeDescConditionPayload,
  WorkflowConditionRow,
  WorkflowConditionRulesMap,
  WorkflowConditionType,
} from '@/types/governance';

/**
 * Official conditionBuilderTransformer (pin a3012259ca), ported 1:1: the
 * rows ↔ rules conversion for the check-change-description condition
 * builder. `deleted` is the only boolean field (true/false as a boolean in
 * the rules object); every other field sends a trimmed string[].
 */
export function generateRowId(index?: number): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return typeof index === 'number'
    ? `row-${index}-${Date.now()}-${suffix}`
    : `row-${Date.now()}-${suffix}`;
}

const DELETED_FIELD = 'deleted';

export function rowsToRules(
  rows: WorkflowConditionRow[],
): WorkflowConditionRulesMap {
  const rules: WorkflowConditionRulesMap = {};
  for (const row of rows) {
    if (!row.field || !Array.isArray(row.values)) {
      continue;
    }
    if (row.field === DELETED_FIELD) {
      const v = row.values[0];
      if (v === 'true' || v === 'false') {
        rules[row.field] = v === 'true';
      }
      continue;
    }
    const trimmed = row.values
      .filter((v) => v != null && String(v).trim() !== '')
      .map((v) => String(v).trim());
    if (trimmed.length > 0) {
      rules[row.field] = trimmed;
    }
  }
  return rules;
}

export function rulesToRows(
  rules: WorkflowConditionRulesMap | null | undefined,
): WorkflowConditionRow[] {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return [];
  }
  const rows: WorkflowConditionRow[] = [];
  let index = 0;
  for (const [field, value] of Object.entries(rules)) {
    if (field === DELETED_FIELD && typeof value === 'boolean') {
      rows.push({
        id: generateRowId(index++),
        field,
        values: [value ? 'true' : 'false'],
      });
      continue;
    }
    if (Array.isArray(value)) {
      const trimmed = value
        .filter((v) => v != null && String(v).trim() !== '')
        .map((v) => String(v).trim());
      if (trimmed.length > 0) {
        rows.push({
          id: generateRowId(index++),
          field,
          values: trimmed,
        });
      }
    }
  }
  return rows;
}

function resolveConditionBuilderRules(
  rules: WorkflowConditionRulesMap | undefined,
  legacyInclude: WorkflowConditionRulesMap | undefined,
): WorkflowConditionRulesMap | null {
  if (
    rules &&
    typeof rules === 'object' &&
    !Array.isArray(rules) &&
    Object.keys(rules).length > 0
  ) {
    return rules;
  }
  if (
    legacyInclude &&
    typeof legacyInclude === 'object' &&
    !Array.isArray(legacyInclude)
  ) {
    return legacyInclude;
  }
  return null;
}

/** Parse a payload into rows + condition. Supports config.rules and legacy config.include. */
export function parseConditionBuilderPayload(
  payload: WorkflowCheckChangeDescConditionPayload | null | undefined,
): { rows: WorkflowConditionRow[]; condition: WorkflowConditionType } {
  if (!payload?.config) {
    return { rows: [], condition: 'OR' };
  }
  const { config } = payload;
  const condition = config.condition ?? 'OR';
  const legacyInclude = (
    config as { include?: WorkflowConditionRulesMap }
  ).include;
  const rulesObj = resolveConditionBuilderRules(config.rules, legacyInclude);
  const rows = rulesObj ? rulesToRows(rulesObj) : [];
  return { rows, condition };
}

/** Build a check-change-description payload: { config: { condition, rules } }. */
export function buildConditionBuilderPayload(
  condition: WorkflowConditionType,
  rows: WorkflowConditionRow[],
): WorkflowCheckChangeDescConditionPayload {
  return {
    config: {
      condition,
      rules: rowsToRules(rows),
    },
  };
}
