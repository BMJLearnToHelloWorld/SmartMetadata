/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import IngestionStatusCount from './IngestionStatusCount.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      settings: {
        services: {
          pipeline: { countSuccess: 'Success', countFailed: 'Failed', countWarning: 'Warning' },
        },
      },
    },
  },
});

describe('IngestionStatusCount', () => {
  it('renders three tiles with the official formula and compact counts', () => {
    const wrapper = mount(IngestionStatusCount, {
      props: {
        summary: { records: 1200, updated_records: 300, errors: 4, warnings: 12 },
        runId: 'run-1',
      },
      global: { plugins: [i18n] },
    });
    const success = wrapper.find('[data-testid="success-count"]');
    const failed = wrapper.find('[data-testid="failed-count"]');
    const warning = wrapper.find('[data-testid="warning-count"]');
    expect(success.text()).toContain('1.5K');
    expect(success.text()).toContain('Success');
    expect(failed.text()).toContain('4');
    expect(failed.text()).toContain('Failed');
    expect(warning.text()).toContain('12');
    expect(warning.text()).toContain('Warning');
  });

  it('renders zero tiles when the summary is absent', () => {
    const wrapper = mount(IngestionStatusCount, {
      props: { summary: undefined },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('[data-testid="success-count"]').text()).toContain('0');
    expect(wrapper.find('[data-testid="failed-count"]').text()).toContain('0');
    expect(wrapper.find('[data-testid="warning-count"]').text()).toContain('0');
  });

  it('counts updated-only records as success', () => {
    const wrapper = mount(IngestionStatusCount, {
      props: { summary: { updated_records: 42 } },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('[data-testid="success-count"]').text()).toContain('42');
  });
});
