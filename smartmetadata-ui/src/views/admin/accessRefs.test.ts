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
import { newPatchReference, toPatchReference, toRulePatchValue } from './accessRefs';

describe('accessRefs', () => {
  it('carries a reference verbatim and drops undefined fields', () => {
    expect(
      toPatchReference({
        id: 'r1',
        type: 'policy',
        name: 'Policy',
        displayName: 'Policy Display',
        fullyQualifiedName: 'Policy',
        description: 'desc',
        deleted: false,
      }),
    ).toEqual({
      id: 'r1',
      type: 'policy',
      name: 'Policy',
      displayName: 'Policy Display',
      fullyQualifiedName: 'Policy',
      description: 'desc',
      deleted: false,
    });
    expect(toPatchReference({ id: 'r2', type: 'team', name: 'Team' })).toEqual({
      id: 'r2',
      type: 'team',
      name: 'Team',
    });
  });

  it('builds a fresh reference as {id, type} only', () => {
    expect(newPatchReference('p9', 'policy')).toEqual({ id: 'p9', type: 'policy' });
  });

  it('preserves an existing rule FQN and never invents one', () => {
    expect(
      toRulePatchValue({
        name: 'Rule',
        effect: 'allow',
        operations: ['ViewAll'],
        resources: ['all'],
        fullyQualifiedName: 'Policy.Rule',
      }),
    ).toEqual({
      name: 'Rule',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['all'],
      fullyQualifiedName: 'Policy.Rule',
    });
    const fresh = toRulePatchValue({
      name: 'Rule',
      effect: 'allow',
      operations: [],
      resources: [],
    });
    expect(fresh).not.toHaveProperty('fullyQualifiedName');
    expect(fresh).not.toHaveProperty('description');
    expect(fresh).not.toHaveProperty('condition');
  });

  it('copies rule arrays instead of aliasing them', () => {
    const operations = ['ViewAll'];
    const value = toRulePatchValue({ name: 'R', operations, resources: [] });
    expect(value.operations).toEqual(operations);
    expect(value.operations).not.toBe(operations);
  });
});
