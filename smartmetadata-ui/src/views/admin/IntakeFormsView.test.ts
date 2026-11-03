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
import IntakeFormsView from './IntakeFormsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FORM = {
  id: 'f1',
  name: 'dataProduct',
  displayName: 'Intake form for Data Product',
  entityType: 'dataProduct',
  enabled: true,
  formFields: [
    { fieldPath: 'displayName', fieldLabel: 'Display name', fieldKind: 'native', required: true },
    { fieldPath: 'tags', fieldLabel: 'Tags', fieldKind: 'native', required: false },
  ],
};

async function mountIntake(forms: unknown[] = [FORM]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/governance/intake-forms',
        name: 'admin-settings-governance-intake-forms',
        component: IntakeFormsView,
      },
    ],
  });
  await router.push('/admin/settings/governance/intake-forms');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/governance/intakeForms') && (!init?.method || init?.method === 'GET')) {
        return jsonResponse({ data: forms, paging: { total: forms.length } });
      }
      if (url.includes('/v1/governance/intakeForms/') && init?.method === 'PATCH') {
        return jsonResponse({ ...FORM, enabled: true });
      }
      if (url.includes('/v1/governance/intakeForms/') && init?.method === 'DELETE') {
        return jsonResponse({});
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(IntakeFormsView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, requests };
}

describe('IntakeFormsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists forms with entity type, fields and the enabled toggle', async () => {
    const { wrapper } = await mountIntake();
    expect(wrapper.find('[data-testid="intake-forms-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Product');
    expect(wrapper.text()).toContain('Display name');
    expect(wrapper.find('[data-testid="toggle-dataProduct"]').exists()).toBe(true);
  });

  it('shows the empty state when no form exists', async () => {
    const { wrapper } = await mountIntake([]);
    expect(wrapper.find('[data-testid="intake-forms-empty"]').exists()).toBe(true);
  });

  it('PATCHes only /enabled when the toggle flips', async () => {
    const { wrapper, requests } = await mountIntake();
    const toggle = wrapper.find('[data-testid="toggle-dataProduct"]');
    expect(toggle.exists()).toBe(true);
    await toggle.trigger('click');
    await flushPromises();
    const patch = requests.find((request) => request.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(String(patch?.init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([{ op: 'replace', path: '/enabled', value: false }]);
    expect(patch?.init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
  });

  it('opens the delete confirm and deletes on confirm', async () => {
    const { wrapper, requests } = await mountIntake();
    await wrapper.find('[data-testid="delete-dataProduct"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.ant-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('This action cannot be undone');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(requests.some((request) => request.init?.method === 'DELETE')).toBe(true);
  });
});
