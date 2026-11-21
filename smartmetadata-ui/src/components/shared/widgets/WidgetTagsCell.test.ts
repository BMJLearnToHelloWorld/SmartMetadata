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
import { Select, Tag } from 'ant-design-vue';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { TagRef } from '@/types/api';
import type { TagLabelInput } from '@/governance/assetPatch';
import type { AssetTagOption } from '@/types/governance';
import WidgetTagsCell from './WidgetTagsCell.vue';

const TAGS: TagRef[] = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' },
  { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification', labelType: 'Manual' },
  { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification', labelType: 'Manual' },
  { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Generated' },
];

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
  { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification' },
  { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary' },
  { tagFQN: 'Glossary.Address', name: 'Address', source: 'Glossary' },
];

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(WidgetTagsCell, {
    attachTo: document.body,
    props: {
      tags: TAGS,
      tagType: 'Classification',
      options: OPTIONS,
      hasEditAccess: false,
      onTagsChange: () => undefined,
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetTagsCell', () => {
  it('renders only this source non-tier labels as chips in read-only mode', () => {
    const wrapper = mountCell();
    expect(wrapper.findAllComponents(Tag).map((chip) => chip.text().trim())).toEqual(['Email']);
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-tag"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders only glossary labels for tagType Glossary', () => {
    const wrapper = mountCell({ tagType: 'Glossary' });
    expect(wrapper.findAllComponents(Tag).map((chip) => chip.text().trim())).toEqual(['Contact']);
    wrapper.unmount();
  });

  it('shows an em dash when the source has no labels', () => {
    const wrapper = mountCell({ tags: [] });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('shows the add button when editable and empty, the edit button when non-empty', () => {
    const empty = mountCell({ tags: [], hasEditAccess: true });
    expect(empty.find('[data-testid="add-tag"]').exists()).toBe(true);
    expect(empty.find('[data-testid="edit-button"]').exists()).toBe(false);
    empty.unmount();
    const filled = mountCell({ hasEditAccess: true });
    expect(filled.find('[data-testid="edit-button"]').exists()).toBe(true);
    expect(filled.find('[data-testid="add-tag"]').exists()).toBe(false);
    filled.unmount();
  });

  it('saves the full merged list: new selection plus tier, certification and other-source labels untouched', async () => {
    const onTagsChange = vi.fn((_tags: TagLabelInput[]) => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onTagsChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.exists()).toBe(true);
    expect(select.props('value')).toEqual(['PII.Email']);
    await select.vm.$emit('change', ['PII.Email', 'PII.Sensitive']);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onTagsChange).toHaveBeenCalled());
    const saved = onTagsChange.mock.calls[0][0];
    expect(saved.map((tag) => tag.tagFQN).sort()).toEqual(
      ['Certification.Gold', 'Glossary.Contact', 'PII.Email', 'PII.Sensitive', 'Tier.Tier1'].sort(),
    );
    wrapper.unmount();
  });

  it('keeps the editor open when the save throws', async () => {
    const onTagsChange = vi.fn(() => Promise.reject(new Error('save failed')));
    const wrapper = mountCell({ hasEditAccess: true, onTagsChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onTagsChange).toHaveBeenCalled());
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });
});
