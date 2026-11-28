/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ObservabilityPageShell from './ObservabilityPageShell.vue';

describe('ObservabilityPageShell', () => {
  it('matches ObservabilityPageShell.tsx layout test ids and inset', () => {
    const wrapper = mount(ObservabilityPageShell, {
      slots: {
        header: '<div data-testid="hdr">Header</div>',
        default: 'Content',
      },
    });
    expect(wrapper.find('[data-testid="observability-page-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="observability-page"]').classes()).toContain(
      'observability-page-shell__frame',
    );
    expect(wrapper.find('[data-testid="observability-page-header"]').text()).toContain('Header');
    expect(wrapper.find('[data-testid="observability-page-content"]').text()).toBe('Content');
    wrapper.unmount();
  });
});