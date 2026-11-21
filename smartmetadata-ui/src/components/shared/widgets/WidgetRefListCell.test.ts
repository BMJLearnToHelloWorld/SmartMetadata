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
import type { OwnerOption } from '@/governance/catalogOptions';
import type { EntityRef } from '@/types/api';
import WidgetExpertsCell from './WidgetExpertsCell.vue';
import WidgetOwnersCell from './WidgetOwnersCell.vue';
import WidgetReviewerCell from './WidgetReviewerCell.vue';

const OPTIONS: OwnerOption[] = [
  { key: 'user:u1', id: 'u1', type: 'user', label: 'Alice' },
  { key: 'team:t1', id: 't1', type: 'team', label: 'Team A' },
];

const REFS: EntityRef[] = [
  { id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' },
  { id: 't1', type: 'team', name: 'team-a', displayName: 'Team A' },
];

type WrapperProps = Record<string, unknown>;

function mountCell(
  component: Parameters<typeof mount>[0],
  props: WrapperProps,
) {
  return mount(component, {
    attachTo: document.body,
    props: { options: OPTIONS, hasEditAccess: false, onChange: () => undefined, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetOwnersCell', () => {
  it('renders users and teams joined by commas, read-only without access', () => {
    const wrapper = mountCell(WidgetOwnersCell, { owners: REFS });
    expect(wrapper.text()).toContain('Alice, Team A');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an em dash when there are no owners', () => {
    const wrapper = mountCell(WidgetOwnersCell, { owners: [] });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('saves the picked users and teams through the modal', async () => {
    const onChange = vi.fn(() => Promise.resolve());
    const wrapper = mountCell(WidgetOwnersCell, { owners: REFS, hasEditAccess: true, onChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toEqual(['user:u1', 'team:t1']);
    await select.vm.$emit('change', ['user:u1']);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith([{ id: 'u1', type: 'user' }]);
    wrapper.unmount();
  });

  it('keeps the editor open when the save throws', async () => {
    const onChange = vi.fn(() => Promise.reject(new Error('save failed')));
    const wrapper = mountCell(WidgetOwnersCell, { owners: REFS, hasEditAccess: true, onChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });
});

describe('WidgetExpertsCell', () => {
  it('renders only users and offers only users in the picker', async () => {
    const wrapper = mountCell(WidgetExpertsCell, { experts: REFS, hasEditAccess: true });
    expect(wrapper.text()).toContain('Alice, Team A');
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('options')).toEqual([{ label: 'Alice', value: 'user:u1' }]);
    wrapper.unmount();
  });
});

describe('WidgetReviewerCell', () => {
  it('offers only users in the picker', async () => {
    const wrapper = mountCell(WidgetReviewerCell, { reviewers: REFS, hasEditAccess: true });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('options')).toEqual([{ label: 'Alice', value: 'user:u1' }]);
    wrapper.unmount();
  });
});
