/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import LineageSettingsSection from './LineageSettingsSection.vue';

vi.mock('@/api/system', () => ({
  getTypedSetting: vi.fn(),
  settingAsLineage: (v: unknown) => v,
  updateSetting: vi.fn(),
}));

import { getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

const STORED = {
  upstreamDepth: 2,
  downstreamDepth: 1,
  lineageLayer: 'EntityLineage',
  pipelineViewMode: 'Node',
  graphPerformanceConfig: { maxNodesPerLayer: 50 },
};

function mountSection() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        label: { edit: 'Edit' },
        settings: {
          lineage: {
            title: 'Lineage configuration',
            description: 'Lineage defaults.',
            loadFailed: 'load fail',
            saved: 'saved',
            saveFailed: 'save fail',
            upstream: 'Upstream depth',
            downstream: 'Downstream depth',
            layer: 'Lineage layer',
            entityLineage: 'Entity lineage',
            columnLineage: 'Column-level lineage',
            dataObservability: 'Data observability',
            pipelineMode: 'Pipeline view mode',
            rangeNote: 'Valid range is 0–3.',
            node: 'Node',
            edge: 'Edge',
            save: 'Save',
            cancel: 'Cancel',
            fieldRequired: '{field} is required',
            minZero: '{field} must be at least {min}',
          },
        },
      },
    },
  });
  return mount(LineageSettingsSection, {
    global: { plugins: [i18n, Antd, pinia] },
  });
}

describe('LineageSettingsSection (D-CFG-3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getMock.mockReset();
    updateMock.mockReset();
    updateMock.mockImplementation(async (_type: string, value: unknown) => ({
      configType: 'lineageSettings',
      configValue: value,
    }));
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('renders the pin four-row summary and hides Edit until the config loads', async () => {
    getMock.mockResolvedValue(STORED);
    const wrapper = mountSection();
    await flushPromises();
    expect(wrapper.find('[data-testid="upstream-depth-value"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="downstream-depth-value"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="lineage-layer-value"]').text()).toBe('Entity lineage');
    expect(wrapper.find('[data-testid="pipeline-view-mode-value"]').text()).toBe('Node');
    expect(wrapper.find('[data-testid="platform-lineage-edit"]').exists()).toBe(true);
  });

  it('edits and saves with the stored config spread (graphPerformanceConfig survives)', async () => {
    getMock.mockResolvedValue(STORED);
    const wrapper = mountSection();
    await flushPromises();
    await wrapper.find('[data-testid="platform-lineage-edit"]').trigger('click');
    await wrapper.find('[data-testid="platform-lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'lineageSettings',
      expect.objectContaining({
        upstreamDepth: 2,
        downstreamDepth: 1,
        lineageLayer: 'EntityLineage',
        pipelineViewMode: 'Node',
        graphPerformanceConfig: { maxNodesPerLayer: 50 },
      }),
    );
    expect(wrapper.find('[data-testid="platform-lineage-form"]').exists()).toBe(false);
  });

  it('does not save while the stored config failed to load', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountSection();
    await flushPromises();
    expect(wrapper.find('[data-testid="platform-lineage-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="platform-lineage-edit"]').exists()).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
