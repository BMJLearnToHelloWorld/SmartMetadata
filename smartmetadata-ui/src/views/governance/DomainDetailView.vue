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
import type { BulkAssetResult } from '@/api/bulkAssets';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import {
  addDomainAssets,
  deleteDomain,
  getDomain,
  listDomainAssets,
  patchDomain,
  removeDomainAssets,
  updateDomain,
} from '@/api/domains';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import BulkAssetResultPanel from '@/features/crud/BulkAssetResultPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { extensionPatch } from '@/governance/assetPatch';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const domain = ref<Domain | null>(null);
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
  domainType: 'Source-aligned',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('governance.domains.title'), to: { name: 'governance-domains' } },
  { label: entityLabel(domain.value) || t('governance.domains.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'domain-tab-overview' },
  { key: 'assets', label: t('governance.domains.assetsTab'), testId: 'domain-tab-assets' },
  // Official SubDomainsTable: sub-domains live as a flat list on the detail
  // page, not as nested rows in the domain list.
  { key: 'subDomains', label: t('governance.domains.subDomainsTab'), testId: 'domain-tab-subdomains' },
  { key: 'activity', label: t('governance.domains.activityTab'), testId: 'domain-tab-activity' },
  {
    key: 'customProperties',
    label: t('governance.domains.customPropertiesTab'),
    testId: 'domain-tab-custom-properties',
  },
]);

/**
 * P1 both lines for asset writes: the server authorizes EDIT_ALL on the
 * domain for assets/add|remove, and isAdminUser ORs in on top. A failed or
 * missing permission fetch denies (fail-closed).
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

const subDomainColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    domain.value = await getDomain(props.id);
    const fqn = domain.value.fullyQualifiedName || domain.value.name;
    ops.value = fqn
      ? await permissionStore.getEntityPermissionByFqn('domain', fqn).catch(() => null)
      : null;
    try {
      assets.value = (await listDomainAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
    try {
      const [activityPage, conversationPage] = await Promise.all([
        listEntityActivity('domain', fqn),
        listConversations({ entityLink: toEntityLink('domain', fqn), limit: 20 }),
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
      customProperties.value = await listCustomProperties('domain');
      customPropsError.value = '';
    } catch (error) {
      customProperties.value = [];
      customPropsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  } catch (error) {
    domain.value = null;
    assets.value = [];
    ops.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onConfirmAddAssets(selected: EntityRef[]): Promise<void> {
  if (!domain.value) {
    return;
  }
  const fqn = domain.value.fullyQualifiedName || domain.value.name;
  try {
    bulkResult.value = await addDomainAssets(fqn, selected);
    addAssetsOpen.value = false;
    message.success(t('governance.domains.assetsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function onRemoveAsset(asset: EntityRef): Promise<void> {
  if (!domain.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('governance.domains.removeAssetConfirm', {
      name: asset.displayName || asset.name,
    }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  const fqn = domain.value.fullyQualifiedName || domain.value.name;
  removingFqn.value = asset.fullyQualifiedName || asset.name;
  try {
    bulkResult.value = await removeDomainAssets(fqn, [asset]);
    message.success(t('governance.domains.assetsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    removingFqn.value = null;
  }
}

async function onSaveCustomProperties(next: Record<string, unknown>): Promise<void> {
  if (!domain.value) {
    return;
  }
  propsSaving.value = true;
  try {
    await patchDomain(domain.value.id, extensionPatch(domain.value.extension, next));
    propsOpen.value = false;
    message.success(t('asset.propsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    propsSaving.value = false;
  }
}

async function onDeleteDomain(): Promise<void> {
  if (!domain.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: domain.value.displayName || domain.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDomain(domain.value.id, { hardDelete: true, recursive: true });
    message.success(t('crud.deletedName', { name: domain.value.displayName || domain.value.name }));
    await router.push({ name: 'governance-domains' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
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

function openSubDomain(subDomain: EntityRef): void {
  if (!subDomain.id) {
    return;
  }
  void router.push({ name: 'governance-domain', params: { id: subDomain.id } });
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
      <Button danger data-testid="delete-domain" :disabled="!domain" @click="onDeleteDomain">{{ t('crud.delete') }}</Button>
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
      <div style="margin-bottom: 12px">
        <Button
          type="primary"
          data-testid="add-domain-assets"
          :disabled="!domain || !canEditAssets"
          @click="addAssetsOpen = true"
        >
          {{ t('governance.domains.addAssets') }}
        </Button>
      </div>
      <BulkAssetResultPanel v-if="bulkResult" :result="bulkResult" />
      <SmTable
        row-key="id"
        test-id="domain-assets-table"
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
      <p v-if="!assets.length" class="entity-detail__tab-lead">{{ t('governance.domains.noAssets') }}</p>
    </template>
    <template #subDomains>
      <SmTable
        row-key="id"
        test-id="domain-subdomains-table"
        :columns="subDomainColumns"
        :data-source="domain?.children ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="openSubDomain(record as EntityRef)"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </SmTable>
      <p v-if="!(domain?.children?.length ?? 0)" class="entity-detail__tab-lead">
        {{ t('governance.domains.noSubDomains') }}
      </p>
    </template>
    <template #activity>
      <AssetActivityPanel
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="domain"
        :fqn="domain?.fullyQualifiedName || domain?.name || ''"
      />
    </template>
    <template #customProperties>
      <div style="margin-bottom: 12px">
        <Button
          data-testid="edit-domain-custom-properties"
          :disabled="!domain || !canEditAssets || !customProperties.length"
          @click="propsOpen = true"
        >
          {{ t('asset.editCustomProperties') }}
        </Button>
      </div>
      <AssetCustomPropertiesPanel
        :defs="customProperties"
        :values="domain?.extension || {}"
        :error="customPropsError"
        entity-type="domain"
      />
    </template>
  </EntityDetailShell>
  <AddAssetsModal
    :open="addAssetsOpen"
    :owner-name="domain?.displayName || domain?.name || ''"
    :existing-fqns="assets.map((a) => a.fullyQualifiedName || a.name)"
    @confirm="onConfirmAddAssets"
    @cancel="addAssetsOpen = false"
  />
  <CustomPropertiesEditModal
    :open="propsOpen"
    :defs="customProperties"
    :values="domain?.extension || {}"
    :saving="propsSaving"
    @save="onSaveCustomProperties"
    @cancel="propsOpen = false"
  />
  <FormModal
    :open="editOpen"
    :title="t('governance.domains.editTitle')"
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
      <Form.Item :label="t('governance.domains.type')" required>
        <Select v-model:value="editForm.domainType">
          <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
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
