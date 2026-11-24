/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DomainTreeView from './DomainTreeView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const rootsBody = {
  data: [
    { id: 'd1', name: 'Marketing', fullyQualifiedName: 'Marketing', domainType: 'Consumer-aligned', childrenCount: 1 },
    { id: 'd2', name: 'Sales', fullyQualifiedName: 'Sales', domainType: 'Source-aligned', childrenCount: 0 },
  ],
  paging: { total: 2 },
};

const childrenBody = {
  data: [
    { id: 'd3', name: 'SEO', fullyQualifiedName: 'Marketing.SEO', domainType: 'Consumer-aligned', childrenCount: 0 },
  ],
  paging: { total: 1 },
};

const searchBody = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: 'domain_search_index',
        _id: 'd1',
        _source: {
          id: 'd1',
          name: 'Marketing',
          fullyQualifiedName: 'Marketing',
          description: 'Growth',
          domainType: 'Consumer-aligned',
          childrenCount: 1,
        },
      },
    ],
  },
};

describe('DomainTreeView', () => {
  let failHierarchyOnce = false;

  beforeEach(() => {
    failHierarchyOnce = false;
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse(searchBody);
        }
        if (url.includes('/api/v1/domains/hierarchy')) {
          if (failHierarchyOnce) {
            failHierarchyOnce = false;
            return new Response('hierarchy failed', { status: 500 });
          }
          const params = new URL(url, 'http://localhost').searchParams;
          if (params.get('directChildrenOf') === 'Marketing') {
            return jsonResponse(childrenBody);
          }
          return jsonResponse(rootsBody);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function mountTree(props: { searchQuery?: string; refreshToken?: number } = {}) {
    const wrapper = mount(DomainTreeView, {
      props,
      global: { plugins: [Antd, createTestI18n()] },
    });
    return wrapper;
  }

  it('renders hierarchy roots from GET /v1/domains/hierarchy', async () => {
    const wrapper = mountTree();
    await flushPromises();
    expect(wrapper.find('[data-testid="domains-tree"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.text()).toContain('Sales');
    expect(wrapper.text()).toContain('Consumer-aligned');
    const hierarchyCalls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/domains/hierarchy'));
    expect(hierarchyCalls).toHaveLength(1);
    expect(hierarchyCalls[0]).not.toContain('directChildrenOf');
    expect(hierarchyCalls[0]).toContain('limit=15');
  });

  it('expands a node and loads its children on demand', async () => {
    const wrapper = mountTree();
    await flushPromises();
    expect(wrapper.text()).not.toContain('SEO');
    const switcher = wrapper.find('.ant-tree-switcher_close');
    expect(switcher.exists()).toBe(true);
    await switcher.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('SEO');
    const childCalls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('directChildrenOf=Marketing'));
    expect(childCalls).toHaveLength(1);
  });

  it('emits open with the domain when a node title is clicked', async () => {
    const wrapper = mountTree();
    await flushPromises();
    await wrapper.find('[data-testid="domain-tree-node-Marketing"]').trigger('click');
    await flushPromises();
    const emitted = wrapper.emitted('open');
    expect(emitted).toHaveLength(1);
    expect((emitted?.[0]?.[0] as { name?: string })?.name).toBe('Marketing');
  });

  it('searches the domain index when searchQuery changes and restores roots on clear', async () => {
    const wrapper = mountTree({ searchQuery: '' });
    await flushPromises();
    expect(wrapper.text()).toContain('Sales');
    await wrapper.setProps({ searchQuery: 'mark' });
    await flushPromises();
    const searchCalls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/search/query'));
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toContain('index=domain');
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.text()).not.toContain('Sales');
    await wrapper.setProps({ searchQuery: '' });
    await flushPromises();
    expect(wrapper.text()).toContain('Sales');
  });

  it('loads more roots when the total exceeds one page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/hierarchy')) {
          const params = new URL(url, 'http://localhost').searchParams;
          const offset = Number(params.get('offset') ?? 0);
          if (offset > 0) {
            return jsonResponse({
              data: [
                { id: 'd16', name: 'Root16', fullyQualifiedName: 'Root16', domainType: 'Aggregate', childrenCount: 0 },
              ],
              paging: { total: 16 },
            });
          }
          return jsonResponse({
            data: Array.from({ length: 15 }, (_, i) => ({
              id: `d${i + 1}`,
              name: `Root${i + 1}`,
              fullyQualifiedName: `Root${i + 1}`,
              domainType: 'Source-aligned',
              childrenCount: 0,
            })),
            paging: { total: 16 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = mountTree();
    await flushPromises();
    expect(wrapper.find('[data-testid="domains-tree-load-more"]').exists()).toBe(true);
    await wrapper.find('[data-testid="domains-tree-load-more"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Root16');
    const offsetCalls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('offset=15'));
    expect(offsetCalls).toHaveLength(1);
    expect(wrapper.find('[data-testid="domains-tree-load-more"]').exists()).toBe(false);
  });

  it('shows an error and retries when the hierarchy load fails', async () => {
    failHierarchyOnce = true;
    const wrapper = mountTree();
    await flushPromises();
    expect(wrapper.find('[data-testid="domains-tree-retry"]').exists()).toBe(true);
    await wrapper.find('[data-testid="domains-tree-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="domains-tree-retry"]').exists()).toBe(false);
  });
});
