<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, InputNumber, Select, Typography } from 'ant-design-vue';
import ToggleField from '@/components/shared/ToggleField.vue';

/**
 * Port of official `ProfileSampleConfigField` (pin a3012259ca,
 * IngestionWorkflowForm/ProfileSampleConfigField.tsx): the dedicated
 * editor for the profiler pipeline's `profileSampleConfig`, registered
 * by `IngestionWorkflowForm` only for profiler pipelines. The generic
 * schema renderer must never render this field for profiler.
 *
 * Shape: `{ sampleConfigType: 'STATIC' | 'DYNAMIC', config: {...} }`.
 * The config keys depend on the type (official
 * `ProfileSampleConfigUtils.pickConfigForType`): static keeps
 * profileSample/profileSampleType/samplingMethodType; dynamic keeps
 * smartSampling/thresholds. Switching type resets the config (dynamic
 * seeds `{ smartSampling: true, thresholds: [] }`, static seeds `{}`).
 * `profileSample` clamps to a minimum of 1 on blur (official
 * `MIN_PROFILE_SAMPLE`).
 */
export interface ProfileSampleThreshold {
  rowCountThreshold?: number;
  profileSample?: number;
  profileSampleType?: string;
  samplingMethodType?: string;
}

export interface ProfileSampleConfigValue {
  sampleConfigType?: string;
  config?: {
    profileSample?: number;
    profileSampleType?: string;
    samplingMethodType?: string;
    smartSampling?: boolean;
    thresholds?: ProfileSampleThreshold[];
  };
}

const props = withDefaults(
  defineProps<{
    modelValue?: ProfileSampleConfigValue;
    disabled?: boolean;
  }>(),
  { modelValue: undefined, disabled: false },
);
const emit = defineEmits<{
  'update:modelValue': [value: ProfileSampleConfigValue];
}>();

const { t } = useI18n();

const MIN_PROFILE_SAMPLE = 1;
const DEFAULT_THRESHOLD: ProfileSampleThreshold = { rowCountThreshold: 1, profileSample: 100 };

const STATIC_CONFIG_KEYS = ['profileSample', 'profileSampleType', 'samplingMethodType'] as const;
const DYNAMIC_CONFIG_KEYS = ['smartSampling', 'thresholds'] as const;

/** Official `pickConfigForType`: keep only the keys the type owns. */
function pickConfigForType(
  config: ProfileSampleConfigValue['config'],
  type: string,
): NonNullable<ProfileSampleConfigValue['config']> {
  if (!config) {
    return {};
  }
  const allowed = type === 'STATIC' ? STATIC_CONFIG_KEYS : DYNAMIC_CONFIG_KEYS;
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (config[key] !== undefined) {
      result[key] = config[key];
    }
  }
  return result as NonNullable<ProfileSampleConfigValue['config']>;
}

const sampleConfigType = computed(() => props.modelValue?.sampleConfigType ?? 'DYNAMIC');
const config = computed(() => pickConfigForType(props.modelValue?.config, sampleConfigType.value));
const thresholds = computed(() => config.value.thresholds ?? []);
const smartSampling = computed(() => config.value.smartSampling ?? true);

const sampleConfigTypeOptions = computed(() => [
  { value: 'STATIC', label: t('ingestion.pipelines.profileSample.static') },
  { value: 'DYNAMIC', label: t('ingestion.pipelines.profileSample.dynamic') },
]);
const profileSampleTypeOptions = computed(() => [
  { value: 'PERCENTAGE', label: t('ingestion.pipelines.profileSample.percentage') },
  { value: 'ROWS', label: t('ingestion.pipelines.profileSample.rows') },
]);
// Official labels the sampling methods with the enum literals themselves.
const samplingMethodTypeOptions = [
  { value: 'BERNOULLI', label: 'BERNOULLI' },
  { value: 'SYSTEM', label: 'SYSTEM' },
];

function onConfigTypeChange(type: string): void {
  const newConfig = type === 'DYNAMIC' ? { smartSampling: true, thresholds: [] } : {};
  emit('update:modelValue', { sampleConfigType: type, config: newConfig });
}

function onStaticFieldChange(field: 'profileSample' | 'profileSampleType' | 'samplingMethodType', value: unknown): void {
  emit('update:modelValue', {
    sampleConfigType: sampleConfigType.value,
    config: { ...config.value, [field]: value },
  });
}

function onStaticSampleBlur(): void {
  const sample = config.value.profileSample;
  if (sample !== undefined && sample !== null && sample < MIN_PROFILE_SAMPLE) {
    onStaticFieldChange('profileSample', MIN_PROFILE_SAMPLE);
  }
}

function onSmartSamplingChange(value: boolean): void {
  emit('update:modelValue', {
    sampleConfigType: sampleConfigType.value,
    config: { ...config.value, smartSampling: value },
  });
}

function onThresholdChange(index: number, field: keyof ProfileSampleThreshold, value: unknown): void {
  const next = [...thresholds.value];
  next[index] = { ...next[index], [field]: value };
  emit('update:modelValue', {
    sampleConfigType: sampleConfigType.value,
    config: { ...config.value, thresholds: next },
  });
}

function onThresholdSampleBlur(index: number): void {
  const sample = thresholds.value[index]?.profileSample;
  if (sample !== undefined && sample < MIN_PROFILE_SAMPLE) {
    onThresholdChange(index, 'profileSample', MIN_PROFILE_SAMPLE);
  }
}

function onAddThreshold(): void {
  emit('update:modelValue', {
    sampleConfigType: sampleConfigType.value,
    config: { ...config.value, thresholds: [...thresholds.value, { ...DEFAULT_THRESHOLD }] },
  });
}

