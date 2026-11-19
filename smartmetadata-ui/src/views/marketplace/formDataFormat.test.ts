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
import {
  escapeBackwardSlashChar,
  formatAdditionalProperties,
  formatFormDataForRender,
  formatFormDataForSubmit,
} from './formDataFormat';

describe('formDataFormat', () => {
  it('unescapes literal backslash-n sequences recursively without mutating the input', () => {
    const input = { a: 'line1\\nline2', nested: { b: 'x\\ny' }, list: ['p\\nq'] };
    const result = formatFormDataForSubmit(input);
    expect(result).toEqual({ a: 'line1\nline2', nested: { b: 'x\ny' }, list: ['p\nq'] });
    expect(input.a).toBe('line1\\nline2');
  });

  it('drops unfilled additional-properties rows by key and default value', () => {
    const input = {
      newKey1: 'New Value',
      newKey2: {},
      newKey3: [],
      newKey4: 'filled',
      kept: { newKey5: 'New Value', real: 1 },
    };
    expect(formatAdditionalProperties(structuredClone(input))).toEqual({
      newKey4: 'filled',
      kept: { real: 1 },
    });
  });

  it('parses connectionArguments values that are JSON and leaves the rest', () => {
    const input = {
      connectionArguments: { a: '{"x":1}', b: 'plain', c: '[1,2]' },
      other: 'untouched',
    };
    expect(formatFormDataForSubmit(input)).toEqual({
      connectionArguments: { a: { x: 1 }, b: 'plain', c: [1, 2] },
      other: 'untouched',
    });
  });

  it('applies the three transforms in pin order', () => {
    const input = {
      text: 'a\\nb',
      newKey1: 'New Value',
      connectionArguments: { opt: '{"k":"v"}' },
    };
    expect(formatFormDataForSubmit(input)).toEqual({
      text: 'a\nb',
      connectionArguments: { opt: { k: 'v' } },
    });
  });

  it('stringifies connectionArguments objects for render', () => {
    const input = { connectionArguments: { a: { x: 1 }, b: 'plain' } };
    expect(formatFormDataForRender(input)).toEqual({
      connectionArguments: { a: '{"x":1}', b: 'plain' },
    });
  });

  it('escapeBackwardSlashChar handles null and non-string leaves', () => {
    const input = { a: null, b: 42, c: true, d: { e: null } };
    expect(escapeBackwardSlashChar(structuredClone(input))).toEqual(input);
  });

  it('tolerates missing connectionArguments', () => {
    expect(formatFormDataForSubmit({ a: 1 })).toEqual({ a: 1 });
    expect(formatFormDataForRender({ a: 1 })).toEqual({ a: 1 });
  });

  it('does not share references with the input', () => {
    const input = { nested: { v: 1 } };
    const result = formatFormDataForSubmit(input);
    (result.nested as { v: number }).v = 2;
    expect(input.nested.v).toBe(1);
  });
});
