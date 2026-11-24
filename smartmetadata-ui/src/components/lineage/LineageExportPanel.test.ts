/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { LineageGraphModel } from '@/lineage/graphModel';
import LineageExportPanel from './LineageExportPanel.vue';

const MODEL = {
  centerId: 'center-id',
  nodes: [
    {
      id: 'center-id',
      entityType: 'table',
      name: 'orders',
      displayName: 'Orders',
      fullyQualifiedName: 'svc.db.schema.orders',
      isCenter: true,
      serviceName: 'svc',
      pathLabel: 'svc / db / schema',
      truncatedFqn: 'svc.db.schema.orders',
      columns: [],
    },
  ],
  edges: [],
  hasColumnLineage: false,
  columnMappings: [],
} as unknown as LineageGraphModel;

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(LineageExportPanel, {
    props: {
      model: MODEL,
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      pngAvailable: true,
      onExportPng: vi.fn(async () => undefined),
      onExportCsv: vi.fn(async () => undefined),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('LineageExportPanel (L3)', () => {
  it('calls the async CSV export instead of building a client CSV', async () => {
    const onExportCsv = vi.fn(async () => undefined);
    const wrapper = mountPanel({ onExportCsv });
    await wrapper.find('[data-testid="lineage-export-csv"]').trigger('click');
    expect(onExportCsv).toHaveBeenCalledTimes(1);
  });

  it('disables CSV on an empty graph and shows the empty hint', () => {
    const wrapper = mountPanel({ model: null });
    expect(wrapper.find('[data-testid="lineage-export-csv"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="lineage-export-empty"]').exists()).toBe(true);
  });

  it('still exports PNG through the provided callback', async () => {
    const onExportPng = vi.fn(async () => undefined);
    const wrapper = mountPanel({ onExportPng });
    await wrapper.find('[data-testid="lineage-export-png"]').trigger('click');
    expect(onExportPng).toHaveBeenCalledTimes(1);
  });

  it('hides the PNG button when showPngButton is false and keeps CSV', () => {
    const wrapper = mountPanel({ showPngButton: false });
    expect(wrapper.find('[data-testid="lineage-export-png"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-export-csv"]').exists()).toBe(true);
  });
});
