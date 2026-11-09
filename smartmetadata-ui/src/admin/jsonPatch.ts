/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff-only RFC 6902 ops between two flat records: one op per top-level
 * key that was added, removed, or changed; unchanged keys emit nothing.
 * Arrays and nested objects are replaced wholesale when they differ —
 * the server applies the ops to reach the same final state as a
 * field-by-field diff, without a patch library.
 *
 * ADR:2026-11-08-context-center-memory-create-edit-payload — the memory
 * edit path needs fast-json-patch `compare` semantics; the UI carries no
 * patch library, so this covers the flat edit shape instead of adding a
 * dependency for one call site.
 */
export function diffJsonPatch(
  original: Record<string, unknown>,
  updated: Record<string, unknown>,
): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  for (const key of Object.keys(original)) {
    if (!(key in updated)) {
      ops.push({ op: 'remove', path: `/${escapePointerSegment(key)}` });
    } else if (!jsonEquals(original[key], updated[key])) {
      ops.push({ op: 'replace', path: `/${escapePointerSegment(key)}`, value: updated[key] });
    }
  }
  for (const key of Object.keys(updated)) {
    if (!(key in original)) {
      ops.push({ op: 'add', path: `/${escapePointerSegment(key)}`, value: updated[key] });
    }
  }
  return ops;
}

/** RFC 6902 op for a whole-field write: add when absent, replace when present. */
export function setFieldPatch(path: string, current: unknown, value: unknown): JsonPatchOp[] {
  if (current === undefined || current === null) {
    return [{ op: 'add', path, value }];
  }
  return [{ op: 'replace', path, value }];
}

/**
 * RFC 6902 remove op. fast-json-patch's compare() emits `remove` when a
 * field present in the old document is absent in the new one (e.g.
 * clearing a severity); setFieldPatch cannot express that, so the
 * removal has its own op instead of a `replace` with null.
 */
export function removeFieldPatch(path: string): JsonPatchOp {
  return { op: 'remove', path };
}

export function entityRefValue(id: string, type: string): { id: string; type: string } {
  return { id, type };
}
