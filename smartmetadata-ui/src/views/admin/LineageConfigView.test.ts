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
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { useShellConfigStore } from '@/stores/shellConfig';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import LineageConfigView from './LineageConfigView.vue';

const backMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: backMock }),
  // SmBreadcrumb imports the real RouterLink; the mount stubs it, but the
  // mock must export it or the import itself fails. The back() stub above
  // is what this mock exists for, so it stays.
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] },
}));

vi.mock('@/api/system', () => ({
  getTypedSetting: vi.fn(),
  settingAsLineage: (v: unknown) => v,
  updateSetting: vi.fn(),
}));

import { getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
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
            cancel: 'Cancel',
            fieldRequired: '{field} is required',
            minZero: '{field} must be at least {min}',
          },
        },
      },
    },
  });
  return mount(LineageConfigView, {
    global: {
      plugins: [i18n, Antd, pinia],
      stubs: {
        RouterLink: true,
      },
    },
  });
}

describe('LineageConfigView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    backMock.mockReset();
    getMock.mockReset();
    updateMock.mockReset();
    // Echo the sent value back as the PUT response, as updateSetting does
    // when the server returns no parseable setting.
    updateMock.mockImplementation(async (_type: string, value: unknown) => ({
      configType: 'lineageSettings',
      configValue: value,
    }));
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('saves a depth above 3: official validates min 0 only, with no upper bound', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 5,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'lineageSettings',
      expect.objectContaining({ upstreamDepth: 5, downstreamDepth: 2 }),
    );
  });

  it('saves depths at the official minimum 0', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 0,
      downstreamDepth: 0,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'lineageSettings',
      expect.objectContaining({ upstreamDepth: 0, downstreamDepth: 0 }),
    );
  });

  it('blocks save on a negative depth and shows the per-field error', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: -1,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Upstream depth must be at least 0');
  });

  it('maps missing depths to empty fields and blocks save as required', async () => {
    getMock.mockResolvedValue({
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    expect(
      (wrapper.find('input[data-testid="field-upstream"]').element as HTMLInputElement).value,
    ).toBe('');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Upstream depth is required');
  });

  it('toasts on load failure and keeps the form empty', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(message.error).toHaveBeenCalled();
    expect(
      (wrapper.find('input[data-testid="field-upstream"]').element as HTMLInputElement).value,
    ).toBe('');
  });

  it('uses root field ids and official test ids', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('input[data-testid="field-upstream"]').attributes('id')).toBe(
      'root/upstreamDepth',
    );
    expect(wrapper.find('[data-testid="field-lineage-layer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-pipeline-view-mode"]').exists()).toBe(true);
  });

  it('renders the resizable doc panel beside the form', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="resizable-panels"]').exists()).toBe(true);
    const docPanel = wrapper.findComponent(ServiceDocPanel);
    expect(docPanel.exists()).toBe(true);
    expect(docPanel.props('serviceName')).toBe('LineageConfiguration');
    expect(docPanel.props('serviceType')).toBe('OpenMetadata');
  });

  it('passes the focused field id to the doc panel', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('input[data-testid="field-upstream"]').trigger('focus');
    expect(wrapper.findComponent(ServiceDocPanel).props('activeField')).toBe(
      'root/upstreamDepth',
    );
  });

  it('navigates back on cancel', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 2,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="cancel-button"]').trigger('click');
    expect(backMock).toHaveBeenCalled();
  });

  it('refreshes the shell lineage slice after a successful save', async () => {
    getMock.mockResolvedValue({
      upstreamDepth: 2,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(useShellConfigStore().lineageSettings).toEqual({
      upstreamDepth: 2,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
  });
});

describe('LineageConfigView preserves settings the form does not edit', () => {
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
    await wrapper.find('input[data-testid="field-upstream"]').setValue(1);
    await wrapper.find('[data-testid="save-button"]').trigger('click');
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
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1]).toEqual(['lineageSettings', stored]);
  });

  it('does not save when the configuration never loaded', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
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
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('lineageSettings', {
      upstreamDepth: 2,
      downstreamDepth: 3,
      lineageLayer: 'EntityLineage',
      pipelineViewMode: 'Node',
    });
  });
});
