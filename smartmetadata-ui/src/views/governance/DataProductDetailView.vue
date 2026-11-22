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
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import WidgetCertificationCell from '@/components/shared/widgets/WidgetCertificationCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetExpertsCell from '@/components/shared/widgets/WidgetExpertsCell.vue';
import WidgetKnowledgePagesCell from '@/components/shared/widgets/WidgetKnowledgePagesCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetReviewerCell from '@/components/shared/widgets/WidgetReviewerCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import WidgetTierCell from '@/components/shared/widgets/WidgetTierCell.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { isDetailWired } from '@/catalog/entityRoutes';
import GenericTab from '@/components/customize/GenericTab.vue';
import { resolveWidgetLayout, isLargeWidget } from '@/composables/customizeWidgetLayout';
import { getCustomPropertiesWidgetSettings } from '@/views/admin/persona/editors/customPropertiesWidgetSettings';
import { findCustomizedTabEntry, getDetailsTabWithNewLabel, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
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
import { getDerivedPermissionFlags } from '@/api/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import BulkAssetResultPanel from '@/features/crud/BulkAssetResultPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import { listDomains } from '@/api/domains';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import {
  certificationPatch,
  domainsPatch,
  entityRefsPatch,
  extensionPatch,
  ownersPatch,
  tagsPatch,
  type TagLabelInput,
} from '@/governance/assetPatch';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
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
const editKey = ref(0);
const descriptionEditorRef = ref<{ getEditorContent: () => string } | null>(null);
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

// C-4 consume side: the selected persona's DataProduct page replaces
// these tabs (official `getDetailsTabWithNewLabel` — see
// `useCustomPages.ts`). No tab is preserved: every rendered key
// resolves to an official DataProduct id, exactly (`assets`) or
// through an alias (`documentation` → `overview`, `activity_feed` →
// `activity`, `custom_properties` → `customProperties`), so a
// customization can remove any of them.
const { customizedPage } = useCustomPages('DataProduct');

const tabs = computed<EntityDetailTab[]>(() =>
  getDetailsTabWithNewLabel(
    [
      { key: 'overview', label: t('crud.overview'), testId: 'data-product-tab-overview' },
      { key: 'assets', label: t('governance.dataProducts.assetsTab'), testId: 'data-product-tab-assets' },
      { key: 'activity', label: t('governance.dataProducts.activityTab'), testId: 'data-product-tab-activity' },
      {
        key: 'customProperties',
        label: t('governance.dataProducts.customPropertiesTab'),
        testId: 'data-product-tab-custom-properties',
      },
    ],
    customizedPage.value?.tabs,
  ),
);

// Widget layer (B-8): the widget grid mounts ONLY on this page type's
// widget-layout tab (DataProduct: documentation), and only when the
// customized page has a tab entry resolving to the rendered tab key
// whose official id is that mount tab (`isWidgetLayoutTab`, reading
// layoutAppliesTo — the official GenericTab mount set, one tab per
// page type). The editor saves ALL tabs with layout: [] on the
// non-mount ones, so entry resolution alone would blank every other
// tab; non-mount tabs always keep their existing panels. The grid
// renders the entry's resolved layout, including empty when the entry
// carries no layout. The entry's own id — never the rendered key —
// is passed to the layout resolver, because the official lookup
// matches tab entries by id only (`customizeWidgetLayout.ts`).
// Dispatch-resolvable keys with no branch in this view's widget chains,
// absent on purpose, so their cells stay empty (same disclosure format
// as AssetDetailView): DATA_PRODUCTS — the DataProduct spec
// (`entity/domains/dataProduct.json`) carries no such field (the entity
// IS a data product). LEFT_PANEL is structural, not a missing branch:
// GenericTab renders the panel's children and never offers the panel
// itself to the slot.
function customizedEntryFor(tabKey: string) {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, tabKey);
  if (!entry?.id || !isWidgetLayoutTab('DataProduct', entry.id)) {
    return undefined;
  }
  return entry;
}

function widgetLayoutFor(tabKey: string) {
  const entry = customizedEntryFor(tabKey);
  return entry ? resolveWidgetLayout('DataProduct', entry.id, customizedPage.value) : [];
}

/**
 * D-4 derived flags (official getDerivedPermissionFlags, DescriptionWidget
 * shape): the entity's `deleted` gates every Edit* flag.
 */
const productFlags = computed(() =>
  getDerivedPermissionFlags(ops.value ?? {}, product.value?.deleted === true),
);

/**
 * P1 both lines for asset writes: the server authorizes EDIT_ALL on the
 * data product for assets/add|remove, and isAdminUser ORs in on top. A
 * failed or missing permission fetch denies (fail-closed). Field-level
 * EditAll is read through the derivation now, not raw.
 */
