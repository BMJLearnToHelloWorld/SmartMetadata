<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DatePickerMenu presets (PROFILER_FILTER_RANGE) for the
  incident list. Vue3 + ant-design-vue; no CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, DatePicker, Dropdown, Menu } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CUSTOM_DATE_RANGE_KEY,
  INCIDENT_DATE_PRESETS,
  rangeForPreset,
  type IncidentDateRange,
} from '@/quality/incidentDatePresets';

const props = withDefaults(
  defineProps<{
    startTs?: number;
    endTs?: number;
    rangeKey?: string;
    rangeTitle?: string;
    testId?: string;
    /**
     * Official DatePickerMenu / TabFilters titles use label.yesterday,
     * label.last-number-of-days, and label.custom-range. The incident
     * list keeps its existing keys unless this is set.
     */
    officialLabels?: boolean;
    /** Official TabFilters DatePickerMenu showSelectedCustomRange. */
    showSelectedCustomRange?: boolean;
  }>(),
  {
    startTs: undefined,
    endTs: undefined,
    rangeKey: undefined,
    rangeTitle: undefined,
    testId: 'incident-date-range',
    officialLabels: false,
    showSelectedCustomRange: false,
  },
);
const emit = defineEmits<{
  apply: [range: IncidentDateRange];
  clear: [];
}>();

const { t } = useI18n();
const customOpen = ref(props.rangeKey === CUSTOM_DATE_RANGE_KEY);

function toRangeValue(startTs?: number, endTs?: number): [Dayjs, Dayjs] | null {
  if (startTs === undefined || endTs === undefined) {
    return null;
  }
  return [dayjs(startTs), dayjs(endTs)];
}

const rangeValue = ref<[Dayjs, Dayjs] | null>(toRangeValue(props.startTs, props.endTs));

watch(
  () => [props.startTs, props.endTs, props.rangeKey] as const,
  ([startTs, endTs, rangeKey]) => {
    rangeValue.value = toRangeValue(startTs, endTs);
    customOpen.value = rangeKey === CUSTOM_DATE_RANGE_KEY;
  },
);

function officialPresetTitle(days: number): string {
  return days === 1
    ? t('label.yesterday')
    : t('label.last-number-of-days', { numberOfDays: days });
}

function presetTitle(days: number): string {
  if (props.officialLabels) {
    return officialPresetTitle(days);
  }
  return days === 1
    ? t('observability.incidents.yesterday')
    : t('observability.incidents.lastNumberOfDays', { numberOfDays: days });
}

function customTitle(startTs?: number, endTs?: number): string {
  if (props.officialLabels && props.showSelectedCustomRange && startTs !== undefined && endTs !== undefined) {
    const start = dayjs(startTs).format('YYYY-MM-DD');
    const end = dayjs(endTs).format('YYYY-MM-DD');
    return `${start} -> ${end}`;
  }
  return props.officialLabels ? t('label.custom-range') : t('observability.incidents.customRange');
}

const triggerLabel = computed(() => {
  if (props.rangeKey === CUSTOM_DATE_RANGE_KEY || customOpen.value) {
    return props.rangeTitle || customTitle(props.startTs, props.endTs);
  }
  const preset = INCIDENT_DATE_PRESETS.find((item) => item.key === props.rangeKey);
  if (preset) {
    return presetTitle(preset.days);
  }
  if (props.rangeTitle) {
    return props.rangeTitle;
  }
  if (props.officialLabels) {
    return officialPresetTitle(7);
  }
  return t('observability.incidents.dateRangePlaceholder');
});

function onPreset(key: string): void {
  if (key === CUSTOM_DATE_RANGE_KEY) {
    customOpen.value = true;
    return;
  }
  customOpen.value = false;
  const preset = INCIDENT_DATE_PRESETS.find((item) => item.key === key);
  if (!preset) {
    return;
  }
  const range = rangeForPreset(preset.days);
  emit('apply', { ...range, key: preset.key, title: presetTitle(preset.days) });
}

function onCustomChange(dates: unknown): void {
  const pair = Array.isArray(dates) ? (dates as Array<{ valueOf: () => number } | null>) : null;
  const start = pair?.[0];
  const end = pair?.[1];
  if (start && end) {
    const startTs = dayjs(start.valueOf()).startOf('day').valueOf();
    const endTs = dayjs(end.valueOf()).endOf('day').valueOf();
    rangeValue.value = [dayjs(startTs), dayjs(endTs)];
    emit('apply', {
      startTs,
      endTs,
      key: CUSTOM_DATE_RANGE_KEY,
      title: customTitle(startTs, endTs),
    });
    return;
  }
  rangeValue.value = null;
  emit('clear');
}

</script>

<template>
  <div class="incident-date-filter" :data-testid="testId">
    <Dropdown :trigger="['click']">
      <Button data-testid="date-picker-menu">
        {{ triggerLabel }}
      </Button>
      <template #overlay>
        <Menu @click="(info) => onPreset(String(info.key))">
          <Menu.Item
            v-for="preset in INCIDENT_DATE_PRESETS"
            :key="preset.key"
            :data-testid="`incident-date-preset-${preset.key}`"
          >
            {{ presetTitle(preset.days) }}
          </Menu.Item>
          <Menu.Item :key="CUSTOM_DATE_RANGE_KEY" data-testid="incident-date-preset-custom">
            {{ officialLabels ? t('label.custom-range') : t('observability.incidents.customRange') }}
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
    <DatePicker.RangePicker
      v-if="customOpen"
      :value="rangeValue ?? undefined"
      :placeholder="[t('observability.incidents.dateRangePlaceholder'), t('observability.incidents.dateRangePlaceholder')]"
      data-testid="incident-date-custom-range"
      style="min-width: 260px"
      @change="onCustomChange"
    />
  </div>
</template>

<style scoped>
.incident-date-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
