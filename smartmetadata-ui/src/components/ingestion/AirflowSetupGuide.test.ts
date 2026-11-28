/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AirflowSetupGuide from '@/components/ingestion/AirflowSetupGuide.vue';
import { createTestI18n } from '@/test/i18n';

describe('AirflowSetupGuide', () => {
  it('shows loader while orchestrator status is fetching', () => {
    const wrapper = mount(AirflowSetupGuide, {
      props: {
        status: null,
        checked: false,
        isFetchingStatus: true,
      },
      global: { plugins: [createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="airflow-setup-guide-loader"]').exists()).toBe(true);
  });

  it('shows Airflow install guidance when platform is Airflow', () => {
    const wrapper = mount(AirflowSetupGuide, {
      props: {
        status: { platform: 'Airflow', code: 500 },
        checked: true,
        isFetchingStatus: false,
      },
      global: { plugins: [createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="error-steps"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Failed to find');
    expect(wrapper.find(`a[href*="deployment/ingestion/external/airflow"]`).exists()).toBe(true);
  });

  it('shows scheduler support message for non-Airflow platform', () => {
    const wrapper = mount(AirflowSetupGuide, {
      props: {
        status: { platform: 'Argo', code: 500 },
        checked: true,
        isFetchingStatus: false,
      },
      global: { plugins: [createTestI18n()] },
    });
    expect(wrapper.text()).toContain('Ingestion Scheduler');
  });
});