/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getNegativeQueryForNotContainsReverserOperation,
  getSematicRuleFields,
  ruleStringFromTree,
  toNegatedRule,
} from './jsonLogicSemantic';

describe('jsonLogicSemantic official helpers', () => {
  it('omits extension, service.name, and name from semantic fields', () => {
    const keys = getSematicRuleFields().map((field) => field.key);
    expect(keys).not.toContain('extension');
    expect(keys).not.toContain('service.name');
    expect(keys).not.toContain('name');
    expect(keys).toContain('displayName');
    expect(keys).toContain('tags');
    expect(keys).toContain('glossaryTerm');
    expect(keys).toContain('tier');
  });

  it('rewrites official is-not-set some==null as !some != null', () => {
    const rewritten = getNegativeQueryForNotContainsReverserOperation({
      some: [{ var: 'tags' }, { '==': [{ var: 'tagFQN' }, null] }],
    });
    expect(rewritten).toEqual({
      '!': { some: [{ var: 'tags' }, { '!=': [{ var: 'tagFQN' }, null] }] },
    });
  });

  it('emits a negated JSONLogic rule string from a semantic tree', () => {
    const rule = ruleStringFromTree({
      combinator: 'and',
      rules: [{ field: 'displayName', operator: 'equal', value: 'Orders' }],
    });
    expect(JSON.parse(rule)).toEqual({ '==': [{ var: 'displayName' }, 'Orders'] });
    expect(toNegatedRule('')).toBe('');
  });
});
