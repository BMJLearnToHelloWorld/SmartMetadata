/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * You may use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TagDetailView from './TagDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountTag(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/classifications', name: 'governance-classifications', component: { template: '<div>list</div>' } },
      { path: '/governance/classifications/:id', name: 'governance-classification', component: { template: '<div>detail</div>' } },
    ],
  });
  await router.push('/governance/classifications/c1');
  await router.isReady();
  const wrapper = mount(TagDetailView, {
    props: { id },
    global: {
      plugins: [router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

function isDisabled(wrapper: Awaited<ReturnType<typeof mountTag>>, testid: string): boolean {
  return (wrapper.find(`[data-testid="${testid}"]`).element as HTMLButtonElement).disabled;
}

describe('TagDetailView edit gating (upstream revokeEditPermissions)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/')) {
          // The stub encodes the tag state in the id: 'disabled-tag' loads disabled.
          const disabled = url.includes('disabled-tag');
          return jsonResponse({
            id: disabled ? 'disabled-tag' : 't1',
            name: 'pii',
            displayName: 'PII',
            disabled,
            owners: [],
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables edit and delete on an enabled tag', async () => {
    const wrapper = await mountTag('t1');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(false);
    expect(isDisabled(wrapper, 'delete-tag')).toBe(false);
  });

  it('disables edit but not delete on a disabled tag', async () => {
    const wrapper = await mountTag('disabled-tag');
    expect(isDisabled(wrapper, 'edit-tag')).toBe(true);
    // Delete is not an Edit* operation: upstream revoke leaves it untouched.
    expect(isDisabled(wrapper, 'delete-tag')).toBe(false);
  });
});

describe('TagDetailView versions entry (M-Next A4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the newest tag version snapshot from the versions button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tags/t1/versions')) {
          return jsonResponse({ versions: [{ version: 0.1 }, { version: 0.2 }] });
        }
        if (url.includes('/api/v1/tags/')) {
          return jsonResponse({ id: 't1', name: 'pii', displayName: 'PII', disabled: false, owners: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/tags/:id', name: 'governance-tag', component: { template: '<div>tag</div>' } },
        {
          path: '/governance/tags/:id/versions/:version',
          name: 'governance-tag-version',
          component: { template: '<div>version</div>' },
        },
      ],
    });
    await router.push('/governance/tags/t1');
    await router.isReady();
    const wrapper = mount(TagDetailView, {
      props: { id: 't1' },
      global: {
        plugins: [router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-versions"]').exists()).toBe(true);
    await wrapper.find('[data-testid="tag-versions"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/governance/tags/t1/versions/0.2');
  });
});
