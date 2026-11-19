/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
// Shared harness for the C-4 page-editor component tests: a minimal
// customize-store stand-in. It holds currentPage in reactive state,
// echoes onUpdateCurrentPage into it (like the store), and records
// onSaveLayout calls. Mounted inside a RouterView so the route leave
// guard is live.
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref, type Component } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { PersonaPage } from '@/types/persona';

export interface PageHarness {
  wrapper: VueWrapper;
  router: Router;
  currentPage: ReturnType<typeof ref<PersonaPage | null>>;
  onSaveLayout: ReturnType<typeof vi.fn>;
  updateCalls: PersonaPage[];
}

export async function mountPageEditor(
  component: Component,
  options: {
    currentPage: PersonaPage | null;
    currentPageType: string;
    originalPage: PersonaPage | null;
    props?: Record<string, unknown>;
    saveImpl?: (page?: PersonaPage) => Promise<void>;
  },
): Promise<PageHarness> {
  setActivePinia(createPinia());
  const currentPage = ref<PersonaPage | null>(options.currentPage);
  const updateCalls: PersonaPage[] = [];
  const onSaveLayout = vi.fn<(page?: PersonaPage) => Promise<void>>(
    options.saveImpl ?? (async () => {}),
  );

  const Harness = defineComponent({
    setup() {
      return () =>
        h(component as Component, {
          personaName: 'Analyst',
          currentPage: currentPage.value,
          currentPageType: options.currentPageType,
          originalPage: options.originalPage,
          onUpdateCurrentPage: (page: PersonaPage) => {
            updateCalls.push(page);
            currentPage.value = page;
          },
          onSaveLayout: (...args: [PersonaPage?]) => onSaveLayout(...args),
          ...(options.props ?? {}),
        });
    },
  });

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Harness },
      { path: '/other', component: { template: '<div>other</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();

  const App = defineComponent({ template: '<RouterView />' });
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, currentPage, onSaveLayout, updateCalls };
}

export async function mountTabWidget(
  component: Component,
  options: {
    currentPage: PersonaPage | null;
    currentPageType: string;
  },
): Promise<PageHarness> {
  setActivePinia(createPinia());
  const currentPage = ref<PersonaPage | null>(options.currentPage);
  const updateCalls: PersonaPage[] = [];
  const onSaveLayout = vi.fn<(page?: PersonaPage) => Promise<void>>(async () => {});

  const Harness = defineComponent({
    setup() {
      return () =>
        h(component as Component, {
          currentPage: currentPage.value,
          currentPageType: options.currentPageType,
          onUpdateCurrentPage: (page: PersonaPage) => {
            updateCalls.push(page);
            currentPage.value = page;
          },
        });
    },
  });

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Harness }],
  });
  await router.push('/');
  await router.isReady();

  const App = defineComponent({ template: '<RouterView />' });
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, currentPage, onSaveLayout, updateCalls };
}

export function bodyEl(selector: string): HTMLElement {
  const el = document.body.querySelector(selector) as HTMLElement | null;
  if (!el) {
    throw new Error(`Expected an element matching ${selector} in document.body`);
  }
  return el;
}

export function clickBody(selector: string): void {
  bodyEl(selector).click();
}

export function cleanupBody(): void {
  document.body.innerHTML = '';
}
