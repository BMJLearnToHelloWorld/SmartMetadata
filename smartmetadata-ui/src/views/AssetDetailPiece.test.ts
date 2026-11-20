/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail } from '@/types/api';
import AssetDetailPiece, {
  type AssetDetailPieceContext,
  type AssetDetailPieceId,
} from './AssetDetailPiece.vue';

function baseAsset(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

function mountPiece(
  piece: AssetDetailPieceId,
  asset: AssetDetail,
  extraContext: Partial<AssetDetailPieceContext> = {},
) {
  const context = {
    asset,
    entityType: 'table',
    onTableFqnClick: vi.fn(),
    ...extraContext,
  } as unknown as AssetDetailPieceContext;
  const wrapper = mount(AssetDetailPiece, {
    props: { piece, context },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onTableFqnClick: context.onTableFqnClick as unknown as ReturnType<typeof vi.fn> };
}

describe('AssetDetailPiece D-1 table widgets', () => {
  it('renders partition columns with -- for a missing interval type', () => {
    const { wrapper } = mountPiece(
      'partitionedKeys',
      baseAsset({
        tablePartition: {
          columns: [
            { columnName: 'ds', intervalType: 'TIME-UNIT' },
            { columnName: 'region' },
          ],
        },
      }),
    );
    expect(wrapper.find('[data-testid="asset-partitioned-keys-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ds');
    expect(wrapper.text()).toContain('TIME-UNIT');
    expect(wrapper.text()).toContain('region');
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });

  it('renders aliases by trailing name with the full FQN as the hover title', () => {
    const { wrapper } = mountPiece(
      'tableAliases',
      baseAsset({ aliases: ['svc.db.schema.orders_alias', 'svc.db.schema."my.tbl"'] }),
    );
    expect(wrapper.find('[data-testid="asset-table-aliases-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders_alias');
    // A quoted dotted name stays one segment (official Fqn.split rule).
    expect(wrapper.text()).toContain('my.tbl');
    const titled = wrapper.find('span[title="svc.db.schema.orders_alias"]');
    expect(titled.exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders constraint groups and navigates a foreign-key reference to its table', async () => {
    const { wrapper, onTableFqnClick } = mountPiece(
      'tableConstraints',
      baseAsset({
        tableConstraints: [
          { constraintType: 'PRIMARY_KEY', columns: ['id'] },
          {
            constraintType: 'FOREIGN_KEY',
            columns: ['customer_id'],
            referredColumns: ['svc.db.schema.customers.id'],
          },
        ],
      }),
    );
    expect(wrapper.find('[data-testid="PRIMARY_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Primary Key');
    expect(wrapper.text()).toContain('id');
    expect(wrapper.find('[data-testid="FOREIGN_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Foreign Key');
    const link = wrapper.find('[data-testid="FOREIGN_KEY-container"] a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('title')).toBe('svc.db.schema.customers.id');
    await link.trigger('click');
    expect(onTableFqnClick).toHaveBeenCalledWith('svc.db.schema.customers');
    wrapper.unmount();
  });

  it('renders referred columns as plain text when no table navigation is wired', () => {
    const { wrapper } = mountPiece(
      'tableConstraints',
      baseAsset({
        tableConstraints: [
          {
            constraintType: 'FOREIGN_KEY',
            columns: ['customer_id'],
            referredColumns: ['svc.db.schema.customers.id'],
          },
        ],
      }),
      { onTableFqnClick: undefined },
    );
    expect(wrapper.find('[data-testid="FOREIGN_KEY-container"] a').exists()).toBe(false);
    expect(wrapper.text()).toContain('svc.db.schema.customers.id');
    wrapper.unmount();
  });

  it('renders an empty state when the table has no constraints', () => {
    const { wrapper } = mountPiece('tableConstraints', baseAsset({ tableConstraints: [] }));
    expect(wrapper.find('[data-testid="asset-table-constraints-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
