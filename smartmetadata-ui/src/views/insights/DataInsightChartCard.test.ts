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
        changeValue: 15,
        changeDays: 7,
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
    expect(wrapper.text()).toContain('+15.00%');
    expect(wrapper.text()).toContain('7-days change');
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
    expect(change.text()).toContain('+15.00%');
    expect(change.text()).toContain('7-days change');
    // The change sits in the right column, not stacked under the value.
    expect(change.element.parentElement).toBe(main.element);
    expect(headline.find('.di-chart-card__headline-value').text()).toBe('62.5%');
  });

  it('does not crush the headline at narrow width: pin wraps the row and splits the change into two short lines', () => {
    const wrapper = mountCard();
    const headline = wrapper.get('[data-testid="insights-service-description-headline"]');
    const main = headline.find('.di-chart-card__headline-main');
    // Pin CustomStatistic.tsx:34: the headline row wraps (Box wrap="wrap"),
    // so the change drops to the next line instead of crushing the left
    // column to min-content. The compiled SFC style lands in the document.
    const styles = [...document.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');
    expect(styles).toContain('flex-wrap:wrap');
    // The change is two short lines (signed percent + duration), never one
    // 185px sentence: its min-content width is the longer line, so the
    // label + value keep their full width at a 221px headline.
    const change = headline.get('.di-chart-card__headline-change');
    expect(change.element.parentElement).toBe(main.element);
    const valueLine = change.get('.di-chart-card__headline-change-value');
    const daysLine = change.get('.di-chart-card__headline-change-days');
    expect(valueLine.text()).toBe('+15.00%');
    expect(daysLine.text()).toBe('7-days change');
    expect(headline.get('.di-chart-card__headline-label').text()).toBe('Services with description');
    expect(headline.get('.di-chart-card__headline-value').text()).toBe('62.5%');
    // Pin CustomStatistic.tsx:49-55: a non-negative change reads success.
    expect(valueLine.classes()).toContain('ant-typography-success');
    // ...and a negative change reads danger, with the same two lines.
    const negative = mountCard({ headline: { label: 'Assigned Tier', value: '2.33%', progress: 2.33, changeValue: -1.17, changeDays: 7, showProgress: false } });
    const negativeChange = negative.get('.di-chart-card__headline-change');
    expect(negativeChange.get('.di-chart-card__headline-change-value').text()).toBe('-1.17%');
    expect(negativeChange.get('.di-chart-card__headline-change-value').classes()).toContain(
      'ant-typography-danger',
    );
    expect(negativeChange.get('.di-chart-card__headline-change-days').text()).toBe('7-days change');
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

  it('suffixes the y-axis ticks with % only for percentage cards (pin axisTickFormatter)', () => {
    // Pin DataInsightChartCard.tsx:600-608: isPercentageGraph gates the
    // '%' y-axis formatter; the tier/total cards keep bare ticks.
    const percentage = mountCard({ isPercentage: true });
    const percentageAxis = chartOption(percentage).yAxis as {
      axisLabel: { formatter: (value: number) => string };
    };
    expect(percentageAxis.axisLabel.formatter(100)).toBe('100%');
    expect(percentageAxis.axisLabel.formatter(80)).toBe('80%');
    const total = mountCard({ isPercentage: false });
    expect(chartOption(total).yAxis as Record<string, unknown>).not.toHaveProperty('axisLabel');
    const unset = mountCard();
    expect(chartOption(unset).yAxis as Record<string, unknown>).not.toHaveProperty('axisLabel');
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
    expect(wrapper.find('.di-chart-card__headline-change').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('7-days change');
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('40%');
  });

  it('filters the rows by search text', async () => {
    const wrapper = mountCard();
    await wrapper.find('input[placeholder="Search"]').setValue('my');
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('MySQL');
  });

  // Pin R-P2-10 (DataInsightChartCard.tsx:442-443): the row search
  // matches the raw entity key case-insensitively, so `storedProcedure`
  // hits even though the display name carries a space ("Stored
  // Procedure"). The display-name match is kept alongside it, so a
  // Chinese display name stays searchable (multilingual exception).
  it('matches the raw row key as well as the display name when searching (pin R-P2-10)', async () => {
    const wrapper = mountCard({
      series: [
        {
          name: 'storedProcedure',
          points: [{ label: '2026-01-07', value: 48 }],
        },
        {
          name: 'table',
          points: [{ label: '2026-01-07', value: 150 }],
        },
      ],
      rows: [
        { key: 'storedProcedure', name: 'Stored Procedure', label: '48', percent: 48, color: '#E57373' },
        { key: 'table', name: 'Table', label: '150', percent: 100, color: '#E57373' },
      ],
    });
    const search = wrapper.find('input[placeholder="Search"]');
    // Raw key, no space: only the key match can hit this.
    await search.setValue('storedprocedure');
    let rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('Stored Procedure');
    // Case-insensitive raw key.
    await search.setValue('STOREDPROCEDURE');
    rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('Stored Procedure');
    // Display-name match is kept: "procedure" still hits.
    await search.setValue('procedure');
    rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('Stored Procedure');
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

  it('shows pin\'s empty placeholder only when the fetch succeeded with no points (pin R-P2-11)', () => {
    const wrapper = mountCard({ series: [], rows: [], headline: undefined });
    const empty = wrapper.get('[data-testid="insights-service-description-empty"]');
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
    // Pin DataInsightChartCard.tsx:533: a failed fetch only toasts — the
    // card has no error state at all, so no data always means empty.
    expect(wrapper.find('[data-testid="insights-service-description-error"]').exists()).toBe(false);
    // Pin EmptyGraphPlaceholder.tsx:27-58: database icon + pin wording +
    // docs link (only the word "docs" is the link).
    expect(empty.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(empty.text()).toContain('Still need help? Refer to our docs for more information.');
    const link = empty.get('a[href="https://docs.open-metadata.org/latest/how-to-guides/data-insights"]');
    expect(link.text()).toBe('docs');
    expect(link.attributes('target')).toBe('_blank');
    expect(empty.find('.ant-empty').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('No service coverage data in the selected window.');
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

  it('keeps the title visible while loading and shows a 4-row skeleton, not a whole-card spinner (pin R-P2-11)', () => {
    // Pin DataInsightChartCard.tsx:620-645: the loading shell keeps the
    // PageHeader and renders SkeletonParagraph rows={4}.
    const wrapper = mountCard({ loading: true });
    const loading = wrapper.get('[data-testid="insights-service-description-loading"]');
    expect(loading.text()).toContain('Services with description');
    expect(loading.text()).toContain('Share of services with a description, by service.');
    expect(loading.find('.ant-skeleton').exists()).toBe(true);
    expect(loading.findAll('.ant-skeleton-paragraph li')).toHaveLength(4);
    expect(loading.find('.ant-spin').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
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
    expect(wrapper.text()).toContain('Explore Assets with No description');
    const to = JSON.parse(link.attributes('data-to') ?? '{}') as {
      name?: string;
      params?: Record<string, string>;
      query?: Record<string, string>;
    };
    expect(to.name).toBe('search');
    expect(to.params?.tab).toBe('tables');
    const filter = to.query?.query_filter ?? '';
    expect(filter).toContain('descriptionStatus');
    expect(filter).toContain('INCOMPLETE');
  });

  it('links the owner card out to Explore with pin\'s no-owner filter', () => {
    const wrapper = mountCard({ listAssets: 'owner' });
    const link = wrapper.find('[data-testid="insights-service-description-explore-link"]');
    expect(link.exists()).toBe(true);
    expect(wrapper.text()).toContain('Explore Assets with No Owner');
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
