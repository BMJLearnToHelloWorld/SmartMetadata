<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseIncidentManagerStatus isInline + InlineTestCaseIncidentStatus.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Spin } from 'ant-design-vue';
import { listTestIncidents } from '@/api/testIncidents';
import IncidentInlineStatus from '@/components/observability/IncidentInlineStatus.vue';
import {
  incidentStatusMenuOptions,
  reopenResolvedIncident,
  submitIncidentStatusChange,
  type StatusChangeAdditionalData,
} from '@/features/quality/incidentManager';
import { usePermissionStore } from '@/stores/permissions';
import type { TestCase, TestIncident, IncidentStatus } from '@/types/quality';
import { message } from 'ant-design-vue';

const props = defineProps<{
  testCase: TestCase;
}>();

const emit = defineEmits<{
  incidentUpdated: [testCaseId: string, status?: string];
}>();

const { t } = useI18n();
const permissionStore = usePermissionStore();
const incident = ref<TestIncident | undefined>();
const loading = ref(false);
const writing = ref(false);

const editable = computed(() => permissionStore.isAdminUser && !props.testCase.deleted);

const menuOptions = computed(() =>
  incidentStatusMenuOptions(incident.value?.testCaseResolutionStatusType),
);

const showInline = computed(
  () => incident.value?.testCaseResolutionStatusType || props.testCase.incidentStatus,
);

async function loadIncident(): Promise<void> {
  if (!props.testCase.fullyQualifiedName) {
    incident.value = undefined;
    return;
  }
  if (!props.testCase.incidentStatus && !props.testCase.incidentId) {
    incident.value = undefined;
    return;
  }
  loading.value = true;
  try {
    const page = await listTestIncidents({
      testCaseFQN: props.testCase.fullyQualifiedName,
      latest: true,
      limit: 1,
    });
    incident.value = page.data[0];
  } catch {
    incident.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function onTransition(status: IncidentStatus, additional?: StatusChangeAdditionalData): Promise<void> {
  const record = incident.value;
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
      incident.value = latest;
      emit('incidentUpdated', props.testCase.id, latest.testCaseResolutionStatusType);
    }
  } catch {
    message.error(t('observability.incidents.updateFailed'));
  } finally {
    writing.value = false;
  }
}

watch(
  () => [props.testCase.fullyQualifiedName, props.testCase.incidentStatus, props.testCase.incidentId],
  () => {
    void loadIncident();
  },
);

onMounted(() => {
  void loadIncident();
});
</script>

<template>
  <Spin v-if="loading" size="small" />
  <IncidentInlineStatus
    v-else-if="incident && showInline"
    :record="incident"
    :editable="editable"
    :loading="writing"
    :menu-options="menuOptions"
    :test-id="`test-case-list-incident-${testCase.id}`"
    @transition="onTransition"
  />
  <span v-else>—</span>
</template>