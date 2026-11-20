<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Descriptions, Form, Input, Select, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { isDetailWired } from '@/catalog/entityRoutes';
import GenericTab from '@/components/customize/GenericTab.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { findCustomizedTabEntry, getDetailsTabWithNewLabel, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import { listEntityActivity } from '@/api/activity';
import { getDomainDryRunImpacts, type BulkAssetResponse, type BulkAssetResult } from '@/api/bulkAssets';
import { latestGovernanceVersionPath } from '@/api/governanceVersions';
import { getDomainVersionPath } from '@/catalog/versionPaths';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import {
  addDomainAssets,
  deleteDomain,
  getDomainByName,
  listDomainAssets,
  patchDomain,
  removeDomainAssets,
  updateDomain,
} from '@/api/domains';
import type { OperationPermissions } from '@/api/permissions';
import { getDerivedPermissionFlags } from '@/api/permissions';
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
import { getCertificationTag, getTierTag } from '@/ingestion/tierTags';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';
import type { EntityRef, TagRef } from '@/types/api';

const props = defineProps<{ fqn: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const domain = ref<Domain | null>(null);
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
const dryRunImpacts = ref<BulkAssetResponse[]>([]);
const pendingAssets = ref<EntityRef[]>([]);
const dryRunSaving = ref(false);
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

// C-4 consume side: the selected persona's Domain page replaces these
// tabs (official `getDetailsTabWithNewLabel` — see `useCustomPages.ts`).
// No tab is preserved: every rendered key resolves to an official
// Domain id, exactly (`assets`) or through an alias (`documentation` →
// `overview`, `subdomains` → `subDomains`, `activity_feed` → `activity`,
// `custom_properties` → `customProperties`), so a customization can
// remove any of them.
const { customizedPage } = useCustomPages('Domain');

const tabs = computed<EntityDetailTab[]>(() =>
  getDetailsTabWithNewLabel(
    [
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
    ],
    customizedPage.value?.tabs,
  ),
);

// Widget layer (B-8): the widget grid mounts ONLY on this page type's
// widget-layout tab (Domain: documentation), and only when the
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
// as AssetDetailView): DATA_PRODUCTS / DOMAIN / REVIEWER — the Domain
// spec (`entity/domains/domain.json`) carries no such fields, so there
// is no supporting data; KNOWLEDGE_ARTICLE — no knowledge-article data
// source exists in the product. LEFT_PANEL is structural, not a missing
// branch: GenericTab renders the panel's children and never offers the
// panel itself to the slot.
function customizedEntryFor(tabKey: string) {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, tabKey);
  if (!entry?.id || !isWidgetLayoutTab('Domain', entry.id)) {
    return undefined;
  }
  return entry;
}

function widgetLayoutFor(tabKey: string) {
  const entry = customizedEntryFor(tabKey);
  return entry ? resolveWidgetLayout('Domain', entry.id, customizedPage.value) : [];
}

// Tag labels split the official way: glossary-sourced labels are the
// glossary-terms widget, the rest are the tags widget.
const domainTags = computed(() =>
  (domain.value?.tags ?? []).filter((tag) => tag.source !== 'Glossary'),
);
const domainGlossaryTerms = computed(() =>
  (domain.value?.tags ?? []).filter((tag) => tag.source === 'Glossary'),
);
const domainTierTag = computed(() => getTierTag(domain.value?.tags ?? []));
const domainCertificationTag = computed(() => getCertificationTag(domain.value?.tags ?? []));

function tagFqnList(tags: readonly TagRef[]): string {
  return tags.map((tag) => tag.tagFQN).join(', ');
}

/**
 * D-4 derived flags (official getDerivedPermissionFlags, DescriptionWidget
 * shape): the entity's `deleted` gates every Edit* flag. Domain carries
 * `deleted` in the spec (pin generated domain.ts), so it is passed like
 * every other entity.
 */
const domainFlags = computed(() =>
  getDerivedPermissionFlags(ops.value ?? {}, domain.value?.deleted === true),
);

