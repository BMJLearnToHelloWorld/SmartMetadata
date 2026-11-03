<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Radio, Select, Typography } from 'ant-design-vue';

const { t } = useI18n();

const props = defineProps<{
  modelValue: string | undefined;
  /** Period options the app allows (official includePeriodOptions); undefined means all. */
  periodOptions?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined];
  'update:valid': [valid: boolean];
}>();

type Period = 'hour' | 'day' | 'week' | 'month' | 'custom';

const ALL_PERIODS: Period[] = ['hour', 'day', 'week', 'month', 'custom'];

const periods = computed<Period[]>(() => {
  if (!props.periodOptions) {
    return ALL_PERIODS;
  }
  const allowed = ALL_PERIODS.filter((period) => props.periodOptions?.includes(period));
  return allowed.includes('custom') ? allowed : [...allowed, 'custom'];
});

function parseCron(value: string): {
  min: string;
  hour: string;
  dom: string;
  dow: string;
  period: Period;
} | null {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  const [min, hour, dom, month, dow] = fields;
  if (month !== '*') {
    return null;
  }
  const isNum = (field: string): boolean => /^\d+$/.test(field);
  if (min !== '*' && !isNum(min)) {
    return null;
  }
  if (min === '*' && hour === '*' && dom === '*' && dow === '*') {
    return { min: '0', hour: '0', dom: '1', dow: '0', period: 'custom' };
  }
  if (hour === '*' && dom === '*' && dow === '*') {
    return { min, hour: '0', dom: '1', dow: '0', period: 'hour' };
  }
  if (dom === '*' && dow === '*') {
    return { min, hour, dom: '1', dow: '0', period: 'day' };
  }
  if (dom === '*' && dow !== '*') {
    return { min, hour, dom: '1', dow, period: 'week' };
  }
  if (dow === '*' || /^\d+$/.test(dow)) {
    return { min, hour, dom, dow, period: 'month' };
  }
  return { min, hour, dom, dow, period: 'custom' };
}

const initial = props.modelValue
  ? (parseCron(props.modelValue) ?? {
      min: '0',
      hour: '0',
      dom: '1',
      dow: '0',
      period: 'custom' as Period,
    })
  : null;

const mode = ref<'schedule' | 'onDemand'>(props.modelValue ? 'schedule' : 'onDemand');
const period = ref<Period>(initial?.period ?? 'day');
const minute = ref(initial?.min ?? '0');
const hour = ref(initial?.hour ?? '0');
const dayOfWeek = ref(initial?.dow ?? '0');
const dayOfMonth = ref(initial?.dom ?? '1');
const customCron = ref(initial?.period === 'custom' ? (props.modelValue ?? '') : '');

const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index));
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index));
const dayOfWeekOptions = ['0', '1', '2', '3', '4', '5', '6'];
const dayOfMonthOptions = Array.from({ length: 31 }, (_, index) => String(index + 1));

function buildCron(): string {
  switch (period.value) {
    case 'hour':
      return `${minute.value} * * * *`;
    case 'day':
      return `${minute.value} ${hour.value} * * *`;
    case 'week':
      return `${minute.value} ${hour.value} * * ${dayOfWeek.value}`;
    case 'month':
      return `${minute.value} ${hour.value} ${dayOfMonth.value} * ${dayOfWeek.value}`;
    case 'custom':
      return customCron.value.trim();
  }
}

function isValidCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  const ranges: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  const isFieldValid = (field: string, [min, max]: [number, number]): boolean => {
    if (field === '*') {
      return true;
    }
    return field.split(',').every((part) => {
      const stepSplit = part.split('/');
      if (stepSplit.length > 2) {
        return false;
      }
      const base = stepSplit[0];
      const step = stepSplit[1];
      if (step !== undefined && !/^\d+$/.test(step)) {
        return false;
      }
      if (base === '*') {
        return true;
      }
      if (base.includes('-')) {
        const [from, to] = base.split('-');
        return (
          /^\d+$/.test(from) &&
          /^\d+$/.test(to) &&
          Number(from) >= min &&
          Number(to) <= max &&
          Number(from) <= Number(to)
        );
      }
      return /^\d+$/.test(base) && Number(base) >= min && Number(base) <= max;
    });
  };
  return fields.every((field, index) => isFieldValid(field, ranges[index]));
}

const valid = computed<boolean>(() => {
  if (mode.value === 'onDemand') {
    return true;
  }
  return period.value === 'custom' ? isValidCron(customCron.value) : true;
});

watch(
  [mode, period, minute, hour, dayOfWeek, dayOfMonth, customCron],
  () => {
    emit('update:valid', valid.value);
    emit('update:modelValue', mode.value === 'onDemand' ? undefined : buildCron());
  },
  { immediate: true },
);
</script>

<template>
  <div data-testid="app-schedule-form">
    <Form layout="vertical">
      <Form.Item :label="t('apps.install.scheduleMode')">
        <Radio.Group v-model:value="mode" data-testid="app-schedule-mode">
          <Radio value="schedule">{{ t('apps.install.scheduled') }}</Radio>
          <Radio value="onDemand">{{ t('apps.install.onDemand') }}</Radio>
        </Radio.Group>
      </Form.Item>
      <template v-if="mode === 'schedule'">
        <Form.Item :label="t('apps.install.period')">
          <Select v-model:value="period" data-testid="app-schedule-period">
            <Select.Option v-for="item in periods" :key="item" :value="item">
              {{ t(`apps.install.periods.${item}`) }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="period === 'hour' || period === 'day' || period === 'week' || period === 'month'" :label="t('apps.install.minute')">
          <Select v-model:value="minute" data-testid="app-schedule-minute">
            <Select.Option v-for="item in minuteOptions" :key="item" :value="item">{{ item }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="period === 'day' || period === 'week' || period === 'month'" :label="t('apps.install.hour')">
          <Select v-model:value="hour" data-testid="app-schedule-hour">
            <Select.Option v-for="item in hourOptions" :key="item" :value="item">{{ item }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="period === 'week'" :label="t('apps.install.dayOfWeek')">
          <Select v-model:value="dayOfWeek" data-testid="app-schedule-dow">
            <Select.Option v-for="item in dayOfWeekOptions" :key="item" :value="item">{{ item }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="period === 'month'" :label="t('apps.install.dayOfMonth')">
          <Select v-model:value="dayOfMonth" data-testid="app-schedule-dom">
            <Select.Option v-for="item in dayOfMonthOptions" :key="item" :value="item">{{ item }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item
          v-if="period === 'custom'"
          :label="t('apps.install.cronExpression')"
          :validate-status="valid ? undefined : 'error'"
          :help="valid ? undefined : t('apps.install.invalidCron')"
        >
          <Input v-model:value="customCron" data-testid="app-schedule-cron" placeholder="0 0 * * *" />
        </Form.Item>
        <Typography.Paragraph type="secondary" data-testid="app-schedule-preview">
          {{ mode === 'onDemand' ? '' : buildCron() }}
        </Typography.Paragraph>
      </template>
    </Form>
  </div>
</template>
