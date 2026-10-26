<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, Modal, Select, Table, message } from 'ant-design-vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { getDataProduct, listDataProductAssets, updateDataProduct } from '@/api/dataProducts';
import { listDomains } from '@/api/domains';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { EntityRef } from '@/types/api';
import type { DataProduct, Domain } from '@/types/governance';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const product = ref<DataProduct | null>(null);
const domains = ref<Domain[]>([]);
const assets = ref<EntityRef[]>([]);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
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
]);

const assetColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    product.value = await getDataProduct(props.id);
    try {
      assets.value = (await listDataProductAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
  } catch (error) {
    product.value = null;
    assets.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
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
      <Table row-key="id" :columns="assetColumns" :data-source="assets" :pagination="false" size="small">
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
        </template>
      </Table>
      <p v-if="!assets.length" class="entity-detail__tab-lead">{{ t('governance.dataProducts.noAssets') }}</p>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('governance.dataProducts.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
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
  </Modal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-top: 12px;
}
</style>
