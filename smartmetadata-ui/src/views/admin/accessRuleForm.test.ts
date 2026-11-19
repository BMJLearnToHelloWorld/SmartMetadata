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
import { INITIAL_RULE, buildConditionOptions, serializeRuleFormValue } from './accessRuleForm';

describe('accessRuleForm', () => {
  it('starts every field empty except effect, whose default is allow', () => {
    expect(INITIAL_RULE).toEqual({
      condition: '',
      description: '',
      effect: 'allow',
      name: '',
      operations: [],
      resources: [],
    });
    expect(INITIAL_RULE).not.toHaveProperty('fullyQualifiedName');
  });

  it('deduplicates condition examples in first-seen order', () => {
    expect(buildConditionOptions(['a()', 'b()', 'a()', 'c()'])).toEqual([
      { id: 'a()', label: 'a()' },
      { id: 'b()', label: 'b()' },
      { id: 'c()', label: 'c()' },
    ]);
    expect(buildConditionOptions([])).toEqual([]);
  });

  it('trims only the name, omits an empty condition, and keeps the description verbatim', () => {
    expect(
      serializeRuleFormValue({
        ...INITIAL_RULE,
        name: '  RuleA  ',
        description: '',
        operations: ['ViewAll'],
        resources: ['table'],
        condition: '',
      }),
    ).toEqual({
      name: 'RuleA',
      description: '',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['table'],
    });
  });

  it('carries a non-empty condition untrimmed and an existing FQN unchanged', () => {
    const serialized = serializeRuleFormValue({
      ...INITIAL_RULE,
      name: 'RuleA',
      condition: '  isOwner()  ',
      fullyQualifiedName: 'Policy.RuleA',
    });
    expect(serialized.condition).toBe('  isOwner()  ');
    expect(serialized.fullyQualifiedName).toBe('Policy.RuleA');
  });

  it('never invents an FQN from the name', () => {
    expect(
      serializeRuleFormValue({ ...INITIAL_RULE, name: 'RuleA' }),
    ).not.toHaveProperty('fullyQualifiedName');
  });
});
