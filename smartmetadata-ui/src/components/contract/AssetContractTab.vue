<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractTab VIEW + details-tab create/delete (ContractTab.tsx,
  ContractDetail.tsx, ContractDetailFormTab.tsx). The official AddDataContract
  schema / SLA / security / quality / terms wizard is a later leftover.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Form, Input, Space, message } from 'ant-design-vue';
import {
  createContract,
  deleteContractById,
  getContractByEntityId,
  type DataContract,
} from '@/api/dataContracts';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { confirmDelete } from '@/features/crud/confirmDelete';
import SmState from '@/components/shared/SmState.vue';

const props = defineProps<{
  entityId: string;
  entityType: string;
  entityName?: string;
}>();

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const contract = ref<DataContract | null>(null);
const mode = ref<'view' | 'add'>('view');
const saving = ref(false);
const form = ref({ name: '', description: '' });

async function load(): Promise<void> {
  if (!props.entityId) {
    contract.value = null;
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    contract.value = await getContractByEntityId(props.entityId, props.entityType, ['owners']);
    mode.value = 'view';
  } catch (error) {
    contract.value = null;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') }));
  } finally {
    loading.value = false;
  }
}

function openAdd(): void {
  form.value = { name: props.entityName ? `${props.entityName}_contract` : '', description: '' };
  mode.value = 'add';
}

async function onSave(): Promise<void> {
  const name = form.value.name.trim();
  if (!name) {
    message.error(t('label.please-enter-entity-name', { entity: t('label.contract') }) || t('label.field-required', { entity: t('label.contract') }));
    return;
  }
  saving.value = true;
  try {
    await createContract({
      name,
      displayName: name,
      description: form.value.description.trim() || undefined,
      entity: { id: props.entityId, type: props.entityType },
      entityStatus: 'Draft',
    });
    message.success(t('message.data-contract-saved-successfully'));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.create-entity-error', { entity: t('label.contract') })));
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!contract.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.are-you-sure-you-want-to-delete-this-entity', { entity: t('label.contract') }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteContractById(contract.value.id);
    message.success(t('server.entity-deleted-successfully', { entity: t('label.contract') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.delete-entity-error', { entity: t('label.contract') })));
  }
}

watch(() => [props.entityId, props.entityType], () => { void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <SmState v-if="loading" state="loading" />
  <SmState v-else-if="errorMessage" state="error" :error-text="errorMessage" />
  <div v-else-if="mode === 'add'" data-testid="asset-contract-add">
    <Form layout="vertical">
      <Form.Item :label="t('label.name')" required>
        <Input v-model:value="form.name" data-testid="contract-name" />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <Input.TextArea v-model:value="form.description" :rows="3" data-testid="contract-description" />
      </Form.Item>
      <Space>
        <Button type="primary" data-testid="contract-save" :loading="saving" @click="onSave">{{ t('label.save') }}</Button>
        <Button data-testid="contract-cancel" @click="mode = 'view'">{{ t('label.cancel') }}</Button>
      </Space>
    </Form>
  </div>
  <div v-else-if="contract" data-testid="asset-contract-detail">
    <Space style="margin-bottom: 16px">
      <Button data-testid="contract-delete" danger @click="onDelete">{{ t('label.delete') }}</Button>
    </Space>
    <Descriptions bordered :column="1" size="small">
      <Descriptions.Item :label="t('label.name')">{{ contract.displayName || contract.name }}</Descriptions.Item>
      <Descriptions.Item :label="t('label.status')">{{ contract.entityStatus || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('label.description')">{{ contract.description || '—' }}</Descriptions.Item>
      <Descriptions.Item v-if="contract.latestResult" :label="t('label.test-case-result')">
        {{ contract.latestResult.status || contract.latestResult.message || '—' }}
      </Descriptions.Item>
    </Descriptions>
  </div>
  <div v-else data-testid="asset-contract-empty">
    <p>{{ t('message.no-contract-description') }}</p>
    <p>{{ t('message.create-contract-description') }}</p>
    <Button type="primary" data-testid="contract-add" @click="openAdd">
      {{ t('label.add-entity', { entity: t('label.contract') }) }}
    </Button>
  </div>
</template>
