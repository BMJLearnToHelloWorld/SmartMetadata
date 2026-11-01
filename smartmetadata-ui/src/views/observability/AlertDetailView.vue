<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Form, Input, Switch, Table, message } from 'ant-design-vue';
import { getEventSubscription, updateEventSubscription } from '@/api/eventSubscriptions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { EventSubscription } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const alert = ref<EventSubscription | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({ displayName: '', description: '', enabled: true, endpoint: '' });

function openEdit(): void {
  if (!alert.value) {
    return;
  }
  editForm.displayName = alert.value.displayName || '';
  editForm.description = alert.value.description || '';
  editForm.enabled = alert.value.enabled !== false;
  editForm.endpoint = alert.value.destinations[0]?.endpoint || '';
  editOpen.value = true;
}

async function onSaveEdit(): Promise<void> {
  if (!alert.value) {
    return;
  }
  saving.value = true;
  try {
    await updateEventSubscription({
      name: alert.value.name,
      alertType: alert.value.alertType || 'Observability',
      displayName: editForm.displayName.trim() || undefined,
      description: editForm.description.trim() || undefined,
      enabled: editForm.enabled,
      destinations: editForm.endpoint.trim()
        ? [{ category: 'External', type: 'Webhook', config: { endpoint: editForm.endpoint.trim() } }]
        : [],
    });
    editOpen.value = false;
    message.success(t('observability.alerts.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('observability.alerts.updateFailed'));
  } finally {
    saving.value = false;
  }
}

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('observability.alerts.title'), to: { name: 'observability-alerts' } },
  { label: entityLabel(alert.value) || t('observability.alerts.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'alert-tab-overview' },
  { key: 'destinations', label: t('observability.alerts.destinationsTab'), testId: 'alert-tab-destinations' },
]);

const destinationColumns = computed<EntityListColumn[]>(() => [
  { title: t('observability.alerts.category'), dataIndex: 'category', key: 'category' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type' },
  { title: t('observability.alerts.endpoint'), dataIndex: 'endpoint', key: 'endpoint' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    alert.value = await getEventSubscription(props.id);
  } catch (error) {
    alert.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
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
    :title="entityLabel(alert) || t('observability.alerts.title')"
    :name="alert?.name"
    :fqn="alert?.fullyQualifiedName"
    :lead="t('observability.alerts.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!alert && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="alert ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-alert" :disabled="!alert" @click="openEdit">{{ t('observability.alerts.edit') }}</Button>
    </template>
    <template #overview>
      <Descriptions v-if="alert" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ alert.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('observability.alerts.type')">{{ alert.alertType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.enabled')">
          {{ alert.enabled === false ? t('crud.no') : t('crud.yes') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ alert.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #destinations>
      <Table
        v-if="alert"
        row-key="type"
        size="small"
        :columns="destinationColumns"
        :data-source="alert.destinations"
        :pagination="false"
      />
    </template>
  </EntityDetailShell>
  <FormModal
    v-model:open="editOpen"
    :title="t('observability.alerts.editTitle')"
    :confirm-loading="saving"
    test-id="edit-alert-modal"
    @ok="onSaveEdit"
    @cancel="editOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="editForm.displayName" data-testid="edit-alert-display-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.enabled')">
        <Switch v-model:checked="editForm.enabled" data-testid="edit-alert-enabled" />
      </Form.Item>
      <Form.Item :label="t('observability.alerts.endpoint')">
        <Input v-model:value="editForm.endpoint" data-testid="edit-alert-endpoint" />
      </Form.Item>
    </Form>
  </FormModal>
</template>
