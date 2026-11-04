<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Descriptions, Form, Input, Select, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import {
  addDataProductAssets,
  deleteDataProduct,
  getDataProduct,
  listDataProductAssets,
  patchDataProduct,
  removeDataProductAssets,
  updateDataProduct,
} from '@/api/dataProducts';
import type { BulkAssetResult } from '@/api/bulkAssets';
import { usePermissionStore } from '@/stores/permissions';
import type { OperationPermissions } from '@/api/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import BulkAssetResultPanel from '@/features/crud/BulkAssetResultPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import { listDomains } from '@/api/domains';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { extensionPatch } from '@/governance/assetPatch';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { EntityRef } from '@/types/api';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { DataProduct, Domain } from '@/types/governance';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const product = ref<DataProduct | null>(null);
const domains = ref<Domain[]>([]);
const assets = ref<EntityRef[]>([]);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const ops = ref<OperationPermissions | null>(null);
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const customProperties = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');
const propsOpen = ref(false);
const propsSaving = ref(false);
const addAssetsOpen = ref(false);
const bulkResult = ref<BulkAssetResult | null>(null);
const removingFqn = ref<string | null>(null);
const editForm = reactive({
  displayName: '',
  description: '',
  domainFqns: [] as string[],
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('governance.dataProducts.title'), to: { name: 'governance-data-products' } },
  { label: entityLabel(product.value) || t('governance.dataProducts.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'data-product-tab-overview' },
  { key: 'assets', label: t('governance.dataProducts.assetsTab'), testId: 'data-product-tab-assets' },
  { key: 'activity', label: t('governance.dataProducts.activityTab'), testId: 'data-product-tab-activity' },
  {
    key: 'customProperties',
    label: t('governance.dataProducts.customPropertiesTab'),
    testId: 'data-product-tab-custom-properties',
  },
]);

/**
 * P1 both lines for asset writes: the server authorizes EDIT_ALL on the
 * data product for assets/add|remove, and isAdminUser ORs in on top. A
 * failed or missing permission fetch denies (fail-closed).
 */
const canEditAssets = computed(
  () => permissionStore.isAdminUser || ops.value?.EditAll === true,
);

const assetColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: '', key: 'actions', width: 110 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    product.value = await getDataProduct(props.id);
    const fqn = product.value.fullyQualifiedName || product.value.name;
    ops.value = fqn
      ? await permissionStore.getEntityPermissionByFqn('dataProduct', fqn).catch(() => null)
      : null;
    try {
      assets.value = (await listDataProductAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
    try {
      const [activityPage, conversationPage] = await Promise.all([
        listEntityActivity('dataProduct', fqn),
        listConversations({ entityLink: toEntityLink('dataProduct', fqn), limit: 20 }),
      ]);
      activity.value = activityPage.data;
      conversations.value = conversationPage.data;
      collaborationError.value = '';
    } catch (error) {
      activity.value = [];
      conversations.value = [];
      collaborationError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    try {
      customProperties.value = await listCustomProperties('dataProduct');
      customPropsError.value = '';
    } catch (error) {
      customProperties.value = [];
      customPropsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  } catch (error) {
    product.value = null;
    assets.value = [];
    ops.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onConfirmAddAssets(selected: EntityRef[]): Promise<void> {
  if (!product.value) {
    return;
  }
  const fqn = product.value.fullyQualifiedName || product.value.name;
  try {
    bulkResult.value = await addDataProductAssets(fqn, selected);
    addAssetsOpen.value = false;
    message.success(t('governance.dataProducts.assetsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function onRemoveAsset(asset: EntityRef): Promise<void> {
  if (!product.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('governance.dataProducts.removeAssetConfirm', {
      name: asset.displayName || asset.name,
    }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  const fqn = product.value.fullyQualifiedName || product.value.name;
  removingFqn.value = asset.fullyQualifiedName || asset.name;
  try {
    bulkResult.value = await removeDataProductAssets(fqn, [asset]);
    message.success(t('governance.dataProducts.assetsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    removingFqn.value = null;
  }
}

async function onSaveCustomProperties(next: Record<string, unknown>): Promise<void> {
  if (!product.value) {
    return;
  }
  propsSaving.value = true;
  try {
    await patchDataProduct(
      product.value.id,
      extensionPatch(product.value.extension, next),
    );
    propsOpen.value = false;
    message.success(t('asset.propsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    propsSaving.value = false;
  }
}

async function onDeleteDataProduct(): Promise<void> {
  if (!product.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: product.value.displayName || product.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDataProduct(product.value.id);
    message.success(t('crud.deletedName', { name: product.value.displayName || product.value.name }));
    await router.push({ name: 'governance-data-products' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

function openEdit(): void {
  if (!product.value) {
    return;
  }
  editForm.displayName = product.value.displayName || '';
  editForm.description = product.value.description || '';
  editForm.domainFqns = product.value.domains
    .map((item) => item.fullyQualifiedName || item.name)
    .filter(Boolean);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!product.value) {
    return;
  }
  saving.value = true;
  try {
    await updateDataProduct({
      name: product.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      domains: editForm.domainFqns,
    });
    editOpen.value = false;
    message.success(t('governance.dataProducts.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

function openAsset(asset: EntityRef): void {
  const entityType = asset.type || '';
  const fqn = asset.fullyQualifiedName || asset.name;
  if (!isDetailWired(entityType) || !fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
  void listDomains({ limit: 100 })
    .then((page) => {
      domains.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(product) || t('governance.dataProducts.title')"
    :name="product?.name"
    :fqn="product?.fullyQualifiedName"
    :lead="t('governance.dataProducts.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!product && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="product ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button danger data-testid="delete-data-product" :disabled="!product" @click="onDeleteDataProduct">{{ t('crud.delete') }}</Button>
      <Button type="primary" data-testid="edit-data-product" :disabled="!product" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="product" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ product.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ product.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ product.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('governance.dataProducts.domains')">
          {{ joinRefNames(product.domains) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">
          {{ joinRefNames(product.owners) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #assets>
      <div style="margin-bottom: 12px">
        <Button
          type="primary"
          data-testid="add-data-product-assets"
          :disabled="!product || !canEditAssets"
          @click="addAssetsOpen = true"
        >
          {{ t('governance.dataProducts.addAssets') }}
        </Button>
      </div>
      <BulkAssetResultPanel v-if="bulkResult" :result="bulkResult" />
      <SmTable row-key="id" :columns="assetColumns" :data-source="assets" :pagination="false" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
              href="#"
              @click.prevent="openAsset(record as EntityRef)"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              danger
              size="small"
              :data-testid="`remove-asset-${(record as EntityRef).id}`"
              :disabled="!canEditAssets || removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              :loading="removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              @click="onRemoveAsset(record as EntityRef)"
            >
              {{ t('crud.delete') }}
            </Button>
          </template>
        </template>
      </SmTable>
      <p v-if="!assets.length" class="entity-detail__tab-lead">{{ t('governance.dataProducts.noAssets') }}</p>
    </template>
    <template #activity>
      <AssetActivityPanel
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="dataProduct"
        :fqn="product?.fullyQualifiedName || product?.name || ''"
      />
    </template>
    <template #customProperties>
      <div style="margin-bottom: 12px">
        <Button
          data-testid="edit-data-product-custom-properties"
          :disabled="!product || !canEditAssets || !customProperties.length"
          @click="propsOpen = true"
        >
          {{ t('asset.editCustomProperties') }}
        </Button>
      </div>
      <AssetCustomPropertiesPanel
        :defs="customProperties"
        :values="product?.extension || {}"
        :error="customPropsError"
        entity-type="dataProduct"
      />
    </template>
  </EntityDetailShell>
  <AddAssetsModal
    :open="addAssetsOpen"
    :owner-name="product?.displayName || product?.name || ''"
    :existing-fqns="assets.map((a) => a.fullyQualifiedName || a.name)"
    @confirm="onConfirmAddAssets"
    @cancel="addAssetsOpen = false"
  />
  <CustomPropertiesEditModal
    :open="propsOpen"
    :defs="customProperties"
    :values="product?.extension || {}"
    :saving="propsSaving"
    @save="onSaveCustomProperties"
    @cancel="propsOpen = false"
  />
  <FormModal
    :open="editOpen"
    :title="t('governance.dataProducts.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.dataProducts.domains')" required>
        <Select v-model:value="editForm.domainFqns" mode="multiple">
          <Select.Option
            v-for="domain in domains"
            :key="domain.id"
            :value="domain.fullyQualifiedName || domain.name"
          >
            {{ entityLabel(domain) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-top: 12px;
}
</style>
