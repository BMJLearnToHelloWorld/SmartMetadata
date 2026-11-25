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
import DataInsightChartCard from './DataInsightChartCard.vue';

const ROUTER_LINK_STUB = {
  props: ['to'],
  template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
};

function mountCard(props: Record<string, unknown> = {}) {
  return mount(DataInsightChartCard, {
    props: {
      id: 'percentage_of_service_with_description',
      title: 'Services with description',
      subTitle: 'Share of services with a description, by service.',
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
      rows: [
        { key: 'Postgres', name: 'Postgres', label: '80%', percent: 80, color: '#E57373' },
        { key: 'MySQL', name: 'MySQL', label: '60%', percent: 60, color: '#E57373' },
      ],
      headline: {
        label: 'Services with description',
        value: '62.5%',
        progress: 62.5,
        changeText: '+15.00% over the last 7 days',
        showProgress: true,
        target: 80,
        targetSuffix: '%',
      },
      loading: false,
      testId: 'insights-service-description',
      emptyText: 'No service coverage data in the selected window.',
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { RouterLink: ROUTER_LINK_STUB },
    },
  });
}

function chartOption(wrapper: ReturnType<typeof mountCard>): Record<string, unknown> {
  const chart = wrapper.findComponent({ name: 'VChart' });
  expect(chart.exists()).toBe(true);
  return chart.props('option') as Record<string, unknown>;
}

