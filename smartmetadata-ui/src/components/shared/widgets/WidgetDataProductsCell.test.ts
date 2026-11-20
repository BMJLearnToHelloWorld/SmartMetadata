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
import { listDataProducts } from '@/api/dataProducts';
import type { EntityRef } from '@/types/api';
import type { DataProduct } from '@/types/governance';
import WidgetDataProductsCell from './WidgetDataProductsCell.vue';

vi.mock('@/api/dataProducts', () => ({
  listDataProducts: vi.fn(),
}));

const mockedListDataProducts = vi.mocked(listDataProducts);

const PRODUCTS: DataProduct[] = [
  {
    id: 'dp1',
    name: 'sales',
    displayName: 'Sales',
    fullyQualifiedName: 'Sales',
    domains: [],
    owners: [],
    reviewers: [],
    experts: [],
    tags: [],
  },
  {
    id: 'dp2',
    name: 'marketing',
    displayName: 'Marketing',
    fullyQualifiedName: 'Marketing',
    domains: [],
    owners: [],
    reviewers: [],
    experts: [],
    tags: [],
  },
];

const DOMAINS: EntityRef[] = [{ id: 'd1', type: 'domain', name: 'finance', displayName: 'Finance' }];

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(WidgetDataProductsCell, {
    attachTo: document.body,
    props: {
      dataProducts: [{ id: 'dp1', type: 'dataProduct', name: 'sales', displayName: 'Sales' }],
      domains: DOMAINS,
      hasEditAccess: false,
      onSave: () => undefined,
      ...propsOverrides,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('WidgetDataProductsCell', () => {
  it('renders the data-product chips, read-only without access', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Sales');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an em dash when there are no data products and a domain is set', () => {
    const wrapper = mountCell({ dataProducts: [] });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('shows the select-domain message when empty, permitted and domainless', () => {
    const wrapper = mountCell({ dataProducts: [], domains: [], hasEditAccess: true });
    expect(wrapper.text()).toContain('Select a domain to add data products.');
    expect(wrapper.find('[data-testid="add-data-product"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads options on open and saves the picked products', async () => {
    mockedListDataProducts.mockResolvedValue({ data: PRODUCTS, total: 2 });
    const onSave = vi.fn((_products: EntityRef[]) => Promise.resolve());
    const wrapper = mountCell({ hasEditAccess: true, onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await vi.waitFor(() => expect(mockedListDataProducts).toHaveBeenCalledWith({ limit: 100 }));
    const select = wrapper.findComponent(Select);
    expect(select.props('options')).toEqual([
      { label: 'Sales', value: 'dp1' },
      { label: 'Marketing', value: 'dp2' },
    ]);
    await select.vm.$emit('change', ['dp1', 'dp2']);
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.map((product) => product.id)).toEqual(['dp1', 'dp2']);
    wrapper.unmount();
  });

  it('keeps the editor open when the save throws', async () => {
    mockedListDataProducts.mockResolvedValue({ data: PRODUCTS, total: 2 });
    const onSave = vi.fn(() => Promise.reject(new Error('save failed')));
    const wrapper = mountCell({ hasEditAccess: true, onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await vi.waitFor(() => expect(mockedListDataProducts).toHaveBeenCalled());
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });
});
