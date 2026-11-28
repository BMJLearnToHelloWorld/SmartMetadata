<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Vue counterpart to official ChipTrigger (inline incident status/severity).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { DownOutlined, UpOutlined } from '@ant-design/icons-vue';
import type { IncidentChipPalette } from '@/quality/incidentChipColors';

const props = defineProps<{
  label: string;
  palette: IncidentChipPalette;
  editable?: boolean;
  loading?: boolean;
  overlayOpen?: boolean;
  testId?: string;
  maxWidth?: string;
}>();

const pillStyle = computed(() => ({
  backgroundColor: props.palette.bg,
  color: props.palette.color,
  borderColor: props.palette.border,
  maxWidth: props.maxWidth,
}));
</script>

<template>
  <span
    class="incident-chip"
    :class="{ 'incident-chip--editable': editable && !loading, 'incident-chip--open': overlayOpen }"
    :data-testid="testId"
    :style="pillStyle"
  >
    <span class="incident-chip__label">{{ label }}</span>
    <DownOutlined v-if="editable && !overlayOpen" class="incident-chip__chevron" />
    <UpOutlined v-else-if="editable && overlayOpen" class="incident-chip__chevron" />
  </span>
</template>

<style scoped>
.incident-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
}
.incident-chip--editable {
  cursor: pointer;
}
.incident-chip__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.incident-chip__chevron {
  font-size: 10px;
}
</style>