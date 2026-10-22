<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Form, Input, Select, Space, Spin, Typography, message } from 'ant-design-vue';
import { createTestIncident, getTestIncident } from '@/api/testIncidents';
import type { TestIncident } from '@/types/quality';

const RESOLVE_REASONS = ['FalsePositive', 'MissingData', 'Duplicates', 'OutOfBounds', 'Other'] as const;

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const incident = ref<TestIncident | null>(null);
const nextStatus = ref('Ack');
const resolveReason = ref<(typeof RESOLVE_REASONS)[number]>('Other');
const resolveComment = ref('');

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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load incident';
  } finally {
    loading.value = false;
  }
}

async function onUpdateStatus(): Promise<void> {
  const reference = incident.value?.testCaseReference?.fullyQualifiedName || incident.value?.testCaseReference?.name;
  if (!reference) {
    message.error('Cannot update status without a test case FQN');
    return;
  }
  saving.value = true;
  try {
    if (nextStatus.value === 'Resolved' && !resolveComment.value.trim()) {
      message.error('Resolved requires a failure comment');
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
    message.success(`Recorded status ${nextStatus.value}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update incident status failed');
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
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">Incident</Typography.Title>
      <Typography.Paragraph type="secondary">
        GET /api/v1/dataQuality/testCases/testCaseIncidentStatus/{id}. Status changes POST a new
        resolution record (CreateTestCaseResolutionStatus requires type + testCaseReference).
      </Typography.Paragraph>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Descriptions v-if="incident" bordered :column="1" size="small" class="dq-desc">
        <Descriptions.Item label="Id">{{ incident.id }}</Descriptions.Item>
        <Descriptions.Item label="State id">{{ incident.stateId || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Status">{{ incident.testCaseResolutionStatusType || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Severity">{{ incident.severity || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Timestamp">{{ formatTs(incident.timestamp) }}</Descriptions.Item>
        <Descriptions.Item label="Test case">
          {{ incident.testCaseReference?.fullyQualifiedName || incident.testCaseReference?.name || '—' }}
        </Descriptions.Item>
      </Descriptions>
      <Space v-if="incident" class="dq-actions">
        <Select v-model:value="nextStatus" style="min-width: 160px" data-testid="incident-next-status">
          <Select.Option value="Ack">Ack</Select.Option>
          <Select.Option value="Resolved">Resolved</Select.Option>
        </Select>
        <Form.Item v-if="nextStatus === 'Resolved'" label="Reason" style="margin-bottom: 0">
          <Select v-model:value="resolveReason" style="min-width: 180px">
            <Select.Option v-for="reason in RESOLVE_REASONS" :key="reason" :value="reason">
              {{ reason }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="nextStatus === 'Resolved'" label="Comment" style="margin-bottom: 0">
          <Input v-model:value="resolveComment" data-testid="incident-resolve-comment" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="update-incident-status" @click="onUpdateStatus">
          Record status
        </Button>
        <Button @click="router.push({ name: 'observability-incidents' })">Back to incidents</Button>
      </Space>
    </Card>
  </Spin>
</template>

<style scoped>
.dq-desc,
.dq-actions {
  margin-top: 16px;
}
</style>
