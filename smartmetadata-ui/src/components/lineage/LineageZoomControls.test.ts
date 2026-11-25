/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageZoomControls from './LineageZoomControls.vue';

function mountControls(props: Record<string, unknown> = {}) {
  return mount(LineageZoomControls, {
    props: { miniMapVisible: true, zoom: 1, ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('LineageZoomControls (pin LineageControlButtons)', () => {
  it('renders the minimap toggle, zoom percentage, and fit button in pin order', () => {
    const wrapper = mountControls({ miniMapVisible: false, zoom: 1.25 });
    const testIds = [...wrapper.findAll('[data-testid]')].map((node) =>
      node.attributes('data-testid'),
    );
    expect(testIds).toEqual([
      'lineage-zoom-controls',
      'toggle-mind-map',
      'zoom-in',
      'zoom-level',
      'zoom-out',
      'fit-screen',
    ]);
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe('125%');
    expect(wrapper.find('[data-testid="toggle-mind-map"]').attributes('aria-pressed')).toBe(
      'false',
    );
    wrapper.unmount();
  });

  it('marks the minimap toggle pressed when the minimap is visible', () => {
    const wrapper = mountControls({ miniMapVisible: true, zoom: 0.5 });
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe('50%');
    expect(wrapper.find('[data-testid="toggle-mind-map"]').attributes('aria-pressed')).toBe(
      'true',
    );
    wrapper.unmount();
  });

  it('emits the zoom/fit actions on click', async () => {
    const wrapper = mountControls();
    await wrapper.find('[data-testid="toggle-mind-map"]').trigger('click');
    await wrapper.find('[data-testid="zoom-in"]').trigger('click');
    await wrapper.find('[data-testid="zoom-out"]').trigger('click');
    await wrapper.find('[data-testid="fit-screen"]').trigger('click');
    expect(wrapper.emitted('toggle-mini-map')).toHaveLength(1);
    expect(wrapper.emitted('zoom-in')).toHaveLength(1);
    expect(wrapper.emitted('zoom-out')).toHaveLength(1);
    expect(wrapper.emitted('fit-view')).toHaveLength(1);
    wrapper.unmount();
  });
});
