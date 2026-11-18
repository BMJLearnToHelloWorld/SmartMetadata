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
import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import DataQualityDimensionsView from './DataQualityDimensionsView.vue';

vi.mock('@/api/dataQualityDimensions', () => ({
  createDataQualityDimension: vi.fn(),
  deleteDataQualityDimension: vi.fn(),
  getDataQualityDimensionTestCaseCounts: vi.fn(),
  getDataQualityDimensionTestDefinitionCounts: vi.fn(),
  listDataQualityDimensions: vi.fn(),
  patchDataQualityDimension: vi.fn(),
}));

import {
  createDataQualityDimension,
  deleteDataQualityDimension,
  getDataQualityDimensionTestCaseCounts,
  getDataQualityDimensionTestDefinitionCounts,
  listDataQualityDimensions,
  patchDataQualityDimension,
} from '@/api/dataQualityDimensions';

const listMock = listDataQualityDimensions as unknown as ReturnType<typeof vi.fn>;
const caseCountsMock = getDataQualityDimensionTestCaseCounts as unknown as ReturnType<
  typeof vi.fn
>;
const definitionCountsMock =
  getDataQualityDimensionTestDefinitionCounts as unknown as ReturnType<typeof vi.fn>;
const createMock = createDataQualityDimension as unknown as ReturnType<typeof vi.fn>;
const patchMock = patchDataQualityDimension as unknown as ReturnType<typeof vi.fn>;
const deleteMock = deleteDataQualityDimension as unknown as ReturnType<typeof vi.fn>;

const DIMENSIONS = [
  {
    id: 'd1',
    name: 'Accuracy',
    displayName: 'Accuracy Display',
    description: 'Measures accuracy',
    style: { color: '#2E90FA' },
    provider: 'system',
  },
  {
    id: 'd2',
    name: 'custom-dim',
    displayName: undefined,
    description: undefined,
    style: {},
    provider: 'user',
  },
];

function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        label: {
          'no-description': 'No description',
          entity: 'entity',
          'doc-plural-lowercase': 'docs',
          documentation: 'Documentation',
        },
        message: {
          'adding-new-entity-is-easy-just-give-it-a-spin':
            'Adding a new {entity} is easy, just give it a spin',
          'refer-to-our-doc': 'Refer to our {doc}',
          'check-spelling-or-try-shorter-term': 'Check spelling or try a shorter term',
        },
        settings: {
          dqDimensions: {
            title: 'Data Quality',
            lead: 'Lead',
            loadFailed: 'Fetch failed',
            saveFailed: 'Save failed',
            deleteFailed: 'Delete failed',
            dimension: 'Dimension',
            description: 'Description',
            type: 'Type',
            testCases: 'Test Cases',
            actions: 'Actions',
            name: 'Name',
            displayName: 'Display Name',
            system: 'System',
            custom: 'Custom',
            systemReadOnly: 'System dimensions are read-only',
            editDimension: 'Edit Dimension',
            deleteDimension: 'Delete Dimension',
            addDimension: 'Add Dimension',
            searchPlaceholder: 'Search dimensions',
            createDimension: 'Create Dimension',
            fieldRequired: 'Field {field} is required',
            nameInvalid: 'Name is invalid',
            nameFixedHint: 'Name is fixed after creation',
            nameHelp: 'Name help',
            displayNameHelp: 'Display name help',
            descriptionPlaceholder: 'Description placeholder',
            color: 'Color',
            preview: 'Preview',
            aboutDimensions: 'About dimensions',
            cancel: 'Cancel',
            save: 'Save',
            create: 'Create',
            updated: '{entity} updated',
            created: '{entity} created',
            deleted: '{entity} deleted',
            delete: 'Delete',
            deleteConfirmation: 'Are you sure you want to delete this dimension?',
            impactUnknown: 'Impact is unknown',
            inUseCount: '{count} test cases use this dimension',
            deleteFallback: ' They will fall back.',
            inUseTestDefinitionCount: '{count} test definitions use this dimension',
            deleteTestDefinitionFallback: ' They will be cleared.',
            colorDarkBlue: 'Dark Blue',
            colorBlue: 'Blue',
            colorGreen: 'Green',
            colorYellow: 'Yellow',
            colorOrange: 'Orange',
            colorRed: 'Red',
            colorViolet: 'Violet',
            colorPurple: 'Purple',
            colorPink: 'Pink',
            colorTeal: 'Teal',
            colorGray: 'Gray',
          },
        },
      },
    },
  });
  return mount(DataQualityDimensionsView, {
    global: {
      plugins: [i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="dq-dimensions"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
      },
    },
  });
}

