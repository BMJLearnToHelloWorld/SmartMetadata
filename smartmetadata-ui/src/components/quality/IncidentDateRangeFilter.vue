<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DatePicker } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';

/**
 * Incident date-range filter, adapting antd's RangePicker to the
 * incident list's epoch-millis startTs/endTs (official
 * DateRangeFilter.tsx: start of day / end of day, staged then
 * committed). A complete range commits on pick; clearing the picker
 * clears the range.
 *
 * Presets: this component offers NONE. Official's preset key/title are
 * opaque strings that arrive through the URL (useIncidentFilters
 * dateRangeKey) — the core DateRangePicker's preset list lives outside
 * the pin snapshot and must not be re-invented here (ruling R-6).
 * The view preserves whatever key/title the URL carries and drops
 * them only on clear-all.
 * ADR:2026-11-08-incident-date-range-key-title-are-opaque
 */
const props = withDefaults(
  defineProps<{
    startTs?: number;
    endTs?: number;
    testId?: string;
  }>(),
  { startTs: undefined, endTs: undefined, testId: 'incident-date-range' },
);
const emit = defineEmits<{
  apply: [range: { startTs: number; endTs: number }];
  clear: [];
}>();

const { t } = useI18n();

function toRangeValue(startTs?: number, endTs?: number): [Dayjs, Dayjs] | null {
  if (startTs === undefined || endTs === undefined) {
    return null;
  }
  return [dayjs(startTs), dayjs(endTs)];
}

const rangeValue = ref<[Dayjs, Dayjs] | null>(toRangeValue(props.startTs, props.endTs));

watch(
  () => [props.startTs, props.endTs] as const,
  ([startTs, endTs]) => {
    rangeValue.value = toRangeValue(startTs, endTs);
  },
);

const placeholder = computed(() => t('observability.incidents.dateRangePlaceholder'));

function onChange(dates: unknown): void {
  const pair = Array.isArray(dates) ? (dates as Array<{ valueOf: () => number } | null>) : null;
  const start = pair?.[0];
  const end = pair?.[1];
  if (start && end) {
    const startTs = dayjs(start.valueOf()).startOf('day').valueOf();
    const endTs = dayjs(end.valueOf()).endOf('day').valueOf();
    rangeValue.value = [dayjs(startTs), dayjs(endTs)];
    emit('apply', { startTs, endTs });
    return;
  }
  rangeValue.value = null;
  emit('clear');
}
</script>

<template>
  <DatePicker.RangePicker
    :value="rangeValue ?? undefined"
    :placeholder="[placeholder, placeholder]"
    :data-testid="testId"
    style="min-width: 260px"
    @change="onChange"
  />
</template>
