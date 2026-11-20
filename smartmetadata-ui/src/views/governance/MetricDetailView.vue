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
import { setFieldPatch } from '@/admin/jsonPatch';
import { descriptionPatch } from '@/governance/assetPatch';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import MetricCreateDrawer from '@/components/governance/MetricCreateDrawer.vue';
import WidgetKnowledgePagesCell from '@/components/shared/widgets/WidgetKnowledgePagesCell.vue';
import WidgetMetricHierarchyCell from '@/components/shared/widgets/WidgetMetricHierarchyCell.vue';
import WidgetRelatedMetricsCell from '@/components/shared/widgets/WidgetRelatedMetricsCell.vue';
import { useMetricCreateDrawer } from '@/features/metrics/useMetricCreateDrawer';
import { usePermissionStore } from '@/stores/permissions';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { entityDetailTabDefs } from '@/catalog/entityDetailTabs';
import GenericTab from '@/components/customize/GenericTab.vue';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { findCustomizedTabEntry, getDetailsTabWithNewLabel, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { getCertificationTag, getTierTag } from '@/ingestion/tierTags';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { AssetDetail, EntityRef, TagRef } from '@/types/api';

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

/**
 * D-2 batch 5c: the three grid-editable metric widgets. RelatedMetrics
 * edits under the derived canEditAll flag, never on a deleted metric
 * (official RelatedMetrics gate). The hierarchy add-child button reads
 * the raw Create permission with no derivation (A8 §2.3 exception 2)
 * and the P1 admin line on top, never on a deleted metric. The create
 * drawer handle is created once per view and handed to both the cell
 * and the drawer, so the cell's button opens the mounted drawer.
 */
const permissionStore = usePermissionStore();
const createDrawer = useMetricCreateDrawer();
const hierarchyRefreshKey = ref(0);
const canEditRelatedMetrics = computed(
  () => metricPermissions.canEditAll.value && metric.value?.deleted !== true,
);
const canAddChildMetric = computed(
  () =>
    (permissionStore.isAdminUser || metricPermissions.permissions.value.Create === true) &&
    metric.value?.deleted !== true,
);

/**
 * Official RelatedMetrics save: patchMetric with a relatedMetrics JSON
 * Patch. Throws on failure so the cell keeps its editor open.
 */
async function onRelatedMetricsChange(refs: EntityRef[]): Promise<void> {
  if (!metric.value?.id) {
    return;
  }
  await patchMetric(
    metric.value.id,
    setFieldPatch('/relatedMetrics', metric.value.relatedMetrics, refs),
  );
  message.success(t('crud.updated'));
  await load();
}

function onAddChildMetric(): void {
  if (metric.value) {
    createDrawer.openDrawer(metric.value.fullyQualifiedName);
  }
}

async function onChildMetricCreated(): Promise<void> {
  hierarchyRefreshKey.value += 1;
  await load();
}
/** Custom-properties read gate: null while the permission fetch is still resolving. */
const customPropsCanView = computed<boolean | null>(() =>
  metricPermissions.isLoading.value ? null : metricPermissions.can('ViewCustomFields'),
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
// as AssetDetailView; residual R-4): DATA_PRODUCTS / EXPERTS / REVIEWER —
// this view reads the metric through `fetchAssetDetail`, whose
// AssetDetail shape carries none of these fields, so there is no
// supporting data in the loaded object (the Metric spec carries them;
// the `api/metrics.ts` Metric shape is a different, list-oriented read
// path). LEFT_PANEL is structural, not a missing branch: GenericTab
// renders the panel's children and never offers the panel itself to
// the slot.
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

// Tag labels split the official way: glossary-sourced labels are the
// glossary-terms widget, the rest are the tags widget.
const metricTags = computed(() =>
  (metric.value?.tags ?? []).filter((tag) => tag.source !== 'Glossary'),
);
const metricGlossaryTerms = computed(() =>
  (metric.value?.tags ?? []).filter((tag) => tag.source === 'Glossary'),
);
const metricTierTag = computed(() => getTierTag(metric.value?.tags ?? []));
const metricCertificationTag = computed(() => getCertificationTag(metric.value?.tags ?? []));

function tagFqnList(tags: readonly TagRef[]): string {
  return tags.map((tag) => tag.tagFQN).join(', ');
}

const metricExpression = computed(
  () =>
    [metric.value?.storedProcedureCode?.language, metric.value?.storedProcedureCode?.code]
      .filter(Boolean)
      .join('\n\n') || t('metrics.noExpression'),
);

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
      <Button danger data-testid="metric-delete" :disabled="!metric?.id" @click="onDeleteMetric">
        {{ t('crud.delete') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="Metric">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('metrics.type')">{{ metric.metricType || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.unit')">{{ metric.unitOfMeasurement || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.granularity')">{{ metric.granularity || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.expression')">{{ metricExpression }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(metric.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.title')">{{ joinRefNames(metric.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(metricTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(metricGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ metricTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ metricCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_METRICS && metric" data-testid="widget-related-metrics">
            <WidgetRelatedMetricsCell
              :metric="metric"
              :has-edit-access="canEditRelatedMetrics"
              :on-save="onRelatedMetricsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_HIERARCHY && metric" data-testid="widget-metric-hierarchy">
            <WidgetMetricHierarchyCell
              :key="hierarchyRefreshKey"
              :metric="metric"
              :can-add-child="canAddChildMetric"
              :on-add-child="onAddChildMetric"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && metric?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="metric.id" entity-type="metric" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
            :can-view="customPropsCanView"
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
        <Descriptions.Item :label="t('metrics.type')">
          {{ metric.metricType || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.unit')">
          {{ metric.unitOfMeasurement || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.granularity')">
          {{ metric.granularity || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.expression')" :span="3">
          {{ metricExpression }}
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
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('metrics.type')">{{ metric.metricType || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.unit')">{{ metric.unitOfMeasurement || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.granularity')">{{ metric.granularity || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.expression')">{{ metricExpression }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(metric.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.title')">{{ joinRefNames(metric.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(metricTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(metricGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ metricTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ metricCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_METRICS && metric" data-testid="widget-related-metrics">
            <WidgetRelatedMetricsCell
              :metric="metric"
              :has-edit-access="canEditRelatedMetrics"
              :on-save="onRelatedMetricsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_HIERARCHY && metric" data-testid="widget-metric-hierarchy">
            <WidgetMetricHierarchyCell
              :key="hierarchyRefreshKey"
              :metric="metric"
              :can-add-child="canAddChildMetric"
              :on-add-child="onAddChildMetric"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && metric?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="metric.id" entity-type="metric" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
            :can-view="customPropsCanView"
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
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('metrics.type')">{{ metric.metricType || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.unit')">{{ metric.unitOfMeasurement || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.granularity')">{{ metric.granularity || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.expression')">{{ metricExpression }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(metric.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.title')">{{ joinRefNames(metric.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(metricTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(metricGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ metricTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ metricCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_METRICS && metric" data-testid="widget-related-metrics">
            <WidgetRelatedMetricsCell
              :metric="metric"
              :has-edit-access="canEditRelatedMetrics"
              :on-save="onRelatedMetricsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_HIERARCHY && metric" data-testid="widget-metric-hierarchy">
            <WidgetMetricHierarchyCell
              :key="hierarchyRefreshKey"
              :metric="metric"
              :can-add-child="canAddChildMetric"
              :on-add-child="onAddChildMetric"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && metric?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="metric.id" entity-type="metric" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
            :can-view="customPropsCanView"
            />
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.assets')" />
    </template>
    <template #activity_feed>
      <GenericTab v-if="customizedEntryFor('activity_feed')" :layout="widgetLayoutFor('activity_feed')" page-type="Metric">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('metrics.type')">{{ metric.metricType || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.unit')">{{ metric.unitOfMeasurement || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.granularity')">{{ metric.granularity || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.expression')">{{ metricExpression }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(metric.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.title')">{{ joinRefNames(metric.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(metricTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(metricGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ metricTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ metricCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_METRICS && metric" data-testid="widget-related-metrics">
            <WidgetRelatedMetricsCell
              :metric="metric"
              :has-edit-access="canEditRelatedMetrics"
              :on-save="onRelatedMetricsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_HIERARCHY && metric" data-testid="widget-metric-hierarchy">
            <WidgetMetricHierarchyCell
              :key="hierarchyRefreshKey"
              :metric="metric"
              :can-add-child="canAddChildMetric"
              :on-add-child="onAddChildMetric"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && metric?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="metric.id" entity-type="metric" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
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
        entity-type="metric"
        :fqn="metric?.fullyQualifiedName || metric?.name || ''"
      />
    </template>
    <template #custom_properties>
      <GenericTab v-if="customizedEntryFor('custom_properties')" :layout="widgetLayoutFor('custom_properties')" page-type="Metric">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && metric" data-testid="widget-description">
            <EntityDescriptionCell
              :description="metric.description"
              :entity-name="metric.displayName || metric.name"
              :has-edit-access="canEditDescription"
              :expanded="true"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_DEFINITION && metric" data-testid="widget-metric-definition">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('metrics.type')">{{ metric.metricType || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.unit')">{{ metric.unitOfMeasurement || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.granularity')">{{ metric.granularity || '—' }}</Descriptions.Item>
              <Descriptions.Item :label="t('metrics.expression')">{{ metricExpression }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && metric" data-testid="widget-owners">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(metric.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && metric" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('governance.domains.title')">{{ joinRefNames(metric.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && metric" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(metricTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && metric" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(metricGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && metric" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ metricTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && metric" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ metricCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_METRICS && metric" data-testid="widget-related-metrics">
            <WidgetRelatedMetricsCell
              :metric="metric"
              :has-edit-access="canEditRelatedMetrics"
              :on-save="onRelatedMetricsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.METRIC_HIERARCHY && metric" data-testid="widget-metric-hierarchy">
            <WidgetMetricHierarchyCell
              :key="hierarchyRefreshKey"
              :metric="metric"
              :can-add-child="canAddChildMetric"
              :on-add-child="onAddChildMetric"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.KNOWLEDGE_ARTICLE && metric?.id" data-testid="widget-knowledge-article">
            <WidgetKnowledgePagesCell :entity-id="metric.id" entity-type="metric" />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CUSTOM_PROPERTIES" data-testid="widget-custom-properties">
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="metric?.extension || {}"
              :error="customPropsError"
              entity-type="metric"
            :can-view="customPropsCanView"
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
      />
    </template>
    <MetricCreateDrawer
      v-model:open="createDrawer.open.value"
      :parent-metric-fqn="createDrawer.parentMetricFqn.value"
      @created="onChildMetricCreated"
    />
  </EntityDetailShell>
</template>
