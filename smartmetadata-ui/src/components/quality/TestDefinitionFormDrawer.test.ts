/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TestDefinitionFormDrawer from './TestDefinitionFormDrawer.vue';

describe('TestDefinitionFormDrawer', () => {
  it('shows ShowHintToggle and hides the help panel when hint is off (official TestDefinitionForm)', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    });
    const wrapper = mount(TestDefinitionFormDrawer, {
      props: { open: true },
      global: { plugins: [Antd, createTestI18n(), router] },
      attachTo: document.body,
    });
    await flushPromises();
    const toggle = document.body.querySelector('[data-testid="show-hint-toggle"]');
    expect(toggle).not.toBeNull();
    expect(document.body.querySelector('[data-testid="test-definition-help-panel"]')).not.toBeNull();
    const drawer = document.body.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(drawer?.style.width || '').toContain('80vw');
    (toggle as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="test-definition-help-panel"]')).toBeNull();
    const narrowed = document.body.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(narrowed?.style.width || '').toContain('60vw');
    wrapper.unmount();
  });
});