/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { useTagAssetPermissions } from './useTagAssetPermissions';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Harness: the composable only runs its load in onMounted. */
function probe(editTagsPermission: boolean, pinia = createPinia()) {
  const Probe = defineComponent({
    setup() {
      return useTagAssetPermissions(ref(editTagsPermission));
    },
    template: '<div />',
  });
  setActivePinia(pinia);
  return mount(Probe, { global: { plugins: [pinia] } });
}

describe('useTagAssetPermissions (pin TagPage haveAssetEditPermission)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions') && !url.includes('/v1/permissions/')) {
          return jsonResponse({
            data: [
              { resource: 'table', permissions: [{ operation: 'EditTags', access: 'allow' }] },
              { resource: 'topic', permissions: [{ operation: 'EditTags', access: 'deny' }] },
              { resource: 'dashboard', permissions: [{ operation: 'EditAll', access: 'allow' }] },
            ],
            paging: { total: 3 },
          });
        }
        if (url.includes('/v1/permissions/')) {
          // Resources absent from the bulk page fall back to a
          // per-resource read; here they carry no grant.
          const resource = url.split('/v1/permissions/')[1].split('?')[0];
          return jsonResponse({ resource, permissions: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('grants when the viewer can EditTags on any asset type', async () => {
    const wrapper = probe(false);
    await flushPromises();
    await flushPromises();
    expect(wrapper.vm.haveAssetEditPermission).toBe(true);
    expect(wrapper.vm.entitiesHavingPermission).toContain('table');
    // EditAll falls back to the EditTags check, per the product derivation.
    expect(wrapper.vm.entitiesHavingPermission).toContain('dashboard');
    expect(wrapper.vm.entitiesNotHavingPermission).toContain('topic');
    expect(wrapper.vm.entitiesNotHavingPermission).toContain('domain');
    wrapper.unmount();
  });

  it('grants on the tag-level permission alone', async () => {
    const wrapper = probe(true);
    await flushPromises();
    await flushPromises();
    expect(wrapper.vm.haveAssetEditPermission).toBe(true);
    wrapper.unmount();
  });

  it('denies a type whose EditTags is explicitly denied even when EditAll allows it', async () => {
    // Pin would grant this type: checkPermissionEntityResource(EditTags,
    // resource, permissions, true) ORs EditAll in (PermissionsUtils.ts:55-70).
    // The product derivation is field-priority (api/permissions.ts
    // prioritizedEditPermission): an explicit EditTags key wins, so the
    // EditAll allow never falls through. This test pins the product's
    // fail-closed behaviour. The derivation gap itself is a product-level
    // named residual: it needs Bai to accept it or a separate item to
    // unify the derivation product-wide; this lane must not change it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions') && !url.includes('/v1/permissions/')) {
          return jsonResponse({
            data: [
              {
                resource: 'table',
                permissions: [
                  { operation: 'EditTags', access: 'deny' },
                  { operation: 'EditAll', access: 'allow' },
                ],
              },
              { resource: 'topic', permissions: [{ operation: 'EditTags', access: 'deny' }] },
              { resource: 'dashboard', permissions: [{ operation: 'EditTags', access: 'deny' }] },
            ],
            paging: { total: 3 },
          });
        }
        if (url.includes('/v1/permissions/')) {
          const resource = url.split('/v1/permissions/')[1].split('?')[0];
          return jsonResponse({ resource, permissions: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
    const wrapper = probe(false);
    await flushPromises();
    await flushPromises();
    expect(wrapper.vm.haveAssetEditPermission).toBe(false);
    expect(wrapper.vm.entitiesHavingPermission).toEqual([]);
    expect(wrapper.vm.entitiesNotHavingPermission).toContain('table');
    expect(wrapper.vm.entitiesNotHavingPermission).toContain('topic');
    wrapper.unmount();
  });

  it('loads the bulk permissions once per principal', async () => {
    const pinia = createPinia();
    const first = probe(false, pinia);
    await flushPromises();
    await flushPromises();
    first.unmount();
    const second = probe(false, pinia);
    await flushPromises();
    await flushPromises();
    second.unmount();
    const bulkCalls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/v1/permissions') && !url.includes('/v1/permissions/'));
    expect(bulkCalls).toHaveLength(1);
  });

  it('fails closed when the bulk load fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('error', { status: 500 })),
    );
    const wrapper = probe(false);
    await flushPromises();
    await flushPromises();
    expect(wrapper.vm.haveAssetEditPermission).toBe(false);
    expect(wrapper.vm.entitiesHavingPermission).toEqual([]);
    expect(wrapper.vm.error).not.toBeNull();
    wrapper.unmount();
  });
});
