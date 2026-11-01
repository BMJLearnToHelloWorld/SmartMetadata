/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createTestI18n } from '@/test/i18n';
import type { LineageGraphModel } from '@/lineage/graphModel';
import LineageImpactPanel from './LineageImpactPanel.vue';

function node(id: string, name: string): LineageGraphModel['nodes'][number] {
  return {
    id,
    entityType: 'table',
    name,
    displayName: name,
    fullyQualifiedName: `svc.db.schema.${name}`,
    isCenter: id === 'center',
    serviceName: 'svc',
    pathLabel: '',
    truncatedFqn: name,
    columns: [],
  };
}

const MODEL: LineageGraphModel = {
  centerId: 'center',
  nodes: [node('center', 'orders'), node('down', 'orders_mart')],
  edges: [
    {
      id: 'e1',
      source: 'center',
      target: 'down',
      label: '',
      columnMappings: [{ fromColumns: ['orders.id'], toColumn: 'orders_mart.id' }],
    },
  ],
  columnMappings: [],
  hasColumnLineage: true,
};

describe('LineageImpactPanel', () => {
  it('shows downstream entity rows from the model and an empty state with no model', () => {
    const wrapper = mount(LineageImpactPanel, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-impact-table"]').text()).toContain('orders_mart');

    const empty = mount(LineageImpactPanel, {
      props: { model: null },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(empty.find('[data-testid="lineage-impact-empty"]').exists()).toBe(true);
  });
});
