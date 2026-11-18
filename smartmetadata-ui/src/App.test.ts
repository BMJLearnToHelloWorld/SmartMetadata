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
import { ConfigProvider, theme } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useShellConfigStore } from '@/stores/shellConfig';
import { useShellPreferencesStore } from '@/stores/shellPreferences';
import { SM_BORDER_RADIUS, SM_COLOR_PRIMARY } from '@/theme/tokens';
import App from './App.vue';

async function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router, createTestI18n()],
      stubs: { 'router-view': true },
    },
  });
  return { wrapper, pinia };
}

describe('App', () => {
  it('wires ConfigProvider to the shared OM + iPlatform soul theme tokens', async () => {
    const { wrapper } = await mountApp();
    const provider = wrapper.findComponent(ConfigProvider);
    expect(provider.exists()).toBe(true);
    const themeProp = provider.props('theme') as { token: { colorPrimary: string; borderRadius: number }; algorithm: unknown };
    expect(themeProp.token.colorPrimary).toBe(SM_COLOR_PRIMARY);
    expect(themeProp.token.borderRadius).toBe(SM_BORDER_RADIUS);
    expect(themeProp.algorithm).toBe(theme.defaultAlgorithm);
    expect(provider.props('form')?.validateMessages?.required).toBe('${label} is required');
  });

  it('switches the Ant algorithm to dark when the shell preference is dark', async () => {
    const { wrapper } = await mountApp();
    const shellPreferences = useShellPreferencesStore();
    shellPreferences.setThemeMode('dark');
    await wrapper.vm.$nextTick();
    const provider = wrapper.findComponent(ConfigProvider);
    const themeProp = provider.props('theme') as { algorithm: unknown };
    expect(themeProp.algorithm).toBe(theme.darkAlgorithm);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    shellPreferences.setThemeMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('writes the custom favicon URL to link[rel=icon] and data:, when empty', async () => {
    const { wrapper } = await mountApp();
    const linkHref = () =>
      document.querySelector<HTMLLinkElement>("link[rel='icon']")?.getAttribute('href');
    expect(linkHref()).toBe('data:,');
    useShellConfigStore().uiThemePreference = {
      customLogoConfig: { customFaviconUrlPath: 'https://example.com/f.ico' },
      customTheme: {},
    };
    await wrapper.vm.$nextTick();
    expect(linkHref()).toBe('https://example.com/f.ico');
    useShellConfigStore().uiThemePreference = { customLogoConfig: {}, customTheme: {} };
    await wrapper.vm.$nextTick();
    expect(linkHref()).toBe('data:,');
  });
});
