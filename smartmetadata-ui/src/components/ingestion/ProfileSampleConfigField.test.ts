/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { InputNumber, Select } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ProfileSampleConfigField, {
  type ProfileSampleConfigValue,
} from './ProfileSampleConfigField.vue';

/** Controlled harness: the field is controlled, so the parent feeds emits back. */
function mountField(initial?: ProfileSampleConfigValue) {
  const state = ref<ProfileSampleConfigValue | undefined>(initial);
  const harness = defineComponent({
    components: { ProfileSampleConfigField },
    setup() {
      return { state };
    },
    template: '<ProfileSampleConfigField v-model="state" />',
  });
  const wrapper = mount(harness, {
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, state };
}

function selectByTestId(wrapper: ReturnType<typeof mountField>['wrapper'], testId: string) {
  const found = wrapper
    .findAllComponents(Select)
    .find((candidate) => candidate.attributes('data-testid') === testId);
  expect(found, `${testId} select`).toBeTruthy();
  return found!;
}

function inputNumberByTestId(wrapper: ReturnType<typeof mountField>['wrapper'], testId: string) {
  // Antd InputNumber binds fallthrough attrs to its inner <input>, so
  // match the component by the input inside its subtree.
  const found = wrapper
    .findAllComponents(InputNumber)
    .find((candidate) => candidate.find(`input[data-testid="${testId}"]`).exists());
  expect(found, `${testId} input`).toBeTruthy();
  return found!;
}

describe('ProfileSampleConfigField (official ProfileSampleConfigField)', () => {
  it('defaults to dynamic with smart sampling on and no thresholds UI', async () => {
    const { wrapper, state } = mountField();
    await flushPromises();
    expect(wrapper.find('[data-testid="sample-config-type-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="smart-sampling-toggle-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-threshold-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profile-sample-input"]').exists()).toBe(false);
    expect(state.value).toBeUndefined();
  });

  it('emits no focus event when a control is focused (L-9: the focus mechanism is invented)', async () => {
    const { wrapper } = mountField();
    await flushPromises();
    await selectByTestId(wrapper, 'sample-config-type-select').trigger('focus');
    const field = wrapper.findComponent(ProfileSampleConfigField);
    expect(field.emitted('focus')).toBeUndefined();
  });

  it('resets the config when the type switches (pin pickConfigForType)', async () => {
    const { wrapper, state } = mountField({
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
    });
    await flushPromises();
    await selectByTestId(wrapper, 'sample-config-type-select').vm.$emit('change', 'DYNAMIC');
    await flushPromises();
    expect(state.value).toEqual({
      sampleConfigType: 'DYNAMIC',
      config: { smartSampling: true, thresholds: [] },
    });
    await selectByTestId(wrapper, 'sample-config-type-select').vm.$emit('change', 'STATIC');
    await flushPromises();
    expect(state.value).toEqual({ sampleConfigType: 'STATIC', config: {} });
  });

  it('edits the static fields and clamps the sample to 1 on blur', async () => {
    const { wrapper, state } = mountField({ sampleConfigType: 'STATIC', config: {} });
    await flushPromises();
    await inputNumberByTestId(wrapper, 'profile-sample-input').vm.$emit('update:value', 50);
    await selectByTestId(wrapper, 'profile-sample-type-select').vm.$emit('change', 'ROWS');
    await selectByTestId(wrapper, 'sampling-method-type-select').vm.$emit('change', 'SYSTEM');
    await flushPromises();
    expect(state.value?.config).toEqual({
      profileSample: 50,
      profileSampleType: 'ROWS',
      samplingMethodType: 'SYSTEM',
    });
    await inputNumberByTestId(wrapper, 'profile-sample-input').vm.$emit('update:value', 0);
    await inputNumberByTestId(wrapper, 'profile-sample-input').vm.$emit('blur');
    await flushPromises();
    expect(state.value?.config?.profileSample).toBe(1);
  });

  it('drops stale keys the current type does not own', async () => {
    const { wrapper, state } = mountField({
      sampleConfigType: 'DYNAMIC',
      config: {
        smartSampling: true,
        thresholds: [],
        profileSample: 50,
      } as ProfileSampleConfigValue['config'],
    });
    await flushPromises();
    await wrapper.find('[data-testid="smart-sampling-toggle-switch"]').trigger('click');
    await flushPromises();
    expect(state.value?.config).toEqual({ smartSampling: false, thresholds: [] });
  });

  it('switching Dynamic→Static with populated thresholds cleans to {} (Q-3)', async () => {
    const { wrapper, state } = mountField({
      sampleConfigType: 'DYNAMIC',
      config: {
        smartSampling: false,
        thresholds: [
          {
            rowCountThreshold: 500,
            profileSample: 25,
            profileSampleType: 'PERCENTAGE',
            samplingMethodType: 'BERNOULLI',
          },
        ],
      },
    });
    await flushPromises();
    await selectByTestId(wrapper, 'sample-config-type-select').vm.$emit('change', 'STATIC');
    await flushPromises();
    expect(state.value).toEqual({ sampleConfigType: 'STATIC', config: {} });
  });

  it('switching Static→Dynamic with populated static fields inits dynamic defaults (Q-3)', async () => {
    const { wrapper, state } = mountField({
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
    });
    await flushPromises();
    await selectByTestId(wrapper, 'sample-config-type-select').vm.$emit('change', 'DYNAMIC');
    await flushPromises();
    expect(state.value).toEqual({
      sampleConfigType: 'DYNAMIC',
      config: { smartSampling: true, thresholds: [] },
    });
  });

  it('renders a saved non-empty STATIC echo without dynamic fields (Q-3)', async () => {
    const initial: ProfileSampleConfigValue = {
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
    };
    const { wrapper, state } = mountField(initial);
    await flushPromises();
    expect(inputNumberByTestId(wrapper, 'profile-sample-input').props('value')).toBe(50);
    expect(selectByTestId(wrapper, 'profile-sample-type-select').props('value')).toBe('ROWS');
    expect(selectByTestId(wrapper, 'sampling-method-type-select').props('value')).toBe('SYSTEM');
    expect(wrapper.find('[data-testid="smart-sampling-toggle-switch"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-threshold-btn"]').exists()).toBe(false);
    // The field never writes back unprompted (pin parity): the echo
    // renders filtered, and the parent value is untouched until an edit.
    expect(state.value).toEqual(initial);
  });

  it('adds, edits, and removes thresholds when smart sampling is off', async () => {
    const { wrapper, state } = mountField({
      sampleConfigType: 'DYNAMIC',
      config: { smartSampling: false, thresholds: [] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="add-threshold-btn"]').trigger('click');
    await flushPromises();
    expect(state.value?.config?.thresholds).toEqual([{ rowCountThreshold: 1, profileSample: 100 }]);
    expect(wrapper.text()).toContain('Threshold 1');
    await inputNumberByTestId(wrapper, 'row-count-threshold-0').vm.$emit('update:value', 500);
    await inputNumberByTestId(wrapper, 'profile-sample-0').vm.$emit('update:value', 25);
    await selectByTestId(wrapper, 'profile-sample-type-0').vm.$emit('change', 'PERCENTAGE');
    await selectByTestId(wrapper, 'sampling-method-type-0').vm.$emit('change', 'BERNOULLI');
    await flushPromises();
    expect(state.value?.config?.thresholds).toEqual([
      {
        rowCountThreshold: 500,
        profileSample: 25,
        profileSampleType: 'PERCENTAGE',
        samplingMethodType: 'BERNOULLI',
      },
    ]);
    await wrapper.find('[data-testid="remove-threshold-0"]').trigger('click');
    await flushPromises();
    expect(state.value?.config?.thresholds).toEqual([]);
  });
});
