/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TaskTagCell from './TaskTagCell.vue';
import type { AssetTagOption } from '@/types/governance';
import type { TagRef } from '@/types/api';

const TAGS: TagRef[] = [
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
  { tagFQN: 'PII.Generated', name: 'Generated', source: 'Classification', labelType: 'Generated', state: 'Confirmed' },
  { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
  { tagFQN: 'Orphan.Tag', name: 'Orphan', source: undefined, labelType: 'Manual', state: 'Confirmed' },
];

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'PII.Public', name: 'Public', source: 'Classification' },
  { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary' },
];

function mountCell(props: Record<string, unknown>) {
  return mount(TaskTagCell, {
    props: {
      tags: TAGS,
      source: 'Classification',
      options: OPTIONS,
      editable: false,
      testIdPrefix: 'task-tags',
      onChange: () => {},
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('TaskTagCell (pin TableTags via SchemaTagCell shape)', () => {
  it('renders only the source-matching tags, with a Generated badge on generated ones', () => {
    const wrapper = mountCell({ source: 'Classification', editable: false });
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.text()).toContain('Generated');
    expect(wrapper.text()).not.toContain('Term');
    // The generated tag carries the star badge.
    expect(wrapper.find('.asset-overview__generated-tag').exists()).toBe(true);
    wrapper.unmount();
  });

  it('treats a sourceless tag as Classification', () => {
    const wrapper = mountCell({ source: 'Classification', editable: false });
    expect(wrapper.text()).toContain('Orphan');
    const glossary = mountCell({ source: 'Glossary', editable: false });
    expect(glossary.text()).not.toContain('Orphan');
    wrapper.unmount();
    glossary.unmount();
  });

  it('renders a dash when no tag matches the source', () => {
    const wrapper = mountCell({ source: 'Glossary', tags: [], editable: false });
    expect(wrapper.text()).toBe('—');
    wrapper.unmount();
  });

  it('calls onChange with the full FQN list when the selection changes', async () => {
    const onChange = vi.fn();
    const wrapper = mountCell({ source: 'Classification', editable: true, onChange });
    const select = wrapper.findComponent({ name: 'ASelect' });
    expect(select.exists()).toBe(true);
    await (select.props('onChange') as (values: string[]) => void)(['PII.Sensitive', 'PII.Public']);
    expect(onChange).toHaveBeenCalledWith(['PII.Sensitive', 'PII.Public']);
    wrapper.unmount();
  });

  it('renders no select when read-only', async () => {
    const wrapper = mountCell({ source: 'Classification', editable: false, onChange: vi.fn() });
    expect(wrapper.findComponent({ name: 'ASelect' }).exists()).toBe(false);
    await flushPromises();
    wrapper.unmount();
  });
});
