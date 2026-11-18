/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { CUSTOM_ANNOUNCEMENT_COLORS } from '@/utils/notifications/announcementUtils';
import AnnouncementColorSelect from './AnnouncementColorSelect.vue';

function mountSelect(value?: string) {
  return mount(AnnouncementColorSelect, { props: { value }, global: { plugins: [Antd, createTestI18n()] } });
}

describe('AnnouncementColorSelect', () => {
  it('offers the five custom colours', () => {
    const wrapper = mountSelect();
    const swatches = wrapper.findAll('.ant-radio-wrapper');
    expect(swatches.map((swatch) => swatch.attributes('data-testid'))).toEqual(
      CUSTOM_ANNOUNCEMENT_COLORS.map((color) => `announcement-color-${color}`),
    );
  });

  it('appends a stored colour the form no longer offers', () => {
    const wrapper = mountSelect('purple');
    const swatches = wrapper.findAll('.ant-radio-wrapper');
    expect(swatches).toHaveLength(6);
    expect(swatches[5]?.attributes('data-testid')).toBe('announcement-color-purple');
    expect(
      (wrapper.find('input[value="purple"]').element as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('emits the picked colour', async () => {
    const wrapper = mountSelect();
    const input = wrapper.find('input[value="orange"]');
    (input.element as HTMLInputElement).checked = true;
    await input.trigger('change');
    expect(wrapper.emitted('change')).toEqual([['orange']]);
  });
});
