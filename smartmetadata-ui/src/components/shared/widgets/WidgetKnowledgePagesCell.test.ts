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
import WidgetKnowledgePagesCell from './WidgetKnowledgePagesCell.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mountCell() {
  return mount(WidgetKnowledgePagesCell, {
    props: { entityId: 'table-1', entityType: 'table' },
    global: { plugins: [Antd, createTestI18n()], stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] } } },
    attachTo: document.body,
  });
}

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('WidgetKnowledgePagesCell', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders articles as in-app links and quick links in a new window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'p1',
              name: 'guide',
              fullyQualifiedName: 'guide',
              displayName: 'Guide',
              pageType: 'Article',
            },
            {
              id: 'p2',
              name: 'docs',
              fullyQualifiedName: 'docs',
              displayName: 'Docs',
              pageType: 'QuickLink',
              page: { url: 'https://example.com/docs' },
            },
          ],
          paging: { total: 2 },
        }),
      ),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="knowledge-pages"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Guide');
    expect(wrapper.text()).toContain('Docs');
    const quickLink = wrapper.find('a[href="https://example.com/docs"]');
    expect(quickLink.exists()).toBe(true);
    expect(quickLink.attributes('target')).toBe('_blank');
    expect(wrapper.find('[data-testid="knowledge-pages-view-all"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the view-all link once the entity has more than ten pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'p1',
              name: 'guide',
              fullyQualifiedName: 'guide',
              displayName: 'Guide',
              pageType: 'Article',
            },
          ],
          paging: { total: 11 },
        }),
      ),
    );
    const wrapper = mountCell();
    await flush();
    const viewAll = wrapper.find('[data-testid="knowledge-pages-view-all"]');
    expect(viewAll.exists()).toBe(true);
    const viewAllLink = wrapper
      .findAllComponents({ name: 'RouterLink' })
      .find((link) => (link.props('to') as { name?: string }).name === 'context-center-filter');
    expect(viewAllLink).toBeDefined();
    expect(
      (viewAllLink?.props('to') as { query?: Record<string, string> }).query,
    ).toEqual({ entityId: 'table-1', entityType: 'table' });
    wrapper.unmount();
  });

  it('renders nothing when the entity has no pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="knowledge-pages"]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('knowledge-pages');
    wrapper.unmount();
  });

  it('renders nothing when the load fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('down');
    }));
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="knowledge-pages"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
