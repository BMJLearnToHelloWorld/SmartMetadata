<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractTab: VIEW / ADD / EDIT. Inherited contracts open ADD
  without passing the parent contract. The official AddDataContract wizard
  is lazy-mounted here, not as a route. VIEW is official ContractDetail.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';
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
import ContractDetail from '@/components/contract/ContractDetail.vue';
import { DataContractTabMode } from '@/catalog/dataContractConstants';

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
const contract = ref<DataContract | null>(null);
const mode = ref<DataContractTabMode>(DataContractTabMode.VIEW);
const resourceCreate = ref(false);
const contractEditAll = ref(false);

const isInheritedContract = computed(() => Boolean(contract.value?.inherited));
const hasEditPermission = computed(() =>
  contract.value ? contractEditAll.value : resourceCreate.value,
);

async function loadPermissions(contractId?: string): Promise<void> {
  if (contractId) {
    const ops = await permissionStore.getEntityPermissionById('dataContract', contractId).catch(() => null);
    contractEditAll.value = Boolean(ops && getDerivedPermissionFlags(ops).canEditAll);
    resourceCreate.value = false;
    return;
  }
  const resource = await permissionStore.getResourcePermission('dataContract').catch(() => null);
  resourceCreate.value = Boolean(resource?.Create);
  contractEditAll.value = false;
}

async function load(): Promise<void> {
  if (!props.entityId) {
    contract.value = null;
    await loadPermissions();
    return;
  }
  loading.value = true;
  try {
    // Official ContractTab: a fetch failure is treated as "no contract",
    // then resource Create is loaded. Do not invent an error banner.
    const fetched = await getContractByEntityId(props.entityId, props.entityType, ['owners']);
    contract.value = fetched;
    mode.value = DataContractTabMode.VIEW;
    await loadPermissions(fetched?.id);
  } catch {
    contract.value = null;
    await loadPermissions();
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  // Official: inherited contracts use ADD so this asset gets its own contract.
  mode.value = contract.value && !isInheritedContract.value
    ? DataContractTabMode.EDIT
    : DataContractTabMode.ADD;
}

async function onDelete(): Promise<void> {
  if (!contract.value?.id) {
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
    mode.value = DataContractTabMode.VIEW;
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
  <div v-else-if="mode === DataContractTabMode.ADD || mode === DataContractTabMode.EDIT" data-testid="asset-contract-wizard">
    <AddDataContract
      :contract="mode === DataContractTabMode.EDIT && !isInheritedContract ? contract ?? undefined : undefined"
      :entity-id="entityId"
      :entity-type="entityType"
      :entity-name="entityName"
      :entity-fqn="entityFqn"
      :entity-columns="entityColumns"
      @cancel="mode = DataContractTabMode.VIEW"
      @save="onWizardSave"
    />
  </div>
  <div v-else data-testid="asset-contract-detail">
    <ContractDetail
      :contract="contract"
      :entity-id="entityId"
      :entity-type="entityType"
      :entity-name="entityName"
      :entity-columns="entityColumns"
      :has-edit-permission="hasEditPermission"
      @edit="openEdit"
      @delete="onDelete"
      @updated="load"
    />
  </div>
</template>
