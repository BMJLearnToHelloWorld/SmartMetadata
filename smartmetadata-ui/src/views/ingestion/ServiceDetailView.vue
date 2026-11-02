<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Descriptions, Form, Input, Modal, Table, Tooltip, message } from 'ant-design-vue';
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import { SERVICE_DETAIL_TABS } from '@/catalog/ingestionTabs';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import SmState from '@/components/shared/SmState.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { buildServiceConnection, formValuesFromService, redactConnectionForDisplay } from '@/ingestion/connections';
import { cliSourceType } from '@/ingestion/cliWorkflow';
import { SERVICE_DELETE_API, SERVICE_GET_API, SERVICE_UPDATE_API } from '@/ingestion/serviceApis';
import type {
  CatalogService,
  IngestionPipeline,
  ServiceFormValues,
  ServiceKind,
} from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string; initialTab?: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const activeTab = ref(props.initialTab ?? 'overview');
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

const kind = computed<ServiceKind>(() =>
  (['messaging', 'dashboard', 'storage', 'pipeline'] as readonly string[]).includes(props.kind)
    ? (props.kind as ServiceKind)
    : 'database',
);
const supported = computed(() => Boolean(service.value && cliSourceType(service.value.serviceType)));
const connectionJson = computed(() =>
  JSON.stringify(redactConnectionForDisplay(service.value?.connection) ?? {}, null, 2),
);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('ingestion.services.title'), to: { name: 'ingestion-services' } },
  { label: entityLabel(service.value) || t('ingestion.services.title') },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  SERVICE_DETAIL_TABS.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `service-tab-${tab.key}`,
  })),
);
const servicePipelines = ref<IngestionPipeline[]>([]);
const pipelinesLoading = ref(false);
const pipelinesError = ref('');
const pipelinesLoaded = ref(false);
const pipelineColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: t('crud.enabled'), key: 'enabled', width: 100 },
]);
const residualByKey = computed(() => {
  const map = new Map<string, string>();
  for (const tab of SERVICE_DETAIL_TABS) {
    if (!tab.supported && tab.residualReason) {
      map.set(tab.key, tab.residualReason);
    }
  }
  return map;
});

async function loadPipelines(): Promise<void> {
  if (!service.value?.fullyQualifiedName || pipelinesLoaded.value) {
    return;
  }
  pipelinesLoading.value = true;
  pipelinesError.value = '';
  try {
    const page = await listIngestionPipelines({ service: service.value.fullyQualifiedName, limit: 100 });
    servicePipelines.value = page.data;
    pipelinesLoaded.value = true;
  } catch {
    servicePipelines.value = [];
    pipelinesError.value = t('crud.loadFailed');
  } finally {
    pipelinesLoading.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind.value](props.id);
    pipelinesLoaded.value = false;
    servicePipelines.value = [];
    if (activeTab.value === 'pipelines') {
      await loadPipelines();
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
    await SERVICE_UPDATE_API[kind.value](body);
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
    await SERVICE_DELETE_API[kind.value](service.value.id);
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

watch(activeTab, (tab) => {
  if (tab === 'pipelines') {
    void loadPipelines();
  }
});

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
      <Button
        v-if="service"
        data-testid="edit-service-connection"
        @click="router.push({ name: 'ingestion-service-connection', params: { kind: props.kind, id: props.id } })"
      >
        {{ t('ingestion.services.editConnection') }}
      </Button>
      <p v-if="service" class="entity-detail__tab-lead" data-testid="service-connection-json-help">
        {{ t('ingestion.services.connectionJsonHelp') }}
      </p>
      <pre v-if="service" class="ing-json" data-testid="service-connection-json">{{ connectionJson }}</pre>
    </template>
    <template #pipelines>
      <SmState
        v-if="pipelinesError"
        state="error"
        test-id="service-pipelines-error"
        :error-text="pipelinesError"
      />
      <Table
        v-else
        data-testid="service-pipelines-table"
        row-key="id"
        size="small"
        :columns="pipelineColumns"
        :data-source="servicePipelines"
        :loading="pipelinesLoading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`service-pipeline-${(record as IngestionPipeline).id}`"
              @click.prevent="router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })"
            >
              {{ entityLabel(record as IngestionPipeline) }}
            </a>
          </template>
          <template v-else-if="column.key === 'enabled'">
            {{ (record as IngestionPipeline).enabled === false ? t('crud.no') : t('crud.yes') }}
          </template>
        </template>
      </Table>
    </template>
    <template #assets>
      <SmState state="empty" test-id="service-assets-residual" :empty-text="residualByKey.get('assets')" />
    </template>
    <template #insights>
      <SmState state="empty" test-id="service-insights-residual" :empty-text="residualByKey.get('insights')" />
    </template>
    <template #agents>
      <SmState state="empty" test-id="service-agents-residual" :empty-text="residualByKey.get('agents')" />
    </template>
    <template #versions>
      <SmState state="empty" test-id="service-versions-residual" :empty-text="residualByKey.get('versions')" />
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
  color: var(--ant-color-text-secondary, #414651);
  margin-bottom: 12px;
}
.ing-json {
  background: var(--sm-content-bg);
  border: 1px solid var(--sm-border-secondary);
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
</style>
