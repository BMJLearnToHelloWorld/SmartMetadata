/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import HomeWidgetCard from './HomeWidgetCard.vue';

describe('HomeWidgetCard', () => {
  it('renders title, meta, and rows when the widget has data', () => {
    const wrapper = mount(HomeWidgetCard, {
      props: {
        title: 'My Tasks',
        testId: 'home-widget-myTasks',
        meta: '2 open',
        summary: 'Tasks assigned to you.',
      },
      slots: { default: '<button>Request description</button>' },
      global: { plugins: [Antd] },
    });
    expect(wrapper.get('[data-testid="home-widget-myTasks"]').text()).toContain('My Tasks');
    expect(wrapper.text()).toContain('2 open');
    expect(wrapper.text()).toContain('Request description');
    expect(wrapper.find('[data-testid="home-widget-myTasks-empty"]').exists()).toBe(false);
  });

  it('shows the honest empty copy and hides rows when empty', () => {
    const wrapper = mount(HomeWidgetCard, {
      props: {
        title: 'KPIs',
        testId: 'home-widget-kpi',
        empty: true,
        emptyText: 'Set a target for coverage — ownership, descriptions, tiering — with a deadline, and track your pace against it here.',
      },
      slots: { default: '<button>should not show</button>' },
      global: { plugins: [Antd] },
    });
    expect(wrapper.get('[data-testid="home-widget-kpi-empty"]').text()).toContain('Set a target for coverage');
    expect(wrapper.text()).not.toContain('should not show');
  });
});
