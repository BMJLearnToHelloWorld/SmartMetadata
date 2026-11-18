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
 * Lodash `startCase` / `capitalize` equivalents. The product carries no
 * lodash dependency; the pin renders resource names, effect values,
 * event types, and change labels through these two functions
 * (AccessControlRuleForm, PoliciesDetailPage rule cards,
 * AuditLogList), so the Access partition ports their exact word
 * splitting instead of hand-rolling per-call-site casing.
 */

const WORD_PATTERN = /[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+/g;

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Lodash `startCase`: split on word boundaries (camel humps, acronym
 * runs, separators), capitalize each word's first letter, join with a
 * single space. All-caps words stay all-caps (`CREATE` -> `CREATE`);
 * `storedProcedure` -> `Stored Procedure`.
 */
export function startCase(value: string): string {
  const words = value.match(WORD_PATTERN) ?? [];
  return words.map(upperFirst).join(' ');
}

/** Lodash `capitalize`: first letter upper, the rest lowercased. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
