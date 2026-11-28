/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataQualityTestCaseSummary } from './useDataQualityTestCaseSummary';

const fetchDqDashboardAggregations = vi.fn();

vi.mock('@/quality/dashboard', () => ({
  fetchDqDashboardAggregations: (...args: unknown[]) => fetchDqDashboardAggregations(...args),
}));

const Harness = defineComponent({
  setup() {
    const activeTab = ref<'dashboard' | 'test-cases'>('dashboard');
    const ownsTheUrl = ref(true);
    const route = ref({ query: {} });
    const canViewTestCaseBasic = ref(true);
    const summary = useDataQualityTestCaseSummary({
      activeTab,
      ownsTheUrl,
      route,
      canViewTestCaseBasic,
    });
    return { ...summary, activeTab, ownsTheUrl, canViewTestCaseBasic };
  },
  template: '<div />',
});

describe('useDataQualityTestCaseSummary', () => {
  beforeEach(() => {
    fetchDqDashboardAggregations.mockResolvedValue({
      results: { success: 2, failed: 1, aborted: 0, queued: 0, total: 3 },
      dimensions: [],
      coverage: null,
      health: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips loading on the dashboard tab', async () => {
    const wrapper = mount(Harness);
    await flushPromises();
    expect(wrapper.vm.isTestCaseSummaryLoading).toBe(false);
    expect(fetchDqDashboardAggregations).not.toHaveBeenCalled();
  });

  it('loads summary for list tabs', async () => {
    const wrapper = mount(Harness);
    wrapper.vm.activeTab = 'test-cases';
    await flushPromises();
    expect(fetchDqDashboardAggregations).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.isTestCaseSummaryLoading).toBe(false);
    expect(wrapper.vm.testCaseSummary.total).toBe(3);
  });
});