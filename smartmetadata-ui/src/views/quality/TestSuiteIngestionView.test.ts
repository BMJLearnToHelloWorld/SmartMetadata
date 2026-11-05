/**
 * Copyright 2026 SmartMetadata authors.
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
import TestSuiteIngestionView from './TestSuiteIngestionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TestSuiteIngestionView', () => {
  const bodies: Array<{ url: string; body: unknown }> = [];
  beforeEach(() => {
    bodies.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testSuites/suite1') && init?.method === 'GET') {
          return jsonResponse({
            id: 'suite1',
            name: 'orders_suite',
            fullyQualifiedName: 'orders_suite',
            basic: false,
            tests: [{ id: 'tc1', name: 'row_count' }],
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          return jsonResponse({ code: 200 });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          bodies.push({ url, body: JSON.parse(String(init?.body)) });
          return jsonResponse({
            id: 'p9',
            name: 'orders_suite-test-suite',
            pipelineType: 'TestSuite',
            service: { id: 'suite1', type: 'testSuite' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a TestSuite pipeline for the suite, then deploys it (A15)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/quality/test-suites/:id/add-ingestion',
          name: 'quality-test-suite-add-ingestion',
          component: TestSuiteIngestionView,
          props: true,
        },
        {
          path: '/ingestion/pipelines/:id',
          name: 'ingestion-pipeline',
          component: { template: '<div>pipeline</div>' },
          props: true,
        },
      ],
    });
    await router.push('/quality/test-suites/suite1/add-ingestion');
    await router.isReady();
    const wrapper = mount(TestSuiteIngestionView, {
      props: { id: 'suite1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="test-suite-ingestion-form"]').exists()).toBe(true);
    await wrapper.find('[data-testid="test-suite-ingestion-save"]').trigger('click');
    await flushPromises();
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!.body as {
      pipelineType: string;
      service: { id: string; type: string };
      sourceConfig: { config: { type: string; entityFullyQualifiedName?: string; testCases?: string[] } };
      loggerLevel?: string;
      raiseOnError?: boolean;
    };
    expect(body.pipelineType).toBe('TestSuite');
    expect(body.service).toEqual({ id: 'suite1', type: 'testSuite' });
    expect(body.sourceConfig.config.type).toBe('TestSuite');
    expect(body.sourceConfig.config.entityFullyQualifiedName).toBe('orders_suite');
    expect(body.sourceConfig.config.testCases).toBeUndefined();
    expect(body.loggerLevel).toBe('Info');
    expect(body.raiseOnError).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
  });
});
