<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Empty, message } from 'ant-design-vue';
import { fetchAssetDetail } from '@/api/entities';
import { deleteMetricAsync, patchMetric } from '@/api/metrics';
import {
  certificationPatch,
  descriptionPatch,
  domainsPatch,
  extensionPatch,
  ownersPatch,
  tagsPatch,
  type TagLabelInput,
} from '@/governance/assetPatch';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import WidgetCertificationCell from '@/components/shared/widgets/WidgetCertificationCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import WidgetTierCell from '@/components/shared/widgets/WidgetTierCell.vue';
import MetricDefinitionWidget from '@/components/widgets/MetricDefinitionWidget.vue';
import { usePermissionStore } from '@/stores/permissions';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { entityDetailTabDefs } from '@/catalog/entityDetailTabs';
import GenericTab from '@/components/customize/GenericTab.vue';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import { resolveWidgetLayout, isLargeWidget } from '@/composables/customizeWidgetLayout';
import { getCustomPropertiesWidgetSettings } from '@/views/admin/persona/editors/customPropertiesWidgetSettings';
import { findCustomizedTabEntry, getDetailsTabWithNewLabel, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { AssetDetail } from '@/types/api';

/**
 * Stage 4 metric detail page, following the official MetricDetailsPage
 * shape (FQN lookup, definition fields, version entry) without inventing
 * what the product API does not serve: the page reads the metric entity
 * through the Stage 2 entity detail endpoint (metrics collection,
 * metricExpression/metricType/unitOfMeasurement/granularity fields).
 * The description write goes through PATCH /v1/metrics/{id} (official
 * patchMetric; the server is the pin tree, so the endpoint exists with
 * no backend change). Delete and single-version detail are residuals,
 * not buttons that call nothing.
 *
 * B-11 tab surface: the five official Metric tabs (METRIC_TABS, from
 * MetricDetailsClassBase.getMetricDetailPageTabsIds) through the
 * EntityDetailShell, with the tab layer (C-4) and widget layer (B-8)
 * following the other governance views. The lineage pane reuses the
 * shared LineageCanvas; the assets pane is the established honest
 * residual (no metric-assets API exists); activity and custom
 * properties reuse the shared panels and generic read APIs.
 */
const props = defineProps<{ fqn: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const metric = ref<AssetDetail | null>(null);
const activeTab = ref('overview');
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const customProperties = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');

/**
 * D-4: the composable fetches the metric's permissions by FQN and
 * derives the flags (deleted-gated). A fetch failure is toasted once
 * via the error watcher; the flags stay all-false (fail-closed).
 */
const metricPermissions = useEntityPermissions(
  'metric',
  () => metric.value?.fullyQualifiedName || metric.value?.name || '',
  { deleted: () => metric.value?.deleted === true },
);
const canEditDescription = computed(() => metricPermissions.canEditDescription.value);
const permissionStore = usePermissionStore();
/**
 * D-4 delete gate (pin DataAssetsHeader canDelete; the view has no edit
 * affordance — Metric is read-only here). Delete is the soft-delete
 * action, so it additionally requires !deleted. The P1 admin line ORs
 * in on top.
 */
const canDeleteMetric = computed(
  () =>
    metric.value?.deleted !== true &&
    (permissionStore.isAdminUser || metricPermissions.canDelete.value),
);
/** Custom-properties read gate: null while the permission fetch is still resolving. */
const customPropsCanView = computed<boolean | null>(() =>
  metricPermissions.isLoading.value ? null : metricPermissions.can('ViewCustomFields'),
);

/**
 * D-2 batch 2 widget-cell gates (P1 dual line): each action gate ORs
 * `isAdminUser` with the derived flag — never only one. The composable
 * exposes only the named flags it owns; the rest go through its generic
 * `can(op)` escape hatch, which applies the same prioritization and
 * deleted gating.
 */
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
const canEditTags = computed(() => permissionStore.isAdminUser || metricPermissions.can('EditTags'));
const canEditGlossaryTerms = computed(
  () => permissionStore.isAdminUser || metricPermissions.can('EditGlossaryTerms'),
);
const canEditOwners = computed(() => permissionStore.isAdminUser || metricPermissions.can('EditOwners'));
const canEditDomains = computed(() => permissionStore.isAdminUser || metricPermissions.can('EditDomains'));
const canEditTier = computed(() => permissionStore.isAdminUser || metricPermissions.can('EditTier'));
const canEditCertification = computed(
  () => permissionStore.isAdminUser || metricPermissions.can('EditCertification'),
);
const canEditCustomProperties = computed(
  () => permissionStore.isAdminUser || metricPermissions.can('EditCustomFields'),
);
watch(
  () => metricPermissions.error.value,
  (error) => {
    if (error) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  },
);

/**
 * D-3 description-cell save: official patchMetric (PATCH /v1/metrics/{id})
 * with a description JSON Patch. Throws on failure so the cell keeps
 * its editor open.
 */
async function onDescriptionUpdate(description: string): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(metric.value.id, descriptionPatch(metric.value.description, description));
  message.success(t('crud.updated'));
  await load();
}

/**
 * D-2 batch 2 widget-cell saves: each is one field's JSON Patch via
 * patchMetric. Each throws on failure so the cell keeps its editor open.
 */
async function onTagsChange(tags: TagLabelInput[]): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(metric.value.id, tagsPatch(metric.value.tags, tags));
  message.success(t('crud.updated'));
  await load();
}

