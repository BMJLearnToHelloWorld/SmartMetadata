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
import { ANNOUNCEMENT_TYPE_ORDER } from '@/utils/notifications/announcementUtils';
import AnnouncementTypeSelect from './AnnouncementTypeSelect.vue';

function mountSelect(value?: string) {
  return mount(AnnouncementTypeSelect, {
    props: { value: value as never },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AnnouncementTypeSelect', () => {
  it('offers the five types in the pin order', () => {
    const wrapper = mountSelect('Notice');
    const chips = wrapper.findAll('.ant-radio-wrapper');
    expect(chips.map((chip) => chip.attributes('data-testid'))).toEqual(
      ANNOUNCEMENT_TYPE_ORDER.map((type) => `announcement-type-${type}`),
    );
  });

  it('marks the current type selected', () => {
    const wrapper = mountSelect('Warning');
    const input = wrapper.find('input[value="Warning"]');
    expect((input.element as HTMLInputElement).checked).toBe(true);
  });

  it('emits the picked type', async () => {
    const wrapper = mountSelect('Notice');
    const input = wrapper.find('input[value="Critical"]');
    (input.element as HTMLInputElement).checked = true;
    await input.trigger('change');
    expect(wrapper.emitted('change')).toEqual([['Critical']]);
  });
});
