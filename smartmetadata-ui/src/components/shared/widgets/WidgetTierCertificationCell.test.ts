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
import WidgetCertificationCell from './WidgetCertificationCell.vue';
import WidgetTierCell from './WidgetTierCell.vue';

const TAGS: TagRef[] = [
  { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification', labelType: 'Manual' },
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' },
];

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
  { tagFQN: 'Tier.Tier2', name: 'Tier2', source: 'Classification' },
  { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification' },
  { tagFQN: 'Certification.Silver', name: 'Silver', source: 'Classification' },
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetTierCell', () => {
  function mountCell(propsOverrides: Record<string, unknown> = {}) {
    return mount(WidgetTierCell, {
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

  it('renders the tier name, read-only without access', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Tier1');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('replaces the old tier and keeps the other tags on save', async () => {
    const onTagsChange = vi.fn((_tags: TagLabelInput[]) => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onTagsChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toBe('Tier.Tier1');
    await select.vm.$emit('change', 'Tier.Tier2');
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onTagsChange).toHaveBeenCalled());
    const saved = onTagsChange.mock.calls[0][0];
    expect(saved.map((tag) => tag.tagFQN).sort()).toEqual(['PII.Email', 'Tier.Tier2'].sort());
    wrapper.unmount();
  });

  it('clears the tier when the selection is cleared', async () => {
    const onTagsChange = vi.fn((_tags: TagLabelInput[]) => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onTagsChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', undefined);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onTagsChange).toHaveBeenCalled());
    const saved = onTagsChange.mock.calls[0][0];
    expect(saved.map((tag) => tag.tagFQN)).toEqual(['PII.Email']);
    wrapper.unmount();
  });
});

describe('WidgetCertificationCell', () => {
  function mountCell(propsOverrides: Record<string, unknown> = {}) {
    return mount(WidgetCertificationCell, {
      attachTo: document.body,
      props: {
        certificationTagFqn: 'Certification.Gold',
        options: OPTIONS,
        hasEditAccess: false,
        onChange: () => undefined,
        ...propsOverrides,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
  }

  it('renders the certification name, read-only without access', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Gold');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the new certification tag FQN and clears on empty selection', async () => {
    const onChange = vi.fn(() => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', 'Certification.Silver');
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('Certification.Silver'));
    wrapper.unmount();
  });
});
