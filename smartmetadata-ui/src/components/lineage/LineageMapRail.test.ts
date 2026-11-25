/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageMapRail from './LineageMapRail.vue';

function mountRail(props: Record<string, unknown> = {}) {
  return mount(LineageMapRail, {
    props: { activeStop: 'LAYER', lens: 'service', canDrill: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('LineageMapRail (pin LineageMapControls)', () => {
  it('renders the three stops with only the active label visible', () => {
    const wrapper = mountRail({ activeStop: 'ASSET' });
    expect(wrapper.find('[data-testid="lineage-map-band-LAYER"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-band-ASSET"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-band-FIELD"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-band-label-ASSET"]').classes()).toContain(
      'lineage-map-rail__label--active',
    );
    expect(wrapper.find('[data-testid="lineage-map-band-label-LAYER"]').classes()).not.toContain(
      'lineage-map-rail__label--active',
    );
    wrapper.unmount();
  });

  it('disables a deeper stop when nothing can be drilled into', () => {
    const wrapper = mountRail({ activeStop: 'LAYER', canDrill: false });
    expect(
      (wrapper.find('[data-testid="lineage-map-band-ASSET"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (wrapper.find('[data-testid="lineage-map-band-FIELD"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (wrapper.find('[data-testid="lineage-map-band-LAYER"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    wrapper.unmount();
  });

  it('keeps deeper stops enabled when the scene can drill', () => {
    const wrapper = mountRail({ activeStop: 'LAYER', canDrill: true });
    expect(
      (wrapper.find('[data-testid="lineage-map-band-FIELD"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    wrapper.unmount();
  });

  it('emits select-stop on dot click', async () => {
    const wrapper = mountRail({ activeStop: 'LAYER' });
    await wrapper.find('[data-testid="lineage-map-band-ASSET"]').trigger('click');
    expect(wrapper.emitted('select-stop')).toEqual([['ASSET']]);
    wrapper.unmount();
  });
});
