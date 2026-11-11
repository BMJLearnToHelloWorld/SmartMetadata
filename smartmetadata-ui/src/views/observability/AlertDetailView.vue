<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Descriptions, Form, Input, InputNumber, Select, Switch, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { deleteEventSubscription, getEventSubscription, updateEventSubscription } from '@/api/eventSubscriptions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { EventSubscription } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
/**
 * Official NotificationListPage row gating: edit needs EditAll, delete
 * needs Delete on this alert's entity permission by FQN. A missing or
 * failed fetch denies.
 */
const permissionStore = usePermissionStore();
const alertOps = ref<OperationPermissions>({});
const canEditAlert = computed(() => alertOps.value.EditAll === true);
const canDeleteAlert = computed(() => alertOps.value.Delete === true);
const loading = ref(false);
const errorMessage = ref('');
const alert = ref<EventSubscription | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  enabled: true,
  endpoint: '',
  destinationType: 'Webhook',
  readTimeout: 12,
  resources: [] as string[],
});

/** Official AlertDetails filters rendering: Include renders ===, anything else !==. */
function filterRuleText(rule: { name?: string; effect?: string; condition?: string | string[] }): string {
  const conditions = Array.isArray(rule.condition) ? rule.condition.join(', ') : (rule.condition ?? '');
  const effect = rule.effect === 'Include' ? '===' : '!==';
  return [rule.name, effect, conditions].filter(Boolean).join(' ');
}

async function onDeleteAlert(): Promise<void> {
  if (!alert.value || !canDeleteAlert.value) {
    if (alert.value) {
      message.error(t('errors.forbidden'));
    }
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: entityLabel(alert.value) }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteEventSubscription(alert.value.id);
    message.success(t('crud.deletedName', { name: entityLabel(alert.value) }));
    await router.push({ name: 'observability-alerts' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

function openEdit(): void {
  if (!alert.value || !canEditAlert.value) {
    if (alert.value) {
      message.error(t('errors.forbidden'));
    }
    return;
  }
  editForm.displayName = alert.value.displayName || '';
  editForm.description = alert.value.description || '';
  editForm.enabled = alert.value.enabled !== false;
  editForm.endpoint = alert.value.destinations[0]?.endpoint || '';
  editForm.destinationType = alert.value.destinations[0]?.type || 'Webhook';
  editForm.readTimeout = alert.value.destinations[0]?.readTimeout ?? 12;
  editForm.resources = [...(alert.value.filteringRules?.resources ?? [])];
  editOpen.value = true;
}

async function onSaveEdit(): Promise<void> {
  if (!alert.value || !canEditAlert.value) {
    if (alert.value) {
      message.error(t('errors.forbidden'));
    }
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
      // Top-level resources, as on create: the schema has no
      // filteringRules field.
      resources: editForm.resources,
      destinations: editForm.endpoint.trim()
        ? [
            {
              category: 'External',
              type: editForm.destinationType,
              config: { endpoint: editForm.endpoint.trim() },
              readTimeout: editForm.readTimeout,
            },
          ]
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
  { title: t('observability.alerts.readTimeout'), dataIndex: 'readTimeout', key: 'readTimeout' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    alert.value = await getEventSubscription(props.id);
    try {
      alertOps.value = alert.value.fullyQualifiedName
        ? await permissionStore.getEntityPermissionByFqn('eventsubscription', alert.value.fullyQualifiedName)
        : {};
    } catch {
      alertOps.value = {};
    }
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
      <Button data-testid="edit-alert" :disabled="!alert || !canEditAlert" @click="openEdit">{{ t('observability.alerts.edit') }}</Button>
      <Button danger data-testid="delete-alert" :disabled="!alert || !canDeleteAlert" @click="onDeleteAlert">{{ t('crud.delete') }}</Button>
    </template>
    <template #overview>
      <Descriptions v-if="alert" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ alert.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('observability.alerts.type')">{{ alert.alertType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.enabled')">
          {{ alert.enabled === false ? t('crud.no') : t('crud.yes') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ alert.description || '—' }}</Descriptions.Item>
        <Descriptions.Item v-if="alert.filteringRules?.resources?.length" :label="t('observability.alerts.trigger')">
          {{ alert.filteringRules.resources.join(', ') }}
        </Descriptions.Item>
        <Descriptions.Item v-if="alert.filteringRules?.rules?.length" :label="t('observability.alerts.filters')">
          <div v-for="rule in alert.filteringRules.rules" :key="rule.name">
            <code>{{ filterRuleText(rule) }}</code>
          </div>
        </Descriptions.Item>
        <Descriptions.Item v-if="alert.owners?.length" :label="t('crud.owners')">
          {{ alert.owners.map((owner) => owner.displayName || owner.name).filter(Boolean).join(', ') }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #destinations>
      <SmTable
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
      <Form.Item :label="t('observability.alerts.destinationType')">
        <Select v-model:value="editForm.destinationType">
          <Select.Option value="Webhook">Webhook</Select.Option>
          <Select.Option value="Slack">Slack</Select.Option>
          <Select.Option value="MsTeams">MsTeams</Select.Option>
          <Select.Option value="GChat">GChat</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('observability.alerts.endpoint')">
        <Input v-model:value="editForm.endpoint" data-testid="edit-alert-endpoint" />
      </Form.Item>
      <Form.Item :label="t('observability.alerts.readTimeout')">
        <InputNumber v-model:value="editForm.readTimeout" :min="0" data-testid="edit-alert-read-timeout" />
      </Form.Item>
      <Form.Item :label="t('observability.alerts.resources')">
        <Select v-model:value="editForm.resources" mode="tags" data-testid="edit-alert-resources" />
      </Form.Item>
    </Form>
  </FormModal>
</template>