function setBodyInput(testId: string, value: string): void {
  const input = document.body.querySelector(
    `[data-testid="${testId}"]`,
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: DIMENSIONS, paging: {} });
  caseCountsMock.mockResolvedValue({ d1: 3 });
  definitionCountsMock.mockResolvedValue({ d1: 2, d2: 0 });
  createMock.mockResolvedValue({});
  patchMock.mockResolvedValue({});
  deleteMock.mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DataQualityDimensionsView list', () => {
  it('renders dimension cells, badges, counts, and -- for unknown counts', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(listMock).toHaveBeenCalledWith({ limit: 1000 });
    const accuracy = wrapper.find('[data-testid="dimension-Accuracy"]');
    expect(accuracy.text()).toContain('Accuracy Display');
    expect(accuracy.text()).toContain('Accuracy');
    expect(wrapper.text()).toContain('Measures accuracy');
    expect(wrapper.text()).toContain('System');
    expect(wrapper.text()).toContain('Custom');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('3');
    expect(rows[1].text()).toContain('--');
  });

  it('shows -- when a count request fails instead of hiding the list', async () => {
    caseCountsMock.mockRejectedValue(new Error('counts down'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('--');
  });

  it('toasts when the list request fails', async () => {
    listMock.mockRejectedValue(new Error('list down'));
    const errorSpy = vi.spyOn(message, 'error');
    mountView();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('list down');
    errorSpy.mockRestore();
  });

  it('has no Refresh button', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="dq-dimensions-refresh"]').exists()).toBe(false);
  });

  it('disables actions on system rows', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="edit-Accuracy"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="delete-Accuracy"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="edit-custom-dim"]').attributes('disabled')).toBeUndefined();
  });

  it('filters by search term across name, display name, and description', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="search-dimensions"]').setValue('accuracy');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.find('[data-testid="dimension-Accuracy"]').exists()).toBe(true);
  });

  it('shows the no-search-results placeholder when the search matches nothing', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="search-dimensions"]').setValue('zzz-no-match');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="search-error-placeholder"]').exists()).toBe(true);
  });

  it('shows the create placeholder with an Add entry when the list is empty', async () => {
    listMock.mockResolvedValue({ data: [], paging: {} });
    const wrapper = mountView();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="create-error-placeholder-Dimension"]').exists(),
    ).toBe(true);
    await wrapper.find('[data-testid="add-placeholder-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="dimension-name"]')).not.toBeNull();
  });
});

describe('DataQualityDimensionsView drawer', () => {
  it('creates a dimension with the palette default and dropped empty optionals', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-dimension"]').trigger('click');
    await wrapper.vm.$nextTick();
    setBodyInput('dimension-name', 'new-dim');
    const saveButton = document.body.querySelector(
      '[data-testid="save-dimension"]',
    ) as HTMLButtonElement;
    saveButton.click();
    await flushPromises();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      name: 'new-dim',
      displayName: undefined,
      description: undefined,
      style: { color: '#175CD3' },
    });
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('requires a valid name before creating', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-dimension"]').trigger('click');
    await wrapper.vm.$nextTick();
    const saveButton = document.body.querySelector(
      '[data-testid="save-dimension"]',
    ) as HTMLButtonElement;
    saveButton.click();
    await flushPromises();
    expect(createMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Field Name is required');
    setBodyInput('dimension-name', 'bad name!');
    saveButton.click();
    await flushPromises();
    expect(createMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Name is invalid');
  });

  it('edits through a JSON patch with only the changed paths', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-custom-dim"]').trigger('click');
    await wrapper.vm.$nextTick();
    const nameInput = document.body.querySelector(
      '[data-testid="dimension-name"]',
    ) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    setBodyInput('dimension-display-name', 'Custom Display');
    const swatch = document.body.querySelector(
      '[data-testid="color-#2E90FA"]',
    ) as HTMLButtonElement;
    swatch.click();
    await wrapper.vm.$nextTick();
    expect(swatch.getAttribute('aria-checked')).toBe('true');
    const saveButton = document.body.querySelector(
      '[data-testid="save-dimension"]',
    ) as HTMLButtonElement;
    saveButton.click();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledTimes(1);
    const [id, ops] = patchMock.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(id).toBe('d2');
    expect(ops).toContainEqual({ op: 'replace', path: '/displayName', value: 'Custom Display' });
    expect(ops).toContainEqual({ op: 'add', path: '/style/color', value: '#2E90FA' });
  });

  it('removes a cleared display name on edit', async () => {
    listMock.mockResolvedValue({
      data: [
        {
          id: 'd3',
          name: 'editable',
          displayName: 'Old Name',
          description: 'd',
          style: { color: '#175CD3' },
          provider: 'user',
        },
      ],
      paging: {},
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-editable"]').trigger('click');
    await wrapper.vm.$nextTick();
    setBodyInput('dimension-display-name', '');
    const saveButton = document.body.querySelector(
      '[data-testid="save-dimension"]',
    ) as HTMLButtonElement;
    saveButton.click();
    await flushPromises();
    expect(patchMock).toHaveBeenCalledTimes(1);
    const [, ops] = patchMock.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(ops).toContainEqual({ op: 'remove', path: '/displayName' });
  });
});

describe('DataQualityDimensionsView delete', () => {
  it('confirms with both in-use counts and deletes', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="delete-custom-dim"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('Are you sure you want to delete');
    expect(document.body.textContent).toContain('Impact is unknown');
    const okButton = document.body.querySelector(
      '.ant-modal-footer .ant-btn-dangerous',
    ) as HTMLButtonElement;
    okButton.click();
    await flushPromises();
    expect(deleteMock).toHaveBeenCalledWith('d2');
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('reports both counts when they loaded', async () => {
    caseCountsMock.mockResolvedValue({ d2: 4 });
    definitionCountsMock.mockResolvedValue({ d2: 1 });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="delete-custom-dim"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('4 test cases use this dimension');
    expect(document.body.textContent).toContain('1 test definitions use this dimension');
    expect(document.body.textContent).not.toContain('Impact is unknown');
  });
});
