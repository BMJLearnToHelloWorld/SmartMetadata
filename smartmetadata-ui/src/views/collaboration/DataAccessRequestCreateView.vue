<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Select, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { createTask } from '@/api/tasks';
import { requiredField } from '@/features/crud/formRules';
import { toEntityLink } from '@/quality/entityLink';
import {
  DATA_ACCESS_PERMISSIONS,
  DATA_ACCESS_TYPES,
  type DataAccessRequestPayload,
} from '@/types/collaboration';

const router = useRouter();
const { t } = useI18n();

const creating = ref(false);
const errorMessage = ref('');
const form = reactive({
  entityType: 'table',
  entityFqn: '',
  accessType: 'FullAccess',
  requestedAccess: 'Read',
  columns: '',
  duration: '',
  reason: '',
  ticketId: '',
  expirationDate: '',
  extraAssets: '',
});

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function onSubmit(): Promise<void> {
  if (!form.entityFqn.trim() || !form.reason.trim()) {
    errorMessage.value = t('collaboration.dataAccess.requiredNote');
    return;
  }
  const columns = splitList(form.columns);
  if (form.accessType === 'ColumnLevel' && columns.length === 0) {
    errorMessage.value = t('collaboration.dataAccess.columnsRequired');
    return;
  }
  creating.value = true;
  errorMessage.value = '';
  try {
    const expirationMs = form.expirationDate.trim()
      ? new Date(form.expirationDate.trim()).getTime()
      : undefined;
    const payload: DataAccessRequestPayload = {
      accessType: form.accessType,
      requestedAccess: form.requestedAccess,
      // Columns only scope a ColumnLevel request (spec field note);
      // they are not sent for broader scopes.
      columns: form.accessType === 'ColumnLevel' && columns.length ? columns : undefined,
      duration: form.duration.trim() || undefined,
      reason: form.reason.trim(),
      // Additional assets ride the same entity type as the target and
      // are only sent when the requester names them; the target itself
      // travels as the task's about link.
      assets: splitList(form.extraAssets).map((fqn) => ({
        type: form.entityType,
        fullyQualifiedName: fqn,
      })),
      ticketId: form.ticketId.trim() || undefined,
      expirationDate: Number.isFinite(expirationMs) ? expirationMs : undefined,
    };
    if (!payload.assets?.length) {
      delete payload.assets;
    }
    const created = await createTask({
      category: 'DataAccess',
      type: 'DataAccessRequest',
      about: toEntityLink(form.entityType, form.entityFqn),
      payload,
    });
    message.success(t('collaboration.dataAccess.created', { name: created.name || created.id }));
    await router.push({ name: 'task', params: { id: created.id } });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.dataAccess.createFailed');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Card>
    <PageHeader :header="t('collaboration.dataAccess.createTitle')" :sub-header="t('collaboration.dataAccess.createLead')" />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="dar-alert" />
    <Form layout="vertical" class="dar-form">
      <Form.Item :label="t('collaboration.tasks.entityType')" :extra="t('collaboration.tasks.entityTypeHelp')" :rules="requiredField(t, t('collaboration.tasks.entityType'))">
        <Select v-model:value="form.entityType">
          <Select.Option value="table">table</Select.Option>
          <Select.Option value="topic">topic</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('collaboration.tasks.fqn')" :extra="t('collaboration.tasks.fqnHelp')" :rules="requiredField(t, t('collaboration.tasks.fqn'))">
        <Input v-model:value="form.entityFqn" data-testid="dar-target-fqn" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.accessType')" :rules="requiredField(t, t('collaboration.dataAccess.accessType'))">
        <Select v-model:value="form.accessType" data-testid="dar-access-type">
          <Select.Option v-for="item in DATA_ACCESS_TYPES" :key="item" :value="item">
            {{ item }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.requestedAccess')">
        <Select v-model:value="form.requestedAccess" data-testid="dar-requested-access">
          <Select.Option v-for="item in DATA_ACCESS_PERMISSIONS" :key="item" :value="item">
            {{ item }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.columns')" :extra="t('collaboration.dataAccess.columnsHelp')">
        <Input.TextArea v-model:value="form.columns" data-testid="dar-columns" :rows="2" :placeholder="t('collaboration.dataAccess.columnsPlaceholder')" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.duration')" :extra="t('collaboration.dataAccess.durationHelp')">
        <Input v-model:value="form.duration" data-testid="dar-duration" :placeholder="t('collaboration.dataAccess.durationPlaceholder')" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.reason')" :rules="requiredField(t, t('collaboration.dataAccess.reason'))">
        <Input.TextArea v-model:value="form.reason" data-testid="dar-reason" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.ticketId')" :extra="t('collaboration.dataAccess.ticketIdHelp')">
        <Input v-model:value="form.ticketId" data-testid="dar-ticket-id" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.expirationDate')">
        <Input v-model:value="form.expirationDate" data-testid="dar-expiration-date" type="datetime-local" />
      </Form.Item>
      <Form.Item :label="t('collaboration.dataAccess.extraAssets')" :extra="t('collaboration.dataAccess.extraAssetsHelp')">
        <Input.TextArea v-model:value="form.extraAssets" data-testid="dar-extra-assets" :rows="2" :placeholder="t('collaboration.dataAccess.extraAssetsPlaceholder')" />
      </Form.Item>
      <Button type="primary" data-testid="dar-submit" :loading="creating" @click="onSubmit">
        {{ t('collaboration.dataAccess.submit') }}
      </Button>
    </Form>
  </Card>
</template>

<style scoped>
.dar-alert {
  margin: 16px 0;
}
.dar-form {
  margin-top: 16px;
  max-width: 640px;
}
</style>
