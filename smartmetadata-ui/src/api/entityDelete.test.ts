/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { deleteEntity, hardDeleteEntity, prepareEntityType } from './entityDelete';

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] as RequestInit | undefined };
}

describe('entityDelete', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps policy through the table and role through the plural fallback', () => {
    expect(prepareEntityType('policy')).toBe('policies');
    expect(prepareEntityType('role')).toBe('roles');
  });

  it('sends hardDelete and recursive on the wire, key order included', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    await deleteEntity('policy', 'p1', false);
    const parsed = new URL(lastFetch().url);
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/policies/p1?hardDelete=true&recursive=false');
    expect(lastFetch().init?.method).toBe('DELETE');
    await deleteEntity('role', 'r1', true);
    const recursive = new URL(lastFetch().url);
    expect(`${recursive.pathname}${recursive.search}`).toBe('/api/v1/roles/r1?hardDelete=true&recursive=true');
  });

  it('returns true and runs onSuccess when the delete lands', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const onSuccess = vi.fn();
    const onError = vi.fn();
    await expect(hardDeleteEntity('p1', 'policy', { onSuccess, onError })).resolves.toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('returns false and runs onError with the thrown error when the delete fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const onSuccess = vi.fn();
    const onError = vi.fn();
    await expect(hardDeleteEntity('p1', 'policy', { onSuccess, onError })).resolves.toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
