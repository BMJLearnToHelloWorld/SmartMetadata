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
import WidgetWorkflowHistoryCell from './WidgetWorkflowHistoryCell.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubHistory() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/workflowInstances')) {
      return jsonResponse({
        data: [{ id: 'i1', status: 'SUCCESS', startedAt: 1699900000000, workflowDefinitionId: 'wd1' }],
        paging: { total: 1 },
      });
    }
    if (url.includes('/workflowDefinitions/wd1')) {
      return jsonResponse({
        id: 'wd1',
        name: 'approve-term',
        nodes: [{ type: 'task', subType: 'setGlossaryTermStatusTask', name: 'approve' }],
      });
    }
    if (url.includes('/workflowInstanceStates/approve-term/i1')) {
      return jsonResponse({
        data: [
          { id: 's1', status: 'Finished', timestamp: 1699900001000, stage: { name: 'review', displayName: 'Review' } },
          { id: 's2', status: 'Running', timestamp: 1699900002000, stage: { name: 'approve', displayName: 'Approve' } },
        ],
        paging: { total: 2 },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetWorkflowHistoryCell, {
    props: { glossaryTermFqn: 'Business.term', entityStatus: 'Draft', ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('WidgetWorkflowHistoryCell', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows the workflow name, progress and the reversed timeline', async () => {
    vi.stubGlobal('fetch', stubHistory());
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-header"]').text()).toContain('approve-term');
    expect(wrapper.find('[data-testid="workflow-history-header"]').text()).toContain('1/2');
    const items = wrapper.findAll('[data-testid="workflow-history-item"]');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('Approve');
    expect(items[1].text()).toContain('Review');
    wrapper.unmount();
  });

  it('starts collapsed for an Approved term in widget form and expands on click', async () => {
    vi.stubGlobal('fetch', stubHistory());
    const wrapper = mountCell({ entityStatus: 'Approved' });
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-timeline"]').exists()).toBe(false);
    await wrapper.find('[data-testid="workflow-history-header"]').trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-timeline"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('starts expanded in popover form even for an Approved term', async () => {
    vi.stubGlobal('fetch', stubHistory());
    const wrapper = mountCell({ entityStatus: 'Approved', isWidget: false });
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-timeline"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the empty state when no workflow ran', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/workflowInstances')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        throw new Error(`unexpected fetch ${input}`);
      }),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No Workflow History are available');
    wrapper.unmount();
  });

  it('shows the empty state when the load fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('down');
    }));
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="workflow-history-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
