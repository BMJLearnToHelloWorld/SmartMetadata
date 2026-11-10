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
 * tableDiff parameter names and wire encoding (official tableDiff test
 * definition, openmetadata-service/.../json/data/tests/tableDiff.json).
 *
 * ARRAY parameters (keyColumns, table2.keyColumns, useColumns) travel as
 * one string per parameterValue. The product writes a JSON array string
 * (`["id", "code"]`); the P2-3 compiler parses it with `ast.literal_eval`
 * per official table_diff_params_setter.py, which accepts both the JSON
 * spelling and the Python-literal spelling (`['id', 'code']`), so the
 * encoding is stable across the form and the compiler. Decoding accepts
 * either spelling, and falls back to a comma split for values typed by
 * hand in the legacy free-text editor.
 * ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
 */
export const TABLE_DIFF_DEFINITION_NAME = 'tableDiff';
export const TABLE2_PARAM = 'table2';
export const TABLE2_KEY_COLUMNS_PARAM = 'table2.keyColumns';
export const KEY_COLUMNS_PARAM = 'keyColumns';
export const USE_COLUMNS_PARAM = 'useColumns';

export function isTableDiffDefinition(name?: string, fullyQualifiedName?: string): boolean {
  return name === TABLE_DIFF_DEFINITION_NAME || fullyQualifiedName === TABLE_DIFF_DEFINITION_NAME;
}

export function encodeArrayParam(values: string[]): string {
  return JSON.stringify(values);
}

export function decodeArrayParam(value: string | undefined): string[] {
  const text = (value ?? '').trim();
  if (!text) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Fall through to the comma-split recovery below.
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
