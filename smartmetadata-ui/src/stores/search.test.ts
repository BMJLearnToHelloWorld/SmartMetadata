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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchStore } from './search';

const getNLPEnabledStatus = vi.fn();

vi.mock('@/api/search', () => ({
  getNLPEnabledStatus: (...args: unknown[]) => getNLPEnabledStatus(...args),
}));

describe('useSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getNLPEnabledStatus.mockReset();
  });

  it('starts with NLP inactive, disabled, and uninitialized', () => {
    const store = useSearchStore();
    expect(store.isNLPActive).toBe(false);
    expect(store.isNLPEnabled).toBe(false);
    expect(store.isNLPInitialized).toBe(false);
  });

  it('initNLP enables NLP from a true status and fetches only once', async () => {
    getNLPEnabledStatus.mockResolvedValue(true);
    const store = useSearchStore();
    await store.initNLP();
    await store.initNLP();
    expect(store.isNLPEnabled).toBe(true);
    expect(store.isNLPInitialized).toBe(true);
    expect(getNLPEnabledStatus).toHaveBeenCalledTimes(1);
  });

  it('initNLP disables NLP on a false status and still marks itself initialized', async () => {
    getNLPEnabledStatus.mockResolvedValue(false);
    const store = useSearchStore();
    await store.initNLP();
    await store.initNLP();
    expect(store.isNLPEnabled).toBe(false);
    expect(store.isNLPInitialized).toBe(true);
    expect(getNLPEnabledStatus).toHaveBeenCalledTimes(1);
  });

  it('initNLP disables NLP when the status call fails', async () => {
    getNLPEnabledStatus.mockRejectedValue(new Error('offline'));
    const store = useSearchStore();
    await store.initNLP();
    expect(store.isNLPEnabled).toBe(false);
    expect(store.isNLPInitialized).toBe(true);
  });

  it('setNLPActive toggles the active flag', () => {
    const store = useSearchStore();
    store.setNLPActive(true);
    expect(store.isNLPActive).toBe(true);
    store.setNLPActive(false);
    expect(store.isNLPActive).toBe(false);
  });
});
