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
import { createNodeConfig, isValidString } from './workflowBuilderUtils';

describe('isValidString', () => {
  it('rejects empty, blank, undefined and null', () => {
    expect(isValidString('')).toBe(false);
    expect(isValidString('   ')).toBe(false);
    expect(isValidString(undefined)).toBe(false);
    expect(isValidString(null)).toBe(false);
  });

  it('accepts a non-blank string', () => {
    expect(isValidString('Approve')).toBe(true);
    expect(isValidString('  Approve  ')).toBe(true);
  });
});

describe('createNodeConfig', () => {
  it('spreads the base config and stamps lastSaved/userModified', () => {
    const before = new Date().toISOString();
    const config = createNodeConfig({
      displayName: 'End',
      subType: 'endEvent',
    });
    expect(config.displayName).toBe('End');
    expect(config.subType).toBe('endEvent');
    expect(config.userModified).toBe(true);
    expect(typeof config.lastSaved).toBe('string');
    expect((config.lastSaved as string) >= before).toBe(true);
  });

  it('does not mutate the base config', () => {
    const base = { displayName: 'End' };
    createNodeConfig(base);
    expect(base).toEqual({ displayName: 'End' });
  });
});
