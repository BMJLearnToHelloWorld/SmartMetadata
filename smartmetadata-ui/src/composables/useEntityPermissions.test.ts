/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntityPermissions } from './useEntityPermissions';

function permissionResponse(operations: string[]): Response {
  // The server's ResourcePermission shape (api/permissions.ts
  // mapResourcePermission + toOperationPermissions): the resource name
  // plus per-operation entries with a lowercase 'allow' access.
  return new Response(
    JSON.stringify({
      resource: 'type',
      permissions: operations.map((operation) => ({ operation, access: 'allow' })),
    }),
    { status: 200 },
  );
}

function stubPermissionFetch(
  handler: (url: string) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useEntityPermissions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fetches by id and exposes the EditAll flags', async () => {
    const fetchMock = stubPermissionFetch((url) =>
      url.includes('/permissions/type/type-1')
        // The server evaluates every operation for the entity, so a real
        // EditAll grant arrives with its View/Delete companions.
        ? permissionResponse(['EditAll', 'ViewAll', 'ViewBasic', 'Delete'])
        : new Response('not found', { status: 404 }),
    );
    const result = useEntityPermissions('type', { id: 'type-1' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/permissions/type/type-1');
    expect(result.isLoading.value).toBe(false);
    expect(result.error.value).toBeNull();
    expect(result.canEditAll.value).toBe(true);
    expect(result.canViewAll.value).toBe(true);
    expect(result.hasViewAccess.value).toBe(true);
    expect(result.canDelete.value).toBe(true);
  });

  it('fetches by FQN for a plain string identifier', async () => {
    stubPermissionFetch((url) =>
      url.includes('/permissions/type/name/myType')
        ? permissionResponse(['ViewBasic'])
        : new Response('not found', { status: 404 }),
    );
    const result = useEntityPermissions('type', 'myType');
    await flushPromises();
    expect(result.canViewBasic.value).toBe(true);
    expect(result.hasViewAccess.value).toBe(true);
    expect(result.canEditAll.value).toBe(false);
    expect(result.canViewAll.value).toBe(false);
  });

  it('does not fetch while disabled and starts when enabled flips', async () => {
    const fetchMock = stubPermissionFetch(() => permissionResponse(['EditAll']));
    const enabled = ref(false);
    const result = useEntityPermissions('type', { id: 'type-1' }, { enabled });
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.canEditAll.value).toBe(false);
    expect(result.isLoading.value).toBe(false);

    enabled.value = true;
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.canEditAll.value).toBe(true);
  });

  it('deleted forces edit flags false while view flags stay', async () => {
    stubPermissionFetch(() => permissionResponse(['EditAll', 'ViewAll', 'ViewBasic', 'Delete']));
    const result = useEntityPermissions('type', { id: 'type-1' }, { deleted: true });
    await flushPromises();
    expect(result.canEditAll.value).toBe(false);
    // Delete is not an Edit* operation, so `deleted` does not revoke it —
    // pin's revokeEditPermissions (and the product's) only revokes Edit*.
    expect(result.canDelete.value).toBe(true);
    expect(result.canViewAll.value).toBe(true);
    expect(result.hasViewAccess.value).toBe(true);
  });

  it('refresh invalidates the store entry and re-fetches', async () => {
    let operations = ['EditAll'];
    const fetchMock = stubPermissionFetch(() => permissionResponse(operations));
    const result = useEntityPermissions('type', { id: 'type-1' });
    await flushPromises();
    expect(result.canEditAll.value).toBe(true);

    operations = ['ViewBasic'];
    await result.refresh();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.canEditAll.value).toBe(false);
    expect(result.canViewBasic.value).toBe(true);
  });

  it('surfaces a fetch failure as an error and keeps the flags all-false', async () => {
    stubPermissionFetch(() => new Response('server error', { status: 500 }));
    const result = useEntityPermissions('type', { id: 'type-1' });
    await flushPromises();
    expect(result.error.value).toBeInstanceOf(Error);
    expect(result.isLoading.value).toBe(false);
    expect(result.canEditAll.value).toBe(false);
    expect(result.canViewAll.value).toBe(false);
    expect(result.hasViewAccess.value).toBe(false);
  });

  it('drops the previous entity grant while the new key is still loading', async () => {
    stubPermissionFetch((url) =>
      url.includes('/permissions/type/type-1')
        ? permissionResponse(['EditAll'])
        : new Promise<Response>(() => {}),
    );
    const identifier = ref({ id: 'type-1' });
    const result = useEntityPermissions('type', identifier);
    await flushPromises();
    expect(result.canEditAll.value).toBe(true);

    identifier.value = { id: 'type-2' };
    await flushPromises();
    expect(result.canEditAll.value).toBe(false);
    expect(result.hasViewAccess.value).toBe(false);
    expect(result.isLoading.value).toBe(true);
  });
});
