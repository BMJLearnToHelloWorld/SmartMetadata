<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractSLAFormTab: refresh frequency, max latency, availability
  time + timezone, retention, columnName. Number inputs as strings.
  Unmodeled stored SLA keys survive until the user clears a touched key.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Select, TimePicker } from 'ant-design-vue';
import type { ContractColumn, ContractSLA, DataContract } from '@/api/dataContracts';
import {
  CONTRACT_TIMEZONES,
  MAX_LATENCY_UNITS,
  REFRESH_FREQUENCY_UNITS,
  RETENTION_UNITS,
} from '@/catalog/dataContractTabs';
import {
  formatAvailabilityTime,
  parseAvailabilityTime,
  toContractSLA,
  toNonNegative,
  type ModelledSLAKey,
} from '@/catalog/dataContractForm';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

const props = defineProps<{
  initialValues?: Partial<DataContract>;
  columns?: ContractColumn[];
  nextLabel?: string;
  prevLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  prev: [];
}>();

const { t } = useI18n();
const touched = ref(new Set<ModelledSLAKey>());
const storedSla = computed<ContractSLA>(() => ({ ...(props.initialValues?.sla ?? {}) }));

const form = reactive({
  refresh_frequency_interval: '',
  refresh_frequency_unit: undefined as string | undefined,
  max_latency_value: '',
  max_latency_unit: undefined as string | undefined,
  retention_period: '',
  retention_unit: undefined as string | undefined,
  availabilityTime: undefined as Dayjs | undefined,
  timezone: undefined as string | undefined,
  columnName: undefined as string | undefined,
});

const topLevelColumns = computed(() =>
  (props.columns ?? []).map((column) => ({
    value: column.fullyQualifiedName ?? column.name,
    label: column.displayName || column.name,
  })),
);

function unitOptions(units: readonly string[]) {
  return units.map((unit) => ({ value: unit, label: t(`label.${unit}`, unit) }));
}

function seed(): void {
  const sla = props.initialValues?.sla;
  form.refresh_frequency_interval = sla?.refreshFrequency?.interval !== undefined ? String(sla.refreshFrequency.interval) : '';
  form.refresh_frequency_unit = sla?.refreshFrequency?.unit;
  form.max_latency_value = sla?.maxLatency?.value !== undefined ? String(sla.maxLatency.value) : '';
  form.max_latency_unit = sla?.maxLatency?.unit;
  form.retention_period = sla?.retention?.period !== undefined ? String(sla.retention.period) : '';
  form.retention_unit = sla?.retention?.unit;
  const parsed = parseAvailabilityTime(sla?.availabilityTime);
  form.availabilityTime = parsed ? dayjs().hour(parsed.hour).minute(parsed.minute).second(0) : undefined;
  form.timezone = sla?.timezone;
  form.columnName = sla?.columnName;
  touched.value = new Set();
}

watch(() => props.initialValues, seed, { immediate: true });

function modelled(): Partial<ContractSLA> {
  const refreshInterval = toNonNegative(form.refresh_frequency_interval);
  const maxLatency = toNonNegative(form.max_latency_value);
  const retention = toNonNegative(form.retention_period);
  return {
    availabilityTime: form.availabilityTime
      ? formatAvailabilityTime(form.availabilityTime.hour(), form.availabilityTime.minute())
      : undefined,
    timezone: form.timezone,
    columnName: form.columnName,
    maxLatency: form.max_latency_unit && maxLatency !== undefined ? { unit: form.max_latency_unit, value: maxLatency } : undefined,
    refreshFrequency: form.refresh_frequency_unit && refreshInterval !== undefined
      ? { interval: refreshInterval, unit: form.refresh_frequency_unit }
      : undefined,
    retention: form.retention_unit && retention !== undefined ? { period: retention, unit: form.retention_unit } : undefined,
  };
}

function touch(key: ModelledSLAKey): void {
  const next = new Set(touched.value);
  next.add(key);
  touched.value = next;
  emit('change', { sla: toContractSLA(modelled() as ContractSLA, storedSla.value, next) });
}
</script>

