/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import HomeLandingPageHeader from './HomeLandingPageHeader.vue';

describe('HomeLandingPageHeader', () => {
  it('greets the user by start-cased display name with the landing subtitle', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-1', name: 'jane doe', displayName: 'jane doe' };
    const wrapper = mount(HomeLandingPageHeader, {
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="home-landing-page-header"]').text()).toContain('Hi Jane Doe');
    expect(wrapper.text()).toContain("Here's what needs your attention across your data.");
  });
});
