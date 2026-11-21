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
import type { Domain } from '@/types/governance';
import type { EntityRef } from '@/types/api';
import WidgetDomainCell from './WidgetDomainCell.vue';

const OPTIONS: Domain[] = [
  { id: 'd1', name: 'finance', displayName: 'Finance', fullyQualifiedName: 'Finance', domainType: 'Aggregate', owners: [], experts: [], tags: [] },
  { id: 'd2', name: 'marketing', displayName: 'Marketing', fullyQualifiedName: 'Marketing', domainType: 'Aggregate', owners: [], experts: [], tags: [] },
];

const DOMAINS: EntityRef[] = [{ id: 'd1', type: 'domain', name: 'finance', displayName: 'Finance' }];

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(WidgetDomainCell, {
    attachTo: document.body,
    props: {
      domains: DOMAINS,
      options: OPTIONS,
      hasEditAccess: false,
      onChange: () => undefined,
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetDomainCell', () => {
  it('renders the domain names joined by commas, read-only without access', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Finance');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an em dash when there are no domains', () => {
    const wrapper = mountCell({ domains: [] });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('saves the picked domain ids', async () => {
    const onChange = vi.fn(() => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toEqual(['d1']);
    await select.vm.$emit('change', ['d1', 'd2']);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(['d1', 'd2']);
    wrapper.unmount();
  });

  it('asks for confirmation when the change moves linked assets', async () => {
    const onChange = vi.fn(() => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, assetCount: 3, onChange });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', ['d2']);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('3'));
    // Decline the confirm: the save must not run.
    const confirmButtons = [...document.querySelectorAll('.ant-modal-confirm .ant-btn')];
    const cancel = confirmButtons.find((button) => button.textContent?.includes('Cancel'));
    (cancel as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