const canEditAssets = computed(
  () => permissionStore.isAdminUser || productFlags.value.canEditAll,
);
const canEditDescription = computed(() => productFlags.value.canEditDescription);
const canEditCustomFields = computed(() => productFlags.value.canEditCustomFields);
/**
 * D-4 header gates (pin DataAssetsHeader): the edit modal writes
 * displayName/description/domains, so it is the OR of those field flags;
 * delete is the soft-delete action, so it additionally requires
 * !deleted. The P1 admin line ORs in on top of both.
 */
const canEditProduct = computed(
  () =>
    permissionStore.isAdminUser ||
    productFlags.value.canEditDescription ||
    productFlags.value.canEditDisplayName ||
    productFlags.value.can('EditDomains'),
);
const canDeleteProduct = computed(
  () =>
    product.value?.deleted !== true &&
    (permissionStore.isAdminUser || productFlags.value.canDelete),
);
/** Custom-properties read gate: null while the permission fetch is still resolving. */
const customPropsCanView = computed<boolean | null>(() =>
  loading.value ? null : ops.value ? productFlags.value.canViewCustomFields : false,
);

/**
 * D-2 batch 2 widget-cell gates (P1 dual line): each action gate ORs
 * `isAdminUser` with the derived flag — never only one. `can('…')`
 * covers operations with no named `canEdit*` flag (EditReviewers,
 * EditCertification).
 */
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
const canEditTags = computed(() => permissionStore.isAdminUser || productFlags.value.canEditTags);
const canEditGlossaryTerms = computed(
  () => permissionStore.isAdminUser || productFlags.value.canEditGlossaryTerms,
);
const canEditOwners = computed(() => permissionStore.isAdminUser || productFlags.value.canEditOwners);
const canEditDomains = computed(() => permissionStore.isAdminUser || productFlags.value.canEditDomains);
const canEditTier = computed(() => permissionStore.isAdminUser || productFlags.value.canEditTier);
const canEditReviewers = computed(
  () => permissionStore.isAdminUser || productFlags.value.can('EditReviewers'),
);
const canEditCertification = computed(
  () => permissionStore.isAdminUser || productFlags.value.can('EditCertification'),
);
const canEditCustomProperties = computed(
  () => permissionStore.isAdminUser || productFlags.value.canEditCustomFields,
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
  // Rebuild the rich-text editor so it opens on the current description.
  editKey.value += 1;
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
      description: descriptionEditorRef.value?.getEditorContent()?.trim() ?? editForm.description.trim(),
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

/**
 * D-3 description-cell save: the same full-body PUT as onSave, built
 * from the loaded entity (not the edit form, which is only populated
 * while the page modal is open). Throws on failure so the cell keeps
 * its editor open.
 */
async function onDescriptionUpdate(description: string): Promise<void> {
  if (!product.value) {
    return;
  }
  await updateDataProduct({
    name: product.value.name,
    description,
    displayName: product.value.displayName || undefined,
    domains: product.value.domains
      .map((item) => item.fullyQualifiedName || item.name)
      .filter(Boolean),
  });
  message.success(t('governance.dataProducts.updated'));
  await load();
}

/**
 * D-2 batch 2 widget-cell saves: each is one field's JSON Patch
 * (governance saves go through PATCH, not the full PUT — the
 * CreateDataProductRequest body does not carry these fields, so a PUT
 * would drop them). Each throws on failure so the cell keeps its
 * editor open.
 */
async function onTagsChange(tags: TagLabelInput[]): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, tagsPatch(product.value.tags, tags));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onOwnersChange(owners: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, ownersPatch(product.value.owners, owners));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onExpertsChange(experts: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, entityRefsPatch('/experts', product.value.experts, experts));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onReviewersChange(reviewers: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, entityRefsPatch('/reviewers', product.value.reviewers, reviewers));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onDomainsChange(domainIds: string[]): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, domainsPatch(product.value.domains, domainIds));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onCertificationChange(tagFqn?: string): Promise<void> {
  if (!product.value) {
    return;
  }
  await patchDataProduct(product.value.id, certificationPatch(product.value.certification, tagFqn));
  message.success(t('governance.dataProducts.updated'));
  await load();
}

