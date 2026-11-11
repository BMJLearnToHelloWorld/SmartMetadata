/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LimitBanner from './LimitBanner.vue';
import { useLimitBannerStore } from '@/stores/limitBanner';

describe('LimitBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--sm-banner-height');
  });

  function mountBanner() {
    return mount(LimitBanner, { global: { plugins: [Antd, createTestI18n()] } });
  }

  it('renders nothing when no banner is set', () => {
    const wrapper = mountBanner();
    expect(wrapper.find('[data-testid="limit-banner"]').exists()).toBe(false);
  });

  it('renders the header and subheader with the warning style at the soft limit', () => {
    const banner = useLimitBannerStore();
    banner.setBannerDetails({
      header: 'Data Assets limit reached',
      subheader: '8/10 (FREE, 80%)',
      type: 'warning',
      softLimitExceed: true,
      hardLimitExceed: false,
    });
    const wrapper = mountBanner();
    const el = wrapper.get('[data-testid="limit-banner"]');
    expect(el.text()).toContain('Data Assets limit reached');
    expect(el.text()).toContain('8/10 (FREE, 80%)');
    expect(el.classes()).toContain('ant-alert-warning');
  });

  it('renders the danger style at the hard limit', () => {
    const banner = useLimitBannerStore();
    banner.setBannerDetails({
      header: 'Data Assets limit reached',
      subheader: '10/10 (FREE, 100%)',
      type: 'danger',
      softLimitExceed: true,
      hardLimitExceed: true,
    });
    const wrapper = mountBanner();
    expect(wrapper.get('[data-testid="limit-banner"]').classes()).toContain('ant-alert-error');
  });

  it('dismissing the banner clears the store details', async () => {
    const banner = useLimitBannerStore();
    banner.setBannerDetails({
      header: 'Data Assets limit reached',
      subheader: '8/10 (FREE, 80%)',
      type: 'warning',
      softLimitExceed: true,
      hardLimitExceed: false,
    });
    const wrapper = mountBanner();
    await wrapper.get('[data-testid="limit-banner"] .ant-alert-close-icon').trigger('click');
    expect(banner.bannerDetails).toBeNull();
    expect(wrapper.find('[data-testid="limit-banner"]').exists()).toBe(false);
  });

  it('publishes its height as --sm-banner-height, 0 when hidden, removed on unmount', async () => {
    const banner = useLimitBannerStore();
    const details = {
      header: 'Data Assets limit reached',
      subheader: '8/10 (FREE, 80%)',
      type: 'warning' as const,
      softLimitExceed: true,
      hardLimitExceed: false,
    };
    banner.setBannerDetails(details);
    const wrapper = mountBanner();
    await flushPromises();
    // jsdom lays out at 0px; stand in a real banner height at the
    // prototype so the measurement reads it whatever element it hits.
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 72,
      width: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // Re-trigger the watcher after the mock is in place, so the
    // measurement definitely runs against it.
    banner.clearBannerDetails();
    await flushPromises();
    expect(document.documentElement.style.getPropertyValue('--sm-banner-height')).toBe('0px');
    banner.setBannerDetails(details);
    await flushPromises();
    expect(document.documentElement.style.getPropertyValue('--sm-banner-height')).toBe('72px');
    banner.clearBannerDetails();
    await flushPromises();
    expect(document.documentElement.style.getPropertyValue('--sm-banner-height')).toBe('0px');
    wrapper.unmount();
    expect(document.documentElement.style.getPropertyValue('--sm-banner-height')).toBe('');
    rectSpy.mockRestore();
  });
});
