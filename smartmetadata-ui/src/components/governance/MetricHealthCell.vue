<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Tag } from 'ant-design-vue';
import { getMetricObservability, type MetricHealth } from '@/api/metrics';

/**
 * Official MetricListHealth equivalent: lazy-loads GET /v1/metrics/
 * {id}/observability the first time the cell scrolls into view
 * (IntersectionObserver, 200px root margin), renders the health pill,
 * and falls back to Health.Unknown when the rollup carries no band.
 * A failed load shows a retry instead of a silent empty cell.
 */
const props = defineProps<{ metricId: string }>();

const { t } = useI18n();
const slotRef = ref<HTMLElement | null>(null);
const health = ref<MetricHealth | null>(null);
const score = ref<number | undefined>(undefined);
const loading = ref(false);
const failed = ref(false);
let observer: IntersectionObserver | null = null;
let started = false;

const healthColor: Record<MetricHealth, string> = {
  Healthy: 'green',
  Degraded: 'orange',
  AtRisk: 'red',
  Unknown: 'default',
};

async function load(): Promise<void> {
  if (started) {
    return;
  }
  started = true;
  loading.value = true;
  failed.value = false;
  try {
    const rollup = await getMetricObservability(props.metricId);
    health.value = rollup.health;
    score.value = rollup.score;
  } catch {
    failed.value = true;
    health.value = null;
  } finally {
    loading.value = false;
  }
}

function retry(): void {
  started = false;
  void load();
}

onMounted(() => {
  if (typeof window.IntersectionObserver === 'undefined') {
    void load();
    return;
  }
  const el = slotRef.value;
  if (!el) {
    void load();
    return;
  }
  try {
    observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          void load();
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
  } catch {
    void load();
  }
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <span
    ref="slotRef"
    :aria-busy="loading"
    :aria-label="t('metrics.columnHealth')"
    :data-testid="`metric-health-slot-${metricId}`"
  >
    <Tag v-if="health" :color="healthColor[health]" :data-testid="`metric-health-${metricId}`">
      {{ t(`metrics.health.${health.toLowerCase()}`) }}
      <template v-if="score !== undefined"> {{ score }}% </template>
    </Tag>
    <Button
      v-else-if="failed"
      type="link"
      size="small"
      :data-testid="`metric-health-retry-${metricId}`"
      @click="retry"
    >
      {{ t('shared.retry') }}
    </Button>
    <span v-else-if="loading">{{ t('shared.loading') }}</span>
    <!-- Not yet in view: the cell stays blank until the lazy load runs. -->
    <span v-else />
  </span>
</template>
