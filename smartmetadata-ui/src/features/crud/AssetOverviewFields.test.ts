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
import { StarOutlined } from '@ant-design/icons-vue';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail, TagRef } from '@/types/api';
import AssetOverviewFields from './AssetOverviewFields.vue';

function mountFields(tags: TagRef[]) {
  const asset: AssetDetail = {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags,
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
  };
  return mount(AssetOverviewFields, {
    props: { asset, entityType: 'table' },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AssetOverviewFields generated-tag badge', () => {
  it('renders a Generated tag as a distinct chip with name-only text', () => {
    const wrapper = mountFields([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
    ]);
    const chips = wrapper.findAll('.ant-tag');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.classes()).toContain('asset-overview__generated-tag');
    expect(chips[0]?.text().trim()).toBe('Email');
    expect(wrapper.findAllComponents(StarOutlined)).toHaveLength(1);
    wrapper.unmount();
  });

  it('badges a Glossary-sourced Generated tag: Generated overrides source', () => {
    const wrapper = mountFields([
      { tagFQN: 'Glossary.Customer', name: 'Customer', source: 'Glossary', labelType: 'Generated' },
    ]);
    const chips = wrapper.findAll('.ant-tag');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.classes()).toContain('asset-overview__generated-tag');
    expect(wrapper.findAllComponents(StarOutlined)).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders Manual, Derived, Automated, and unlabeled tags as plain chips', () => {
    const wrapper = mountFields([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual' },
      { tagFQN: 'PII.Derived', name: 'Derived', source: 'Classification', labelType: 'Derived' },
      { tagFQN: 'PII.Automated', name: 'Automated', source: 'Classification', labelType: 'Automated' },
      { tagFQN: 'PII.Legacy', name: 'Legacy', source: 'Classification' },
    ]);
    const chips = wrapper.findAll('.ant-tag');
    expect(chips).toHaveLength(4);
    for (const chip of chips) {
      expect(chip.classes()).not.toContain('asset-overview__generated-tag');
    }
    expect(wrapper.findAllComponents(StarOutlined)).toHaveLength(0);
    expect(chips.map((chip) => chip.text().trim())).toEqual(['Sensitive', 'Derived', 'Automated', 'Legacy']);
    wrapper.unmount();
  });

  it('badges only the Generated tag in a mixed list', () => {
    const wrapper = mountFields([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
      { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification', labelType: 'Propagated' },
    ]);
    const chips = wrapper.findAll('.ant-tag');
    expect(chips).toHaveLength(3);
    expect(chips[0]?.classes()).not.toContain('asset-overview__generated-tag');
    expect(chips[1]?.classes()).toContain('asset-overview__generated-tag');
    expect(chips[2]?.classes()).not.toContain('asset-overview__generated-tag');
    expect(wrapper.findAllComponents(StarOutlined)).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('AssetOverviewFields glossary-terms split (D-1)', () => {
  // Bordered Descriptions renders each row as a <tr> whose label cell
  // carries `.ant-descriptions-item-label` (there is no per-item wrapper).
  function findRow(wrapper: ReturnType<typeof mountFields>, label: string) {
    return wrapper
      .findAll('.ant-descriptions-row')
      .find((row) => row.find('.ant-descriptions-item-label').text().trim() === label);
  }

  it('renders Classification tags and Glossary terms in separate rows', () => {
    const wrapper = mountFields([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual' },
      { tagFQN: 'Glossary.Customer', name: 'Customer', source: 'Glossary', labelType: 'Manual' },
    ]);
    const tagsRow = findRow(wrapper, 'Tags');
    const termsRow = findRow(wrapper, 'Glossary Terms');
    expect(tagsRow?.text()).toContain('Sensitive');
    expect(tagsRow?.text()).not.toContain('Customer');
    expect(termsRow?.text()).toContain('Customer');
    expect(termsRow?.text()).not.toContain('Sensitive');
    wrapper.unmount();
  });

  it('shows an em dash in the glossary row when there are no terms', () => {
    const wrapper = mountFields([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual' },
    ]);
    expect(findRow(wrapper, 'Glossary Terms')?.text()).toContain('—');
    wrapper.unmount();
  });
});

describe('AssetOverviewFields data products row (D-2 batch 5b, pin DataProductsWidget read side)', () => {
  function mountWithProducts(dataProducts: AssetDetail['dataProducts']) {
    const asset: AssetDetail = {
      entityType: 'table',
      name: 'orders',
      fullyQualifiedName: 'svc.db.schema.orders',
      owners: [],
      tags: [],
      domains: [],
      dataProducts,
      schemaRows: [],
      schemaLabel: 'Columns',
    };
    return mount(AssetOverviewFields, {
      props: { asset, entityType: 'table' },
      global: { plugins: [Antd, createTestI18n()] },
    });
  }

  it('renders the data product names, preferring displayName', () => {
    const wrapper = mountWithProducts([
      { id: 'dp-1', name: 'sales-metrics', displayName: 'Sales Metrics', type: 'dataProduct' },
      { id: 'dp-2', name: 'orders-mart', type: 'dataProduct' },
    ]);
    expect(wrapper.text()).toContain('Data Products');
    expect(wrapper.text()).toContain('Sales Metrics');
    expect(wrapper.text()).toContain('orders-mart');
    wrapper.unmount();
  });

  it('renders an empty dash when the asset has no data products', () => {
    const wrapper = mountWithProducts([]);
    expect(wrapper.text()).toContain('Data Products');
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });
});
