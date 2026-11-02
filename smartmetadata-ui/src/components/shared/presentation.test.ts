/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { DRAWER_WIDTHS, MODAL_SIZES } from './presentation';
import SmDrawer from './SmDrawer.vue';

function testRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  return router;
}

describe('shared presentation tables (R1)', () => {
  it('keeps modal sizes at the observed official widths', () => {
    expect(MODAL_SIZES).toEqual({ confirm: 400, form: 520, export: 480, wide: 720, xl: 1080 });
  });

  it('keeps drawer widths at the official slideout widths', () => {
    expect(DRAWER_WIDTHS).toEqual({ feed: 'max(40vw, 480px)', form: 700 });
  });

  it('renders SmDrawer footer actions and emits ok on save', async () => {
    const router = testRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(SmDrawer, {
      props: { open: true, title: 'Create', testId: 'test-drawer' },
      slots: { default: '<div>body</div>' },
      global: { plugins: [router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.body.innerHTML).toContain('test-drawer-save');
    expect(document.body.innerHTML).toContain('test-drawer-cancel');
    const save = document.querySelector('[data-testid="test-drawer-save"]') as HTMLElement | null;
    expect(save).not.toBeNull();
    save?.click();
    expect(wrapper.emitted('ok')).toBeTruthy();
    wrapper.unmount();
  });
});
