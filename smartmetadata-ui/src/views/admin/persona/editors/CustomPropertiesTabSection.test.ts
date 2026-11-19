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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCustomProperties } from '@/api/customProperties';
import { createTestI18n } from '@/test/i18n';
import type { CustomPropertyDef } from '@/types/collaboration';
import CustomPropertiesTabSection from './CustomPropertiesTabSection.vue';
import type { CustomPropertyLayoutItem } from './customPropertiesLayout';

vi.mock('@/api/customProperties', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/customProperties')>()),
  listCustomProperties: vi.fn(),
}));

const mockedList = vi.mocked(listCustomProperties);

function def(name: string, propertyType = 'string'): CustomPropertyDef {
  return { name, propertyType };
}

async function mountSection(props: {
  entityType?: string;
  propertyLayout: CustomPropertyLayoutItem[];
}) {
  const wrapper = mount(CustomPropertiesTabSection, {
    global: { plugins: [Antd, createTestI18n()] },
    props,
  });
  await flushPromises();
  return wrapper;
}

describe('CustomPropertiesTabSection (R-EDIT-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the entity definitions and merges them with the stored layout', async () => {
    mockedList.mockResolvedValue([
      def('a'),
      def('b', 'markdown'),
      def('c'),
    ]);
    const wrapper = await mountSection({
      entityType: 'table',
      propertyLayout: [
        { name: 'c', width: 'full' },
        { name: 'a', width: 'half' },
      ],
    });
    expect(mockedList).toHaveBeenCalledWith('table');
    // Stored order first (c, a), then the missing definition (b) with
    // its default width — markdown is wide, so full.
    const rows = wrapper.findAll('[data-testid^="custom-property-layout-item-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
      'custom-property-layout-item-c',
      'custom-property-layout-item-a',
      'custom-property-layout-item-b',
    ]);
    expect(wrapper.text()).toContain('Drag a card to move it');
  });

  it('shows the official empty message when the entity type has no definitions', async () => {
    mockedList.mockResolvedValue([]);
    const wrapper = await mountSection({ entityType: 'table', propertyLayout: [] });
    expect(wrapper.text()).toContain('No custom properties defined for this entity type yet');
    expect(
      wrapper.find('[data-testid="custom-properties-tab-layout"]').exists(),
    ).toBe(true);
  });

  it('fetches nothing and shows the empty message without an entity type', async () => {
    const wrapper = await mountSection({ propertyLayout: [] });
    expect(mockedList).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('No custom properties defined for this entity type yet');
  });

  it('treats a failed read as no definitions, never a stale list', async () => {
    mockedList.mockRejectedValue(new Error('boom'));
    const wrapper = await mountSection({ entityType: 'table', propertyLayout: [] });
    expect(wrapper.text()).toContain('No custom properties defined for this entity type yet');
  });

  it('emits the full derived layout when a row is removed', async () => {
    mockedList.mockResolvedValue([def('a'), def('b')]);
    const wrapper = await mountSection({
      entityType: 'table',
      propertyLayout: [{ name: 'a', width: 'half' }],
    });
    await wrapper.get('[data-testid="custom-property-layout-remove-a"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('change')).toEqual([[[{ name: 'b', width: 'half' }]]]);
  });
});
