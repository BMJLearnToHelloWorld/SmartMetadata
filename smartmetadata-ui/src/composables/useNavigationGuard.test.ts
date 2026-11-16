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
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { useNavigationGuard } from './useNavigationGuard';

function buildRouter(guard: ReturnType<typeof useNavigationGuard> | null): Router {
  const dirty = ref(true);
  const Guarded = defineComponent({
    setup() {
      const exposed = useNavigationGuard({ enabled: dirty });
      if (guard) {
        Object.assign(guard, exposed);
      }
      return () => h('div', 'guarded');
    },
  });
  const Other = defineComponent({ setup: () => () => h('div', 'other') });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Guarded },
      { path: '/other', component: Other },
    ],
  });
  return router;
}

describe('useNavigationGuard (official NavigationBlocker)', () => {
  it('blocks leaving while dirty, resumes the original navigation on confirm', async () => {
    const holder = {} as ReturnType<typeof useNavigationGuard>;
    const router = buildRouter(holder);
    await router.push('/');
    await router.isReady();
    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      global: { plugins: [router] },
    });
    const navigation = router.push('/other');
    await flushPromises();
    expect(holder.showModal.value).toBe(true);
    expect(router.currentRoute.value.path).toBe('/');
    await holder.confirmLeave();
    await navigation;
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/other');
    expect(holder.showModal.value).toBe(false);
    wrapper.unmount();
  });

  it('stays on cancel', async () => {
    const holder = {} as ReturnType<typeof useNavigationGuard>;
    const router = buildRouter(holder);
    await router.push('/');
    await router.isReady();
    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      global: { plugins: [router] },
    });
    const navigation = router.push('/other');
    await flushPromises();
    expect(holder.showModal.value).toBe(true);
    holder.cancelLeave();
    await navigation.catch(() => undefined);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
    expect(holder.showModal.value).toBe(false);
    wrapper.unmount();
  });

  it('does not trip on a same-path query change', async () => {
    const holder = {} as ReturnType<typeof useNavigationGuard>;
    const router = buildRouter(holder);
    await router.push('/');
    await router.isReady();
    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      global: { plugins: [router] },
    });
    await router.push('/?showDeletedTables=false');
    await flushPromises();
    expect(holder.showModal.value).toBe(false);
    expect(router.currentRoute.value.query.showDeletedTables).toBe('false');
    wrapper.unmount();
  });
});
