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
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import MemoryConflictReviews from './MemoryConflictReviews.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function reviewTask(id: string, aboutId: string) {
  return {
    id,
    type: 'MemoryConflictReview',
    status: 'Open',
    about: { id: aboutId, type: 'contextMemory', name: 'churn-rate', displayName: 'Churn rate' },
    payload: {
      disputes: [
        {
          memory: { id: 'm3', type: 'contextMemory', name: 'churn-faq' },
          detectedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    },
  };
}

function stubTasks() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/contextCenter/memories/m2')) {
        return jsonResponse({ id: 'm2', title: 'Churn rate memory' });
      }
      if (url.includes('/v1/tasks')) {
        const parsed = new URL(url);
        if (parsed.searchParams.get('limit') === '1') {
          return jsonResponse({ data: [], paging: { total: 3 } });
        }
        if (parsed.searchParams.get('after') === 'c1') {
          return jsonResponse({ data: [reviewTask('t2', 'm2')], paging: { total: 3 } });
        }
        return jsonResponse({
          data: [reviewTask('t1', 'm2')],
          paging: { total: 3, after: 'c1' },
        });
      }
      return jsonResponse({});
    }),
  );
}

function mountReviews() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(MemoryConflictReviews, {
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
  return { wrapper, pinia };
}

describe('MemoryConflictReviews', () => {
  beforeEach(() => {
    localStorage.clear();
    stubTasks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('lists reviews with the resolved memory title, emits the count, and loads more by cursor', { timeout: 15000 }, async () => {
    const { wrapper } = await mountReviews();
    await flushPromises();
    expect(wrapper.emitted('count')).toEqual([[3]]);
    expect(wrapper.find('[data-testid="memory-review-t1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Churn rate memory');
    expect(wrapper.find('[data-testid="memory-reviews-load-more"]').exists()).toBe(true);
    await wrapper.get('[data-testid="memory-reviews-load-more"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="memory-review-t2"]').exists()).toBe(true);
  });

  it('emits open-review when a row is clicked', { timeout: 15000 }, async () => {
    const { wrapper } = await mountReviews();
    await flushPromises();
    await wrapper.get('[data-testid="memory-review-t1"]').trigger('click');
    const emitted = wrapper.emitted('open-review');
    expect(emitted).toHaveLength(1);
    expect((emitted![0][0] as { id: string }).id).toBe('t1');
  });

  it('uses the admin list endpoint for admins', { timeout: 15000 }, async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/v1/contextCenter/memories/m2')) {
          return jsonResponse({ id: 'm2', title: 'Churn rate memory' });
        }
        return jsonResponse({ data: [reviewTask('t1', 'm2')], paging: { total: 1 } });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-root', name: 'admin', isAdmin: true };
    const wrapper = mount(MemoryConflictReviews, {
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="memory-review-t1"]').exists()).toBe(true);
    expect(urls.some((url) => url.includes('/api/v1/tasks?'))).toBe(true);
    expect(urls.some((url) => url.includes('/assigned'))).toBe(false);
  });

  it('shows the empty state when there are no open reviews', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountReviews();
    await flushPromises();
    expect(wrapper.find('[data-testid="memory-reviews-empty"]').exists()).toBe(true);
  });
});
