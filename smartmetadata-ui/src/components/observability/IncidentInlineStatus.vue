<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official inline status chip: audit tooltip + chip menu for allowed transitions.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dropdown, Menu, Tooltip } from 'ant-design-vue';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import { entityLabel } from '@/features/crud/paging';
import { formatMediumDate } from '@/utils/dates';
import type { IncidentStatus, TestIncident } from '@/types/quality';
import IncidentChipTrigger from '@/components/observability/IncidentChipTrigger.vue';
import { INCIDENT_STATUS_CHIP_COLORS } from '@/quality/incidentChipColors';

const props = defineProps<{
  record: TestIncident;
  editable?: boolean;
  loading?: boolean;
  menuOptions: IncidentStatus[];
  testId?: string;
}>();

const emit = defineEmits<{
  select: [status: IncidentStatus];
}>();

const { t } = useI18n();
const open = ref(false);

const status = computed(() => props.record.testCaseResolutionStatusType as IncidentStatus);

const chipLabel = computed(() => incidentStatusLabel(t, status.value));

const palette = computed(
  () => INCIDENT_STATUS_CHIP_COLORS[status.value] ?? INCIDENT_STATUS_CHIP_COLORS.New,
);

const auditTooltip = computed(() => {
  const updatedAt = props.record.updatedAt ?? props.record.timestamp;
  if (!updatedAt) {
    return '';
  }
  const formatted = formatMediumDate(updatedAt);
  const by = entityLabel(props.record.updatedBy);
  if (by) {
    return `${formatted} ${t('label.by-lowercase')} ${by}`;
  }
  return formatted;
});

function onMenuClick({ key }: { key: string }): void {
  open.value = false;
  emit('select', key as IncidentStatus);
}
</script>

<template>
  <Tooltip :title="auditTooltip || undefined" placement="bottom">
    <Dropdown
      v-if="editable"
      :open="open"
      :trigger="['click']"
      @update:open="(value) => { open = value; }"
    >
      <span @click.prevent>
        <IncidentChipTrigger
          :label="chipLabel"
          :palette="palette"
          :editable="!loading"
          :loading="loading"
          :overlay-open="open"
          :test-id="testId"
        />
      </span>
      <template #overlay>
        <Menu :selected-keys="[status]" @click="onMenuClick">
          <Menu.Item
            v-for="option in menuOptions"
            :key="option"
            :data-testid="`incident-status-option-${option}`"
          >
            {{ incidentStatusLabel(t, option) }}
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
    <IncidentChipTrigger
      v-else
      :label="chipLabel"
      :palette="palette"
      :test-id="testId"
    />
  </Tooltip>
</template>