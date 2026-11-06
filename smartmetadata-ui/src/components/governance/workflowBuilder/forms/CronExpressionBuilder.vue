<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official CronExpressionBuilder (pin a3012259ca), ported 1:1: a pure
 * parse/generate pair over 5-field cron plus three selects (every / hour /
 * minute). The hour select hides for hourly schedules. The description
 * line reads `At {time}, every {period}` (or `At {n} minutes past every
 * hour`). Cron tokens (day names, `*`) stay English — they are cron
 * semantics, not UI copy.
 */
const props = withDefaults(
  defineProps<{
    value?: string;
    onChange?: (cronExpression: string) => void;
    forceDisabled?: boolean;
  }>(),
  { value: '', onChange: undefined, forceDisabled: false },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;
const controlsDisabled = computed(() => isFormDisabled.value || props.forceDisabled);

interface CronConfig {
  every: string;
  hour: string;
  minute: string;
}

const DEFAULT_CONFIG: CronConfig = { every: 'Day', hour: '00', minute: '00' };

const DAY_MAP: Record<string, string> = {
  '0': 'Sunday',
  '1': 'Monday',
  '2': 'Tuesday',
  '3': 'Wednesday',
  '4': 'Thursday',
  '5': 'Friday',
  '6': 'Saturday',
};

const DAY_NUMBERS: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function resolveEvery(hour: string, dayOfMonth: string, dayOfWeek: string): string {
  if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
    return 'Hour';
  }
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    return DAY_MAP[dayOfWeek] || 'Day';
  }
  if (dayOfMonth === '1' && dayOfWeek === '*') {
    return 'Month';
  }
  if (dayOfMonth === '*' && dayOfWeek === '0') {
    return 'Week';
  }
  return 'Day';
}

function parseCronExpression(cronExpression: string): CronConfig {
  if (!cronExpression || cronExpression.trim() === '') {
    return DEFAULT_CONFIG;
  }
  try {
    const parts = cronExpression.trim().split(' ');
    if (parts.length !== 5) {
      return DEFAULT_CONFIG;
    }
    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
    return {
      every: resolveEvery(hour, dayOfMonth, dayOfWeek),
      hour: hour === '*' ? '00' : hour.padStart(2, '0'),
      minute: minute === '*' ? '00' : minute.padStart(2, '0'),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function generateCronExpression(cronConfig: CronConfig): string {
  const { every, hour, minute } = cronConfig;
  if (every === 'Hour') {
    return `${minute} * * * *`;
  }
  if (every === 'Week') {
    return `${minute} ${hour} * * 0`;
  }
  if (every === 'Month') {
    return `${minute} ${hour} 1 * *`;
  }
  if (every in DAY_NUMBERS) {
    return `${minute} ${hour} * * ${DAY_NUMBERS[every]}`;
  }
  return `${minute} ${hour} * * *`;
}

function generateDescription(cronConfig: CronConfig): string {
  const { every, hour, minute } = cronConfig;
  const hourNum = parseInt(hour);
  const minuteNum = parseInt(minute);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  let displayHour = hourNum;
  if (hourNum === 0) {
    displayHour = 12;
  } else if (hourNum > 12) {
    displayHour = hourNum - 12;
  }
  const timeStr = `${displayHour}:${minute} ${ampm}`;
  if (every === 'Hour') {
    return t('workflows.builder.cronAtMinutesPastHour', { minutes: minuteNum });
  }
  if (['Day', 'Week', 'Month'].includes(every)) {
    return t('workflows.builder.cronAtTimeEvery', {
      time: timeStr,
      period: every.toLowerCase(),
    });
  }
  return t('workflows.builder.cronAtTimeEvery', { time: timeStr, period: every });
}

const config = ref<CronConfig>(DEFAULT_CONFIG);

watch(
  () => props.value,
  (next) => {
    if (next) {
      config.value = parseCronExpression(next);
    }
  },
  { immediate: true },
);

function handleConfigChange(field: keyof CronConfig, newValue: string): void {
  const newConfig = { ...config.value, [field]: newValue };
  config.value = newConfig;
  props.onChange?.(generateCronExpression(newConfig));
}

const everyOptions = [
  'Hour', 'Day', 'Week', 'Month',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
].map((o) => ({ label: o, value: o }));
const hourOptions = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0'),
).map((h) => ({ label: h, value: h }));
const minuteOptions = Array.from({ length: 60 }, (_, i) =>
  i.toString().padStart(2, '0'),
).map((m) => ({ label: m, value: m }));
</script>

<template>
  <div>
    <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: nowrap">
      <div style="flex: 1; min-width: 120px">
        <Typography.Text type="secondary" style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.cronEvery') }}
        </Typography.Text>
        <Select
          :value="config.every"
          :disabled="controlsDisabled"
          :options="everyOptions"
          style="width: 100%"
          @change="(key) => handleConfigChange('every', String(key ?? ''))"
        />
      </div>
      <div v-if="config.every !== 'Hour'" style="flex: 1; min-width: 120px">
        <Typography.Text type="secondary" style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.cronHour') }}
        </Typography.Text>
        <Select
          :value="config.hour"
          :disabled="controlsDisabled"
          :options="hourOptions"
          style="width: 100%"
          @change="(key) => handleConfigChange('hour', String(key ?? ''))"
        />
      </div>
      <div style="flex: 1; min-width: 120px">
        <Typography.Text type="secondary" style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.cronMinute') }}
        </Typography.Text>
        <Select
          :value="config.minute"
          :disabled="controlsDisabled"
          :options="minuteOptions"
          style="width: 100%"
          @change="(key) => handleConfigChange('minute', String(key ?? ''))"
        />
      </div>
    </div>
    <Typography.Text type="secondary" style="display: block; margin-top: 12px; font-size: 12px">
      {{ generateDescription(config) }}
    </Typography.Text>
  </div>
</template>
