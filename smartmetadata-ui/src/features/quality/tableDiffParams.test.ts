/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { decodeArrayParam, encodeArrayParam, isTableDiffDefinition } from './tableDiffParams';

describe('tableDiffParams (P2-6)', () => {
  it('identifies the tableDiff definition by name or FQN', () => {
    expect(isTableDiffDefinition('tableDiff')).toBe(true);
    expect(isTableDiffDefinition(undefined, 'tableDiff')).toBe(true);
    expect(isTableDiffDefinition('tableRowCountToBeBetween')).toBe(false);
    expect(isTableDiffDefinition()).toBe(false);
  });

  it('encodes array values as a JSON array string', () => {
    expect(encodeArrayParam(['id', 'code'])).toBe('["id","code"]');
    expect(encodeArrayParam([])).toBe('[]');
  });

  it('decodes the JSON spelling', () => {
    expect(decodeArrayParam('["id","code"]')).toEqual(['id', 'code']);
    expect(decodeArrayParam('[]')).toEqual([]);
  });

  it('decodes the Python-literal spelling the official setter accepts', () => {
    expect(decodeArrayParam("['id', 'code']")).toEqual(['id', 'code']);
  });

  it('recovers hand-typed comma lists and blanks', () => {
    expect(decodeArrayParam('id, code')).toEqual(['id', 'code']);
    expect(decodeArrayParam('')).toEqual([]);
    expect(decodeArrayParam(undefined)).toEqual([]);
  });
});
