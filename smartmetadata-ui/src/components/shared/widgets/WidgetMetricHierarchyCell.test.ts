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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { persistSession } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import WidgetMetricHierarchyCell from './WidgetMetricHierarchyCell.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function metricJson(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    fullyQualifiedName: name,
    owners: [],
    reviewers: [],
    domains: [],
    dataProducts: [],
    relatedMetrics: [],
    experts: [],
    tags: [],
  };
}

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetMetricHierarchyCell, {
    props: {
      metric: {
        entityType: 'metric',
        id: 'm1',
        name: 'revenue',
        fullyQualifiedName: 'revenue',
        owners: [],
        tags: [],
        domains: [],
        schemaRows: [],
        schemaLabel: '',
      },
      canAddChild: true,
      onAddChild: () => {},
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()], stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] } } },
    attachTo: document.body,
  });
}

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('WidgetMetricHierarchyCell', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders group, ancestors, current, children and siblings in order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          current: metricJson('m1', 'revenue'),
          group: {
            id: 'g1',
            name: 'finance',
            fullyQualifiedName: 'finance',
            owners: [],
            domains: [],
            tags: [],
            metricCount: 3,
          },
          ancestors: [metricJson('a1', 'parent-metric')],
          children: [metricJson('c1', 'child-metric')],
          childrenPaging: { total: 1 },
          siblings: [metricJson('s1', 'peer-metric')],
          siblingPaging: { total: 1 },
        }),
      ),
    );
    const wrapper = mountCell();
    await flush();
    const rows = wrapper.findAll('[data-testid^="metric-tree-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
      'metric-tree-group',
      'metric-tree-ancestor-a1',
      'metric-tree-current',
      'metric-tree-child-c1',
      'metric-tree-peer-s1',
    ]);
    expect(wrapper.find('[data-testid="metric-tree-current"]').text()).toContain('You are here');
    const groupLink = wrapper
      .findAllComponents({ name: 'RouterLink' })
      .find((link) => (link.props('to') as { name?: string }).name === 'governance-metrics');
    expect(groupLink).toBeDefined();
    expect(
      (groupLink?.props('to') as { query?: Record<string, string> }).query?.highlight,
    ).toBe('finance');
    expect(wrapper.find('[data-testid="metric-tree-more-children"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the standalone message when the metric has no hierarchy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          current: metricJson('m1', 'revenue'),
          ancestors: [],
          children: [],
          childrenPaging: { total: 0 },
          siblings: [],
          siblingPaging: { total: 0 },
        }),
      ),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="metric-tree-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('standalone');
    wrapper.unmount();
  });

  it('renders only the current row for a deleted metric without fetching', async () => {
    const fetch = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountCell({
      metric: {
        entityType: 'metric',
        id: 'm1',
        name: 'revenue',
        fullyQualifiedName: 'revenue',
        owners: [],
        tags: [],
        domains: [],
        schemaRows: [],
        schemaLabel: '',
        deleted: true,
      },
    });
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="metric-tree-current"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Deleted');
    wrapper.unmount();
  });

  it('loads more children on demand and dedups', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        const childOffset = new URL(url, 'http://x').searchParams.get('childOffset');
        if (childOffset === '1') {
          return jsonResponse({
            current: metricJson('m1', 'revenue'),
            ancestors: [],
            children: [metricJson('c1', 'child-metric'), metricJson('c2', 'child-2')],
            childrenPaging: { total: 2 },
            siblings: [],
            siblingPaging: { total: 0 },
          });
        }
        return jsonResponse({
          current: metricJson('m1', 'revenue'),
          ancestors: [],
          children: [metricJson('c1', 'child-metric')],
          childrenPaging: { total: 2 },
          siblings: [],
          siblingPaging: { total: 0 },
        });
      }),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="metric-tree-more-children"]').exists()).toBe(true);
    await wrapper.find('[data-testid="metric-tree-more-children"]').trigger('click');
    await flush();
    expect(wrapper.findAll('[data-testid^="metric-tree-child-"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="metric-tree-more-children"]').exists()).toBe(false);
    expect(calls).toHaveLength(2);
    wrapper.unmount();
  });

  it('shows an error state with a retry when the load fails', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ message: 'boom' }, 500);
        }
        return jsonResponse({
          current: metricJson('m1', 'revenue'),
          ancestors: [],
          children: [],
          childrenPaging: { total: 0 },
          siblings: [],
          siblingPaging: { total: 0 },
        });
      }),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="metric-hierarchy-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="metric-hierarchy-retry"]').trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="metric-tree-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
