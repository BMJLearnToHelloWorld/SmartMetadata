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
