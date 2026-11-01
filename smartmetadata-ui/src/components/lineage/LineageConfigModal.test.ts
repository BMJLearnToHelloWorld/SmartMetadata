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
});
