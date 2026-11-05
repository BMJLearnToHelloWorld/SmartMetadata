<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select, Space } from 'ant-design-vue';
import {
  LINEAGE_TIME_PRESETS,
  isLineageDateString,
  type LineageTimePreset,
} from '@/lineage/config';

const props = defineProps<{
  value: LineageTimePreset;
  customStartDate?: string;
  customEndDate?: string;
  pointDate?: string;
}>();

const emit = defineEmits<{
  change: [preset: LineageTimePreset];
  applyCustom: [dates: { startDate: string; endDate: string }];
  applyPoint: [date: string];
}>();

const { t } = useI18n();
const options = LINEAGE_TIME_PRESETS.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
  disabled: !item.supported,
}));

const startInput = ref(props.customStartDate ?? '');
const endInput = ref(props.customEndDate ?? '');
const pointInput = ref(props.pointDate ?? '');

watch(
  () => props.customStartDate,
  (value) => {
    startInput.value = value ?? '';
  },
);
watch(
  () => props.customEndDate,
  (value) => {
    endInput.value = value ?? '';
  },
);
watch(
  () => props.pointDate,
  (value) => {
    pointInput.value = value ?? '';
  },
);

const customValid = computed(
  () =>
    isLineageDateString(startInput.value) &&
    isLineageDateString(endInput.value) &&
    startInput.value <= endInput.value,
);
const pointValid = computed(() => isLineageDateString(pointInput.value));

function onPresetChange(preset: LineageTimePreset): void {
  emit('change', preset);
}

function onApplyCustom(): void {
  if (customValid.value) {
    emit('applyCustom', { startDate: startInput.value, endDate: endInput.value });
  }
}

function onApplyPoint(): void {
  if (pointValid.value) {
    emit('applyPoint', pointInput.value);
  }
}
</script>

<template>
  <div data-testid="lineage-time-filter">
    <Space wrap align="center">
      <span>{{ t('lineage.timeFilter') }}</span>
      <Select
        :value="props.value"
        data-testid="lineage-time-preset"
        :options="options"
        @update:value="(preset: unknown) => onPresetChange(preset as LineageTimePreset)"
      />
      <template v-if="props.value === 'customRange'">
        <Input
          v-model:value="startInput"
          type="date"
          data-testid="lineage-time-custom-start"
          :aria-label="t('lineage.timeCustomStart')"
          :placeholder="t('lineage.timeCustomStart')"
        />
        <Input
          v-model:value="endInput"
          type="date"
          data-testid="lineage-time-custom-end"
          :aria-label="t('lineage.timeCustomEnd')"
          :placeholder="t('lineage.timeCustomEnd')"
        />
        <Button
          data-testid="lineage-time-custom-apply"
          :disabled="!customValid"
          @click="onApplyCustom"
        >
          {{ t('lineage.timeApply') }}
        </Button>
        <span v-if="startInput && endInput && !customValid" data-testid="lineage-time-range-invalid">
          {{ t('lineage.timeRangeInvalid') }}
        </span>
      </template>
      <template v-else-if="props.value === 'pointInTime'">
        <Input
          v-model:value="pointInput"
          type="date"
          data-testid="lineage-time-point"
          :aria-label="t('lineage.timePointDate')"
          :placeholder="t('lineage.timePointDate')"
        />
        <Button
          data-testid="lineage-time-point-apply"
          :disabled="!pointValid"
          @click="onApplyPoint"
        >
          {{ t('lineage.timeApply') }}
        </Button>
      </template>
    </Space>
  </div>
</template>
