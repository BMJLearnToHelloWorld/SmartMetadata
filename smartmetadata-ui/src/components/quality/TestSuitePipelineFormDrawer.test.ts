/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TestSuitePipelineFormDrawer from './TestSuitePipelineFormDrawer.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function el(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

const bundleSuite: TestSuite = {
  id: 'suite1',
  name: 'orders_suite',
  fullyQualifiedName: 'orders_suite',
  basic: false,
  tests: [{ id: 'tc1', type: 'testCase', name: 'row_count' }],
  owners: [],
};

const basicSuite: TestSuite = {
  id: 'suite2',
  name: 'orders',
  fullyQualifiedName: 'orders',
  basic: true,
  basicEntityReference: 'db.orders',
  tests: [{ id: 'tc1', type: 'testCase', name: 'row_count' }],
  owners: [],
};

describe('TestSuitePipelineFormDrawer', () => {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const patches: Array<Array<Record<string, unknown>>> = [];
  const deploys: string[] = [];
  const caseListUrls: string[] = [];
  let statusCode = 200;

  beforeEach(() => {
    posts.length = 0;
    patches.length = 0;
    deploys.length = 0;
    caseListUrls.length = 0;
    statusCode = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases') && init?.method === 'GET') {
          caseListUrls.push(url);
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                fullyQualifiedName: 'db.orders.row_count',
                testSuite: { id: 'suite1', type: 'testSuite', name: 'orders_suite' },
                testDefinition: { id: 'td1', type: 'testDefinition', name: 'rowCount' },
                testSuites: [],
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: statusCode, platform: statusCode === 200 ? 'airflow' : 'disabled' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          deploys.push(url);
          return jsonResponse({ code: 200 });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          posts.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          return jsonResponse({
            id: 'p9',
            name: 'generated-uuid',
            pipelineType: 'TestSuite',
            service: { id: 'suite1', type: 'testSuite' },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/') && init?.method === 'PATCH') {
          patches.push(JSON.parse(String(init.body)) as Array<Record<string, unknown>>);
          return jsonResponse({ id: 'p9', name: 'generated-uuid' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function mountDrawer(props: {
    suite: TestSuite;
    ingestionPipeline?: IngestionPipeline | null;
  }) {
    return mount(TestSuitePipelineFormDrawer, {
      attachTo: document.body,
      props: { open: true, suite: props.suite, ingestionPipeline: props.ingestionPipeline ?? null },
      global: { plugins: [Antd, createTestI18n()] },
    });
  }

  it('creates a TestSuite pipeline for a bundle suite with no table FQN (P-22, P-33)', async () => {
    const wrapper = mountDrawer({ suite: bundleSuite });
    await flushPromises();
    expect(el('pipeline-name')).not.toBeNull();
    // selectAll defaults false; choose "select all" so the save is valid.
    await new DOMWrapper(el('test-suite-ingestion-select-all')!).trigger('click');
    await new DOMWrapper(el('test-suite-ingestion-save')!).trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as {
      name: string;
      displayName: string;
      pipelineType: string;
      service: { id: string; type: string };
      sourceConfig: { config: { type: string; entityFullyQualifiedName?: string; testCases?: string[] } };
      airflowConfig: { scheduleInterval?: string };
      loggerLevel?: string;
      raiseOnError?: boolean;
    };
    expect(body.pipelineType).toBe('TestSuite');
    expect(body.service).toEqual({ id: 'suite1', type: 'testSuite' });
    expect(body.sourceConfig.config.type).toBe('TestSuite');
    // A bundle suite has no table: entityFullyQualifiedName is undefined.
    expect(body.sourceConfig.config.entityFullyQualifiedName).toBeUndefined();
    expect(body.sourceConfig.config.testCases).toBeUndefined();
    // Born unpaused (ADR:2026-11-11-ingestion-pipeline-born-unpaused).
    expect('pausePipeline' in body.airflowConfig).toBe(false);
    expect(body.airflowConfig.scheduleInterval).toBe('0 0 * * *');
    expect(body.loggerLevel).toBe('INFO');
    expect(body.raiseOnError).toBe(true);
    expect(body.name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.displayName).toMatch(/^orders_suite_TestSuite_[A-Za-z0-9]{8}$/);
    expect(deploys).toHaveLength(1);
    expect(wrapper.emitted('success')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('scopes the case picker by testSuiteId and the table entityLink for a basic suite', async () => {
    const wrapper = mountDrawer({ suite: basicSuite });
    await flushPromises();
    expect(caseListUrls).toHaveLength(1);
    const url = new URL(caseListUrls[0]!, 'http://localhost');
    expect(url.searchParams.get('testSuiteId')).toBe('suite2');
    expect(url.searchParams.get('entityLink')).toBe('<#E::table::db.orders>');
    expect(url.searchParams.get('includeAllTests')).toBe('true');
    await new DOMWrapper(el('test-suite-ingestion-select-all')!).trigger('click');
    await new DOMWrapper(el('test-suite-ingestion-save')!).trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as {
      sourceConfig: { config: { entityFullyQualifiedName?: string } };
    };
    expect(body.sourceConfig.config.entityFullyQualifiedName).toBe('db.orders');
    expect(wrapper.emitted('success')).toHaveLength(1);
  });

  it('searches cases server-side as the user types (M-5)', async () => {
    // The search/list endpoint returns a different case than the plain
    // list, so the options update proves the typed term was queried
    // server-side instead of filtering the first 100 locally.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases') && init?.method === 'GET') {
          caseListUrls.push(url);
          const isSearch = url.includes('/search/list');
          return jsonResponse({
            data: [
              {
                id: isSearch ? 'tc2' : 'tc1',
                name: isSearch ? 'null_check' : 'row_count',
                fullyQualifiedName: isSearch ? 'db.orders.null_check' : 'db.orders.row_count',
                testSuite: { id: 'suite2', type: 'testSuite', name: 'orders' },
                testDefinition: {
                  id: 'td1',
                  type: 'testDefinition',
                  name: isSearch ? 'columnValuesToBeNotNull' : 'rowCount',
                },
                testSuites: [],
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    mountDrawer({ suite: basicSuite });
    await flushPromises();
    expect(caseListUrls).toHaveLength(1);
    // The drawer content is teleported to document.body: reach the
    // cases Select's search input there, not through the wrapper.
    const casesSelect = document.body.querySelector('[data-testid="test-suite-ingestion-cases"]');
    expect(casesSelect).not.toBeNull();
    const searchInput = casesSelect!.querySelector(
      '.ant-select-selection-search-input',
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    searchInput!.value = 'null';
    searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    const searchUrls = caseListUrls.filter((url) => url.includes('/search/list'));
    expect(searchUrls).toHaveLength(1);
    const searchUrl = new URL(searchUrls[0]!, 'http://localhost');
    expect(searchUrl.searchParams.get('q')).toBe('null');
    expect(searchUrl.searchParams.get('testSuiteId')).toBe('suite2');
    expect(searchUrl.searchParams.get('entityLink')).toBe('<#E::table::db.orders>');
    const options = [...document.body.querySelectorAll('.ant-select-item-option')].map(
      (option) => option.textContent,
    );
    expect(options.some((text) => text?.includes('null_check'))).toBe(true);
  });

  it('blocks the save when no test case is selected and select-all is off', async () => {
    const wrapper = mountDrawer({ suite: bundleSuite });
    await flushPromises();
    await new DOMWrapper(el('test-suite-ingestion-save')!).trigger('click');
    await flushPromises();
    expect(posts).toHaveLength(0);
    expect(document.body.textContent).toContain('Select at least one test case');
    expect(wrapper.emitted('success')).toBeUndefined();
  });

  it('edits with a JSON Patch carrying only the changed displayName (P-07)', async () => {
    const existing: IngestionPipeline = {
      id: 'p9',
      name: 'generated-uuid',
      fullyQualifiedName: 'orders_suite.generated-uuid',
      displayName: 'Suite Pipe',
      pipelineType: 'TestSuite',
      service: { id: 'suite1', type: 'testSuite', name: 'orders_suite' },
      sourceConfig: {
        config: { type: 'TestSuite', entityFullyQualifiedName: 'db.orders', testCases: ['row_count'] },
      },
      airflowConfig: { scheduleInterval: '0 0 * * *' },
      loggerLevel: 'DEBUG',
      raiseOnError: false,
    };
    const wrapper = mountDrawer({ suite: basicSuite, ingestionPipeline: existing });
    await flushPromises();
    expect((el('pipeline-name') as HTMLInputElement).value).toBe('Suite Pipe');
    await new DOMWrapper(el('pipeline-name')!).setValue('Suite Pipe v2');
    await new DOMWrapper(el('test-suite-ingestion-save')!).trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(0);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual([
      { op: 'replace', path: '/displayName', value: 'Suite Pipe v2' },
    ]);
    expect(deploys).toHaveLength(1);
    expect(wrapper.emitted('success')).toHaveLength(1);
  });

  it('skips the deploy when Airflow is unavailable (P-41)', async () => {
    statusCode = 503;
    const wrapper = mountDrawer({ suite: bundleSuite });
    await flushPromises();
    await new DOMWrapper(el('test-suite-ingestion-select-all')!).trigger('click');
    await new DOMWrapper(el('test-suite-ingestion-save')!).trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    expect(deploys).toHaveLength(0);
    expect(wrapper.emitted('success')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
