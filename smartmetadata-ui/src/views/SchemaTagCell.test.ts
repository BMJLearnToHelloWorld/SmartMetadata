/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { Select, Tag } from 'ant-design-vue';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { SchemaRow } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';
import SchemaTagCell from './SchemaTagCell.vue';

const ROW: SchemaRow = {
  key: 'email',
  name: 'email',
  dataType: 'VARCHAR',
  fullyQualifiedName: 'svc.db.schema.orders.email',
  indexPath: [0],
  tags: [
    { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
    { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual' },
    { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual' },
  ],
};

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary' },
];

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(SchemaTagCell, {
    props: {
      row: ROW,
      source: 'Classification',
      options: OPTIONS,
      editable: false,
      onChange: () => undefined,
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('SchemaTagCell', () => {
  it('renders only this source tags as chips in read-only mode', () => {
    const wrapper = mountCell();
    const chips = wrapper.findAllComponents(Tag);
    expect(chips.map((chip) => chip.text().trim())).toEqual(['Email', 'Sensitive']);
    expect(wrapper.text()).not.toContain('Contact');
    wrapper.unmount();
  });

  it('badges a Generated tag with the distinct chip class', () => {
    const wrapper = mountCell();
    const chips = wrapper.findAllComponents(Tag);
    expect(chips[0]?.classes()).toContain('asset-overview__generated-tag');
    expect(chips[1]?.classes()).not.toContain('asset-overview__generated-tag');
    wrapper.unmount();
  });

  it('renders the glossary source alone in the Glossary column', () => {
    const wrapper = mountCell({ source: 'Glossary' });
    expect(wrapper.findAllComponents(Tag).map((chip) => chip.text().trim())).toEqual(['Contact']);
    wrapper.unmount();
  });

  it('shows an em dash when the source has no tags', () => {
    const wrapper = mountCell({
      row: { ...ROW, tags: [] },
      source: 'Glossary',
    });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('renders a sourceless tag in the Classification column (pin source default)', () => {
    const wrapper = mountCell({
      row: { ...ROW, tags: [{ tagFQN: 'PII.Legacy', name: 'Legacy' }] },
    });
    expect(wrapper.findAllComponents(Tag).map((chip) => chip.text().trim())).toEqual(['Legacy']);
    wrapper.unmount();
  });

  it('offers the edited source selection and reports changes in the editable mode', async () => {
    const onChange = vi.fn();
    const wrapper = mountCell({ editable: true, onChange });
    const select = wrapper.findComponent(Select);
    expect(select.exists()).toBe(true);
    expect(select.props('value')).toEqual(['PII.Email', 'PII.Sensitive']);
    await select.vm.$emit('change', ['PII.Sensitive']);
    expect(onChange).toHaveBeenCalledWith(['PII.Sensitive']);
    wrapper.unmount();
  });
});
