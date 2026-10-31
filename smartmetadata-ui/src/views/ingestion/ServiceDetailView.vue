<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Descriptions, Form, Input, Modal, Tooltip, message } from 'ant-design-vue';
import { deleteDatabaseService, getDatabaseService, updateDatabaseService } from '@/api/databaseServices';
import {
  deleteDashboardService,
  getDashboardService,
  updateDashboardService,
} from '@/api/dashboardServices';
import { deleteMessagingService, getMessagingService, updateMessagingService } from '@/api/messagingServices';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import { buildServiceConnection, formValuesFromService, redactConnectionForDisplay } from '@/ingestion/connections';
import { cliSourceType } from '@/ingestion/cliWorkflow';
import type { CatalogService, ServiceFormValues, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editForm = reactive<ServiceFormValues>({
  name: '',
  kind: 'database',
  serviceType: 'Postgres',
  password: '',
  storeConnectionSecrets: false,
});

const kind = computed<ServiceKind>(() => {
  if (props.kind === 'messaging') {
    return 'messaging';
  }
  if (props.kind === 'dashboard') {
    return 'dashboard';
  }
  return 'database';
});
const supported = computed(() => Boolean(service.value && cliSourceType(service.value.serviceType)));
const connectionJson = computed(() =>
  JSON.stringify(redactConnectionForDisplay(service.value?.connection) ?? {}, null, 2),
);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('ingestion.services.title'), to: { name: 'ingestion-services' } },
  { label: entityLabel(service.value) || t('ingestion.services.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'service-tab-overview' },
  { key: 'connection', label: t('ingestion.services.connectionTab'), testId: 'service-tab-connection' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (kind.value === 'messaging') {
      service.value = await getMessagingService(props.id);
    } else if (kind.value === 'dashboard') {
      service.value = await getDashboardService(props.id);
    } else {
      service.value = await getDatabaseService(props.id);
    }
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!service.value) {
    return;
  }
  Object.assign(editForm, formValuesFromService(service.value));
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!service.value) {
    return;
  }
  saving.value = true;
  try {
    const body = {
      name: service.value.name,
      serviceType: service.value.serviceType,
      displayName: editForm.displayName?.trim() || undefined,
      description: editForm.description?.trim() || undefined,
      connection: buildServiceConnection(editForm, service.value.connection),
    };
    if (kind.value === 'messaging') {
      await updateMessagingService(body);
    } else if (kind.value === 'dashboard') {
      await updateDashboardService(body);
    } else {
      await updateDatabaseService(body);
    }
    editOpen.value = false;
    message.success(t('ingestion.services.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!service.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.services.deleteConfirm', { name: service.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  deleting.value = true;
  try {
    if (kind.value === 'messaging') {
      await deleteMessagingService(service.value.id);
    } else if (kind.value === 'dashboard') {
      await deleteDashboardService(service.value.id);
    } else {
      await deleteDatabaseService(service.value.id);
    }
    message.success(t('ingestion.services.deleted', { name: service.value.name }));
    await router.push({ name: 'ingestion-services' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

watch(
  () => [props.kind, props.id],
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
    :title="entityLabel(service) || t('ingestion.services.title')"
    :name="service?.name"
    :fqn="service?.fullyQualifiedName"
    :lead="t('ingestion.services.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!service && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="service ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-service" :disabled="!service || !supported" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
      <Tooltip :title="t('crud.deleteHelp')">
        <Button
          data-testid="delete-service"
          danger
          :disabled="!service"
          :loading="deleting"
          :aria-label="t('crud.deleteHelp')"
          @click="onDelete"
        >
          {{ t('crud.delete') }}
        </Button>
      </Tooltip>
    </template>
    <template #overview>
      <Alert
        v-if="service && !supported"
        type="info"
        show-icon
        :message="t('ingestion.services.unsupported')"
      />
      <Descriptions v-if="service" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ service.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ service.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.services.kind')">{{ service.kind }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ service.serviceType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.services.cliSource')">
          {{ cliSourceType(service.serviceType) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ service.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #connection>
      <p class="entity-detail__tab-lead">{{ t('ingestion.services.connectionTitle') }}</p>
      <p v-if="service" class="entity-detail__tab-lead" data-testid="service-connection-json-help">
        {{ t('ingestion.services.connectionJsonHelp') }}
      </p>
      <pre v-if="service" class="ing-json" data-testid="service-connection-json">{{ connectionJson }}</pre>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('ingestion.services.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <ServiceConnectionFields :form="editForm" />
    </Form>
  </Modal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-bottom: 12px;
}
.ing-json {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
</style>