/**
 * P1 both lines for asset writes: the server authorizes EDIT_ALL on the
 * domain for assets/add|remove, and isAdminUser ORs in on top. A failed or
 * missing permission fetch denies (fail-closed). Field-level EditAll is
 * read through the derivation now, not raw.
 */
const canEditAssets = computed(
  () => permissionStore.isAdminUser || domainFlags.value.canEditAll,
);
const canEditDescription = computed(() => domainFlags.value.canEditDescription);
const canEditCustomFields = computed(() => domainFlags.value.canEditCustomFields);
/** Custom-properties read gate: null while the permission fetch is still resolving. */
const customPropsCanView = computed<boolean | null>(() =>
  loading.value ? null : ops.value ? domainFlags.value.canViewCustomFields : false,
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
    domain.value = await getDomainByName(props.fqn);
    const fqn = domain.value.fullyQualifiedName || domain.value.name;
    ops.value = fqn
      ? await permissionStore.getEntityPermissionByFqn('domain', fqn).catch(() => null)
      : null;
    try {
      assets.value = (await listDomainAssets(domain.value.id, 50)).data;
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

/**
 * Official useAssetSelectionState.handleSave (domain branch): a domain
 * add first runs with {dryRun: true}; when the dryRun answer carries
 * hasSideEffects rows, the save stops and the impacts + pending entities
 * wait for the user's confirm (confirmDomainAssetMove) or cancel.
 * Product entry differs — official dryRuns inside the asset-selection
 * modal's save, the product dryRuns on the AddAssetsModal confirm —
 * but the step, the pending set and the confirm/cancel pair are the
 * official ones; the picker closes and the impact panel renders in the
 * assets tab so the pending selection stays visible while deciding.
 */
async function onConfirmAddAssets(selected: EntityRef[]): Promise<void> {
  if (!domain.value) {
    return;
  }
  const fqn = domain.value.fullyQualifiedName || domain.value.name;
  try {
    const dryRun = await addDomainAssets(fqn, selected, { dryRun: true });
    const impacts = getDomainDryRunImpacts(dryRun);
    if (impacts.length > 0) {
      dryRunImpacts.value = impacts;
      pendingAssets.value = selected;
      addAssetsOpen.value = false;
      return;
    }
    await submitDomainAssets(fqn, selected);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function submitDomainAssets(fqn: string, selected: EntityRef[]): Promise<void> {
  bulkResult.value = await addDomainAssets(fqn, selected);
  addAssetsOpen.value = false;
  message.success(t('governance.domains.assetsUpdated'));
  await load();
}

async function onConfirmDryRun(): Promise<void> {
  if (!domain.value || !pendingAssets.value.length) {
    return;
  }
  const fqn = domain.value.fullyQualifiedName || domain.value.name;
  dryRunSaving.value = true;
  try {
    await submitDomainAssets(fqn, pendingAssets.value);
    dryRunImpacts.value = [];
    pendingAssets.value = [];
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    dryRunSaving.value = false;
  }
}

function onCancelDryRun(): void {
  dryRunImpacts.value = [];
  pendingAssets.value = [];
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
  // Rebuild the rich-text editor so it opens on the current description.
  editKey.value += 1;
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
      description: descriptionEditorRef.value?.getEditorContent()?.trim() ?? editForm.description.trim(),
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

/**
 * D-3 description-cell save: the same full-body PUT as onSave, built
 * from the loaded entity (not the edit form, which is only populated
 * while the page modal is open). Throws on failure so the cell keeps
 * its editor open.
 */
async function onDescriptionUpdate(description: string): Promise<void> {
  if (!domain.value) {
    return;
  }
  await updateDomain({
    name: domain.value.name,
    description,
    domainType: domain.value.domainType,
    displayName: domain.value.displayName || undefined,
    parent: domain.value.parent?.fullyQualifiedName || domain.value.parent?.name,
  });
  message.success(t('governance.domains.updated'));
  await load();
}

async function onOpenVersions(): Promise<void> {
  // B-9 #2: the version route still addresses the domain by id, so the
  // version entry needs the loaded entity's id; with no domain loaded
  // there is nothing to open (the button is disabled then).
  const targetId = domain.value?.id;
  if (!targetId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('domain', targetId, (version) => getDomainVersionPath(targetId, version));
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

function openSubDomain(subDomain: EntityRef): void {
  // B-9 #2: sub-domain links carry the fully qualified name now (the
  // EntityRef already carries it). An empty FQN links nowhere: never
  // fall back to `name` — a bare name is not an addressable FQN.
  const fqn = subDomain.fullyQualifiedName;
  if (!fqn) {
    return;
  }
  void router.push({ name: 'governance-domain', params: { fqn } });
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
  () => props.fqn,
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
      <Button data-testid="domain-versions" :disabled="!domain" @click="onOpenVersions">{{ t('governance.versions.openVersions') }}</Button>
      <Button danger data-testid="delete-domain" :disabled="!domain" @click="onDeleteDomain">{{ t('crud.delete') }}</Button>
      <Button type="primary" data-testid="edit-domain" :disabled="!domain" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="Domain">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && domain" data-testid="widget-description">
            <EntityDescriptionCell
              :description="domain.description"
              :entity-name="domain.displayName || domain.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && domain" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(domain.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && domain" data-testid="widget-experts">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.experts')">{{ joinRefNames(domain.experts) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN_TYPE && domain" data-testid="widget-domain-type">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.type')">{{ domain.domainType }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && domain" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(domainTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && domain" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(domainGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && domain" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ domainTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && domain" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ domainCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="domain?.extension || {}"
              :error="customPropsError"
              entity-type="domain"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <Descriptions v-else-if="domain" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ domain.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ domain.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ domain.domainType }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.parent')">{{ domain.parent?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">
              <EntityDescriptionCell
                :description="domain.description"
                :entity-name="domain.displayName || domain.name"
                :has-edit-access="canEditDescription"
                :expanded="true"
                :remove-blur="true"
                :on-description-update="onDescriptionUpdate"
              />
            </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">
          {{ joinRefNames(domain.owners) || '—' }}
        </Descriptions.Item>
        <!-- D-1 Domain right column (official DOCUMENTATION layout,
             y=1..5): tier, certification, tags, glossary terms,
             experts. Same computeds as the widget-cell branches above,
             so the default panel and the grid agree. -->
        <Descriptions.Item :label="t('label.tier')">
          {{ domainTierTag?.tagFQN || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.certification')">
          {{ domainCertificationTag?.tagFQN || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('asset.fields.tags')">
          {{ tagFqnList(domainTags) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">
          {{ tagFqnList(domainGlossaryTerms) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.experts')">
          {{ joinRefNames(domain.experts) || '—' }}
        </Descriptions.Item>
      </Descriptions>
      <!-- D-1 CustomProperties (official DOCUMENTATION y=7): the same
           read panel as the independent custom-properties tab, without
           its edit button — inline editing stays in the tab (D-2 batch 2). -->
      <AssetCustomPropertiesPanel
        :defs="customProperties"
        :values="domain?.extension || {}"
        :error="customPropsError"
        entity-type="domain"
        :can-view="customPropsCanView"
      />
    </template>
    <template #assets>
      <GenericTab v-if="customizedEntryFor('assets')" :layout="widgetLayoutFor('assets')" page-type="Domain">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && domain" data-testid="widget-description">
            <EntityDescriptionCell
              :description="domain.description"
              :entity-name="domain.displayName || domain.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && domain" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(domain.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && domain" data-testid="widget-experts">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.experts')">{{ joinRefNames(domain.experts) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN_TYPE && domain" data-testid="widget-domain-type">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.type')">{{ domain.domainType }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && domain" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(domainTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && domain" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(domainGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && domain" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ domainTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && domain" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ domainCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="domain?.extension || {}"
              :error="customPropsError"
              entity-type="domain"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <template v-else>
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
      <div v-if="dryRunImpacts.length" data-testid="domain-dryrun-panel" style="margin-bottom: 12px">
        <Alert type="warning" show-icon :message="t('governance.domains.dryRunTitle')" />
        <ul>
          <li
            v-for="impact in dryRunImpacts"
            :key="impact.request?.id || impact.request?.fullyQualifiedName || impact.request?.name"
            :data-testid="`domain-dryrun-item-${impact.request?.id || impact.request?.name}`"
          >
            {{ impact.request?.fullyQualifiedName || impact.request?.name }}
            <span v-if="impact.message"> — {{ impact.message }}</span>
          </li>
        </ul>
        <Button
          type="primary"
          data-testid="domain-dryrun-confirm"
          :loading="dryRunSaving"
          @click="onConfirmDryRun"
        >
          {{ t('governance.domains.dryRunConfirm') }}
        </Button>
        <Button data-testid="domain-dryrun-cancel" style="margin-left: 8px" @click="onCancelDryRun">
          {{ t('crud.cancel') }}
        </Button>
      </div>
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
    </template>
    <template #subDomains>
      <GenericTab v-if="customizedEntryFor('subDomains')" :layout="widgetLayoutFor('subDomains')" page-type="Domain">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && domain" data-testid="widget-description">
            <EntityDescriptionCell
              :description="domain.description"
              :entity-name="domain.displayName || domain.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && domain" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(domain.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && domain" data-testid="widget-experts">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.experts')">{{ joinRefNames(domain.experts) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN_TYPE && domain" data-testid="widget-domain-type">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.type')">{{ domain.domainType }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && domain" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(domainTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && domain" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(domainGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && domain" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ domainTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && domain" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ domainCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="domain?.extension || {}"
              :error="customPropsError"
              entity-type="domain"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <template v-else>
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
    </template>
    <template #activity>
      <GenericTab v-if="customizedEntryFor('activity')" :layout="widgetLayoutFor('activity')" page-type="Domain">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && domain" data-testid="widget-description">
            <EntityDescriptionCell
              :description="domain.description"
              :entity-name="domain.displayName || domain.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && domain" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(domain.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && domain" data-testid="widget-experts">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.experts')">{{ joinRefNames(domain.experts) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN_TYPE && domain" data-testid="widget-domain-type">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.type')">{{ domain.domainType }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && domain" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(domainTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && domain" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(domainGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && domain" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ domainTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && domain" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ domainCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="domain?.extension || {}"
              :error="customPropsError"
              entity-type="domain"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <AssetActivityPanel
        v-else
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="domain"
        :fqn="domain?.fullyQualifiedName || domain?.name || ''"
      />
    </template>
    <template #customProperties>
      <GenericTab v-if="customizedEntryFor('customProperties')" :layout="widgetLayoutFor('customProperties')" page-type="Domain">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && domain" data-testid="widget-description">
            <EntityDescriptionCell
              :description="domain.description"
              :entity-name="domain.displayName || domain.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && domain" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(domain.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.EXPERTS && domain" data-testid="widget-experts">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.experts')">{{ joinRefNames(domain.experts) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN_TYPE && domain" data-testid="widget-domain-type">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.type')">{{ domain.domainType }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && domain" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(domainTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && domain" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(domainGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && domain" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ domainTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && domain" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ domainCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="domain?.extension || {}"
              :error="customPropsError"
              entity-type="domain"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <template v-else>
      <div style="margin-bottom: 12px">
        <Button
          data-testid="edit-domain-custom-properties"
          :disabled="!domain || !canEditCustomFields || !customProperties.length"
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
      :can-view="customPropsCanView"
      />
      </template>
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
        <SmRichTextEditor
              :key="editKey"
              ref="descriptionEditorRef"
              :autofocus="true"
              :initial-value="editForm.description"
            />
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
