/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CompactDateTimeDisplay from './CompactDateTimeDisplay.vue';

describe('CompactDateTimeDisplay', () => {
  it('renders official compact date/time/utc lines for epoch millis', () => {
    const wrapper = mount(CompactDateTimeDisplay, {
      props: { timestamp: Date.UTC(2024, 0, 15, 14, 30) },
    });
    expect(wrapper.get('[data-testid="compact-date-time-date"]').text()).toMatch(/January 15, 2024,/);
    expect(wrapper.get('[data-testid="compact-date-time-time"]').text()).toMatch(/\d{1,2}:\d{2}/);
    expect(wrapper.get('[data-testid="compact-date-time-utc"]').text()).toMatch(/^\(UTC/);
  });

  it('shows em dash when timestamp is missing', () => {
    const wrapper = mount(CompactDateTimeDisplay);
    expect(wrapper.get('[data-testid="compact-date-time-empty"]').text()).toBe('—');
  });
});