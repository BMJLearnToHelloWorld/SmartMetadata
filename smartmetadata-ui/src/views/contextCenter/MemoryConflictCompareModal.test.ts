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
import { createTestI18n } from '@/test/i18n';
import type { CollaborationTask } from '@/types/collaboration';
import MemoryConflictCompareModal from './MemoryConflictCompareModal.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const REVIEWED = {
  id: 'm3',
  name: 'churn-rate-new',
  title: 'Churn rate (new)',
  question: 'What is churn rate?',
  answer: 'Lost customers.',
  memoryType: 'FAQ',
  lastContentUpdatedAt: 1760000000000,
};

const DISPUTED = {
  id: 'm2',
  name: 'churn-rate',
  title: 'Churn rate',
  question: 'What is churn?',
  answer: 'Lost customers.',
  memoryType: 'FAQ',
  lastContentUpdatedAt: 1750000000000,
};

function review(): CollaborationTask {
  return {
    id: 't1',
    type: 'MemoryConflictReview',
    status: 'Open',
    about: { id: 'm3', type: 'contextMemory', name: 'churn-rate-new' },
    assignees: [],
    comments: [],
    reviewPayload: {
      disputes: [
        {
          memory: { id: 'm2', type: 'contextMemory', name: 'churn-rate' },
          detectedAt: 1761955200000,
        },
      ],
    },
  };
}

function stubMemories(resolveStatus = 200) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : '' });
      if (url.includes('/v1/contextCenter/memories/m3')) {
        return jsonResponse(REVIEWED);
      }
      if (url.includes('/v1/contextCenter/memories/m2')) {
        return jsonResponse(DISPUTED);
      }
      if (url.includes('/v1/tasks/t1/resolve')) {
        return jsonResponse({ id: 't1', type: 'MemoryConflictReview', status: 'Closed' }, resolveStatus);
      }
      return jsonResponse({});
    }),
  );
  return calls;
}

function clickButton(testId: string): void {
  const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  if (!el) {
    throw new Error(`missing button ${testId}`);
  }
  el.click();
}

function isDisabled(testId: string): boolean {
  const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  if (!el) {
    throw new Error(`missing button ${testId}`);
  }
  return el.disabled;
}

function mountModal() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(MemoryConflictCompareModal, {
    props: { open: true, review: review() },
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
  return wrapper;
}

describe('MemoryConflictCompareModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders nine diff rows once both sides load and enables both keep buttons', { timeout: 15000 }, async () => {
    stubMemories();
    mountModal();
    await flushPromises();
    const rows = document.querySelectorAll('[data-testid="memory-diff-rows"] tbody tr');
    expect(rows.length).toBe(9);
    expect(isDisabled('memory-compare-keep-approved')).toBe(false);
    expect(isDisabled('memory-compare-keep-reviewed')).toBe(false);
  });

  it('keep-reviewed resolves with approve/Approved and the compared payload', { timeout: 15000 }, async () => {
    const calls = stubMemories();
    const wrapper = mountModal();
    await flushPromises();
    clickButton('memory-compare-keep-reviewed');
    await flushPromises();
    const resolve = calls.find((call) => call.url.includes('/v1/tasks/t1/resolve'));
    expect(resolve).not.toBeUndefined();
    const body = JSON.parse(resolve!.body) as Record<string, unknown>;
    expect(body.transitionId).toBe('approve');
    expect(body.resolutionType).toBe('Approved');
    expect(body.payload).toEqual({
      compared: [
        { id: 'm3', contentUpdatedAt: 1760000000000 },
        { id: 'm2', contentUpdatedAt: 1750000000000 },
      ],
    });
    expect(wrapper.emitted('resolved')).toHaveLength(1);
  });

  it('keep-approved resolves with reject/Rejected', { timeout: 15000 }, async () => {
    const calls = stubMemories();
    mountModal();
    await flushPromises();
    clickButton('memory-compare-keep-approved');
    await flushPromises();
    const resolve = calls.find((call) => call.url.includes('/v1/tasks/t1/resolve'));
    expect(resolve).not.toBeUndefined();
    const body = JSON.parse(resolve!.body) as Record<string, unknown>;
    expect(body.transitionId).toBe('reject');
    expect(body.resolutionType).toBe('Rejected');
  });

  it('reloads both sides when the server refuses the decision', { timeout: 15000 }, async () => {
    const calls = stubMemories(409);
    const wrapper = mountModal();
    await flushPromises();
    const readsBefore = calls.filter((call) => call.url.includes('/v1/contextCenter/memories/')).length;
    clickButton('memory-compare-keep-reviewed');
    await flushPromises();
    expect(wrapper.emitted('resolved')).toBeUndefined();
    const readsAfter = calls.filter((call) => call.url.includes('/v1/contextCenter/memories/')).length;
    expect(readsAfter).toBeGreaterThan(readsBefore);
  });
});
