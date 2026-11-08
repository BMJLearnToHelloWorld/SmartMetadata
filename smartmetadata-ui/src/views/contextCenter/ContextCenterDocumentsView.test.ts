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
import ContextCenterDocumentsView from './ContextCenterDocumentsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function allowPermissions(resource: string): Response {
  return jsonResponse({
    resource,
    permissions: [
      { operation: 'Create', access: 'allow' },
      { operation: 'EditAll', access: 'allow' },
      { operation: 'Delete', access: 'allow' },
    ],
  });
}

describe('ContextCenterDocumentsView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders folders and files', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="documents-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Guide');
    expect(wrapper.text()).toContain('Handbook');
    expect(wrapper.find('[data-testid="documents-upload"]').exists()).toBe(true);
    // No cursor in the stubbed page, so no Load more button.
    expect(wrapper.find('[data-testid="entity-list-load-more"]').exists()).toBe(false);
  });

  it('appends the next page with Load more instead of a pager', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/drive/files')) {
          if (url.includes('after=cursor-2')) {
            return jsonResponse({
              data: [
                { id: 'f2', name: 'second.pdf', displayName: 'Second', fileExtension: 'pdf', memoryCount: 0 },
                { id: 'f3', name: 'third.pdf', displayName: 'Third', fileExtension: 'pdf', memoryCount: 0 },
              ],
              paging: { total: 3 },
            });
          }
          return jsonResponse({
            data: [{ id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 }],
            paging: { total: 3, after: 'cursor-2' },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="entity-list-load-more"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-list-next"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-list-prev"]').exists()).toBe(false);
    await wrapper.find('[data-testid="entity-list-load-more"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Guide');
    expect(wrapper.text()).toContain('Second');
    expect(wrapper.text()).toContain('Third');
    expect(wrapper.find('[data-testid="entity-list-load-more"]').exists()).toBe(false);
  });

  it('hides upload, folder creation and folder deletion when the permission request fails', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return new Response('forbidden', { status: 403 });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="documents-upload"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="documents-create-folder"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="documents-delete-folder"]').exists()).toBe(false);
    // The read-only list itself still renders.
    expect(wrapper.find('[data-testid="documents-table"]').exists()).toBe(true);
  });

  it('searches the contextFile index after a 300ms debounce and restores the list on clear', { timeout: 15000 }, async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [
                { _source: { id: 'f9', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 } },
              ],
            },
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'other.pdf', displayName: 'Other', fileExtension: 'pdf', memoryCount: 0 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Other');
    const search = wrapper.find('[data-testid="entity-list-search"]');
    await search.setValue('guide');
    // Still debouncing: no search request yet.
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/v1/search/query'))).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    const searchCalls = vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).includes('/v1/search/query'));
    expect(searchCalls).toHaveLength(1);
    expect(String(searchCalls[0]?.[0])).toContain('index=contextFile');
    expect(wrapper.text()).toContain('Guide');
    expect(wrapper.text()).not.toContain('Other');
    expect(wrapper.find('[data-testid="entity-list-load-more"]').exists()).toBe(false);
    // Clearing the search restores the REST list from the first page.
    await search.setValue('');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(wrapper.text()).toContain('Other');
    vi.useRealTimers();
  });

  it('discards a stale search response when a newer search wins', { timeout: 15000 }, async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/v1/search/query')) {
          const q = new URL(url).searchParams.get('q');
          if (q === 'first') {
            await sleep(600);
            return jsonResponse({
              hits: { total: { value: 1 }, hits: [{ _source: { id: 'f1', name: 'first.pdf', displayName: 'First', fileExtension: 'pdf' } }] },
            });
          }
          return jsonResponse({
            hits: { total: { value: 1 }, hits: [{ _source: { id: 'f2', name: 'second.pdf', displayName: 'Second', fileExtension: 'pdf' } }] },
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const search = wrapper.find('[data-testid="entity-list-search"]');
    await search.setValue('first');
    await sleep(400);
    await search.setValue('second');
    await sleep(900);
    await flushPromises();
    expect(wrapper.text()).toContain('Second');
    expect(wrapper.text()).not.toContain('First');
  });

  it('bulk-deletes the selected files and clears only their selection', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/bulk/delete')) {
          expect(JSON.parse(String(init?.body))).toEqual({ ids: ['f1', 'f2'], hardDelete: false });
          return jsonResponse({
            numberOfRowsProcessed: 2,
            numberOfRowsPassed: 2,
            numberOfRowsFailed: 0,
            successRequest: [
              { request: 'f1', status: 200 },
              { request: 'f2', status: 200 },
            ],
            status: 'SUCCESS',
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [
              { id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 },
              { id: 'f2', name: 'other.pdf', displayName: 'Other', fileExtension: 'pdf', memoryCount: 0 },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 2 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const checkboxes = wrapper.findAll('.ant-checkbox-input');
    await checkboxes[0]?.setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="documents-bulk-bar"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('2 selected');
    await wrapper.find('[data-testid="documents-bulk-delete"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Delete documents');
    const okButton = [...document.querySelectorAll<HTMLElement>('.ant-modal-footer .ant-btn-dangerous')].at(-1);
    expect(okButton).not.toBeUndefined();
    okButton?.click();
    await flushPromises();
    expect(wrapper.text()).not.toContain('Guide');
    expect(wrapper.text()).not.toContain('Other');
    expect(wrapper.find('[data-testid="documents-bulk-bar"]').exists()).toBe(false);
    expect(document.body.textContent).not.toContain('Delete documents');
  });

  it('keeps the bulk-delete confirmation open on partial failure', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/bulk/delete')) {
          expect(JSON.parse(String(init?.body))).toEqual({ ids: ['f1', 'f2'], hardDelete: false });
          return jsonResponse({
            numberOfRowsProcessed: 2,
            numberOfRowsPassed: 1,
            numberOfRowsFailed: 1,
            successRequest: [{ request: 'f1', status: 200 }],
            failedRequest: [{ request: 'f2', status: 404, message: 'not found' }],
            status: 'PARTIAL_SUCCESS',
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [
              { id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 },
              { id: 'f2', name: 'other.pdf', displayName: 'Other', fileExtension: 'pdf', memoryCount: 0 },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 2 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const checkboxes = wrapper.findAll('.ant-checkbox-input');
    await checkboxes[0]?.setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="documents-bulk-delete"]').trigger('click');
    await flushPromises();
    const okButton = [...document.querySelectorAll<HTMLElement>('.ant-modal-footer .ant-btn-dangerous')].at(-1);
    expect(okButton).not.toBeUndefined();
    okButton?.click();
    await flushPromises();
    // The deleted file is gone, the failed one stays — and its row stays
    // selected, with the confirmation still open for a retry.
    expect(wrapper.text()).not.toContain('Guide');
    expect(wrapper.text()).toContain('Other');
    expect(wrapper.text()).toContain('1 selected');
    expect(document.body.textContent).toContain('Delete documents');
  });

  it('bulk-downloads the selected files as context-center-documents.zip', { timeout: 15000 }, async () => {
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-zip');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/bulk/download')) {
          expect(JSON.parse(String(init?.body))).toEqual({ ids: ['f1'] });
          // String body, not a Blob body: Node 22's Response constructor calls
          // blob.stream(), which jsdom's Blob lacks (CI failure on Node 22,
          // while Node 24 tolerates it).
          return new Response('PK\x03\x04', {
            status: 200,
            headers: { 'Content-Type': 'application/zip' },
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const checkboxes = wrapper.findAll('.ant-checkbox-input');
    await checkboxes[0]?.setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="documents-bulk-download"]').trigger('click');
    await flushPromises();
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="documents-bulk-bar"]').exists()).toBe(false);
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('bulk-moves the selected files and updates their folder in place', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/bulk/move')) {
          expect(init?.method).toBe('PUT');
          expect(JSON.parse(String(init?.body))).toEqual({
            ids: ['f1'],
            folder: { id: 'd2', type: 'folder' },
          });
          return jsonResponse({
            numberOfRowsProcessed: 1,
            numberOfRowsPassed: 1,
            numberOfRowsFailed: 0,
            successRequest: [{ request: 'f1', status: 200 }],
            status: 'SUCCESS',
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [
              { id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf', memoryCount: 2, folder: { id: 'd1', name: 'handbook', displayName: 'Handbook' } },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [
              { id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 1 },
              { id: 'd2', name: 'archive', displayName: 'Archive', childrenCount: 0 },
            ],
            paging: { total: 2 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/documents', name: 'context-center-documents', component: ContextCenterDocumentsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/documents');
    await router.isReady();
    const wrapper = mount(ContextCenterDocumentsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const checkboxes = wrapper.findAll('.ant-checkbox-input');
    await checkboxes[0]?.setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="documents-bulk-move"]').trigger('click');
    await flushPromises();
    const moveItem = [...document.querySelectorAll<HTMLElement>('[data-testid="bulk-move-to-d2"]')].at(-1);
    expect(moveItem).not.toBeUndefined();
    moveItem?.click();
    await flushPromises();
    expect(wrapper.text()).toContain('Archive');
    expect(wrapper.find('[data-testid="documents-bulk-bar"]').exists()).toBe(false);
  });
});
