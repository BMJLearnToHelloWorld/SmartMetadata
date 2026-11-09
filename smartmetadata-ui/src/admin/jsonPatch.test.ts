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
import { diffJsonPatch, setFieldPatch } from './jsonPatch';

describe('diffJsonPatch', () => {
  it('emits nothing when the records are identical', () => {
    expect(diffJsonPatch({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([]);
  });

  it('replaces changed scalars and adds new keys', () => {
    expect(diffJsonPatch({ a: 1 }, { a: 2, b: 'new' })).toEqual([
      { op: 'replace', path: '/a', value: 2 },
      { op: 'add', path: '/b', value: 'new' },
    ]);
  });

  it('removes keys absent from the updated record', () => {
    expect(diffJsonPatch({ a: 1, b: 2 }, { a: 1 })).toEqual([{ op: 'remove', path: '/b' }]);
  });

  it('replaces arrays and objects wholesale when they differ', () => {
    expect(
      diffJsonPatch(
        { tags: [{ tagFQN: 'a' }], shareConfig: { visibility: 'Private' } },
        { tags: [{ tagFQN: 'a' }, { tagFQN: 'b' }], shareConfig: { visibility: 'Private' } },
      ),
    ).toEqual([{ op: 'replace', path: '/tags', value: [{ tagFQN: 'a' }, { tagFQN: 'b' }] }]);
  });

  it('treats equal arrays as unchanged', () => {
    expect(diffJsonPatch({ tags: [{ tagFQN: 'a' }] }, { tags: [{ tagFQN: 'a' }] })).toEqual([]);
  });

  it('escapes JSON Pointer segments', () => {
    expect(diffJsonPatch({}, { 'a/b': 1 })).toEqual([{ op: 'add', path: '/a~1b', value: 1 }]);
  });
});

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
