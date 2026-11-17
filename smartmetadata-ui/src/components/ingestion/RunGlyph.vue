<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { computed } from 'vue';
import { RUN_META } from '@/ingestion/agentsUtils';
import type { RunStatus } from '@/types/ingestion';

/**
 * Per-status run glyph, ported from official
 * components/ServiceAgents/components/RunGlyph.component.tsx (pin
 * a3012259ca). Official renders custom SVG assets; the fork maps each
 * status to the closest Ant Design filled icon and reuses RUN_META's
 * color variables. The running glyph spins (1.1s linear infinite, as
 * in pin); an unknown status falls back to the skipped glyph.
 */
const props = withDefaults(
  defineProps<{
    status: RunStatus;
    size?: number;
  }>(),
  { size: 16 },
);

const GLYPH_ICON: Record<RunStatus, Component> = {
  success: CheckCircleFilled,
  partial: ExclamationCircleFilled,
  failed: CloseCircleFilled,
  running: LoadingOutlined,
  skipped: MinusCircleFilled,
};

const icon = computed(() => GLYPH_ICON[props.status] ?? MinusCircleFilled);
const colorVar = computed(() => (RUN_META[props.status] ?? RUN_META.skipped).colorVar);
</script>

<template>
  <component
    :is="icon"
    class="run-glyph"
    :style="{
      color: `var(${colorVar})`,
      fontSize: `${size}px`,
      animation: status === 'running' ? 'run-glyph-spin 1.1s linear infinite' : undefined,
    }"
  />
</template>

<style scoped>
.run-glyph {
  flex-shrink: 0;
}

@keyframes run-glyph-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
