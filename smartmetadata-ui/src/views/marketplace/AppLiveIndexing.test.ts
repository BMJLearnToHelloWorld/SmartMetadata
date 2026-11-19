/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import AppLiveIndexing from './AppLiveIndexing.vue';

const getLiveIndexingQueue = vi.hoisted(() => vi.fn());
vi.mock('@/api/apps', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/apps')>();
  return { ...original, getLiveIndexingQueue };
});

const MESSAGES = {
  en: {
    label: {
      'entity-type': 'Entity Type',
      'entity-fqn': 'Entity FQN',
      status: 'Status',
      'retry-count': 'Retry Count',
      'failure-reason': 'Failure Reason',
    },
    message: { 'no-retry-queue-records': 'No retry queue records.' },
  },
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const records = [
  {
    entityId: 'e1',
    entityFqn: 'db.schema.table1',
    entityType: 'table',
    status: 'PENDING',
    retryCount: 1,
    failureReason: 'timeout',
    claimedAt: null,
  },
  {
    entityId: 'e2',
    entityFqn: 'db.schema.table2',
    entityType: 'table',
    status: 'FAILED',
    retryCount: 3,
    failureReason: 'mapping error',
    claimedAt: null,
  },
];

function mountIndexing() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin' } as LoginUser;
  return mount(AppLiveIndexing, {
    props: {
      appData: {
        id: 'app-1',
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        appType: 'internal',
      },
    },
    global: {
      plugins: [Antd, pinia, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
    },
    attachTo: document.body,
  });
}

describe('AppLiveIndexing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    getLiveIndexingQueue.mockResolvedValue({ data: records, total: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('fetches the queue with limit/offset and renders rows with raw status labels', async () => {
    const wrapper = mountIndexing();
    await flush();
    expect(getLiveIndexingQueue).toHaveBeenCalledWith('SearchIndexingApplication', {
      limit: 15,
      offset: 0,
    });
    const badges = wrapper.findAll('[data-testid="retry-status"]');
    expect(badges).toHaveLength(2);
    expect(badges[0].text()).toContain('PENDING');
    expect(badges[1].text()).toContain('FAILED');
    expect(wrapper.text()).toContain('db.schema.table1');
    expect(wrapper.text()).toContain('timeout');
    wrapper.unmount();
  });

  it('shows the empty placeholder when the queue is empty', async () => {
    getLiveIndexingQueue.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountIndexing();
    await flush();
    expect(wrapper.text()).toContain('No retry queue records.');
    wrapper.unmount();
  });

  it('toasts and empties the records when the fetch fails', async () => {
    getLiveIndexingQueue.mockRejectedValue(new Error('boom'));
    const wrapper = mountIndexing();
    await flush();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(wrapper.text()).toContain('No retry queue records.');
    wrapper.unmount();
  });

  it('refetches at the new offset when the page changes', async () => {
    getLiveIndexingQueue.mockResolvedValue({ data: records, total: 40 });
    const wrapper = mountIndexing();
    await flush();
    const pageTwo = document.body.querySelector('.ant-pagination-item-2') as HTMLElement;
    pageTwo.click();
    await flush();
    expect(getLiveIndexingQueue).toHaveBeenLastCalledWith('SearchIndexingApplication', {
      limit: 15,
      offset: 15,
    });
    wrapper.unmount();
  });
});