/**
 * D-2 batch 5b metric definition: the pin `MetricDefinitionCard` call
 * site derives `canEditAll` WITHOUT the `deleted` flag
 * (`MetricDefinitionCard.tsx:391`); the widget hides the Edit button
 * itself when the metric is deleted. The admin line is the P1 dual
 * line; fail-closed until the permission operations resolve.
 */
const metricDefinitionCanEdit = computed(
  () =>
    permissionStore.isAdminUser ||
    getDerivedPermissionFlags(metricPermissions.permissions.value).canEditAll,
);

/**
 * D-2 batch 5b metric definition save: the widget hands over the JSON
 * Patch ops it diffed from the pin save payload; a thrown failure keeps
 * the edit dialog open with its error alert.
 */
async function onMetricDefinitionSave(ops: JsonPatchOp[]): Promise<void> {
  if (!metric.value?.id) {
    throw new Error(t('crud.loadFailed'));
  }
  await patchMetric(metric.value.id, ops);
  message.success(t('crud.updated'));
  await load();
}

async function onOwnersChange(owners: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(metric.value.id, ownersPatch(metric.value.owners, owners));
  message.success(t('crud.updated'));
  await load();
}

async function onDomainsChange(domainIds: string[]): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(metric.value.id, domainsPatch(metric.value.domains, domainIds));
  message.success(t('crud.updated'));
  await load();
}

async function onCertificationChange(tagFqn?: string): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(metric.value.id, certificationPatch(metric.value.certification, tagFqn));
  message.success(t('crud.updated'));
  await load();
}

async function onCustomPropertySave(name: string, value: unknown): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  const next = { ...(metric.value.extension ?? {}) };
  if (value === undefined) {
    delete next[name];
  } else {
    next[name] = value;
  }
  await patchMetric(metric.value.id, extensionPatch(metric.value.extension, next));
  message.success(t('asset.propsUpdated'));
  await load();
}

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('metrics.title'), to: { name: 'governance-metrics' } },
  { label: entityLabel(metric.value) || props.fqn },
]);

// C-4 consume side: the selected persona's Metric page replaces these
// tabs (official `getDetailsTabWithNewLabel` — see `useCustomPages.ts`).
// No tab is preserved: every rendered key matches a Metric TabsId
// exactly, so a customization can remove any of them.
const { customizedPage } = useCustomPages('Metric');

const tabs = computed<EntityDetailTab[]>(() =>
  getDetailsTabWithNewLabel(
    (entityDetailTabDefs('metric') ?? []).map((def) => ({
      key: def.key,
      label: t(`asset.tabs.${def.labelKey}`),
      testId: `metric-tab-${def.key}`,
    })),
    customizedPage.value?.tabs,
  ),
);

