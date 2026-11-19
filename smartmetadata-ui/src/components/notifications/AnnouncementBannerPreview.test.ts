/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AnnouncementFormValues } from '@/types/notifications';
import AnnouncementBannerPreview from './AnnouncementBannerPreview.vue';

const NOW = Date.now();

function values(overrides: Partial<AnnouncementFormValues> = {}): AnnouncementFormValues {
  return {
    title: 'Downtime window',
    description: 'The **cluster** restarts.',
    startTime: NOW - 10000,
    endTime: NOW + 10000,
    type: 'Notice',
    ...overrides,
  };
}

describe('AnnouncementBannerPreview', () => {
  it('renders the collapsed banner with the title and a flattened description', () => {
    const i18n = createTestI18n();
    const wrapper = mount(AnnouncementBannerPreview, {
      props: { values: values(), createdBy: 'admin' },
      global: { plugins: [Antd, i18n] },
    });
    expect(wrapper.find('[data-testid="announcement-preview"]').exists()).toBe(true);
    const banner = wrapper.find('[data-testid="announcement-preview-banner"]');
    expect(banner.attributes('aria-label')).toBe(
      `${i18n.global.t('label.announcement')}: Downtime window`,
    );
    expect(wrapper.find('[data-testid="announcement-title-btn"]').text()).toBe('Downtime window');
    expect(wrapper.find('[data-testid="announcement-description"]').text()).toBe(
      'The cluster restarts.',
    );
  });

  it('shows the status pill and the window line only once both dates are set', () => {
    const i18n = createTestI18n();
    const withWindow = mount(AnnouncementBannerPreview, {
      props: { values: values() },
      global: { plugins: [Antd, i18n] },
    });
    expect(withWindow.find('[data-testid="announcement-preview-status"]').exists()).toBe(true);
    expect(withWindow.find('[data-testid="announcement-preview-status"]').text()).toBe(
      i18n.global.t('label.active'),
    );
    expect(withWindow.find('[data-testid="announcement-preview-window"]').exists()).toBe(true);

    const withoutWindow = mount(AnnouncementBannerPreview, {
      props: { values: values({ startTime: null, endTime: null }) },
      global: { plugins: [Antd, i18n] },
    });
    expect(withoutWindow.find('[data-testid="announcement-preview-status"]').exists()).toBe(false);
    expect(withoutWindow.find('[data-testid="announcement-preview-window"]').exists()).toBe(false);
  });

  it('falls back to the placeholder title and description when the fields are empty', () => {
    const i18n = createTestI18n();
    const wrapper = mount(AnnouncementBannerPreview, {
      props: { values: values({ title: '   ', description: '' }) },
      global: { plugins: [Antd, i18n] },
    });
    expect(wrapper.find('[data-testid="announcement-title-btn"]').text()).toBe(
      i18n.global.t('label.announcement-title'),
    );
    expect(wrapper.find('[data-testid="announcement-description"]').text()).toBe(
      i18n.global.t('message.enter-a-description'),
    );
  });

  it('badges a custom type with its own name', () => {
    const i18n = createTestI18n();
    const wrapper = mount(AnnouncementBannerPreview, {
      props: {
        values: values({ type: 'Custom', color: 'orange', customTypeName: 'Outage' }),
      },
      global: { plugins: [Antd, i18n] },
    });
    expect(wrapper.find('[data-testid="announcement-type-badge"]').text()).toBe('Outage');
  });
});
