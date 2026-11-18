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
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import { nameFieldRules } from './accessValidation';

describe('accessValidation', () => {
  it('rejects double colons, angle brackets and control characters only', () => {
    expect(ENTITY_NAME_REGEX.test('Data Consumer')).toBe(true);
    expect(ENTITY_NAME_REGEX.test('role-1_name.v2 (x) & y')).toBe(true);
    expect(ENTITY_NAME_REGEX.test('a::b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a>b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a"b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a\nb')).toBe(false);
  });

  it('emits required, size and pattern rules with pin messages', () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`;
    const rules = nameFieldRules(t, 'Name');
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({
      required: true,
      message: 'label.field-required:{"field":"Name"}',
    });
    expect(rules[1]).toEqual({
      max: 128,
      message: 'message.entity-size-in-between:{"entity":"Name","min":1,"max":128}',
    });
    expect(rules[2]).toEqual({
      pattern: ENTITY_NAME_REGEX,
      message: 'message.entity-name-validation:{}',
    });
  });
});
