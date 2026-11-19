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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { ServiceKind } from '@/types/ingestion';
import {
  getDuplicateServiceNameError,
  getServiceCategoryLabel,
  getSuggestedServiceName,
  SERVICE_NAME_VALIDATION_DEBOUNCE_MS,
  useServiceNameValidation,
} from './serviceNameValidation';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: {
          services: {
            categoryLabel: {
              api: 'API Service',
              dashboard: 'Dashboard Service',
              database: 'Database Service',
              drive: 'Drive',
              messaging: 'Messaging Service',
              metadata: 'Metadata Service',
              mlmodel: 'Ml Model Service',
              pipeline: 'Pipeline Service',
              search: 'Search Service',
              security: 'Security Service',
              storage: 'Storage Service',
            },
            serviceLowercase: 'service',
            nameAlreadyExistsWithSuggestion:
              'A {serviceCategory} named {serviceName} already exists. Names must be unique within this category. Try {suggestedServiceName}.',
          },
        },
      },
    },
  });
}

describe('getSuggestedServiceName', () => {
  it('appends _2 to a plain name and increments a numeric suffix', () => {
    expect(getSuggestedServiceName('mysql')).toBe('mysql_2');
    expect(getSuggestedServiceName('mysql_3')).toBe('mysql_4');
    expect(getSuggestedServiceName('mysql_10')).toBe('mysql_11');
  });
});

describe('getServiceCategoryLabel', () => {
  it('lowercases the mapped label for every category', () => {
    const translate = (key: string) => {
      const labels: Record<string, string> = {
        'settings.services.categoryLabel.api': 'API Service',
        'settings.services.categoryLabel.drive': 'Drive',
        'settings.services.categoryLabel.mlmodel': 'Ml Model Service',
      };
      return labels[key] ?? key;
    };
    expect(getServiceCategoryLabel('api', translate)).toBe('api service');
    expect(getServiceCategoryLabel('drive', translate)).toBe('drive');
    expect(getServiceCategoryLabel('mlmodel', translate)).toBe('ml model service');
  });

  it('falls back to the service label as-is for unmapped kinds', () => {
    const translate = (key: string) =>
      key === 'settings.services.serviceLowercase' ? 'service' : key;
    expect(getServiceCategoryLabel('llm', translate)).toBe('service');
  });
});

describe('getDuplicateServiceNameError', () => {
  it('interpolates category, name, and suggestion', () => {
    const i18n = createTestI18n();
    const message = getDuplicateServiceNameError('mysql', 'database', (key, params) =>
      i18n.global.t(key, params ?? {}),
    );
    expect(message).toBe(
      'A database service named mysql already exists. Names must be unique within this category. Try mysql_2.',
    );
  });
});

describe('useServiceNameValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountValidation(lookup: (kind: ServiceKind, name: string) => Promise<unknown>) {
    const enabled = ref(true);
    const serviceCategory = ref<ServiceKind>('database');
    const serviceName = ref('');
    const harness = defineComponent({
      setup() {
        const validation = useServiceNameValidation({
          enabled,
          serviceCategory,
          serviceName,
          lookup,
        });
        return validation;
      },
      template: '<div />',
    });
    const wrapper = mount(harness, { global: { plugins: [createTestI18n()] } });
    return { wrapper, enabled, serviceCategory, serviceName };
  }

  it('debounces the lookup and reports a duplicate with a suggestion', async () => {
    const lookup = vi.fn(async () => ({ id: 's1' }));
    const { wrapper, serviceName } = mountValidation(lookup);
    serviceName.value = 'mysql';
    await wrapper.vm.$nextTick();
    expect(lookup).not.toHaveBeenCalled();
    expect(wrapper.vm.isServiceNameChecking).toBe(true);
    await vi.advanceTimersByTimeAsync(SERVICE_NAME_VALIDATION_DEBOUNCE_MS);
    await wrapper.vm.$nextTick();
    expect(lookup).toHaveBeenCalledWith('database', 'mysql');
    expect(wrapper.vm.isServiceNameChecking).toBe(false);
    expect(wrapper.vm.nameError).toContain('Try mysql_2.');
    expect(wrapper.vm.nameError).toContain('database service');
  });

  it('passes when the lookup fails', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('404');
    });
    const { wrapper, serviceName } = mountValidation(lookup);
    serviceName.value = 'fresh';
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(SERVICE_NAME_VALIDATION_DEBOUNCE_MS);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.nameError).toBe('');
    expect(wrapper.vm.isServiceNameChecking).toBe(false);
  });

  it('validateServiceName returns false for a duplicate and true when available', async () => {
    const lookup = vi
      .fn(async (_kind: ServiceKind, name: string) => {
        if (name === 'taken') {
          return { id: 's1' };
        }
        throw new Error('404');
      });
    const { wrapper } = mountValidation(lookup);
    await expect(wrapper.vm.validateServiceName('taken')).resolves.toBe(false);
    expect(wrapper.vm.nameError).toContain('Try taken_2.');
    await expect(wrapper.vm.validateServiceName('free')).resolves.toBe(true);
    expect(wrapper.vm.nameError).toBe('');
  });

  it('ignores stale request ids', async () => {
    const lookup = vi.fn(async () => ({ id: 's1' }));
    const { wrapper } = mountValidation(lookup);
    await expect(wrapper.vm.validateServiceName('a', 1)).resolves.toBe(false);
    await expect(wrapper.vm.validateServiceName('b', 0)).resolves.toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('database', 'a');
  });

  it('passes immediately when disabled or empty, and reset clears state', async () => {
    const lookup = vi.fn(async () => ({ id: 's1' }));
    const { wrapper, enabled, serviceName } = mountValidation(lookup);
    enabled.value = false;
    await expect(wrapper.vm.validateServiceName('taken')).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
    await expect(wrapper.vm.validateServiceName('   ')).resolves.toBe(true);
    enabled.value = true;
    serviceName.value = 'taken';
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(SERVICE_NAME_VALIDATION_DEBOUNCE_MS);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.nameError).not.toBe('');
    wrapper.vm.resetNameValidation();
    expect(wrapper.vm.nameError).toBe('');
    expect(wrapper.vm.isServiceNameChecking).toBe(false);
  });
});
