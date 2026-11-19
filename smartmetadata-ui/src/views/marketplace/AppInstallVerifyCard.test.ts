/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import AppInstallVerifyCard from './AppInstallVerifyCard.vue';

const MESSAGES = {
  en: {
    label: {
      'authorize-app': 'Authorize {app}',
      'application-by-developer': '{app} by {dev}',
      application: 'Application',
      'wants-to-access-your-account': 'wants to access your {username} account',
      'all-entity': 'All {entity}',
      metadata: 'Metadata',
      cancel: 'Cancel',
      'developed-by-developer': 'Developed by {developer}',
      updated: 'Updated',
    },
  },
};

function mountCard(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin', displayName: 'Admin User' } as LoginUser;
  return mount(AppInstallVerifyCard, {
    props: {
      appData: {
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        displayName: 'Search Indexing',
        developer: 'Collate',
        developerUrl: 'https://example.com/dev',
        updatedAt: Date.now() - 3600_000,
      },
      nextButtonLabel: 'Configure',
      onSave: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    },
    global: {
      plugins: [Antd, pinia, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        UserPopOverCard: {
          props: { userName: String, profileWidth: Number },
          template:
            '<span class="user-popover-stub" :data-user-name="userName" :data-profile-width="profileWidth" />',
        },
      },
    },
  });
}

describe('AppInstallVerifyCard', () => {
  it('renders the authorize heading, the user row, and the developer link', () => {
    const wrapper = mountCard();
    expect(wrapper.find('h5').text()).toBe('Authorize Search Indexing');
    const popover = wrapper.find('.user-popover-stub');
    expect(popover.attributes('data-user-name')).toBe('admin');
    expect(popover.attributes('data-profile-width')).toBe('32');
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://example.com/dev');
    expect(link.attributes('aria-label')).toBe('Application');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.text()).toBe('Collate');
    expect(wrapper.text()).toContain('Search Indexing by');
    expect(wrapper.text()).toContain('wants to access your Admin User account');
    wrapper.unmount();
  });

  it('renders the empty accordion panel and the footer card', () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain('All Metadata');
    expect(wrapper.text()).toContain('Developed by Collate');
    expect(wrapper.text()).toContain('Updated');
    expect(wrapper.find('[data-testid="image"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('calls onCancel and onSave from the full-width buttons', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const wrapper = mountCard({ onSave, onCancel });
    await wrapper.find('[data-testid="cancel"]').trigger('click');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="save-button"]').text()).toBe('Configure');
    wrapper.unmount();
  });
});
