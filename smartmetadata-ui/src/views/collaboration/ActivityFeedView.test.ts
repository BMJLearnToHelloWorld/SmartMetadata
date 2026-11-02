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
import ActivityFeedView from './ActivityFeedView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/activity', name: 'activity', component: ActivityFeedView },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push('/activity');
  await router.isReady();
  const wrapper = mount(ActivityFeedView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ActivityFeedView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/activity') && !url.includes('/replies') && !url.includes('/conversations')) {
          if (url.includes('after=cursor-1')) {
            return jsonResponse({
              data: [
                {
                  id: 'act-3',
                  eventType: 'OwnerUpdated',
                  summary: 'Changed owner',
                  timestamp: 500,
                  entity: { name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' },
                },
              ],
              paging: { total: 3 },
            });
          }
          return jsonResponse({
            data: [
              {
                id: 'act-1',
                eventType: 'DescriptionUpdated',
                summary: 'Updated description',
                timestamp: 1000,
                oldValue: 'old-desc',
                newValue: 'new-desc',
                entity: { name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' },
              },
              {
                id: 'act-2',
                eventType: 'TagUpdated',
                summary: 'Added tag',
                timestamp: 2000,
                entity: { name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' },
              },
            ],
            paging: { total: 3, after: 'cursor-1' },
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('defaults to the 7-day range', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="activity-range"]').exists()).toBe(true);
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('days=7'))).toBe(true);
  });

  it('renders activity events from GET /v1/activity as timeline cards', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Updated description');
    expect(wrapper.text()).toContain('DescriptionUpdated');
    expect(wrapper.find('[data-testid="activity-timeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="activity-type-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-conversation"]').exists()).toBe(true);
  });

  it('sorts cards newest first regardless of payload order', async () => {
    const { wrapper } = await mountView();
    const cards = wrapper.findAll('[data-testid^="activity-card-"]');
    expect(cards.map((card) => card.attributes('data-testid'))).toEqual([
      'activity-card-act-2',
      'activity-card-act-1',
    ]);
  });

  it('loads the next page with the after cursor and appends it', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="activity-load-more"]').exists()).toBe(true);
    await wrapper.find('[data-testid="activity-load-more"]').trigger('click');
    await flushPromises();
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('after=cursor-1'))).toBe(true);
    expect(wrapper.text()).toContain('Changed owner');
  });

  it('opens a feed-width detail drawer on card click', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="activity-card-act-1"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent ?? '').toContain('old-desc');
  });
});
