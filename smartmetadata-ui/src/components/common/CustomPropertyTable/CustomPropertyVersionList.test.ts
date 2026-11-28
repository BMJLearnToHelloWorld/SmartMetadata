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
import { createTestI18n } from '@/test/i18n';
import type { CustomPropertyDef } from '@/types/collaboration';
import CustomPropertyVersionList from './CustomPropertyVersionList.vue';

function createProperty(name: string, typeName: string): CustomPropertyDef {
  return { name, displayName: name, description: '', propertyType: typeName };
}

const properties = [
  createProperty('owner', 'string'),
  createProperty('tiers', 'enum'),
  createProperty('docs', 'hyperlink-cp'),
  createProperty('cost', 'integer'),
];

function mountList(props: Record<string, unknown> = {}) {
  return mount(CustomPropertyVersionList, {
    props: { properties, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function getValue(wrapper: ReturnType<typeof mountList>, propertyName: string) {
  return wrapper.get(`[data-testid="custom-property-${propertyName}-row"] [data-testid="property-value"]`);
}

describe('CustomPropertyVersionList', () => {
  it('renders every property as a read-only row', () => {
    const wrapper = mountList({ extension: { owner: 'Data Platform' } });

    expect(wrapper.find('[data-testid="custom-properties-card"]').exists()).toBe(true);
    expect(wrapper.findAll('li')).toHaveLength(4);
    expect(wrapper.find('[data-testid="edit-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders string values, including diff markup, through the previewer', () => {
    const wrapper = mountList({
      extension: {
        owner: 'Data Platform',
        docs: '<span class="diff-added">https://docs.example.com</span>',
      },
    });

    expect(getValue(wrapper, 'owner').text()).toBe('Data Platform');
    // A hyperlink diff is a string, not a { url } object: it must still
    // render instead of reading as "not set".
    expect(
      getValue(wrapper, 'docs').get('[data-testid="rich-text-previewer"]').text(),
    ).toBe('https://docs.example.com');
    wrapper.unmount();
  });

  it('summarises structured values and marks added properties', () => {
    const wrapper = mountList({
      addedKeys: ['tiers'],
      extension: { tiers: ['gold', 'silver'] },
    });

    const tiers = getValue(wrapper, 'tiers');
    expect(tiers.text()).toBe('gold, silver');
    expect(tiers.get('.diff-added').text()).toBe('gold, silver');
    expect(tiers.get('.diff-added').classes()).toContain('diff-added');
    wrapper.unmount();
  });

  it('shows "not set" for properties without a value', () => {
    const wrapper = mountList();
    expect(getValue(wrapper, 'cost').text()).toBe('Not set');
    wrapper.unmount();
  });
});
