<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Alert, Select, Space } from 'ant-design-vue';
import { LINEAGE_TIME_PRESETS, type LineageTimePreset } from '@/lineage/config';

const props = defineProps<{
  value: LineageTimePreset;
}>();

const emit = defineEmits<{
  change: [preset: LineageTimePreset];
}>();

const { t } = useI18n();
const options = LINEAGE_TIME_PRESETS.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
  disabled: !item.supported,
}));
</script>

<template>
  <div data-testid="lineage-time-filter">
    <Space wrap align="center">
      <span>{{ t('lineage.timeFilter') }}</span>
      <Select
        :value="props.value"
        data-testid="lineage-time-preset"
        :options="options"
        @update:value="(preset: unknown) => emit('change', preset as LineageTimePreset)"
      />
    </Space>
    <Alert
      type="info"
      show-icon
      data-testid="lineage-time-residual"
      :message="t('lineage.timeFilterResidual')"
    />
  </div>
</template>
