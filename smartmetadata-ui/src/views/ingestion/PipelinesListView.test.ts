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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PipelinesListView from './PipelinesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(initialPath: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: PipelinesListView },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  const wrapper = mount(PipelinesListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

async function mountViewWithProp(
  kindFilter: 'database' | 'messaging' | 'testSuites',
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: PipelinesListView },
    ],
  });
  await router.push('/ingestion/pipelines');
  await router.isReady();
  const wrapper = mount(PipelinesListView, {
    props: { kindFilter },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

function listUrls(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter(
      (url) =>
        url.includes('/api/v1/services/ingestionPipelines') &&
        !url.includes('/status') &&
        !url.includes('/deploy/'),
    );
}

/**
 * The route is an interim wrapper around the IngestionPipelineList
 * tab content (shell §4.2 deletes the route): these tests pin only
 * the category resolution. The tab behavior itself is covered by
 * IngestionPipelineList.test.ts. The former create-modal, row-action,
 * search, service-filter, page-size, and result-modal tests covered
 * features deleted by ruling (D-3/D-5/D-6/D-7/D-15, §4.7) and were
 * removed with them.
 */
describe('PipelinesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('defaults to the database category', async () => {
    await mountView('/ingestion/pipelines');
    expect(listUrls()[0]).toContain('serviceType=databaseService');
  });

  it('resolves ?category= to the dashboard category', async () => {
    await mountView('/ingestion/pipelines?category=dashboards');
    expect(listUrls()[0]).toContain('serviceType=dashboardService');
  });

  it('resolves ?category= to an enum value', async () => {
    await mountView('/ingestion/pipelines?category=messagingServices');
    expect(listUrls()[0]).toContain('serviceType=messagingService');
  });

  it('resolves ?category=testSuites to the test-suite service type', async () => {
    await mountView('/ingestion/pipelines?category=testSuites');
    expect(listUrls()[0]).toContain('serviceType=testSuite');
  });

  it('falls back to the database category for an unknown ?category=', async () => {
    await mountView('/ingestion/pipelines?category=bogus');
    expect(listUrls()[0]).toContain('serviceType=databaseService');
  });

  it('fetches with serviceType for the prop-scoped kind', async () => {
    await mountViewWithProp('database');
    expect(listUrls()[0]).toContain('serviceType=databaseService');
  });

  it('reloads with the new kind serviceType when the prop scope changes', async () => {
    const wrapper = await mountViewWithProp('database');
    vi.mocked(fetch).mockClear();
    await wrapper.setProps({ kindFilter: 'messaging' });
    await flushPromises();
    expect(listUrls()[0]).toContain('serviceType=messagingService');
    wrapper.unmount();
  });

  it('passes the test-suite service type for the testSuites prop scope', async () => {
    // The testSuites fetch landed in the component (serviceType
    // testSuite), superseding the old view's no-fetch shell scope.
    await mountViewWithProp('testSuites');
    expect(listUrls()[0]).toContain('serviceType=testSuite');
  });
});
