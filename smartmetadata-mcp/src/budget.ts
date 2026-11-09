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
 * Response-size budget shared by the Batch A read tools.
 *
 * The cap is the dispatch-level `maxResponseChars` (100000). Tools stay under
 * it by returning fewer whole items, never by cutting an item's content:
 * a caller that gets a truncated item cannot tell what was removed.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */
export const MAX_RESPONSE_CHARS = 100_000;

/** Headroom a persona part reserves for the instructions it carries. */
export const PART_RESPONSE_HEADROOM_CHARS = 10_000;

/** Share of the cap the per-tool fit may spend on its items. */
export const DEFAULT_BUDGET_FACTOR = 0.8;

export function defaultBudgetChars(): number {
  return Math.trunc(MAX_RESPONSE_CHARS * DEFAULT_BUDGET_FACTOR);
}

/** Serialized size of a value, as JSON. */
export function serializedLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

export interface Fit {
  count: number;
  usedChars: number;
}

/**
 * How many leading items fit within `budgetChars`, measuring each item's
 * real serialized size (+1 for the separator). Guarantees forward progress:
 * when the first item alone exceeds a positive budget, one item is still
 * returned, so a caller advancing by the returned count never stalls.
 */
export function fitWithin(items: readonly unknown[], budgetChars: number): Fit {
  let used = 0;
  let fit = 0;
  for (let i = 0; i < items.length; i++) {
    const next = used + serializedLength(items[i]) + 1;
    if (next > budgetChars) {
      break;
    }
    used = next;
    fit = i + 1;
  }
  if (fit === 0 && items.length > 0 && budgetChars > 0) {
    fit = 1;
    used = serializedLength(items[0]) + 1;
  }
  return { count: fit, usedChars: used };
}

/**
 * How many leading items fit once `overheadChars` (the serialized size of
 * everything except the items) is accounted for, against the default item
 * budget. Zero when the overhead alone exceeds the budget.
 */
export function fitCount(items: readonly unknown[], overheadChars: number): number {
  return fitWithin(items, defaultBudgetChars() - overheadChars).count;
}
