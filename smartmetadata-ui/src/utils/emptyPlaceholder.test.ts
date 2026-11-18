/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  resolveSingleAction,
  splitTransElement,
  type EmptyPlaceholderAction,
} from './emptyPlaceholder';

describe('resolveSingleAction', () => {
  it('keeps a non-empty caller action list untouched', () => {
    const actions: EmptyPlaceholderAction[] = [{ key: 'custom', label: 'Custom' }];
    expect(resolveSingleAction(actions, () => undefined, 'add', 'Add')).toBe(actions);
  });

  it('builds a single primary action from the handler', () => {
    const handler = vi.fn();
    const resolved = resolveSingleAction(undefined, handler, 'add', 'Add', 'btn-id', 'btn-test');
    expect(resolved).toEqual([
      { key: 'add', id: 'btn-id', label: 'Add', color: 'primary', onPress: handler, testId: 'btn-test' },
    ]);
  });

  it('builds the action from an empty list and omits an absent testId', () => {
    const handler = vi.fn();
    const resolved = resolveSingleAction([], handler, 'reload', 'Reload');
    expect(resolved).toEqual([
      { key: 'reload', id: undefined, label: 'Reload', color: 'primary', onPress: handler },
    ]);
    expect(resolved?.[0]).not.toHaveProperty('testId');
  });

  it('returns undefined when neither actions nor handler exist', () => {
    expect(resolveSingleAction(undefined, undefined, 'add', 'Add')).toBeUndefined();
    expect(resolveSingleAction([], undefined, 'add', 'Add')).toEqual([]);
  });
});

describe('splitTransElement', () => {
  it('splits a message on its first <0> element', () => {
    expect(splitTransElement('Still need help? Refer to our <0>docs</0> for more information.')).toEqual({
      before: 'Still need help? Refer to our ',
      inner: 'docs',
      after: ' for more information.',
    });
  });

  it('returns null when the message carries no element tags', () => {
    expect(splitTransElement('Plain message.')).toBeNull();
    expect(splitTransElement('Open <0> only.')).toBeNull();
    expect(splitTransElement('Close </0> only.')).toBeNull();
  });

  it('handles an empty inner element', () => {
    expect(splitTransElement('a<0></0>b')).toEqual({ before: 'a', inner: '', after: 'b' });
  });
});