<template>
  <ContractFormStep
    :title="t('label.sla')"
    :description="t('message.data-contract-sla-description')"
    :prev-label="prevLabel"
    :is-next-visible="false"
    show-prev
    @prev="emit('prev')"
  >
    <Form layout="vertical">
      <Form.Item :label="t('label.refresh-frequency')">
        <p>{{ t('message.refresh-frequency-contract-description') }}</p>
        <div style="display: flex; gap: 8px">
          <Input data-testid="refresh-frequency-input" :placeholder="t('label.enter-entity', { entity: t('label.interval') })" :value="form.refresh_frequency_interval" @update:value="(value) => { form.refresh_frequency_interval = String(value ?? ''); touch('refreshFrequency'); }" />
          <Select data-testid="refresh-frequency-unit-select" style="width: 160px" :placeholder="t('label.select-entity', { entity: t('label.unit') })" :value="form.refresh_frequency_unit" :options="unitOptions(REFRESH_FREQUENCY_UNITS)" @update:value="(value) => { form.refresh_frequency_unit = String(value); touch('refreshFrequency'); }" />
        </div>
      </Form.Item>
      <Form.Item :label="t('label.max-latency')">
        <p>{{ t('message.max-latency-contract-description') }}</p>
        <div style="display: flex; gap: 8px">
          <Input data-testid="max-latency-input" :placeholder="t('label.enter-entity', { entity: t('label.value') })" :value="form.max_latency_value" @update:value="(value) => { form.max_latency_value = String(value ?? ''); touch('maxLatency'); }" />
          <Select data-testid="max-latency-unit-select" style="width: 160px" :placeholder="t('label.select-entity', { entity: t('label.unit') })" :value="form.max_latency_unit" :options="unitOptions(MAX_LATENCY_UNITS)" @update:value="(value) => { form.max_latency_unit = String(value); touch('maxLatency'); }" />
        </div>
      </Form.Item>
      <Form.Item :label="t('label.availability-time')">
        <p>{{ t('message.availability-time-contract-description') }}</p>
        <div style="display: flex; gap: 8px">
          <TimePicker
            data-testid="availability-time-picker"
            format="HH:mm"
            :placeholder="t('label.time')"
            :value="form.availabilityTime"
            @update:value="(value) => { form.availabilityTime = value as Dayjs | undefined; touch('availabilityTime'); }"
          />
          <Select
            data-testid="timezone-select"
            style="min-width: 280px; flex: 1"
            show-search
            :value="form.timezone"
            :options="CONTRACT_TIMEZONES.map((tz) => ({ value: tz, label: tz }))"
            :placeholder="t('label.select-entity', { entity: t('label.timezone') })"
            @update:value="(value) => { form.timezone = String(value); touch('timezone'); }"
          />
        </div>
        <p>{{ t('message.contract-sla-timezone-availability-default') }}</p>
      </Form.Item>
      <Form.Item :label="t('label.retention')">
        <p>{{ t('message.time-line-data-retention-description') }}</p>
        <div style="display: flex; gap: 8px">
          <Input data-testid="retention-period-input" :placeholder="t('label.enter-entity', { entity: t('label.period') })" :value="form.retention_period" @update:value="(value) => { form.retention_period = String(value ?? ''); touch('retention'); }" />
          <Select data-testid="retention-unit-select" style="width: 160px" :placeholder="t('label.select-entity', { entity: t('label.unit') })" :value="form.retention_unit" :options="unitOptions(RETENTION_UNITS)" @update:value="(value) => { form.retention_unit = String(value); touch('retention'); }" />
        </div>
      </Form.Item>
      <Form.Item :label="t('label.column-name')">
        <p>{{ t('message.contract-sla-column-name-description') }}</p>
        <Select
          data-testid="columnName-select"
          show-search
          style="width: 100%"
          :value="form.columnName"
          :options="topLevelColumns"
          :placeholder="t('label.please-enter-entity-name', { entity: t('label.column') })"
          @update:value="(value) => { form.columnName = String(value); touch('columnName'); }"
        />
      </Form.Item>
    </Form>
  </ContractFormStep>
</template>
