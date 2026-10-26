<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Form, Input, Select, Space, message } from 'ant-design-vue';
import { createTestIncident, getTestIncident } from '@/api/testIncidents';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { TestIncident } from '@/types/quality';

const RESOLVE_REASONS = ['FalsePositive', 'MissingData', 'Duplicates', 'OutOfBounds', 'Other'] as const;

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const incident = ref<TestIncident | null>(null);
const nextStatus = ref('Ack');
const resolveReason = ref<(typeof RESOLVE_REASONS)[number]>('Other');
const resolveComment = ref('');
const activeTab = ref('overview');

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('observability.incidents.title'), to: { name: 'observability-incidents' } },
  {
    label:
      incident.value?.testCaseReference?.fullyQualifiedName ||
      entityLabel(incident.value?.testCaseReference) ||
      t('observability.incidents.title'),
  },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'incident-tab-overview' },
]);

function formatTs(value?: number): string {
  if (!value) {
    return '—';
  }
  const millis = value < 1e12 ? value * 1000 : value;
  return new Date(millis).toISOString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    incident.value = await getTestIncident(props.id);
    nextStatus.value = incident.value.testCaseResolutionStatusType === 'New' ? 'Ack' : 'Resolved';
  } catch (error) {
    incident.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onUpdateStatus(): Promise<void> {
  const reference = incident.value?.testCaseReference?.fullyQualifiedName || incident.value?.testCaseReference?.name;
  if (!reference) {
    message.error(t('observability.incidents.missingFqn'));
    return;
  }
  saving.value = true;
  try {
    if (nextStatus.value === 'Resolved' && !resolveComment.value.trim()) {
      message.error(t('observability.incidents.resolveCommentRequired'));
      saving.value = false;
      return;
    }
    await createTestIncident({
      testCaseResolutionStatusType: nextStatus.value,
      testCaseReference: reference,
      testCaseResolutionStatusDetails:
        nextStatus.value === 'Resolved'
          ? {
              testCaseFailureReason: resolveReason.value,
              testCaseFailureComment: resolveComment.value.trim(),
            }
          : undefined,
    });
    message.success(t('observability.incidents.recorded', { status: nextStatus.value }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('observability.incidents.updateFailed'));
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="
      incident?.testCaseReference?.fullyQualifiedName ||
      entityLabel(incident?.testCaseReference) ||
      t('observability.incidents.title')
    "
    :name="incident?.id"
    :lead="t('observability.incidents.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!incident && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="incident ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #overview>
      <Descriptions v-if="incident" bordered :column="1" size="small">
        <Descriptions.Item :label="t('observability.incidents.id')">{{ incident.id }}</Descriptions.Item>
        <Descriptions.Item :label="t('observability.incidents.stateId')">
          {{ incident.stateId || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.status')">
          {{ incidentStatusLabel(t, incident.testCaseResolutionStatusType) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('observability.incidents.severity')">
          {{ incident.severity || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('observability.incidents.updated')">
          {{ formatTs(incident.timestamp) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('observability.incidents.testCase')">
          {{ incident.testCaseReference?.fullyQualifiedName || incident.testCaseReference?.name || '—' }}
        </Descriptions.Item>
      </Descriptions>
      <Space v-if="incident" style="margin-top: 16px" wrap>
        <Select v-model:value="nextStatus" style="min-width: 160px" data-testid="incident-next-status">
          <Select.Option value="Ack">{{ t('observability.incidents.statusAck') }}</Select.Option>
          <Select.Option value="Resolved">{{ t('observability.incidents.statusResolved') }}</Select.Option>
        </Select>
        <Form.Item v-if="nextStatus === 'Resolved'" :label="t('observability.incidents.resolveReason')" style="margin-bottom: 0">
          <Select v-model:value="resolveReason" style="min-width: 180px">
            <Select.Option v-for="reason in RESOLVE_REASONS" :key="reason" :value="reason">
              {{ reason }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="nextStatus === 'Resolved'" :label="t('observability.incidents.resolveComment')" style="margin-bottom: 0">
          <Input v-model:value="resolveComment" data-testid="incident-resolve-comment" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="update-incident-status" @click="onUpdateStatus">
          {{ t('observability.incidents.recordStatus') }}
        </Button>
      </Space>
    </template>
  </EntityDetailShell>
</template>
