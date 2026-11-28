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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import CustomPropertyTable from './CustomPropertyTable.vue';

const getMetadataTypeByName = vi.fn();

vi.mock('@/api/customProperties', async () => {
  const actual = await vi.importActual<typeof import('@/api/customProperties')>('@/api/customProperties');
  return {
    ...actual,
    getMetadataTypeByName: (...args: unknown[]) => getMetadataTypeByName(...args),
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  getMetadataTypeByName.mockReset();
});

function typeResponse() {
  return {
    name: 'table',
    customProperties: [
      { name: 'xName', displayName: 'xName', propertyType: 'string' },
    ],
  };
}

async function mountTable(props: Record<string, unknown> = {}) {
  const wrapper = mount(CustomPropertyTable, {
    props: {
      entityType: 'table',
      hasEditAccess: false,
      hasPermission: true,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('CustomPropertyTable', () => {
  it('renders the permission placeholder when the viewer cannot view custom fields', async () => {
    getMetadataTypeByName.mockResolvedValue(typeResponse());
    const wrapper = await mountTable({ hasPermission: false });
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-properties-card"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders read-only property rows in version view', async () => {
    getMetadataTypeByName.mockResolvedValue(typeResponse());
    const wrapper = await mountTable({
      isVersionView: true,
      entityDetails: { extension: { xName: 'Data Platform' } },
    });

    const row = wrapper.get('[data-testid="custom-property-xName-row"]');
    expect(row.get('[data-testid="property-value"]').text()).toBe('Data Platform');
    expect(wrapper.find('[data-testid="edit-icon"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-value-button"]').exists()).toBe(false);
    expect(getMetadataTypeByName).toHaveBeenCalledWith('table');
    wrapper.unmount();
  });

  it('marks newly added extension keys in version view', async () => {
    getMetadataTypeByName.mockResolvedValue({
      name: 'table',
      customProperties: [
        { name: 'tiers', displayName: 'tiers', propertyType: 'enum' },
        { name: 'owner', displayName: 'owner', propertyType: 'string' },
      ],
    });
    const wrapper = await mountTable({
      isVersionView: true,
      entityDetails: {
        extension: { tiers: ['gold', 'silver'], owner: 'Data Platform' },
        changeDescription: {
          fieldsAdded: [{ field: 'extension', newValue: JSON.stringify([{ tiers: ['gold', 'silver'] }]) }],
        },
      },
    });

    const tiers = wrapper.get('[data-testid="custom-property-tiers-row"] [data-testid="property-value"]');
    expect(tiers.get('.diff-added').text()).toBe('gold, silver');
    expect(
      wrapper.get('[data-testid="custom-property-owner-row"] [data-testid="property-value"]').text(),
    ).toBe('Data Platform');
    expect(
      wrapper.find('[data-testid="custom-property-owner-row"] [data-testid="property-value"] .diff-added').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it('shows the official empty placeholder when the type defines no properties and the version has no extension', async () => {
    getMetadataTypeByName.mockResolvedValue({ name: 'table', customProperties: [] });
    const wrapper = await mountTable({ isVersionView: true, entityDetails: {} });
    expect(wrapper.get('[data-testid="create-error-placeholder"]').text()).toContain(
      'No custom properties defined',
    );
    expect(wrapper.get('[data-testid="custom-property-read-docs"]').attributes('href')).toContain(
      'how-to-guides/guide-for-data-users/custom',
    );
    wrapper.unmount();
  });
});