// Widget layer (B-8): the widget grid mounts ONLY on this page type's
// widget-layout tab (Metric: overview), and only when the customized
// page has a tab entry resolving to the rendered tab key whose
// official id is that mount tab (`isWidgetLayoutTab`, reading
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
// as AssetDetailView; residual R-4): DATA_PRODUCTS — the field is now
// requested and mapped on AssetDetail, but the Metric layout carries no
// DataProducts widget (only Asset wires it, BENCHMARK §15); EXPERTS /
// REVIEWER / RELATED_METRICS / METRIC_HIERARCHY — this view reads the
// metric through `fetchAssetDetail`, whose AssetDetail shape carries
// none of these fields, so there is no supporting data in the loaded
// object (the Metric spec carries them; the `api/metrics.ts` Metric
// shape is a different, list-oriented read path); KNOWLEDGE_ARTICLE —
// no knowledge-article data source exists in the product. LEFT_PANEL is
// structural, not a missing branch: GenericTab renders the panel's
// children and never offers the panel itself to the slot.
function customizedEntryFor(tabKey: string) {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, tabKey);
  if (!entry?.id || !isWidgetLayoutTab('Metric', entry.id)) {
    return undefined;
  }
  return entry;
}

function widgetLayoutFor(tabKey: string) {
  const entry = customizedEntryFor(tabKey);
  return entry ? resolveWidgetLayout('Metric', entry.id, customizedPage.value) : [];
}


