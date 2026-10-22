<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Space, Spin, Typography, message } from 'ant-design-vue';
import { deleteDatabaseService, getDatabaseService, updateDatabaseService } from '@/api/databaseServices';
import { deleteMessagingService, getMessagingService, updateMessagingService } from '@/api/messagingServices';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import { buildServiceConnection, formValuesFromService, redactConnectionForDisplay } from '@/ingestion/connections';
import { cliSourceType } from '@/ingestion/cliWorkflow';
import type { CatalogService, ServiceFormValues, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
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

const kind = computed<ServiceKind>(() => (props.kind === 'messaging' ? 'messaging' : 'database'));
const supported = computed(() => Boolean(service.value && cliSourceType(service.value.serviceType)));
const connectionJson = computed(() =>
  JSON.stringify(redactConnectionForDisplay(service.value?.connection) ?? {}, null, 2),
);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value =
      kind.value === 'messaging' ? await getMessagingService(props.id) : await getDatabaseService(props.id);
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load service';
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
    } else {
      await updateDatabaseService(body);
    }
    editOpen.value = false;
    message.success('Service updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!service.value) {
    return;
  }
  if (!window.confirm(`Delete service ${service.value.name}? This cannot be undone from this console.`)) {
    return;
  }
  deleting.value = true;
  try {
    if (kind.value === 'messaging') {
      await deleteMessagingService(service.value.id);
    } else {
      await deleteDatabaseService(service.value.id);
    }
    message.success(`Deleted ${service.value.name}`);
    await router.push({ name: 'ingestion-services' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Delete failed');
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
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">
        {{ service?.displayName || service?.name || 'Service' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET/PUT /api/v1/services/{{ kind === 'messaging' ? 'messagingServices' : 'databaseServices' }}
      </Typography.Paragraph>
      <Space>
        <Button data-testid="edit-service" :disabled="!service || !supported" @click="openEdit">Edit</Button>
        <Button data-testid="delete-service" danger :disabled="!service" :loading="deleting" @click="onDelete">
          Delete
        </Button>
      </Space>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="ing-alert" />
      <Alert
        v-if="service && !supported"
        type="info"
        show-icon
        class="ing-alert"
        message="This serviceType is listed from the catalog but has no Phase 6–7 connector form. Connection JSON is read-only."
      />
      <Descriptions v-if="service" bordered :column="1" size="small" class="ing-desc">
        <Descriptions.Item label="Name">{{ service.name }}</Descriptions.Item>
        <Descriptions.Item label="FQN">{{ service.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item label="Kind">{{ service.kind }}</Descriptions.Item>
        <Descriptions.Item label="Type">{{ service.serviceType || '—' }}</Descriptions.Item>
        <Descriptions.Item label="CLI source.type">
          {{ cliSourceType(service.serviceType) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Description">{{ service.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title v-if="service" :level="5" class="ing-sub">Connection (secrets redacted)</Typography.Title>
      <pre v-if="service" class="ing-json" data-testid="service-connection-json">{{ connectionJson }}</pre>
    </Card>
    <Modal v-model:open="editOpen" title="Edit service" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <ServiceConnectionFields :form="editForm" />
      </Form>
    </Modal>
  </Spin>
</template>

<style scoped>
.ing-alert,
.ing-desc {
  margin-top: 16px;
}
.ing-sub {
  margin-top: 24px;
}
.ing-json {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
</style>
