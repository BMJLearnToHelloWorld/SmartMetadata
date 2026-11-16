/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import NavigationGuardModal from './NavigationGuardModal.vue';

async function mountModal(open: boolean): Promise<VueWrapper> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const wrapper = mount(NavigationGuardModal, {
    props: { open },
    attachTo: host,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('NavigationGuardModal (official NavigationGuardModal)', () => {
  it('shows the unsaved-changes copy with Discard and Continue Editing', async () => {
    const wrapper = await mountModal(true);
    try {
      expect(document.body.textContent).toContain('Unsaved changes');
      expect(document.body.textContent).toContain('Do you want to save or discard changes?');
      expect(
        document.body.querySelector('[data-testid="navigation-guard-discard"]')?.textContent,
      ).toContain('Discard');
      expect(document.body.textContent).toContain('Continue Editing');
      expect(wrapper.emitted('leave')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('emits leave on Discard and stay on Continue Editing', async () => {
    const wrapper = await mountModal(true);
    try {
      const discard = document.body.querySelector<HTMLElement>(
        '[data-testid="navigation-guard-discard"]',
      );
      discard?.click();
      await flushPromises();
      expect(wrapper.emitted('leave')).toHaveLength(1);
      const buttons = [...document.body.querySelectorAll('button')];
      buttons.find((button) => button.textContent?.includes('Continue Editing'))?.click();
      await flushPromises();
      expect(wrapper.emitted('stay')).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  it('renders nothing actionable while closed', async () => {
    const wrapper = await mountModal(false);
    try {
      expect(
        document.body.querySelector('[data-testid="navigation-guard-discard"]'),
      ).toBeNull();
    } finally {
      wrapper.unmount();
    }
  });
});
