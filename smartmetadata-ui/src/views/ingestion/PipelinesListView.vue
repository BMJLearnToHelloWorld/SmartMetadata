<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { listDatabaseServices } from '@/api/databaseServices';
import { createIngestionPipeline, listIngestionPipelines } from '@/api/ingestionPipelines';
import { listMessagingServices } from '@/api/messagingServices';
import { entityTypeForKind } from '@/ingestion/connections';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import type { CatalogService, IngestionPipeline, PipelineFormValues } from '@/types/ingestion';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const pipelines = ref<IngestionPipeline[]>([]);
const catalogServices = ref<CatalogService[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive<PipelineFormValues>({
  name: '',
  displayName: '',
  description: '',
  pipelineType: 'metadata',
  serviceId: '',
  serviceKind: 'database',
  includeViews: true,
  includeSchemas: '',
  includeTopics: '',
  scheduleInterval: '',
});

const selectedService = computed(
  () => catalogServices.value.find((item) => item.id === form.serviceId) ?? null,
);

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: 'Service', key: 'service' },
  { title: 'Enabled', key: 'enabled', width: 100 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [page, databases, messaging] = await Promise.all([
      listIngestionPipelines({ limit: 100 }),
      listDatabaseServices({ limit: 100 }),
      listMessagingServices({ limit: 100 }),
    ]);
    pipelines.value = page.data;
    total.value = page.total;
    catalogServices.value = [...databases.data, ...messaging.data];
  } catch (error) {
    pipelines.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load pipelines';
  } finally {
    loading.value = false;
  }
}

function onServiceChange(id: string): void {
  form.serviceId = id;
  const service = catalogServices.value.find((item) => item.id === id);
  if (service) {
    form.serviceKind = service.kind;
  }
}

async function onCreate(): Promise<void> {
  const service = selectedService.value;
  if (!service) {
    message.error('Select a service');
    return;
  }
  creating.value = true;
  try {
    const created = await createIngestionPipeline({
      name: form.name.trim(),
      pipelineType: 'metadata',
      service: { id: service.id, type: entityTypeForKind(service.kind) },
      sourceConfig: buildSourceConfig({ ...form, serviceKind: service.kind }),
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: form.scheduleInterval?.trim() || undefined,
      },
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
    });
    createOpen.value = false;
    message.success(`Created pipeline ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create pipeline failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="ing-head">
        <div>
          <Typography.Title :level="4">Ingestion pipelines</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/services/ingestionPipelines. CreateIngestionPipeline still requires
            <code>sourceConfig</code> + <code>airflowConfig</code> even though this console does not
            deploy Airflow DAGs. Jobs run with <code>smartmetadata-ingest run</code>.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-pipeline" @click="createOpen = true">Create pipeline</Button>
      </div>
      <Alert
        type="info"
        show-icon
        message="Trigger and deploy call the server pipeline-service client (Airflow). They are not offered here. Status below is the catalog record; run history is GET /{fqn}/pipelineStatus."
      />
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="pipelines-table"
        :columns="columns"
        :data-source="pipelines"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`pipeline-row-${(record as IngestionPipeline).id}`"
              @click.prevent="
                router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })
              "
            >
              {{ (record as IngestionPipeline).displayName || (record as IngestionPipeline).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'service'">
            {{ (record as IngestionPipeline).service?.name || '—' }}
          </template>
          <template v-else-if="column.key === 'enabled'">
            {{ (record as IngestionPipeline).enabled === false ? 'no' : 'yes' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ pipelines.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create ingestion pipeline" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-pipeline-name" />
        </Form.Item>
        <Form.Item label="Service" required>
          <Select
            :value="form.serviceId"
            data-testid="create-pipeline-service"
            placeholder="Select a catalog service"
            @update:value="onServiceChange"
          >
            <Select.Option v-for="item in catalogServices" :key="item.id" :value="item.id">
              {{ item.name }} ({{ item.serviceType }})
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item v-if="form.serviceKind === 'database'">
          <Checkbox v-model:checked="form.includeViews" data-testid="create-pipeline-include-views">
            Include views (catalog includeViews; CLI includeViewLineage)
          </Checkbox>
        </Form.Item>
        <Form.Item v-if="form.serviceKind === 'database'" label="Include schemas">
          <Input v-model:value="form.includeSchemas" placeholder="public, analytics" />
        </Form.Item>
        <Form.Item v-if="form.serviceKind === 'messaging'" label="Include topics">
          <Input v-model:value="form.includeTopics" placeholder="orders, payments" />
        </Form.Item>
        <Form.Item label="Schedule interval (catalog only)">
          <Input v-model:value="form.scheduleInterval" placeholder="0 0 * * *" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.ing-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
