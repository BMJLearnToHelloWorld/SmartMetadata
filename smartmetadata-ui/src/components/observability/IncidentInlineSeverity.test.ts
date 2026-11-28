/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import IncidentInlineSeverity from './IncidentInlineSeverity.vue';

describe('IncidentInlineSeverity', () => {
  it('emits severity change from the chip menu when editable', async () => {
    const wrapper = mount(IncidentInlineSeverity, {
      props: { severity: 'Severity2', editable: true },
      global: { plugins: [Antd, createTestI18n('en-US')] },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="incident-severity-chip"]').trigger('click');
    await flushPromises();
    const menuItem = document.body.querySelector('[data-testid="incident-severity-option-Severity3"]');
    expect(menuItem).toBeTruthy();
    (menuItem as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('change')?.[0]).toEqual(['Severity3']);
    wrapper.unmount();
  });

  it('renders read-only chip without chevron when not editable', () => {
    const wrapper = mount(IncidentInlineSeverity, {
      props: { severity: undefined, editable: false },
      global: { plugins: [Antd, createTestI18n('en-US')] },
    });
    expect(wrapper.find('.incident-chip--editable').exists()).toBe(false);
  });
});