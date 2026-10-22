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
import { setFieldPatch } from './jsonPatch';

describe('setFieldPatch', () => {
  it('adds a field that is missing on the current entity', () => {
    expect(setFieldPatch('/roles', undefined, [{ id: 'r1', type: 'role' }])).toEqual([
      { op: 'add', path: '/roles', value: [{ id: 'r1', type: 'role' }] },
    ]);
  });

  it('replaces a field that already exists', () => {
    expect(setFieldPatch('/roles', [], [{ id: 'r1', type: 'role' }])).toEqual([
      { op: 'replace', path: '/roles', value: [{ id: 'r1', type: 'role' }] },
    ]);
  });
});
