/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message, Select } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import ReindexFailuresDrawer from './ReindexFailuresDrawer.vue';

const getReindexFailures = vi.hoisted(() => vi.fn());
vi.mock('@/api/search', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/search')>();
  return { ...original, getReindexFailures };
});

const getRdfReindexFailures = vi.hoisted(() => vi.fn());
vi.mock('@/api/sparql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/sparql')>();
  return { ...original, getRdfReindexFailures };
});

const MESSAGES = {
  en: {
    label: {
      'reindex-failure-plural': 'Reindex Failures',
      'filter-by-entity-type': 'Filter by Entity Type',
      all: 'All',
      'showing-total-failure-plural': 'Showing {total} failures',
      'entity-type': 'Entity Type',
      'entity-id': '{entity} Id',
      entity: 'Entity',
      stage: 'Stage',
      error: 'Error',
      timestamp: 'Timestamp',
      copy: 'Copy',
      'more-lowercase': 'more',
      'less-lowercase': 'less',
    },
  },
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const pageOne = {
  data: [
    {
      id: 'f1',
      jobId: 'j1',
      runId: 'r1',
      entityType: 'table',
      entityId: 'e1',
      failureStage: 'sink',
      errorMessage: 'sink exploded',
      timestamp: 1700000000000,
    },
    {
      id: 'f2',
      jobId: 'j1',
      runId: 'r1',
      entityType: 'dashboard',
      entityId: 'e2',
      failureStage: 'reader',
      errorMessage: 'read failed',
      timestamp: 1700000100000,
    },
  ],
  total: 40,
  offset: 0,
  limit: 20,
};

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(ReindexFailuresDrawer, {
    props: { visible: true, appName: 'SearchIndexingApplication', ...props },
    global: {
      plugins: [Antd, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
    },
    attachTo: document.body,
  });
}

describe('ReindexFailuresDrawer', () => {
  beforeEach(() => {
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    getReindexFailures.mockResolvedValue(pageOne);
    getRdfReindexFailures.mockResolvedValue(pageOne);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('fetches the first page from the search endpoint and renders the rows', async () => {
    const wrapper = mountDrawer();
    await flush();
    expect(getReindexFailures).toHaveBeenCalledWith({ offset: 0, limit: 20, entityType: undefined });
    expect(getRdfReindexFailures).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('sink exploded');
    expect(document.body.textContent).toContain('Showing 40 failures');
    wrapper.unmount();
  });

  it('fetches from the RDF endpoint for the RDF app', async () => {
    const wrapper = mountDrawer({ appName: 'RdfIndexApp' });
    await flush();
    expect(getRdfReindexFailures).toHaveBeenCalledWith({ offset: 0, limit: 20, entityType: undefined });
    expect(getReindexFailures).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('offers the entity types harvested from page one as filter options', async () => {
    const wrapper = mountDrawer();
    await flush();
    const options = wrapper.findComponent(Select).props('options') as { value: string; label: string }[];
    expect(options.map((option) => option.label)).toEqual(['All', 'table', 'dashboard']);
    expect(options.map((option) => option.value)).toEqual(['__all__', 'table', 'dashboard']);
    wrapper.unmount();
  });

  it('refetches at the new offset when the page changes', async () => {
    const wrapper = mountDrawer();
    await flush();
    getReindexFailures.mockResolvedValue({ ...pageOne, data: [], total: 40 });
    const pageTwo = document.body.querySelector('.ant-pagination-item-2') as HTMLElement;
    pageTwo.click();
    await flush();
    expect(getReindexFailures).toHaveBeenLastCalledWith({ offset: 20, limit: 20, entityType: undefined });
    wrapper.unmount();
  });

  it('resets state and refetches when reopened', async () => {
    const wrapper = mountDrawer({ visible: false });
    await flush();
    expect(getReindexFailures).not.toHaveBeenCalled();
    await wrapper.setProps({ visible: true });
    await flush();
    expect(getReindexFailures).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('toasts and keeps the drawer usable when the fetch fails', async () => {
    getReindexFailures.mockRejectedValue(new Error('boom'));
    const wrapper = mountDrawer();
    await flush();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(document.body.querySelector('[data-testid="reindex-failures-drawer"]')).toBeTruthy();
    wrapper.unmount();
  });
});
