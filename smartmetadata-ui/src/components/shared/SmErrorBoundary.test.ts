/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { defineComponent, h, nextTick, ref } from 'vue';
import SmErrorBoundary from './SmErrorBoundary.vue';

// Local messages: the boundary references NEW keys the integration line
// has not written yet. Asserting rendered copy pins the exact key names.
function createBoundaryI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        errors: {
          somethingWentWrong: 'Something went wrong',
          backHome: 'Back to Home',
          upgradeAvailable: 'A better iSmart experience awaits!',
          upgradeRefreshHint:
            "We've updated iSmart with the latest improvements. Refresh your page to jump back in.",
          refreshPage: 'Refresh page',
        },
      },
    },
  });
}

const HomeView = defineComponent({
  name: 'HomeView',
  setup: () => () => h('div', 'home view'),
});
const OtherView = defineComponent({
  name: 'OtherView',
  setup: () => () => h('div', 'other view'),
});

function createTestRouter(extraRoutes: Parameters<typeof createRouter>[0]['routes'] = []): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: HomeView },
      { path: '/other', name: 'other', component: OtherView },
      ...extraRoutes,
    ],
  });
}

function mountBoundary(
  router: Router,
  child: ReturnType<typeof defineComponent>,
  childProps: Record<string, unknown> = {},
) {
  const harness = defineComponent({
    setup: () => () => h(SmErrorBoundary, null, { default: () => h(child, childProps) }),
  });
  return mount(harness, {
    global: { plugins: [Antd, createBoundaryI18n(), router] },
    attachTo: document.body,
  });
}

const Thrower = defineComponent({
  name: 'Thrower',
  props: { error: { type: null, default: null }, shouldThrow: { type: Boolean, default: true } },
  setup(props) {
    if (props.shouldThrow) {
      throw props.error ?? new Error('boom');
    }
    return () => h('div', 'healthy child');
  },
});

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = undefined;
  vi.restoreAllMocks();
});

describe('SmErrorBoundary ordinary variant', () => {
  it('shows the title, the verbatim error message, and the home button', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower, { error: new Error('render exploded') });
    await nextTick();
    expect(wrapper.text()).toContain('Something went wrong');
    expect(wrapper.text()).toContain('render exploded');
    expect(wrapper.text()).toContain('Back to Home');
    expect(wrapper.find('[data-testid="upgrade-screen"]').exists()).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('renders no empty subtitle row for an empty error message', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower, { error: new Error('') });
    await nextTick();
    expect(wrapper.find('.sm-error-fallback__message').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a thrown non-Error value as the subtitle', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower, { error: 'string failure' });
    await nextTick();
    expect(wrapper.text()).toContain('string failure');
    wrapper.unmount();
  });

  it('recovers Home-first, then remounts the subtree', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const shouldThrow = ref(true);
    const harness = defineComponent({
      setup: () =>
        () =>
          h(
            SmErrorBoundary,
            null,
            { default: () => h(Thrower, { shouldThrow: shouldThrow.value }) },
          ),
    });
    const wrapper = mount(harness, {
      global: { plugins: [Antd, createBoundaryI18n(), router] },
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.text()).toContain('Something went wrong');

    shouldThrow.value = false;
    await wrapper.find('.sm-error-fallback .ant-btn').trigger('click');
    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('home');
    });
    await nextTick();
    expect(wrapper.text()).toContain('healthy child');
    wrapper.unmount();
  });

  it('does not auto-reset on route change while the fallback shows', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower);
    await nextTick();
    expect(wrapper.text()).toContain('Something went wrong');
    await router.push('/my-data');
    await nextTick();
    // No fullPath reset: the fallback stays until the user recovers.
    expect(wrapper.text()).toContain('Something went wrong');
    wrapper.unmount();
  });
});

describe('SmErrorBoundary chunk variant', () => {
  const chunkErrors: Array<[string, unknown]> = [
    ['ChunkLoadError name', Object.assign(new Error('chunk 42'), { name: 'ChunkLoadError' })],
    ['legacy webpack prefix', new Error('Loading chunk 42 failed')],
    ['vite dynamic import', new Error('Failed to fetch dynamically imported module: /x.js')],
    ['vite safari', new Error('Importing a module script failed.')],
  ];

  it.each(chunkErrors)('matches the chunk predicate: %s', async (_label, error) => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower, { error });
    await nextTick();
    expect(wrapper.find('[data-testid="upgrade-screen"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('A better iSmart experience awaits! ✨');
    expect(wrapper.text()).toContain('Refresh your page to jump back in.');
    expect(wrapper.find('[data-testid="refresh-page-btn"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('refresh button performs a full reload via router.go(0)', async () => {
    const router = createTestRouter();
    await router.push('/other');
    await router.isReady();
    const goSpy = vi.spyOn(router, 'go').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountBoundary(router, Thrower, {
      error: new Error('Failed to fetch dynamically imported module'),
    });
    await nextTick();
    await wrapper.find('[data-testid="refresh-page-btn"]').trigger('click');
    expect(goSpy).toHaveBeenCalledWith(0);
    wrapper.unmount();
  });

  it('catches chunk failures reported through router.onError', async () => {
    const router = createTestRouter([
      {
        path: '/lazy',
        name: 'lazy',
        component: () =>
          Promise.reject(new Error('Failed to fetch dynamically imported module: /lazy.js')),
      },
    ]);
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Healthy = defineComponent({ setup: () => () => h('div', 'healthy child') });
    const wrapper = mountBoundary(router, Healthy);
    await nextTick();
    expect(wrapper.text()).toContain('healthy child');
    await expect(router.push('/lazy')).rejects.toThrow();
    await nextTick();
    expect(wrapper.find('[data-testid="upgrade-screen"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ignores non-chunk router errors', async () => {
    const router = createTestRouter([
      {
        path: '/lazy',
        name: 'lazy',
        component: () => Promise.reject(new Error('plain load failure')),
      },
    ]);
    await router.push('/other');
    await router.isReady();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Healthy = defineComponent({ setup: () => () => h('div', 'healthy child') });
    const wrapper = mountBoundary(router, Healthy);
    await nextTick();
    await expect(router.push('/lazy')).rejects.toThrow();
    await nextTick();
    expect(wrapper.text()).toContain('healthy child');
    expect(wrapper.find('[data-testid="upgrade-screen"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