async function onCustomPropertySave(name: string, value: unknown): Promise<void> {
  if (!product.value) {
    return;
  }
  const next = { ...(product.value.extension ?? {}) };
  if (value === undefined) {
    delete next[name];
  } else {
    next[name] = value;
  }
  await patchDataProduct(product.value.id, extensionPatch(product.value.extension, next));
  message.success(t('asset.propsUpdated'));
  await load();
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
  void loadGovernanceCatalog()
    .then((loaded) => {
      catalog.value = loaded;
    })
    .catch(() => undefined);
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
      <Button danger data-testid="delete-data-product" :disabled="!product || !canDeleteProduct" @click="onDeleteDataProduct">{{ t('crud.delete') }}</Button>
      <Button type="primary" data-testid="edit-data-product" :disabled="!product || !canEditProduct" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="DataProduct">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && product" data-testid="widget-description">
            <EntityDescriptionCell
              :remove-blur="isLargeWidget(widget)"
              :description="product.description"
              :entity-name="product.displayName || product.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && product" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="product.domains"
              :options="domains"
              :asset-count="assets.length"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && product" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="product.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && product" data-testid="widget-experts">
            <WidgetExpertsCell
              :experts="product.experts"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onExpertsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && product" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="product.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && product" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && product" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && product" data-testid="widget-tier">
            <WidgetTierCell
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && product" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="product.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="product?.extension || {}"
              :error="customPropsError"
              entity-type="dataProduct"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product" data-testid="widget-knowledge-pages">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
        </template>
      </GenericTab>
      <Descriptions v-else-if="product" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ product.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ product.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">
              <EntityDescriptionCell
                :description="product.description"
                :entity-name="product.displayName || product.name"
                :has-edit-access="canEditDescription"
                :on-description-update="onDescriptionUpdate"
              />
            </Descriptions.Item>
        <Descriptions.Item :label="t('governance.dataProducts.domains')">
          {{ joinRefNames(product.domains) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">
          {{ joinRefNames(product.owners) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #assets>
      <GenericTab v-if="customizedEntryFor('assets')" :layout="widgetLayoutFor('assets')" page-type="DataProduct">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && product" data-testid="widget-description">
            <EntityDescriptionCell
              :remove-blur="isLargeWidget(widget)"
              :description="product.description"
              :entity-name="product.displayName || product.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && product" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="product.domains"
              :options="domains"
              :asset-count="assets.length"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && product" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="product.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && product" data-testid="widget-experts">
            <WidgetExpertsCell
              :experts="product.experts"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onExpertsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && product" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="product.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && product" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && product" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && product" data-testid="widget-tier">
            <WidgetTierCell
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && product" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="product.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="product?.extension || {}"
              :error="customPropsError"
              entity-type="dataProduct"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product" data-testid="widget-knowledge-pages">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
        </template>
      </GenericTab>
      <template v-else>
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
    </template>
    <template #activity>
      <GenericTab v-if="customizedEntryFor('activity')" :layout="widgetLayoutFor('activity')" page-type="DataProduct">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && product" data-testid="widget-description">
            <EntityDescriptionCell
              :remove-blur="isLargeWidget(widget)"
              :description="product.description"
              :entity-name="product.displayName || product.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && product" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="product.domains"
              :options="domains"
              :asset-count="assets.length"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && product" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="product.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && product" data-testid="widget-experts">
            <WidgetExpertsCell
              :experts="product.experts"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onExpertsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && product" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="product.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && product" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && product" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && product" data-testid="widget-tier">
            <WidgetTierCell
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && product" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="product.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="product?.extension || {}"
              :error="customPropsError"
              entity-type="dataProduct"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product" data-testid="widget-knowledge-pages">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
        </template>
      </GenericTab>
      <AssetActivityPanel
        v-else
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="dataProduct"
        :fqn="product?.fullyQualifiedName || product?.name || ''"
      />
    </template>
    <template #customProperties>
      <GenericTab v-if="customizedEntryFor('customProperties')" :layout="widgetLayoutFor('customProperties')" page-type="DataProduct">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && product" data-testid="widget-description">
            <EntityDescriptionCell
              :remove-blur="isLargeWidget(widget)"
              :description="product.description"
              :entity-name="product.displayName || product.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && product" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="product.domains"
              :options="domains"
              :asset-count="assets.length"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && product" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="product.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && product" data-testid="widget-experts">
            <WidgetExpertsCell
              :experts="product.experts"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onExpertsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && product" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="product.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && product" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && product" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && product" data-testid="widget-tier">
            <WidgetTierCell
              :tags="product.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && product" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="product.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="product?.extension || {}"
              :error="customPropsError"
              entity-type="dataProduct"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && product" data-testid="widget-knowledge-pages">
            <WidgetKnowledgePagesCell :entity-id="product.id" entity-type="dataProduct" />
          </div>
        </template>
      </GenericTab>
      <template v-else>
      <div style="margin-bottom: 12px">
        <Button
          data-testid="edit-data-product-custom-properties"
          :disabled="!product || !canEditCustomFields || !customProperties.length"
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
      :can-view="customPropsCanView"
      :can-edit="canEditCustomProperties"
      :on-property-save="onCustomPropertySave"
      />
      </template>
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
        <SmRichTextEditor
              :key="editKey"
              ref="descriptionEditorRef"
              :autofocus="true"
              :initial-value="editForm.description"
            />
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
