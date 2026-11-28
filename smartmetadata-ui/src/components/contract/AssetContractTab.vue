<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractTab: VIEW / ADD / EDIT. Inherited contracts open ADD
  without passing the parent contract. The official AddDataContract wizard
  is lazy-mounted here, not as a route.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Space, message } from 'ant-design-vue';
import {
  deleteContractById,
  getContractByEntityId,
  type ContractColumn,
  type DataContract,
} from '@/api/dataContracts';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { confirmDelete } from '@/features/crud/confirmDelete';
import SmState from '@/components/shared/SmState.vue';
import AddDataContract from '@/components/contract/AddDataContract.vue';

const props = defineProps<{
  entityId: string;
  entityType: string;
  entityName?: string;
  entityFqn?: string;
  entityColumns?: ContractColumn[];
}>();

const { t } = useI18n();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const contract = ref<DataContract | null>(null);
const mode = ref<'view' | 'add' | 'edit'>('view');
const resourceCreate = ref(false);
const contractEditAll = ref(false);
const contractDelete = ref(false);

const isInheritedContract = computed(() => Boolean(contract.value?.inherited));
const hasEditPermission = computed(() =>
  contract.value ? contractEditAll.value : resourceCreate.value,
);

async function loadPermissions(contractId?: string, contractFqn?: string): Promise<void> {
  const resource = await permissionStore.getResourcePermission('dataContract').catch(() => null);
  resourceCreate.value = Boolean(resource?.Create);
  if (contractId || contractFqn) {
    const ops = contractFqn
      ? await permissionStore.getEntityPermissionByFqn('dataContract', contractFqn).catch(() => null)
      : null;
    const flags = ops ? getDerivedPermissionFlags(ops) : { canEditAll: false, canDelete: false };
    contractEditAll.value = Boolean(flags.canEditAll);
    contractDelete.value = Boolean(flags.canDelete);
  } else {
    contractEditAll.value = false;
    contractDelete.value = false;
  }
}

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
    await loadPermissions(contract.value?.id, contract.value?.fullyQualifiedName);
  } catch (error) {
    contract.value = null;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') }));
  } finally {
    loading.value = false;
  }
}

function openAdd(): void {
  mode.value = 'add';
}

function openEdit(): void {
  // Official: inherited contracts use ADD so this asset gets its own contract.
  mode.value = contract.value && !isInheritedContract.value ? 'edit' : 'add';
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

function onWizardSave(): void {
  void load();
}

watch(() => [props.entityId, props.entityType], () => { void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <SmState v-if="loading" state="loading" />
  <SmState v-else-if="errorMessage" state="error" :error-text="errorMessage" />
  <div v-else-if="mode === 'add' || mode === 'edit'" data-testid="asset-contract-wizard">
    <AddDataContract
      :contract="mode === 'edit' && !isInheritedContract ? contract ?? undefined : undefined"
      :entity-id="entityId"
      :entity-type="entityType"
      :entity-name="entityName"
      :entity-fqn="entityFqn"
      :entity-columns="entityColumns"
      @cancel="mode = 'view'"
      @save="onWizardSave"
    />
  </div>
  <div v-else-if="contract" data-testid="asset-contract-detail">
    <Space style="margin-bottom: 16px">
      <Button v-if="hasEditPermission" data-testid="contract-edit" @click="openEdit">{{ t('label.edit') }}</Button>
      <Button v-if="contractDelete && !isInheritedContract" data-testid="contract-delete" danger @click="onDelete">{{ t('label.delete') }}</Button>
    </Space>
    <Descriptions bordered :column="1" size="small">
      <Descriptions.Item :label="t('label.name')">{{ contract.displayName || contract.name }}</Descriptions.Item>
      <Descriptions.Item :label="t('label.status')">{{ contract.entityStatus || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('label.description')">{{ contract.description || '—' }}</Descriptions.Item>
      <Descriptions.Item v-if="contract.inherited" :label="t('label.inherited')">{{ t('label.yes') }}</Descriptions.Item>
      <Descriptions.Item v-if="contract.latestResult" :label="t('label.test-case-result')">
        {{ contract.latestResult.status || contract.latestResult.message || '—' }}
      </Descriptions.Item>
    </Descriptions>
  </div>
  <div v-else data-testid="asset-contract-empty">
    <p>{{ t('message.no-contract-description') }}</p>
    <p>{{ t('message.create-contract-description') }}</p>
    <Button v-if="hasEditPermission" type="primary" data-testid="contract-add" @click="openAdd">
      {{ t('label.add-entity', { entity: t('label.contract') }) }}
    </Button>
  </div>
</template>
