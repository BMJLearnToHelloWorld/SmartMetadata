/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import CustomPropertiesEditModal from './CustomPropertiesEditModal.vue';

describe('CustomPropertiesEditModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prefills values and saves typed numbers, dropping blanks', async () => {
    const wrapper = mount(CustomPropertiesEditModal, {
      props: {
        open: true,
        defs: [
          { name: 'sensitivity', displayName: 'Sensitivity', propertyType: 'string' },
          { name: 'retentionDays', displayName: 'Retention days', propertyType: 'integer' },
          { name: 'obsolete', displayName: 'Obsolete', propertyType: 'string' },
        ],
        values: { sensitivity: 'high', retentionDays: 30 },
        saving: false,
      },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const sensitivity = document.querySelector(
      '[data-testid="custom-prop-sensitivity"]',
    ) as HTMLInputElement | null;
    const retention = document.querySelector(
      '[data-testid="custom-prop-retentionDays"]',
    ) as HTMLInputElement | null;
    expect(sensitivity?.value).toBe('high');
    expect(retention?.value).toBe('30');
    if (retention) {
      retention.value = '90';
      retention.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const okButton = document.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const saved = wrapper.emitted('save')?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(saved).toBeDefined();
    expect(saved?.sensitivity).toBe('high');
    expect(saved?.retentionDays).toBe(90);
    expect('obsolete' in (saved ?? {})).toBe(false);
    wrapper.unmount();
  });
});
