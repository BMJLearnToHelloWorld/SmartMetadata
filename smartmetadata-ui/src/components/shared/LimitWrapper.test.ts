/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Tooltip } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { useShellConfigStore } from '@/stores/shellConfig';
import LimitWrapper from './LimitWrapper.vue';

const getLimitByResource = vi.fn();

vi.mock('@/api/limits', () => ({
  getLimitByResource: (...args: unknown[]) => getLimitByResource(...args),
}));

function limitConfig(enable: boolean) {
  return {
    enable,
    limits: {
      config: {
        version: '2.0',
        plan: 'enterprise',
        installationType: 'self-hosted',
        deployment: 'docker',
        companyName: 'Acme',
        domain: 'acme.example',
        instances: 1,
        featureLimits: [],
      },
    },
  };
}

function resourceLimit(limitReached: boolean, currentCount: number, hardLimit = 5) {
  return {
    featureLimitStatuses: [
      {
        name: 'metric',
        limitReached,
        currentCount,
        configuredLimit: { name: 'metric', limits: { softLimit: 1, hardLimit } },
      },
    ],
  };
}

async function mountWrapper(enable: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useShellConfigStore();
  config.limit = limitConfig(enable);
  const wrapper = mount(LimitWrapper, {
    props: { resource: 'metric' },
    slots: { default: '<button data-testid="wrapped-entry">New metric</button>' },
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('LimitWrapper', () => {
  beforeEach(() => {
    localStorage.clear();
    getLimitByResource.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders children ungated when limits are disabled', async () => {
    getLimitByResource.mockResolvedValue(resourceLimit(true, 9));
    const wrapper = await mountWrapper(false);
    expect(wrapper.find('[data-testid="wrapped-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(false);
    expect(getLimitByResource).not.toHaveBeenCalled();
  });

  it('renders children ungated when the server reports currentCount -1', async () => {
    getLimitByResource.mockResolvedValue(resourceLimit(true, -1));
    const wrapper = await mountWrapper(true);
    expect(wrapper.find('[data-testid="wrapped-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(false);
  });

  it('disables the entry with a tooltip when the limit is reached', async () => {
    getLimitByResource.mockResolvedValue(resourceLimit(true, 5));
    const wrapper = await mountWrapper(true);
    expect(wrapper.find('[data-testid="wrapped-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(true);
    expect(wrapper.findComponent(Tooltip).props('title')).toContain('5/5');
  });

  it('renders children when the limit is not reached', async () => {
    getLimitByResource.mockResolvedValue(resourceLimit(false, 2));
    const wrapper = await mountWrapper(true);
    expect(wrapper.find('[data-testid="wrapped-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(false);
  });

  it('fails open: a limit fetch failure renders the children', async () => {
    getLimitByResource.mockRejectedValue(new Error('limit service down'));
    const wrapper = await mountWrapper(true);
    expect(wrapper.find('[data-testid="wrapped-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(false);
  });
});
