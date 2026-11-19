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
import Antd, { message } from 'ant-design-vue';
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
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
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
    document.body.innerHTML = '';
  });

  it('renders the header and Add action in one row', async () => {
    const { wrapper } = await mountIntake();
    const header = wrapper.find('.intake-forms-header');
    expect(header.exists()).toBe(true);
    expect(header.find('[data-testid="page-header"]').exists()).toBe(true);
    expect(header.find('[data-testid="add-intake-form"]').exists()).toBe(true);
  });

  it('opens the delete confirm at 480 wide and closes it before the delete runs', async () => {
    let resolveDelete!: (response: Response) => void;
    const deleteGate = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes('/v1/governance/intakeForms') && init?.method === 'DELETE') {
          return deleteGate;
        }
        if (url.includes('/v1/governance/intakeForms') && (!init?.method || init?.method === 'GET')) {
          return jsonResponse({ data: [FORM], paging: { total: 1 } });
        }
        return jsonResponse({});
      }),
    );
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
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        {
          path: '/settings/:category',
          name: 'settings-category',
          component: { template: '<div />' },
        },
      ],
    });
    await router.push('/admin/settings/governance/intake-forms');
    await router.isReady();
    const wrapper = mount(IntakeFormsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="delete-dataProduct"]').trigger('click');
    await flushPromises();
    const modal = wrapper.find('.ant-modal');
    expect(modal.exists()).toBe(true);
    expect((modal.element as HTMLElement).style.width).toBe('480px');
    expect(modal.text()).toContain(createTestI18n().global.t('intakeForms.deleteConfirm'));
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    // The dialog is already closed while the delete is still pending,
    // and the delete button never shows a loading state.
    expect(wrapper.find('.ant-modal').exists()).toBe(false);
    expect(requests.some((request) => request.init?.method === 'DELETE')).toBe(true);
    resolveDelete(jsonResponse({}));
    await flushPromises();
    expect(requests.filter((request) => !request.init?.method || request.init?.method === 'GET')).toHaveLength(2);
  });

  it('toasts a load failure with the server message and no inline error', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'intake down' }, 500)),
    );
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
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        {
          path: '/settings/:category',
          name: 'settings-category',
          component: { template: '<div />' },
        },
      ],
    });
    await router.push('/admin/settings/governance/intake-forms');
    await router.isReady();
    const wrapper = mount(IntakeFormsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('intake down');
    expect(wrapper.find('[data-testid="intake-forms-error"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Failed to load');
    expect(wrapper.find('[data-testid="intake-forms-empty"]').exists()).toBe(true);
  });

  it('toasts toggle and delete failures without reopening the dialog', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/governance/intakeForms') && init?.method === 'PATCH') {
          return jsonResponse({ message: 'toggle down' }, 500);
        }
        if (url.includes('/v1/governance/intakeForms') && init?.method === 'DELETE') {
          return jsonResponse({ message: 'delete down' }, 500);
        }
        if (url.includes('/v1/governance/intakeForms') && (!init?.method || init?.method === 'GET')) {
          return jsonResponse({ data: [FORM], paging: { total: 1 } });
        }
        return jsonResponse({});
      }),
    );
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
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        {
          path: '/settings/:category',
          name: 'settings-category',
          component: { template: '<div />' },
        },
      ],
    });
    await router.push('/admin/settings/governance/intake-forms');
    await router.isReady();
    const wrapper = mount(IntakeFormsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="toggle-dataProduct"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('toggle down');
    await wrapper.find('[data-testid="delete-dataProduct"]').trigger('click');
    await flushPromises();
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('delete down');
    expect(wrapper.find('.ant-modal').exists()).toBe(false);
    expect(wrapper.text()).toContain('Data Product');
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

  it('toasts a submit failure and keeps the designer open', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/governance/intakeForms') && init?.method === 'PUT') {
          return jsonResponse({ message: 'submit down' }, 500);
        }
        if (url.includes('/v1/governance/intakeForms') && (!init?.method || init?.method === 'GET')) {
          return jsonResponse({ data: [FORM], paging: { total: 1 } });
        }
        return jsonResponse({ data: [] });
      }),
    );
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
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        {
          path: '/settings/:category',
          name: 'settings-category',
          component: { template: '<div />' },
        },
      ],
    });
    await router.push('/admin/settings/governance/intake-forms');
    await router.isReady();
    const wrapper = mount(IntakeFormsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="edit-dataProduct"]').trigger('click');
    await flushPromises();
    const save = document.querySelector(
      '.ant-drawer-open [data-testid="intake-form-designer-modal-save"]',
    ) as HTMLElement | null;
    expect(save).not.toBeNull();
    save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('submit down');
    expect(document.querySelector('.ant-drawer-open')).not.toBeNull();
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
});
