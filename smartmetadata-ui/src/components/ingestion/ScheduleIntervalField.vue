<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Input, Select } from 'ant-design-vue';
import {
  DAY_IN_MONTH_OPTIONS,
  DAY_OPTIONS,
  DEFAULT_SCHEDULE_CRON_DAILY,
  PERIOD_OPTIONS,
  getCron,
  getDefaultScheduleValue,
  getStateValue,
  getUpdatedStateFromFormState,
  validateCronExpression,
  type SchedulePeriod,
  type ScheduleStateValue,
} from '@/ingestion/schedule';

/**
 * Port of official `Steps/ScheduleInterval.tsx` (pin a3012259ca): two
 * selection cards — Schedule (hour / day / week / month / custom period
 * pickers) and On Demand (empty cron) — with the period pickers derived
 * from the saved cron via `getStateValue`. `includePeriodOptions` (the
 * limits `pipelineSchedules`) filters the period list. An empty custom
 * expression is a validation error, not a silent fallback to on-demand,
 * which is reachable only through the On Demand card.
 *
 * `modelValue` is the cron string; `undefined` (or '') means on-demand.
 * The parent owns the value; this component only emits changes and a
 * validity flag (only the custom expression can be left invalid — every
 * other frequency derives a valid cron on its own).
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    disabled?: boolean;
    includePeriodOptions?: string[];
    testIdPrefix: string;
  }>(),
  { modelValue: undefined, disabled: false, includePeriodOptions: undefined },
);
const emit = defineEmits<{
  'update:modelValue': [value: string | undefined];
  'validity-change': [valid: boolean];
}>();

const { t } = useI18n();

const initialDefaultSchedule = getDefaultScheduleValue({
  defaultSchedule: DEFAULT_SCHEDULE_CRON_DAILY,
  includePeriodOptions: props.includePeriodOptions,
  allowNoSchedule: true,
});
const initialCron = props.modelValue ?? initialDefaultSchedule;

const selectedSchedular = ref<'schedule' | 'on-demand'>(props.modelValue ? 'schedule' : 'on-demand');
const state = ref<ScheduleStateValue>(getStateValue(initialCron, initialDefaultSchedule));
const savedCron = ref<string | undefined>(props.modelValue || undefined);
const lastEmitted = ref<string | undefined>(props.modelValue || undefined);
const customCronError = ref('');

const FREQUENCY_LABEL_KEYS: Record<SchedulePeriod, string> = {
  hour: 'frequencyHourly',
  day: 'frequencyDaily',
  week: 'frequencyWeekly',
  month: 'frequencyMonthly',
  custom: 'frequencyCustom',
};

const frequencyOptions = computed(() => {
  const options = props.includePeriodOptions
    ? PERIOD_OPTIONS.filter((option) => props.includePeriodOptions?.includes(option.value))
    : PERIOD_OPTIONS;
  return options.map((option) => ({
    value: option.value,
    label: t(`ingestion.pipelines.${FREQUENCY_LABEL_KEYS[option.value]}`),
  }));
});

const minuteOptions = computed(() =>
  Array.from({ length: 60 }, (_, index) => ({
    value: String(index),
    label: String(index).padStart(2, '0'),
  })),
);
const hourOptions = computed(() =>
  Array.from({ length: 24 }, (_, index) => ({
    value: String(index),
    label: String(index).padStart(2, '0'),
  })),
);
const dayOptions = computed(() => DAY_OPTIONS.map((option) => ({ value: option.value, label: option.label })));
const dateOptions = computed(() =>
  DAY_IN_MONTH_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
);

const showTimePicker = computed(() =>
  ['day', 'week', 'month'].includes(state.value.selectedPeriod),
);
const showMinuteOnly = computed(() => state.value.selectedPeriod === 'hour');
const showWeekSelect = computed(() => state.value.selectedPeriod === 'week');
const showMonthSelect = computed(() => state.value.selectedPeriod === 'month');
const showCustomInput = computed(() => state.value.selectedPeriod === 'custom');

const isCustomCronInvalid = computed(() => showCustomInput.value && Boolean(customCronError.value));

watch(isCustomCronInvalid, (invalid) => {
  emit('validity-change', !invalid);
});

function emitChange(cron?: string): void {
  lastEmitted.value = cron || undefined;
  if (cron) {
    savedCron.value = cron;
  }
  emit('update:modelValue', cron || undefined);
}

function getScheduleRestoreValue(): string | undefined {
  return (
    savedCron.value ||
    getDefaultScheduleValue({
      defaultSchedule: DEFAULT_SCHEDULE_CRON_DAILY,
      includePeriodOptions: props.includePeriodOptions,
    })
  );
}

function handleSelectedSchedular(value: 'schedule' | 'on-demand'): void {
  selectedSchedular.value = value;
  customCronError.value = '';
  if (value === 'on-demand') {
    state.value = { ...state.value, cron: undefined };
    emitChange(undefined);
  } else {
    const nextState = getStateValue(getScheduleRestoreValue(), initialDefaultSchedule);
    state.value = nextState;
    emitChange(nextState.cron);
  }
}

function handleStateChange(partial: Partial<ScheduleStateValue>): void {
  const nextState = getUpdatedStateFromFormState(state.value, {
    ...state.value,
    ...partial,
  });
  const cronExp = getCron(nextState);
  state.value = { ...nextState, cron: cronExp };
  // A stale error from a previous custom expression must not survive a
  // frequency switch - the new frequency always produces a valid cron.
  customCronError.value = '';
  emitChange(cronExp);
}

function handlePeriodChange(period: SchedulePeriod): void {
  handleStateChange({ selectedPeriod: period });
}

function handleCustomCronChange(value: string): void {
  state.value = { ...state.value, cron: value };
  // An empty custom expression is not a schedule. Clearing the field is a
  // validation error rather than a silent fallback to on demand, which is
  // reachable only through the On Demand card.
  if (!value) {
    customCronError.value = t('crud.fieldRequired', { field: t('ingestion.pipelines.scheduleCron') });
    emitChange('');
    return;
  }
  const errorKey = validateCronExpression(value);
  customCronError.value = errorKey ? t(errorKey) : '';
  if (!errorKey) {
    emitChange(value);
  }
}

// An external reset (form reset on drawer open, edit load) replaces the
// state; an echo of this component's own emit is ignored.
watch(
  () => props.modelValue,
  (value) => {
    const normalized = value || undefined;
    if (normalized === lastEmitted.value) {
      return;
    }
    lastEmitted.value = normalized;
    if (normalized) {
      savedCron.value = normalized;
    }
    selectedSchedular.value = normalized ? 'schedule' : 'on-demand';
    state.value = getStateValue(normalized ?? initialDefaultSchedule, initialDefaultSchedule);
    customCronError.value = '';
  },
);
</script>

<template>
  <div>
    <div style="display: flex; gap: 12px; margin-bottom: 16px">
      <Card
        hoverable
        :data-testid="`${testIdPrefix}-card-schedule`"
        :style="{
          flex: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          borderColor: selectedSchedular === 'schedule' ? '#005587' : undefined,
        }"
        @click="!disabled && handleSelectedSchedular('schedule')"
      >
        <strong>{{ t('ingestion.pipelines.scheduleCard') }}</strong>
        <p style="margin: 4px 0 0">{{ t('ingestion.pipelines.scheduleCardDescription') }}</p>
      </Card>
      <Card
        hoverable
        :data-testid="`${testIdPrefix}-card-on-demand`"
        :style="{
          flex: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          borderColor: selectedSchedular === 'on-demand' ? '#005587' : undefined,
        }"
        @click="!disabled && handleSelectedSchedular('on-demand')"
      >
        <strong>{{ t('ingestion.pipelines.onDemandCard') }}</strong>
        <p style="margin: 4px 0 0">{{ t('ingestion.pipelines.onDemandCardDescription') }}</p>
      </Card>
    </div>
    <div v-if="selectedSchedular === 'schedule'">
      <div style="display: flex; gap: 12px; flex-wrap: wrap">
        <div>
          <label>{{ t('ingestion.pipelines.frequency') }}</label>
          <Select
            :value="state.selectedPeriod"
            :disabled="disabled"
            :options="frequencyOptions"
            :data-testid="`${testIdPrefix}-period`"
            style="width: 160px; display: block; margin-top: 4px"
            @change="(value) => handlePeriodChange(value as SchedulePeriod)"
          />
        </div>
        <div v-if="showWeekSelect">
          <label>{{ t('ingestion.pipelines.scheduleDayOfWeek') }}</label>
          <Select
            :value="state.dow"
            :disabled="disabled"
            :options="dayOptions"
            data-testid="day-options"
            style="width: 160px; display: block; margin-top: 4px"
            @change="(value) => handleStateChange({ dow: String(value) })"
          />
        </div>
        <div v-if="showMonthSelect">
          <label>{{ t('ingestion.pipelines.scheduleDayOfMonth') }}</label>
          <Select
            :value="state.dom"
            :disabled="disabled"
            :options="dateOptions"
            data-testid="date-options"
            style="width: 160px; display: block; margin-top: 4px"
            @change="(value) => handleStateChange({ dom: String(value) })"
          />
        </div>
        <div v-if="showTimePicker">
          <label>{{ t('ingestion.pipelines.scheduleTime') }}</label>
          <span style="display: flex; gap: 8px; margin-top: 4px">
            <Select
              :value="state.hour"
              :disabled="disabled"
              :options="hourOptions"
              :data-testid="`${testIdPrefix}-hour`"
              style="width: 80px"
              @change="(value) => handleStateChange({ hour: String(value) })"
            />
            <Select
              :value="state.min"
              :disabled="disabled"
              :options="minuteOptions"
              :data-testid="`${testIdPrefix}-minute`"
              style="width: 80px"
              @change="(value) => handleStateChange({ min: String(value) })"
            />
          </span>
        </div>
        <div v-if="showMinuteOnly">
          <label>{{ t('ingestion.pipelines.scheduleMinute') }}</label>
          <Select
            :value="state.min"
            :disabled="disabled"
            :options="minuteOptions"
            data-testid="minute-options"
            style="width: 160px; display: block; margin-top: 4px"
            @change="(value) => handleStateChange({ min: String(value) })"
          />
        </div>
        <div v-if="showCustomInput" style="flex: 1; min-width: 240px">
          <label>{{ t('ingestion.pipelines.scheduleCron') }}</label>
          <Input
            :value="state.cron ?? ''"
            :disabled="disabled"
            placeholder="0 0 * * *"
            data-testid="custom-cron-input"
            style="margin-top: 4px"
            @update:value="(value) => handleCustomCronChange(String(value ?? ''))"
          />
          <p v-if="customCronError" data-testid="custom-cron-error" style="color: #ff4d4f; margin: 4px 0 0">
            {{ customCronError }}
          </p>
        </div>
      </div>
    </div>
    <div v-else>
      <p>{{ t('ingestion.pipelines.onDemandCardDescription') }}</p>
    </div>
  </div>
</template>
