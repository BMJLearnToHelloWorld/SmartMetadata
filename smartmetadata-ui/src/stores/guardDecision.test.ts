/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { principalKeyFor, useGuardDecisionStore } from './guardDecision';

describe('guard decision store (D-3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with no decision', () => {
    expect(useGuardDecisionStore().decision).toBeNull();
    expect(useGuardDecisionStore().isDenied).toBe(false);
  });

  it('matches a denial only for its own path and principal', () => {
    const store = useGuardDecisionStore();
    store.setDecision({ fullPath: '/settings/access/roles', principalKey: 'ada', denied: true });
    expect(store.isDenied).toBe(true);
    expect(store.isDeniedFor('/settings/access/roles', 'ada')).toBe(true);
    expect(store.isDeniedFor('/settings/access/policies', 'ada')).toBe(false);
    expect(store.isDeniedFor('/settings/access/roles', 'bob')).toBe(false);
    expect(store.isDeniedFor('/settings/access/roles', null)).toBe(false);
  });

  it('does not treat an allow decision as a denial', () => {
    const store = useGuardDecisionStore();
    store.setDecision({ fullPath: '/settings', principalKey: 'ada', denied: false });
    expect(store.isDenied).toBe(false);
    expect(store.isDeniedFor('/settings', 'ada')).toBe(false);
  });

  it('clears a decision whose path differs from the settled route', () => {
    const store = useGuardDecisionStore();
    store.setDecision({ fullPath: '/settings/access/roles', principalKey: 'ada', denied: true });
    store.clearIfStale('/settings/access/roles');
    expect(store.decision).not.toBeNull();
    store.clearIfStale('/settings');
    expect(store.decision).toBeNull();
  });

  it('clears on demand', () => {
    const store = useGuardDecisionStore();
    store.setDecision({ fullPath: '/settings', principalKey: 'ada', denied: true });
    store.clearDecision();
    expect(store.decision).toBeNull();
  });

  it('derives the principal key from the user name, then id', () => {
    expect(principalKeyFor({ name: 'ada', id: 'u1' })).toBe('ada');
    expect(principalKeyFor({ id: 'u1' })).toBe('u1');
    expect(principalKeyFor(null)).toBeNull();
    expect(principalKeyFor(undefined)).toBeNull();
  });
});
