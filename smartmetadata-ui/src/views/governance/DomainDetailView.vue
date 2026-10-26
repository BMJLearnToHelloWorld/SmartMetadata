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
import { getDomain, listDomainAssets, updateDomain } from '@/api/domains';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const domain = ref<Domain | null>(null);
const assets = ref<EntityRef[]>([]);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('governance.domains.title'), to: { name: 'governance-domains' } },
  { label: entityLabel(domain.value) || t('governance.domains.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'domain-tab-overview' },
  { key: 'assets', label: t('governance.domains.assetsTab'), testId: 'domain-tab-assets' },
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
    domain.value = await getDomain(props.id);
    try {
      assets.value = (await listDomainAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
  } catch (error) {
    domain.value = null;
    assets.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!domain.value) {
    return;
  }
  editForm.displayName = domain.value.displayName || '';
  editForm.description = domain.value.description || '';
  editForm.domainType = domain.value.domainType;
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!domain.value) {
    return;
  }
  saving.value = true;
  try {
    await updateDomain({
      name: domain.value.name,
      description: editForm.description.trim(),
      domainType: editForm.domainType,
      displayName: editForm.displayName.trim() || undefined,
      parent: domain.value.parent?.fullyQualifiedName || domain.value.parent?.name,
    });
    editOpen.value = false;
    message.success(t('governance.domains.updated'));
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
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(domain) || t('governance.domains.title')"
    :name="domain?.name"
    :fqn="domain?.fullyQualifiedName"
    :lead="t('governance.domains.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!domain && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="domain ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button type="primary" data-testid="edit-domain" :disabled="!domain" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="domain" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ domain.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ domain.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ domain.domainType }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.parent')">{{ domain.parent?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ domain.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">
          {{ joinRefNames(domain.owners) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #assets>
      <Table
        row-key="id"
        data-testid="domain-assets-table"
        :columns="assetColumns"
        :data-source="assets"
        :pagination="false"
        size="small"
      >
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
      <p v-if="!assets.length" class="entity-detail__tab-lead">{{ t('governance.domains.noAssets') }}</p>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('governance.domains.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.domains.type')" required>
        <Select v-model:value="editForm.domainType">
          <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
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
