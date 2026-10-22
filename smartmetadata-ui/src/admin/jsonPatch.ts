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

export function entityRefValue(id: string, type: string): { id: string; type: string } {
  return { id, type };
}
