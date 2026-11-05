/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PreferencePageShell from './PreferencePageShell.vue';

describe('PreferencePageShell', () => {
  it('renders its title through the shared PageHeader', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/settings', name: 'admin-settings', component: { template: '<div />' } },
      ],
    });
    await router.push('/admin/settings');
    await router.isReady();
    const wrapper = mount(PreferencePageShell, {
      props: { title: 'Appearance', lead: 'Look and feel', testId: 'appearance-settings' },
      slots: { default: '<p data-testid="shell-body">body</p>' },
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="appearance-settings-heading"]').text()).toBe('Appearance');
    expect(wrapper.get('[data-testid="appearance-settings-sub"]').text()).toBe('Look and feel');
    expect(wrapper.find('[data-testid="settings-back"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shell-body"]').exists()).toBe(true);
  });
});