describe('DataInsightChartCard', () => {
  it('renders the headline, change, target, 500px line chart and descending rows', () => {
    const wrapper = mountCard();
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('62.5%');
    expect(wrapper.text()).toContain('+15.00% over the last 7 days');
    const target = wrapper.get('[data-testid="insights-service-description-target"]');
    expect(target.text()).toBe('80%');
    expect(target.attributes('style')).toContain('left: 80%');
    expect(wrapper.find('[data-testid="insights-service-description"]').attributes('data-points')).toBe('1');
    // Pin GRAPH_HEIGHT = 500 for the left-column chart.
    expect(wrapper.findComponent({ name: 'VChart' }).attributes('style')).toContain('height: 500px');
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Postgres');
    expect(rows[0]?.text()).toContain('80%');
    expect(rows[1]?.text()).toContain('MySQL');
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(false);
  });

  it('lays the headline out as pin CustomStatistic: label + value left, change right-aligned', () => {
    const wrapper = mountCard();
    const headline = wrapper.get('[data-testid="insights-service-description-headline"]');
    const main = headline.find('.di-chart-card__headline-main');
    expect(main.exists()).toBe(true);
    const change = headline.find('.di-chart-card__headline-change');
    expect(change.exists()).toBe(true);
    expect(change.text()).toContain('+15.00% over the last 7 days');
    // The change sits in the right column, not stacked under the value.
    expect(change.element.parentElement).toBe(main.element);
    expect(headline.find('.di-chart-card__headline-value').text()).toBe('62.5%');
  });

  it('hides the right headline column when there is no change line', () => {
    const wrapper = mountCard({
      headline: { label: 'Services with description', value: '40%', progress: 40, showProgress: true },
    });
    expect(wrapper.find('.di-chart-card__headline-change').exists()).toBe(false);
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('40%');
  });

  it('passes the percentage flag to the chart tooltip formatter (pin getDataInsightTooltip)', () => {
    const wrapper = mountCard({ isPercentage: true });
    const option = chartOption(wrapper);
    const formatter = (option.tooltip as Record<string, unknown>).formatter as (
      params: Array<{ axisValue: string; seriesName: string; value: number; marker: string }>,
    ) => string;
    expect(typeof formatter).toBe('function');
    const html = formatter([
      { axisValue: '2026-01-07', seriesName: 'Postgres', value: 80, marker: '' },
      { axisValue: '2026-01-07', seriesName: 'MySQL', value: 62.5, marker: '' },
    ]);
    expect(html).toContain('Jan 7, 2026');
    expect(html).toContain('80%');
    expect(html).toContain('62.5%');
    const absolute = mountCard({ isPercentage: false });
    const absoluteFormatter = (chartOption(absolute).tooltip as Record<string, unknown>).formatter as (
      params: Array<{ axisValue: string; seriesName: string; value: number; marker: string }>,
    ) => string;
    const absoluteHtml = absoluteFormatter([
      { axisValue: '2026-01-07', seriesName: 'Postgres', value: 80, marker: '' },
    ]);
    expect(absoluteHtml).toContain('Jan 7, 2026');
    expect(absoluteHtml).toContain('80');
    expect(absoluteHtml).not.toContain('80%');
  });

  it('hides the built-in legend: the right panel is the legend (pin HIDDEN_CHART_LEGEND)', () => {
    const wrapper = mountCard();
    expect(chartOption(wrapper).legend).toEqual({ show: false });
  });

  it('lays each row out 12/12 at >=768px: name + value left, bar right (pin EntitySummaryProgressBar)', () => {
    const wrapper = mountCard();
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.findAll('.ant-col-md-12')).toHaveLength(2);
    }
    expect(rows[0]?.get('[data-testid="insights-service-description-row-name"]').text()).toBe('Postgres');
    expect(rows[0]?.get('[data-testid="insights-service-description-row-value"]').text()).toBe('80%');
  });

  it('hides the target and change lines when they are undefined', () => {
    const wrapper = mountCard({
      headline: { label: 'Services with description', value: '40%', progress: 40, showProgress: true },
    });
    expect(wrapper.find('[data-testid="insights-service-description-target"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('over the last 7 days');
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('40%');
  });

  it('filters the rows by search text', async () => {
    const wrapper = mountCard();
    await wrapper.find('input[placeholder="Search"]').setValue('my');
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('MySQL');
  });

  it('dims the other rows when one is picked, filters the chart to it, and clears the pick', async () => {
    const wrapper = mountCard();
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    await rows[0]?.trigger('click');
    expect(wrapper.find('[data-testid="insights-service-description-clear"]').exists()).toBe(true);
    const after = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(after[0]?.classes()).not.toContain('di-chart-card__row--dim');
    expect(after[1]?.classes()).toContain('di-chart-card__row--dim');
    // Pin updateActiveChartFilter: the chart shows only the picked series.
    const series = chartOption(wrapper).series as Array<Record<string, unknown>>;
    expect(series).toHaveLength(1);
    expect(series[0].name).toBe('Postgres');
    await wrapper.find('[data-testid="insights-service-description-clear"]').trigger('click');
    const cleared = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(cleared[1]?.classes()).not.toContain('di-chart-card__row--dim');
    expect(wrapper.find('[data-testid="insights-service-description-clear"]').exists()).toBe(false);
  });

  it('dims the other series while a row is hovered, and restores them on leave', async () => {
    const wrapper = mountCard();
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    await rows[0]?.trigger('mouseenter');
    const hovered = chartOption(wrapper).series as Array<Record<string, unknown>>;
    expect(hovered[0].lineStyle).toEqual({ opacity: 1 });
    expect(hovered[1].lineStyle).toEqual({ opacity: 0.3 });
    await rows[0]?.trigger('mouseleave');
    const left = chartOption(wrapper).series as Array<Record<string, unknown>>;
    expect(left[0].lineStyle).toEqual({ opacity: 1 });
    expect(left[1].lineStyle).toEqual({ opacity: 1 });
  });

  it('shows the empty state only when the fetch succeeded with no points', () => {
    const wrapper = mountCard({ series: [], rows: [], headline: undefined });
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
    // Pin DataInsightChartCard.tsx:533: a failed fetch only toasts — the
    // card has no error state at all, so no data always means empty.
    expect(wrapper.find('[data-testid="insights-service-description-error"]').exists()).toBe(false);
  });

  it('renders a provided #empty slot instead of the plain SmState empty text', () => {
    const wrapper = mount(DataInsightChartCard, {
      props: {
        id: 'page_views_by_entities',
        title: 'Page Views by Data Assets',
        subTitle: 'Displays the number of times a dataset type was viewed.',
        series: [],
        rows: [],
        loading: false,
        testId: 'insights-page-views',
        emptyText: 'Adding a new Data Insight is easy, just give it a spin!',
      },
      slots: { empty: '<div data-testid="custom-empty">placeholder</div>' },
      global: {
        plugins: [Antd, createTestI18n()],
        stubs: { RouterLink: ROUTER_LINK_STUB },
      },
    });
    expect(wrapper.find('[data-testid="custom-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-page-views-empty"]').exists()).toBe(false);
  });

  it('shows loading while fetching', () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find('[data-testid="insights-service-description-loading"]').exists()).toBe(true);
  });

  it('renders no show-info text element and no show-info class: with showInfo off antd reserves no text space, so no outer/text overrides are needed', () => {
    const wrapper = mountCard();
    // ant-design-vue progress.js:100 returns null for the text node and
    // :84 adds `ant-progress-show-info` only when showInfo is true; the
    // base `.ant-progress-outer` rule is width 100% with no end margin,
    // so the bar is full-width without any !important override.
    expect(wrapper.find('.ant-progress-text').exists()).toBe(false);
    expect(wrapper.find('.ant-progress-show-info').exists()).toBe(false);
    // The first .ant-progress-bg in DOM order is the headline bar (62.5%);
    // the row bars follow it — scope the assertion to the row.
    expect(
      wrapper
        .find('[data-testid="insights-service-description-headline"] .ant-progress-bg')
        .attributes('style'),
    ).toContain('width: 62.5%');
    expect(
      wrapper.find('[data-testid="insights-service-description-row"] .ant-progress-bg').attributes('style'),
    ).toContain('width: 80%');
  });

  it('links the description card out to Explore with pin\'s no-description filter', () => {
    const wrapper = mountCard({ listAssets: 'description' });
    const link = wrapper.find('[data-testid="insights-service-description-explore-link"]');
    expect(link.exists()).toBe(true);
    expect(wrapper.text()).toContain('View data assets without a description');
    const to = JSON.parse(link.attributes('data-to') ?? '{}') as {
      name?: string;
      query?: Record<string, string>;
    };
    expect(to.name).toBe('search');
    expect(to.query?.tab).toBe('table');
    const filter = to.query?.query_filter ?? '';
    expect(filter).toContain('descriptionStatus');
    expect(filter).toContain('INCOMPLETE');
  });

  it('links the owner card out to Explore with pin\'s no-owner filter', () => {
    const wrapper = mountCard({ listAssets: 'owner' });
    const link = wrapper.find('[data-testid="insights-service-description-explore-link"]');
    expect(link.exists()).toBe(true);
    expect(wrapper.text()).toContain('View data assets without an owner');
    const to = JSON.parse(link.attributes('data-to') ?? '{}') as {
      query?: Record<string, string>;
    };
    expect((to.query?.query_filter ?? '')).toContain('ownerDisplayName');
    expect((to.query?.query_filter ?? '')).toContain('is_null');
  });

  it('shows no Explore link without listAssets', () => {
    const wrapper = mountCard();
    expect(wrapper.find('[data-testid="insights-service-description-explore-link"]').exists()).toBe(false);
  });
});
