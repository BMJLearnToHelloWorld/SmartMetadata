<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official InlineSeverity: chip trigger + single-select severity menu.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dropdown, Menu, Spin } from 'ant-design-vue';
import IncidentChipTrigger from '@/components/observability/IncidentChipTrigger.vue';
import {
  INCIDENT_SEVERITY_CHIP_COLORS,
  type IncidentChipPalette,
} from '@/quality/incidentChipColors';
import { INCIDENT_SEVERITY_OPTIONS, officialSeverityLabel } from '@/quality/incidentSeverity';

const props = defineProps<{
  severity?: string;
  editable?: boolean;
  loading?: boolean;
  testId?: string;
}>();

const emit = defineEmits<{
  change: [severity: string | undefined];
}>();

const { t } = useI18n();
const open = ref(false);

const noSeverityLabel = computed(() =>
  t('label.no-entity', { entity: t('label.severity') }),
);

const label = computed(() => officialSeverityLabel(props.severity, noSeverityLabel.value));

const palette = computed<IncidentChipPalette>(() => {
  const key = props.severity ?? 'NoSeverity';
  return INCIDENT_SEVERITY_CHIP_COLORS[key] ?? INCIDENT_SEVERITY_CHIP_COLORS.NoSeverity;
});

function onMenuClick({ key }: { key: string }): void {
  open.value = false;
  emit('change', key === 'none' ? undefined : key);
}
</script>

<template>
  <Dropdown
    v-if="editable"
    :open="open"
    :trigger="['click']"
    @update:open="(value) => { open = value; }"
  >
    <span @click.prevent>
      <IncidentChipTrigger
        :label="label"
        :palette="palette"
        :editable="!loading"
        :loading="loading"
        :overlay-open="open"
        :test-id="testId ?? 'incident-severity-chip'"
        max-width="11rem"
      />
    </span>
    <template #overlay>
      <Menu :selected-keys="[severity ?? 'none']" @click="onMenuClick">
        <Menu.Item key="none" data-testid="incident-severity-option-none">
          {{ noSeverityLabel }}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          v-for="option in INCIDENT_SEVERITY_OPTIONS"
          :key="option"
          :data-testid="`incident-severity-option-${option}`"
        >
          {{ officialSeverityLabel(option, option) }}
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
  <IncidentChipTrigger
    v-else
    :label="label"
    :palette="palette"
    :test-id="testId ?? 'incident-severity-chip'"
    max-width="11rem"
  />
  <Spin v-if="loading" size="small" class="incident-inline-severity__spin" />
</template>

<style scoped>
.incident-inline-severity__spin {
  margin-left: 6px;
}
</style>