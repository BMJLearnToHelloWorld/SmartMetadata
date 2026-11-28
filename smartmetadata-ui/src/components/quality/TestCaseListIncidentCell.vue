<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataQualityTab renderIncidentCell + TestCaseIncidentManagerStatus isInline.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Skeleton, message } from 'ant-design-vue';
import IncidentInlineStatus from '@/components/observability/IncidentInlineStatus.vue';
import {
  incidentStatusMenuOptions,
  reopenResolvedIncident,
  submitIncidentStatusChange,
  type StatusChangeAdditionalData,
} from '@/features/quality/incidentManager';
import type { TestCase, TestIncident, IncidentStatus } from '@/types/quality';

const props = defineProps<{
  testCase: TestCase;
  incident?: TestIncident;
  editable: boolean;
  incidentsLoading?: boolean;
}>();

const emit = defineEmits<{
  incidentUpdated: [testCaseId: string, latest: TestIncident];
}>();

const { t } = useI18n();
const writing = ref(false);
const incidentRecord = ref<TestIncident | undefined>(props.incident);

const menuOptions = computed(() =>
  incidentStatusMenuOptions(incidentRecord.value?.testCaseResolutionStatusType),
);

const showInline = computed(() => Boolean(incidentRecord.value?.testCaseResolutionStatusType));

function syncIncident(next?: TestIncident): void {
  incidentRecord.value = next;
}

watch(
  () => props.incident,
  (next) => {
    syncIncident(next);
  },
);

async function onTransition(status: IncidentStatus, additional?: StatusChangeAdditionalData): Promise<void> {
  const record = incidentRecord.value;
  if (!record || writing.value) {
    return;
  }
  writing.value = true;
  try {
    const fqn = props.testCase.fullyQualifiedName;
    const current = record.testCaseResolutionStatusType;
    let latest: TestIncident | undefined;
    if (current === 'Resolved' && fqn) {
      latest = await reopenResolvedIncident({
        testCaseFqn: fqn,
        testCaseName: props.testCase.name,
        targetStatus: status,
        currentStateId: record.stateId,
        details: additional,
      });
    } else {
      latest = await submitIncidentStatusChange(record, status, additional);
    }
    if (latest) {
      syncIncident(latest);
      emit('incidentUpdated', props.testCase.id, latest);
    }
  } catch {
    message.error(t('observability.incidents.updateFailed'));
  } finally {
    writing.value = false;
  }
}
</script>

<template>
  <Skeleton
    v-if="incidentsLoading"
    :title="false"
    active
    :paragraph="{ rows: 1, width: 60 }"
    data-testid="test-case-list-incident-loading"
  />
  <IncidentInlineStatus
    v-else-if="incidentRecord && showInline"
    :record="incidentRecord"
    :editable="editable"
    :loading="writing"
    :menu-options="menuOptions"
    :test-id="`test-case-list-incident-${testCase.id}`"
    @transition="onTransition"
  />
  <span v-else>—</span>
</template>