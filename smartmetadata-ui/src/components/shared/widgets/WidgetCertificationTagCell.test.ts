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
import { Select } from 'ant-design-vue';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { TagRef } from '@/types/api';
import type { TagLabelInput } from '@/governance/assetPatch';
import type { AssetTagOption } from '@/types/governance';
import WidgetCertificationTagCell from './WidgetCertificationTagCell.vue';

const TAGS: TagRef[] = [
  { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification', labelType: 'Manual' },
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' },
];

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification' },
  { tagFQN: 'Certification.Silver', name: 'Silver', source: 'Classification' },
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
];

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(WidgetCertificationTagCell, {
    attachTo: document.body,
    props: {
      tags: TAGS,
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

describe('WidgetCertificationTagCell', () => {
  it('renders the certification tag name, read-only without access', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Gold');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('replaces the old certification tag and keeps the other tags on save', async () => {
    const onTagsChange = vi.fn((_tags: TagLabelInput[]) => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onTagsChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toBe('Certification.Gold');
    await select.vm.$emit('change', 'Certification.Silver');
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onTagsChange).toHaveBeenCalled());
    const saved = onTagsChange.mock.calls[0][0];
    expect(saved.map((tag) => tag.tagFQN).sort()).toEqual(['Certification.Silver', 'PII.Email'].sort());
    wrapper.unmount();
  });
});
