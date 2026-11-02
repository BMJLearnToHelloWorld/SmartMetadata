<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Spin, message } from 'ant-design-vue';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import {
  buildServiceConnection,
  createEmptyServiceForm,
  formValuesFromService,
} from '@/ingestion/connections';
import { SERVICE_GET_API, SERVICE_UPDATE_API } from '@/ingestion/serviceApis';
import type { CatalogService, ServiceFormValues, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const service = ref<CatalogService | null>(null);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());

const kind = (['messaging', 'dashboard', 'storage', 'pipeline'] as readonly string[]).includes(props.kind)
  ? (props.kind as ServiceKind)
  : 'database';

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind](props.id);
    Object.assign(form, formValuesFromService(service.value));
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (!service.value) {
    return;
  }
  saving.value = true;
  try {
    await SERVICE_UPDATE_API[kind]({
      name: service.value.name,
      serviceType: service.value.serviceType,
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
      connection: buildServiceConnection(form, service.value.connection),
    });
    message.success(t('ingestion.services.updated'));
    await router.push({ name: 'ingestion-service', params: { kind: props.kind, id: props.id } });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader
      :header="t('ingestion.services.editConnectionTitle')"
      :sub-header="t('ingestion.services.editConnectionLead')"
    />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="edit-connection-error"
        :error-text="errorMessage"
      />
      <Form v-else-if="service" layout="vertical" data-testid="edit-connection-form">
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="form.displayName" data-testid="edit-connection-display-name" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <ServiceConnectionFields :form="form" />
        <Alert
          type="info"
          show-icon
          data-testid="edit-connection-filters-residual"
          :message="t('ingestion.services.editConnectionFiltersResidual')"
          style="margin: 16px 0"
        />
        <div style="display: flex; gap: 8px">
          <Button
            data-testid="edit-connection-cancel"
            @click="router.push({ name: 'ingestion-service', params: { kind: props.kind, id: props.id } })"
          >
            {{ t('crud.cancel') }}
          </Button>
          <Button type="primary" data-testid="edit-connection-save" :loading="saving" @click="onSave">
            {{ t('crud.save') }}
          </Button>
        </div>
      </Form>
    </Spin>
  </PageLayout>
</template>
