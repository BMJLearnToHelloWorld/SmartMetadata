/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import DataQualityWidget from './widgets/DataQualityWidget.vue';
import HomeWidgetCard from './HomeWidgetCard.vue';

const getDataQualityReport = vi.fn();
const listTestCasesBySearch = vi.fn();
vi.mock('@/api/dataQualityReports', () => ({
  getDataQualityReport: (...args: unknown[]) => getDataQualityReport(...args),
}));
vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'u1', name: 'admin', teams: [] } }),
}));

function mountCard(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(HomeWidgetCard, {
    props: { title: 'Activity Feed', testId: 'home-widget-activity', ...props },
    slots: {
      extra: '<button>All Activity</button>',
      default: '<p>No Recent Activity</p>',
      ...slots,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('HomeWidgetCard', () => {
  it('renders OM-like card chrome with title, extra, and body slots', () => {
    const wrapper = mountCard();
    expect(wrapper.get('[data-testid="home-widget-activity"]').text()).toContain('Activity Feed');
    expect(wrapper.text()).toContain('All Activity');
    expect(wrapper.text()).toContain('No Recent Activity');
    expect(wrapper.text()).not.toContain('Topics to catch up');
  });

  it('renders the loading skeleton instead of the body while loading', () => {
    const wrapper = mountCard({ isLoading: true });
    expect(wrapper.find('[data-testid="home-widget-activity-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No Recent Activity');
  });

  it('renders the error block with a retry action', async () => {
    const wrapper = mountCard({ isError: true });
    expect(wrapper.find('[data-testid="home-widget-activity-error"]').exists()).toBe(true);
    await wrapper.get('[data-testid="home-widget-activity-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('renders status chip, summary row and meta', () => {
    const wrapper = mountCard({
      status: { label: 'Needs Attention', tone: 'error' },
      summary: '1/3 services failing',
      meta: 'Updated just now',
    });
    expect(wrapper.get('[data-testid="home-widget-activity-status"]').text()).toContain('Needs Attention');
    expect(wrapper.get('[data-testid="home-widget-activity-summary"]').text()).toContain(
      '1/3 services failing',
    );
    expect(wrapper.get('[data-testid="home-widget-activity-meta"]').text()).toContain('Updated just now');
  });

  it('renders the empty state with its action', async () => {
    const wrapper = mountCard({
      emptyState: { title: 'No services connected yet', actionLabel: 'Add Service' },
    });
    expect(wrapper.get('[data-testid="home-widget-activity-empty"]').text()).toContain(
      'No services connected yet',
    );
    await wrapper.get('[data-testid="home-widget-activity-empty-action"]').trigger('click');
    expect(wrapper.emitted('empty-action')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('No Recent Activity');
  });
});

describe('HomeWidgetCard stage D: edit view and collapse', () => {
  it('shows the drag handle and remove button only in edit view', () => {
    const wrapper = mountCard({ editView: true });
    const handle = wrapper.get('[data-testid="drag-widget-activity"]');
    expect(handle.classes()).toContain('drag-widget-icon');
    expect(handle.attributes('draggable')).toBe('true');
    // Pointer-only drag: the handle is not a focusable control.
    expect(handle.attributes('aria-hidden')).toBe('true');
    expect(handle.attributes('tabindex')).toBeUndefined();
    expect(wrapper.find('[data-testid="remove-widget-activity"]').exists()).toBe(true);
  });

  it('shows no edit controls outside edit view', () => {
    const wrapper = mountCard();
    expect(wrapper.find('[data-testid^="drag-widget-"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="remove-widget-"]').exists()).toBe(false);
  });

  it('derives the drag key from an explicit widgetKey', () => {
    const wrapper = mountCard({ editView: true, widgetKey: 'KnowledgePanel.DataQuality' });
    expect(wrapper.find('[data-testid="drag-widget-KnowledgePanel.DataQuality"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="remove-widget-KnowledgePanel.DataQuality"]').exists()).toBe(
      true,
    );
  });

  it('emits remove when the remove button is clicked', async () => {
    const wrapper = mountCard({ editView: true });
    await wrapper.get('[data-testid="remove-widget-activity"]').trigger('click');
    expect(wrapper.emitted('remove')).toHaveLength(1);
  });

  it('toggles collapse from the chevron and hides the body when collapsed', async () => {
    const wrapper = mountCard({ collapsible: true, collapsed: false });
    expect(wrapper.find('[data-testid="home-widget-activity-collapse"]').exists()).toBe(true);
    expect(wrapper.find('.home-widget-card__body').exists()).toBe(true);
    await wrapper.get('[data-testid="home-widget-activity-collapse"]').trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
    const collapsed = mountCard({ collapsible: true, collapsed: true });
    expect(collapsed.find('.home-widget-card__body').exists()).toBe(false);
  });

  it('toggles collapse from the title area when collapsible, not otherwise', async () => {
    const wrapper = mountCard({ collapsible: true });
    await wrapper.get('.home-widget-card__title').trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
    const plain = mountCard();
    await plain.get('.home-widget-card__title').trigger('click');
    expect(plain.emitted('toggle-collapse')).toBeUndefined();
  });

  it('shows no collapse chevron when not collapsible', () => {
    expect(mountCard().find('[data-testid="home-widget-activity-collapse"]').exists()).toBe(false);
  });
});

describe('HomeWidgetCard header tone and summary placement', () => {
  it('renders the official tone tile for a known widget key', () => {
    const dq = mountCard({ widgetKey: 'KnowledgePanel.DataQuality' });
    const dqTone = dq.find('.home-widget-card__tone');
    expect(dqTone.exists()).toBe(true);
    expect(dqTone.attributes('style')).toContain('var(--sm-color-error-bg)');
    const domains = mountCard({ widgetKey: 'KnowledgePanel.Domains' });
    const domainsTone = domains.find('.home-widget-card__tone');
    expect(domainsTone.exists()).toBe(true);
    expect(domainsTone.attributes('style')).toContain('var(--sm-color-primary-bg)');
  });

  it('renders no tone tile for an unknown widget key', () => {
    expect(mountCard().find('.home-widget-card__tone').exists()).toBe(false);
  });

  it('places the summary in the header strip, not the body', () => {
    const wrapper = mountCard({ summary: '1/3 services failing' });
    expect(wrapper.find('.home-widget-card__title .home-widget-card__summary').exists()).toBe(
      true,
    );
    expect(wrapper.find('.home-widget-card__body .home-widget-card__summary').exists()).toBe(
      false,
    );
  });
});

describe('HomeWidgetCard edit view through a real widget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getDataQualityReport.mockResolvedValue({ data: [], metadata: { keys: [], dimensions: [], metrics: [] } });
    listTestCasesBySearch.mockResolvedValue({ data: [], total: 0 });
  });

  it('falls the edit-view props through the widget to the card', async () => {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
        { path: '/quality/test-cases', name: 'quality-test-cases', component: { template: '<div>dq</div>' } },
        { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>test</div>' } },
      ],
    });
    // `editView` is not a declared DataQualityWidget prop: it falls
    // through the widget to its root HomeWidgetCard, which is how the
    // editor reaches every widget without per-widget forwarding.
    const wrapper = mount(DataQualityWidget, {
      props: { widgetKey: 'KnowledgePanel.DataQuality', editView: true },
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="drag-widget-KnowledgePanel.DataQuality"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="remove-widget-KnowledgePanel.DataQuality"]').exists()).toBe(
      true,
    );
  });
});
