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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { defineComponent, h, nextTick } from 'vue';
import App from './App.vue';

// Local messages: same shape as SmErrorBoundary.test.ts — the boundary
// references errors.* keys, and App.vue reads crud.fieldRequired for
// the ConfigProvider form messages.
function createAppI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        crud: {
          fieldRequired: '{field} is required',
        },
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

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/my-data', name: 'home', component: HomeView }],
  });
}

const HealthyBanner = defineComponent({
  name: 'LimitBanner',
  setup: () => () => h('div', 'limit banner'),
});

const ThrowingBanner = defineComponent({
  name: 'LimitBanner',
  setup: () => {
    throw new Error('banner exploded');
  },
});

const TrayStub = defineComponent({
  name: 'CsvJobsTray',
  setup: () => () => h('div', 'csv jobs tray'),
});

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = undefined;
  vi.restoreAllMocks();
});

async function mountApp(banner: ReturnType<typeof defineComponent>) {
  const router = createTestRouter();
  await router.push('/my-data');
  await router.isReady();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const wrapper = mount(App, {
    global: {
      plugins: [Antd, createAppI18n(), router],
      stubs: { LimitBanner: banner, CsvJobsTray: TrayStub },
    },
    attachTo: document.body,
  });
  await nextTick();
  return wrapper;
}

describe('App top-level SmErrorBoundary (B-14 §5)', () => {
  it('renders LimitBanner, router-view, and CsvJobsTray inside the boundary when healthy', async () => {
    const wrapper = await mountApp(HealthyBanner);
    try {
      expect(wrapper.text()).toContain('limit banner');
      expect(wrapper.text()).toContain('home view');
      expect(wrapper.text()).toContain('csv jobs tray');
      expect(wrapper.text()).not.toContain('Something went wrong');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('shows the top-level fallback when LimitBanner throws — the banner is inside the boundary', async () => {
    const wrapper = await mountApp(ThrowingBanner);
    try {
      // Before the widening, LimitBanner sat outside SmErrorBoundary and
      // its render error escaped to the main.ts second net with no
      // fallback UI. Now the boundary catches it.
      expect(wrapper.text()).toContain('Something went wrong');
      expect(wrapper.text()).toContain('banner exploded');
      expect(wrapper.text()).toContain('Back to Home');
      expect(wrapper.text()).not.toContain('home view');
      expect(wrapper.text()).not.toContain('csv jobs tray');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });
});
