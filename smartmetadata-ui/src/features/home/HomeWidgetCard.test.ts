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
import HomeWidgetCard from './HomeWidgetCard.vue';

describe('HomeWidgetCard', () => {
  it('renders OM-like card chrome with title, extra, and body slots', () => {
    const wrapper = mount(HomeWidgetCard, {
      props: { title: 'Activity Feed', testId: 'home-widget-activity' },
      slots: {
        extra: '<button>All Activity</button>',
        default: '<p>No Recent Activity</p>',
      },
      global: { plugins: [Antd] },
    });
    expect(wrapper.get('[data-testid="home-widget-activity"]').text()).toContain('Activity Feed');
    expect(wrapper.text()).toContain('All Activity');
    expect(wrapper.text()).toContain('No Recent Activity');
    expect(wrapper.text()).not.toContain('Topics to catch up');
  });
});