function onRemoveThreshold(index: number): void {
  emit('update:modelValue', {
    sampleConfigType: sampleConfigType.value,
    config: { ...config.value, thresholds: thresholds.value.filter((_, i) => i !== index) },
  });
}
</script>

<template>
  <div class="profile-sample-config-field">
    <div style="display: flex; flex-direction: column; gap: 8px">
      <Typography.Text>{{ t('ingestion.pipelines.profileSample.sampleConfigType') }}</Typography.Text>
      <Select
        :value="sampleConfigType"
        :disabled="disabled"
        :options="sampleConfigTypeOptions"
        data-testid="sample-config-type-select"
        style="width: 100%"
        @change="(value) => onConfigTypeChange(String(value))"
      />
    </div>

    <div v-if="sampleConfigType === 'STATIC'" style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px">
      <div style="display: flex; flex-direction: column; gap: 4px">
        <Typography.Text>{{ t('ingestion.pipelines.profileSample.sample') }}</Typography.Text>
        <InputNumber
          :value="config.profileSample ?? undefined"
          :disabled="disabled"
          data-testid="profile-sample-input"
          style="width: 100%"
          @update:value="(next) => onStaticFieldChange('profileSample', next === null ? undefined : next)"
          @blur="onStaticSampleBlur"
          />
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px">
        <Typography.Text>{{ t('ingestion.pipelines.profileSample.sampleType') }}</Typography.Text>
        <Select
          :value="config.profileSampleType ?? undefined"
          :disabled="disabled"
          :options="profileSampleTypeOptions"
          data-testid="profile-sample-type-select"
          style="width: 100%"
          @change="(value) => onStaticFieldChange('profileSampleType', value === undefined ? undefined : String(value))"
          />
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px">
        <Typography.Text>{{ t('ingestion.pipelines.profileSample.samplingMethodType') }}</Typography.Text>
        <Select
          :value="config.samplingMethodType ?? undefined"
          :disabled="disabled"
          :options="samplingMethodTypeOptions"
          data-testid="sampling-method-type-select"
          style="width: 100%"
          @change="(value) => onStaticFieldChange('samplingMethodType', value === undefined ? undefined : String(value))"
          />
      </div>
    </div>

    <div v-if="sampleConfigType === 'DYNAMIC'" style="margin-top: 16px">
      <ToggleField
        :model-value="smartSampling"
        :label="t('ingestion.pipelines.profileSample.smartSampling')"
        :description="`(${t('ingestion.pipelines.profileSample.smartSamplingHint')})`"
        :disabled="disabled"
        test-id="smart-sampling-toggle"
        @update:model-value="onSmartSamplingChange"
      />
      <template v-if="!smartSampling">
        <Typography.Text strong style="display: block; margin: 12px 0 8px">
          {{ t('ingestion.pipelines.profileSample.thresholds') }}
        </Typography.Text>
        <Card
          v-for="(threshold, index) in thresholds"
          :key="index"
          size="small"
          style="margin-bottom: 8px"
        >
          <template #title>
            {{ t('ingestion.pipelines.profileSample.threshold') }} {{ index + 1 }}
          </template>
          <template #extra>
            <Button
              type="text"
              danger
              :data-testid="`remove-threshold-${index}`"
              :disabled="disabled"
              @click="onRemoveThreshold(index)"
            >
              {{ t('crud.remove') }}
            </Button>
          </template>
          <div style="display: flex; flex-direction: column; gap: 12px">
            <div style="display: flex; flex-direction: column; gap: 4px">
              <Typography.Text>{{ t('ingestion.pipelines.profileSample.rowCountThreshold') }}</Typography.Text>
              <InputNumber
                :value="threshold.rowCountThreshold"
                :min="1"
                :disabled="disabled"
                :data-testid="`row-count-threshold-${index}`"
                style="width: 100%"
                @update:value="(next) => onThresholdChange(index, 'rowCountThreshold', next === null ? 1 : Number(next) || 1)"
                      />
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px">
              <Typography.Text>{{ t('ingestion.pipelines.profileSample.sample') }}</Typography.Text>
              <InputNumber
                :value="threshold.profileSample"
                :disabled="disabled"
                :data-testid="`profile-sample-${index}`"
                style="width: 100%"
                @update:value="(next) => onThresholdChange(index, 'profileSample', next === null ? 0 : Number(next) || 0)"
                @blur="onThresholdSampleBlur(index)"
                      />
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px">
              <Typography.Text>{{ t('ingestion.pipelines.profileSample.sampleType') }}</Typography.Text>
              <Select
                :value="threshold.profileSampleType ?? undefined"
                :disabled="disabled"
                :options="profileSampleTypeOptions"
                :data-testid="`profile-sample-type-${index}`"
                style="width: 100%"
                @change="(value) => onThresholdChange(index, 'profileSampleType', value === undefined ? undefined : String(value))"
                      />
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px">
              <Typography.Text>{{ t('ingestion.pipelines.profileSample.samplingMethodType') }}</Typography.Text>
              <Select
                :value="threshold.samplingMethodType ?? undefined"
                :disabled="disabled"
                :options="samplingMethodTypeOptions"
                :data-testid="`sampling-method-type-${index}`"
                style="width: 100%"
                @change="(value) => onThresholdChange(index, 'samplingMethodType', value === undefined ? undefined : String(value))"
                      />
            </div>
          </div>
        </Card>
        <Button data-testid="add-threshold-btn" :disabled="disabled" @click="onAddThreshold">
          {{ t('ingestion.pipelines.profileSample.addThreshold') }}
        </Button>
      </template>
    </div>
  </div>
</template>
