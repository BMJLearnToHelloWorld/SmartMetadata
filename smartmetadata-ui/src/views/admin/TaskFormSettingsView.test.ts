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
import TaskFormSettingsView from './TaskFormSettingsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SCHEMA = {
  id: 's1',
  name: 'RequestApproval',
  displayName: 'Request Approval',
  description: 'Approve requests',
  taskType: 'RequestApproval',
  taskCategory: 'Approval',
  formSchema: {
    type: 'object',
    properties: { comment: { type: 'string', title: 'Comment' } },
  },
  uiSchema: { comment: { 'ui:widget': 'textarea' } },
  workflowDefinitionRef: 'RequestApprovalTaskWorkflow',
};

async function mountTaskForms() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/governance/task-forms',
        name: 'admin-settings-governance-task-forms',
        component: TaskFormSettingsView,
      },
    ],
  });
  await router.push('/admin/settings/governance/task-forms');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/taskFormSchemas') && (!init?.method || init?.method === 'GET')) {
        return jsonResponse({ data: [SCHEMA], paging: { total: 1 } });
      }
      if (url.includes('/v1/governance/workflowDefinitions/name/')) {
        return jsonResponse({ id: 'w1', name: 'RequestApprovalTaskWorkflow', version: 1 });
      }
      if (url.includes('/v1/taskFormSchemas') && init?.method === 'POST') {
        return jsonResponse({ ...SCHEMA, id: 's2', name: 'CustomTask' });
      }
      if (url.includes('/v1/taskFormSchemas') && init?.method === 'PUT') {
        return jsonResponse(SCHEMA);
      }
      if (url.includes('/v1/governance/workflowDefinitions') && init?.method === 'PUT') {
        return jsonResponse({ id: 'w1', name: 'RequestApprovalTaskWorkflow', version: 2 });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(TaskFormSettingsView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, requests };
}

describe('TaskFormSettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // 10s cap, not the 5s default: this mount renders two Ant tab bars plus
  // the builder sections after two sequential fetches, so under parallel
  // workers it exceeds 5s (single-run: ~3.1s; 9-file parallel run: timeout).
  // Assertions are unchanged; the cap still fails a genuinely hung fetch.
  it('lists schemas and selects the first one with its designer fields', async () => {
    const { wrapper } = await mountTaskForms();
    expect(wrapper.find('[data-testid="task-form-list-item-RequestApproval"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Request Approval');
    expect(wrapper.find('[data-testid="task-form-name-input"]').element).toBeTruthy();
  }, 10000);

  it('creates a new schema from the general fields', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.name).toBe('CustomTask');
    expect(body.taskType).toBe('CustomTask');
    expect(body.formSchema).toBeDefined();
  });

  it('refuses to save when a JSON document is invalid', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('Broken');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[1].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-testid="task-form-resolve-schema-editor"]');
    expect(editor.exists()).toBe(true);
    await editor.setValue('{not json');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(false);
    expect(requests.some((request) => request.init?.method === 'PUT')).toBe(false);
  });

  it('loads a built-in template for a mapped type and category', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('RequestApproval');
    const categorySelect = wrapper.find('[data-testid="task-form-category-input"]');
    const selector = categorySelect.element.querySelector('.ant-select-selector') as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const target = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
      (option) => option.textContent?.includes('Approval'),
    ) as HTMLElement | undefined;
    expect(target).toBeDefined();
    target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await wrapper.find('[data-testid="task-form-load-template-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('RequestApproval');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as {
      formSchema: { properties: Record<string, unknown> };
    };
    expect(body.formSchema.properties).toHaveProperty('comment');
  });
});
