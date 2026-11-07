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
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ServiceInsightCard from './ServiceInsightCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(ServiceInsightCard, {
    props: {
      title: 'Services with description',
      headline: 62.5,
      change: 15,
      days: 7,
      target: 80,
      series: [
        {
          name: 'Postgres',
          points: [
            { label: '2026-01-01', value: 50 },
            { label: '2026-01-07', value: 80 },
          ],
        },
        {
          name: 'MySQL',
          points: [
            { label: '2026-01-01', value: 40 },
            { label: '2026-01-07', value: 60 },
          ],
        },
      ],
      latestByService: [
        { service: 'Postgres', value: 80 },
        { service: 'MySQL', value: 60 },
      ],
      loading: false,
      failed: false,
      testId: 'insights-service-description',
      emptyText: 'No service coverage data in the selected window.',
      errorText: 'Service coverage charts failed to load',
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ServiceInsightCard', () => {
  it('renders the headline, change, target, chart and descending service list', () => {
    const wrapper = mountCard();
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('62.5%');
    expect(wrapper.text()).toContain('+15.00 pp over the last 7 days');
    expect(wrapper.text()).toContain('Target: 80%');
    expect(wrapper.find('[data-testid="insights-service-description"]').attributes('data-points')).toBe('1');
    const rows = wrapper.findAll('[data-testid="insights-service-description-service"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Postgres');
    expect(rows[0]?.text()).toContain('80%');
    expect(rows[1]?.text()).toContain('MySQL');
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(false);
  });

  it('hides the target and change lines when they are undefined', () => {
    const wrapper = mountCard({ headline: 40, change: undefined, target: undefined });
    expect(wrapper.text()).not.toContain('Target:');
    expect(wrapper.text()).not.toContain('pp over the last');
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('40%');
  });

  it('filters the service list by search text', async () => {
    const wrapper = mountCard();
    await wrapper.find('input[placeholder="Search services"]').setValue('my');
    const rows = wrapper.findAll('[data-testid="insights-service-description-service"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('MySQL');
  });

  it('dims the other services when one is picked, and clears the pick', async () => {
    const wrapper = mountCard();
    const rows = wrapper.findAll('[data-testid="insights-service-description-service"]');
    await rows[0]?.trigger('click');
    expect(wrapper.find('[data-testid="insights-service-description-clear"]').exists()).toBe(true);
    const after = wrapper.findAll('[data-testid="insights-service-description-service"]');
    expect(after[0]?.classes()).not.toContain('service-card__row--dim');
    expect(after[1]?.classes()).toContain('service-card__row--dim');
    await wrapper.find('[data-testid="insights-service-description-clear"]').trigger('click');
    const cleared = wrapper.findAll('[data-testid="insights-service-description-service"]');
    expect(cleared[1]?.classes()).not.toContain('service-card__row--dim');
    expect(wrapper.find('[data-testid="insights-service-description-clear"]').exists()).toBe(false);
  });

  it('shows the empty state only when the fetch succeeded with no points', () => {
    const wrapper = mountCard({ series: [], latestByService: [], headline: undefined, change: undefined });
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
  });

  it('shows the error state, not the empty state, when the fetch failed', () => {
    const wrapper = mountCard({ failed: true });
    expect(wrapper.find('[data-testid="insights-service-description-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(false);
  });

  it('shows loading while fetching', () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find('[data-testid="insights-service-description-loading"]').exists()).toBe(true);
  });
});
