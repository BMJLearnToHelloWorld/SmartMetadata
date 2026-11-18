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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import LineageConfigView from './LineageConfigView.vue';

vi.mock('@/api/system', () => ({
  getTypedSetting: vi.fn(),
  settingAsLineage: (v: unknown) => v,
  updateSetting: vi.fn(),
}));

import { getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          back: 'Back',
          lineage: {
            title: 'Lineage configuration',
            lead: 'Lead',
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
            node: 'Node',
            edge: 'Edge',
            save: 'Save',
            rangeNote: 'Valid range is 0–3.',
            rangeInvalid: 'Depth must be an integer between 0 and 3.',
          },
        },
      },
    },
  });
  return mount(LineageConfigView, {
    global: {
      plugins: [i18n, Antd],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="lineage-config"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        RouterLink: true,
      },
    },
  });
}

describe('LineageConfigView depth range (Stage 8)', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    // Echo the sent value back as the PUT response, as updateSetting does
    // when the server returns no parseable setting.
    updateMock.mockImplementation(async (_type: string, value: unknown) => ({
      configType: 'lineageSettings',
      configValue: value,
    }));
  });

  it('refuses to save an out-of-range legacy depth instead of silently clamping it', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 5,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves depths at the official-minimum 0 and the product-maximum 3', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 0,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'lineageSettings',
      expect.objectContaining({ upstreamDepth: 0, downstreamDepth: 3 }),
    );
  });
});

describe('LineageConfigView preserves settings the form does not edit', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    // Echo the sent value back as the PUT response, as updateSetting does
    // when the server returns no parseable setting.
    updateMock.mockImplementation(async (_type: string, value: unknown) => ({
      configType: 'lineageSettings',
      configValue: value,
    }));
  });

  const stored = {
    upstreamDepth: 2,
    downstreamDepth: 3,
    lineageLayer: 'EntityLineage',
    pipelineViewMode: 'Node',
    graphPerformanceConfig: { enableCaching: false, cacheTTLSeconds: 300 },
  };

  it('keeps graphPerformanceConfig when a depth is edited and saved', async () => {
    getMock.mockResolvedValue(stored);
    const wrapper = mountView();
    await flushPromises();
    // Antd InputNumber binds the test id to its inner <input>.
    await wrapper.find('input[data-testid="lineage-upstream"]').setValue(1);
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('lineageSettings', {
      ...stored,
      upstreamDepth: 1,
    });
  });

  it('keeps graphPerformanceConfig across a second save without reloading', async () => {
    getMock.mockResolvedValue(stored);
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1]).toEqual(['lineageSettings', stored]);
  });

  it('does not save when the configuration never loaded', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sends exactly the four form fields when no performance config is stored', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="lineage-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('lineageSettings', {
      upstreamDepth: 2,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
  });
});
