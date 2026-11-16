<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { Card } from 'ant-design-vue';
import { ClockCircleOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { cronstrueLocaleFor } from '@/ingestion/scheduleDescription';

/**
 * Port of official ScheduleInterval's cron-expression card (pin
 * a3012259ca): always rendered below the schedule pickers. With a
 * cron it shows "{{entity}} scheduled to run {{cronstrue text}}"
 * (verbose, locale-aware, 12-hour clock); without one it shows the
 * manual-trigger text. cronstrue's i18n build is lazy-loaded on
 * first use, as in pin; until it resolves the value is empty.
 *
 * This intentionally does NOT reuse getScheduleDescriptionTexts:
 * that helper splits the cronstrue output into two parts for a
 * different surface, while pin's schedule card shows the full
 * string.
 */
const props = withDefaults(
  defineProps<{
    cron?: string | null;
    /** Entity word in the sentence; defaults to the Ingestion label. */
    entity?: string;
    testId?: string;
  }>(),
  { cron: undefined, entity: undefined, testId: 'cron-summary-card' },
);

const { t, locale } = useI18n();
const cronHumanText = ref('');

type CronstrueI18nModule = typeof import('cronstrue/i18n');

let cronstrueModule: CronstrueI18nModule | null = null;
let cronstruePromise: Promise<CronstrueI18nModule> | null = null;
let cancelled = false;

function ensureLoaded(): Promise<CronstrueI18nModule> {
  if (cronstrueModule) {
    return Promise.resolve(cronstrueModule);
  }
  if (!cronstruePromise) {
    cronstruePromise = import('cronstrue/i18n').then((module) => {
      cronstrueModule = module;
      return module;
    });
  }
  return cronstruePromise;
}

async function refresh(): Promise<void> {
  const cronString = props.cron?.trim();
  if (!cronString) {
    cronHumanText.value = '';
    return;
  }
  try {
    const module = await ensureLoaded();
    if (cancelled) {
      return;
    }
    cronHumanText.value = module.default.toString(cronString, {
      use24HourTimeFormat: false,
      verbose: true,
      locale: cronstrueLocaleFor(locale.value),
      throwExceptionOnParseError: false,
    });
  } catch {
    if (!cancelled) {
      cronHumanText.value = '';
    }
  }
}

onMounted(() => {
  void refresh();
});
onUnmounted(() => {
  cancelled = true;
});
watch(() => props.cron, refresh);
watch(locale, refresh);
</script>

<template>
  <Card size="small" :data-testid="testId" class="cron-summary-card">
    <div class="cron-summary-content">
      <ClockCircleOutlined class="cron-summary-icon" />
      <span v-if="cron">
        {{ t('forms.cronSummary.scheduled', { entity: entity ?? t('forms.cronSummary.entityDefault'), value: cronHumanText }) }}
      </span>
      <span v-else>{{ t('forms.cronSummary.manual') }}</span>
    </div>
  </Card>
</template>

<style scoped>
.cron-summary-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cron-summary-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--sm-text-tertiary);
}
</style>
