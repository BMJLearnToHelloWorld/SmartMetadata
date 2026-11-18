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
import type { IntakeForm } from '@/api/intakeForms';
import IntakeFormDesignerModal from './IntakeFormDesignerModal.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountModal(initialValue: IntakeForm | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
  });
  await router.push('/');
  await router.isReady();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ data: [] })),
  );
  const wrapper = mount(IntakeFormDesignerModal, {
    props: {
      open: true,
      entityType: 'dataProduct',
      initialValue,
    },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('IntakeFormDesignerModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  // 10s cap, not the 5s default: mounting the drawer plus the designer's
  // custom-property fetch measures ~3.5s single-run and tips over 5s under
  // parallel workers (observed failure in a grouped run, green in
  // isolation). Assertions are unchanged.
  it('renders the designer at 75% width with the add title and submits', async () => {
    const wrapper = await mountModal(null);
    const drawerWrapper = document.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(drawerWrapper?.style.width).toBe('75%');
    const i18n = createTestI18n();
    const expectedTitle = i18n.global.t('intakeForms.addTitle', {
      entity: i18n.global.t('intakeForms.entityForm', {
        entity: i18n.global.t('intakeForms.entityTypes.dataProduct'),
      }),
    });
    expect(document.querySelector('.ant-drawer-open .ant-drawer-title')?.textContent).toContain(
      expectedTitle,
    );
    const save = document.querySelector(
      '.ant-drawer-open [data-testid="intake-form-designer-modal-save"]',
    ) as HTMLElement | null;
    expect(save).not.toBeNull();
    save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const payload = wrapper.emitted('submit')?.[0]?.[0] as unknown as {
      entityType: string;
      formFields: unknown[];
    };
    expect(payload.entityType).toBe('dataProduct');
    expect(payload.formFields).toEqual([]);
  }, 10000);

  it('renders the edit title for an existing form and emits cancel', async () => {
    const wrapper = await mountModal({
      id: 'f1',
      name: 'dataProduct',
      entityType: 'dataProduct',
      enabled: true,
    } as IntakeForm);
    const i18n = createTestI18n();
    const expectedTitle = i18n.global.t('intakeForms.editTitle', {
      entity: i18n.global.t('intakeForms.entityForm', {
        entity: i18n.global.t('intakeForms.entityTypes.dataProduct'),
      }),
    });
    expect(document.querySelector('.ant-drawer-open .ant-drawer-title')?.textContent).toContain(
      expectedTitle,
    );
    const cancel = document.querySelector(
      '.ant-drawer-open [data-testid="intake-form-designer-modal-cancel"]',
    ) as HTMLElement | null;
    expect(cancel).not.toBeNull();
    cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