async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    metric.value = await fetchAssetDetail('metric', decodeURIComponent(props.fqn));
    const fqn = metric.value.fullyQualifiedName || metric.value.name;
    try {
      const [activityPage, conversationPage] = await Promise.all([
        listEntityActivity('metric', fqn),
        listConversations({ entityLink: toEntityLink('metric', fqn), limit: 20 }),
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
      customProperties.value = await listCustomProperties('metric');
      customPropsError.value = '';
    } catch (error) {
      customProperties.value = [];
      customPropsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('metrics.loadFailed');
    metric.value = null;
    activity.value = [];
    conversations.value = [];
    customProperties.value = [];
  } finally {
    loading.value = false;
  }
}

async function onDeleteMetric(): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('metrics.deleteConfirmWithVariants', { name: entityLabel(metric.value) }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    // A-D5: detail single delete is the same recursive async soft
    // delete as the list bulk delete — recursive=true is passed
    // explicitly, never left to the default.
    await deleteMetricAsync(metric.value.id, true);
    message.success(t('metrics.asyncDeleteSubmitted'));
    await router.push({ name: 'governance-metrics' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

function openVersions(): void {
  if (!metric.value?.id) {
    return;
  }
  void router.push({
    name: 'asset-version',
    params: { entityType: 'metric', fqn: metric.value.fullyQualifiedName },
  });
}

watch(
  () => props.fqn,
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
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(metric) || props.fqn"
    :name="metric?.name"
    :fqn="metric?.fullyQualifiedName"
    :lead="t('metrics.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!metric && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="metric ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #error-action>
      <!-- M-3: restores the SmState retry the shell migration dropped
           (HEAD used SmState + show-retry + @retry="load"). -->
      <Button data-testid="metric-retry" @click="load">{{ t('shared.retry') }}</Button>
    </template>
    <template #actions>
      <Button type="default" data-testid="metric-versions" :disabled="!metric?.id" @click="openVersions">
        {{ t('metrics.versions') }}
      </Button>
      <Button danger data-testid="metric-delete" :disabled="!metric?.id || !canDeleteMetric" @click="onDeleteMetric">
        {{ t('crud.delete') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="Metric">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="isLargeWidget(widget)"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <MetricDefinitionWidget
              :metric="metric"
              :can-edit="metricDefinitionCanEdit"
              :on-save="onMetricDefinitionSave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="metric.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="metric.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <WidgetTierCell
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="metric.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
        </template>
      </GenericTab>
      <Descriptions v-else-if="metric" bordered size="small" data-testid="metric-details">
        <Descriptions.Item :label="t('crud.description')" :span="3">
          <EntityDescriptionCell
            :description="metric.description"
            :entity-name="metric.displayName || metric.name"
            :has-edit-access="canEditDescription"
            :expanded="true"
            :on-description-update="onDescriptionUpdate"
          />
        </Descriptions.Item>
        <Descriptions.Item :span="3">
          <MetricDefinitionWidget
            :metric="metric"
            :can-edit="metricDefinitionCanEdit"
            :on-save="onMetricDefinitionSave"
          />
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')" :span="3">
          {{ joinRefNames(metric.owners) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('governance.domains.title')" :span="3">
          {{ joinRefNames(metric.domains) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #lineage>
      <GenericTab v-if="customizedEntryFor('lineage')" :layout="widgetLayoutFor('lineage')" page-type="Metric">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="isLargeWidget(widget)"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <MetricDefinitionWidget
              :metric="metric"
              :can-edit="metricDefinitionCanEdit"
              :on-save="onMetricDefinitionSave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="metric.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="metric.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <WidgetTierCell
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="metric.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
        </template>
      </GenericTab>
      <LineageCanvas
        v-else
        entity-type="metric"
        :fqn="metric?.fullyQualifiedName || props.fqn"
        variant="tab"
      />
    </template>
    <template #assets>
      <GenericTab v-if="customizedEntryFor('assets')" :layout="widgetLayoutFor('assets')" page-type="Metric">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="isLargeWidget(widget)"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <MetricDefinitionWidget
              :metric="metric"
              :can-edit="metricDefinitionCanEdit"
              :on-save="onMetricDefinitionSave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="metric.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="metric.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <WidgetTierCell
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="metric.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.assets')" />
    </template>
    <template #activity_feed>
      <GenericTab v-if="customizedEntryFor('activity_feed')" :layout="widgetLayoutFor('activity_feed')" page-type="Metric">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="isLargeWidget(widget)"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <MetricDefinitionWidget
              :metric="metric"
              :can-edit="metricDefinitionCanEdit"
              :on-save="onMetricDefinitionSave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="metric.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="metric.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <WidgetTierCell
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="metric.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
        </template>
      </GenericTab>
      <AssetActivityPanel
        v-else
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="metric"
        :fqn="metric?.fullyQualifiedName || metric?.name || ''"
      />
    </template>
    <template #custom_properties>
      <GenericTab v-if="customizedEntryFor('custom_properties')" :layout="widgetLayoutFor('custom_properties')" page-type="Metric">
        <template #widget="{ contentKey, widget }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :remove-blur="isLargeWidget(widget)"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <MetricDefinitionWidget
              :metric="metric"
              :can-edit="metricDefinitionCanEdit"
              :on-save="onMetricDefinitionSave"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="metric.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="metric.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <WidgetTagsCell
              tag-type="Classification"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTags"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <WidgetTagsCell
              tag-type="Glossary"
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditGlossaryTerms"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <WidgetTierCell
              :tags="metric.tags ?? []"
              :options="catalog.tags"
              :has-edit-access="canEditTier"
              :on-tags-change="onTagsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <WidgetCertificationCell
              :certification-tag-fqn="metric.certification?.tagLabel?.tagFQN"
              :options="catalog.tags"
              :has-edit-access="canEditCertification"
              :on-change="onCertificationChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
              :can-view="customPropsCanView"
              :can-edit="canEditCustomProperties"
              :on-property-save="onCustomPropertySave"
            />
          </div>
        </template>
      </GenericTab>
      <AssetCustomPropertiesPanel
        v-else
        :defs="customProperties"
        :values="metric?.extension || {}"
        :error="customPropsError"
        entity-type="metric"
      :can-view="customPropsCanView"
      :can-edit="canEditCustomProperties"
      :on-property-save="onCustomPropertySave"
      />
    </template>
  </EntityDetailShell>
</template>
