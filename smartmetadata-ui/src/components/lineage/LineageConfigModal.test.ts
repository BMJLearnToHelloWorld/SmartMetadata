/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createTestI18n } from '@/test/i18n';
import { DEFAULT_LINEAGE_CANVAS_CONFIG } from '@/lineage/config';
import LineageConfigModal from './LineageConfigModal.vue';

describe('LineageConfigModal', () => {
  it('renders the official config fields in the shared form modal', async () => {
    const wrapper = mount(LineageConfigModal, {
      props: { open: true, config: { ...DEFAULT_LINEAGE_CANVAS_CONFIG } },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.body.innerHTML).toContain('lineage-config-upstream');
    expect(document.body.innerHTML).toContain('lineage-config-nodes-per-layer');
    expect(document.body.innerHTML).toContain('lineage-config-nodes-residual');
    wrapper.unmount();
  });

  it('exposes only the official modal fields: depths + nodes per layer, no layer or pipeline mode', async () => {
    const wrapper = mount(LineageConfigModal, {
      props: { open: true, config: { ...DEFAULT_LINEAGE_CANVAS_CONFIG } },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.body.innerHTML).toContain('lineage-config-downstream');
    expect(document.body.innerHTML).not.toContain('lineage-config-layer');
    expect(document.body.innerHTML).not.toContain('lineage-config-pipeline-mode');
    expect(document.body.innerHTML).not.toContain('lineage-config-layer-residual');
    wrapper.unmount();
  });

  it('preserves layer and pipeline view mode from the incoming config on save', async () => {
    const wrapper = mount(LineageConfigModal, {
      props: {
        open: true,
        config: {
          ...DEFAULT_LINEAGE_CANVAS_CONFIG,
          layer: 'ColumnLevelLineage',
          pipelineViewMode: 'Edge',
        },
      },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const okButton = document.body.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const emitted = wrapper.emitted('ok');
    expect(emitted?.[0]?.[0]).toMatchObject({
      layer: 'ColumnLevelLineage',
      pipelineViewMode: 'Edge',
    });
    wrapper.unmount();
  });
});
