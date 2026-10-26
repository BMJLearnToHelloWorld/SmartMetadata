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
import { ConfigProvider } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { SM_BORDER_RADIUS, SM_COLOR_PRIMARY, smAntdTheme } from '@/theme/tokens';
import App from './App.vue';

describe('App', () => {
  it('wires ConfigProvider to the shared OM console theme tokens', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, {
      global: {
        plugins: [router, createTestI18n()],
        stubs: { 'router-view': true },
      },
    });
    const provider = wrapper.findComponent(ConfigProvider);
    expect(provider.exists()).toBe(true);
    expect(provider.props('theme')).toBe(smAntdTheme);
    expect(provider.props('theme').token.colorPrimary).toBe(SM_COLOR_PRIMARY);
    expect(provider.props('theme').token.borderRadius).toBe(SM_BORDER_RADIUS);
  });
});
