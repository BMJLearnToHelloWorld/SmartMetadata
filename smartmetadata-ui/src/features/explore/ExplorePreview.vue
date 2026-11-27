<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Input, Modal, Spin, Tag, Typography, message } from 'ant-design-vue';
import { ApartmentOutlined, AppstoreAddOutlined, EditOutlined, PartitionOutlined, ProfileOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { fetchAssetDetail } from '@/api/entities';
import { getQueryCount } from '@/api/queries';
import { listTestCases } from '@/api/testCases';
import { listTestCaseIncidentsFromSearch } from '@/api/testIncidents';
import { detailLocationForHit, isLineageCapable, parentTableLocation, resolveDetailEndpoint, type SearchHitLocation } from '@/catalog/entityRoutes';
import { hasLineageSection } from '@/catalog/lineageSection';
import { entityTypeColor } from '@/catalog/searchHits';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import WidgetDataProductsCell from '@/components/shared/widgets/WidgetDataProductsCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import WidgetTierCell from '@/components/shared/widgets/WidgetTierCell.vue';
import { useEntityPermissions, type ResourceEntity } from '@/composables/useEntityPermissions';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
import type { TagLabelInput } from '@/governance/assetPatch';
import { usePermissionStore } from '@/stores/permissions';
import type { AssetDetail, EntityRef, SearchHit } from '@/types/api';
import LineageSection from './LineageSection.vue';
import PreviewCustomProperties from './PreviewCustomProperties.vue';
import PreviewDataQuality from './PreviewDataQuality.vue';
import PreviewLineageTab from './PreviewLineageTab.vue';
import PreviewSchemaTab from './PreviewSchemaTab.vue';
import {
  fetchPreviewOverviewRefresh,
  previewOverviewEditAccess,
  savePreviewDataProducts,
  savePreviewDescription,
  savePreviewDisplayName,
  savePreviewDomains,
  savePreviewOwners,
  savePreviewTags,
  type PreviewOverviewRefresh,
} from './previewOverviewEdits';
import {
  PREVIEW_CUSTOM_PROPERTIES_EXTRA_EXTENSION_TYPES,
  fetchPreviewExtensionSource,
  patchPreviewExtension,
  type PreviewExtensionSource,
} from './previewCustomProperties';
import {
  PREVIEW_CUSTOM_PROPERTIES_TAB_TYPES,
  PREVIEW_LINEAGE_TAB_TYPES,
  PREVIEW_SCHEMA_TAB_TYPES,
  buildPreviewOverviewRows,
  previewLayoutFor,
  previewPermissionTarget,
} from './previewOverview';

const props = defineProps<{
  hit: SearchHit | null;
}>();

const emit = defineEmits<{
  open: [hit: SearchHit];
  openLineage: [hit: SearchHit];
  close: [];
}>();

const { t, te } = useI18n();
const router = useRouter();

// vue-router rejects (unhandled) when a router-link resolves a named
// location the router never registered — this shared preview is mounted
// in host views whose routers carry no 'asset'/governance route, so an
// unregistered name renders plain text instead of a link. Same guard
// the D25 openHit fallback applies on navigation, applied here at
// render time for the title link and the overview row links.
function resolvableLocation(location: SearchHitLocation | null): location is SearchHitLocation {
  return Boolean(location && router.hasRoute(location.name));
}

// E-3a: pin EntitySummaryPanel tab shell (EntityRightPanelVerticalNav).
// E-3b landed Custom Properties, E-3d Schema / Lineage / Data Quality;
// the nav only ever shows implemented tabs, and every tab's content
// mounts with `v-if` so mount = activation (pin
// `EntitySummaryPanel.component.tsx:895-896`).
type PreviewTabKey = 'overview' | 'schema' | 'lineage' | 'dataQuality' | 'customProperties';
const PREVIEW_TABS: {
  key: PreviewTabKey;
  labelKey: string;
  testId: string;
  icon: Component;
  available: (entityType: string) => boolean;
  implemented: boolean;
}[] = [
  {
    key: 'overview',
    labelKey: 'explore.overview',
    testId: 'overview-tab',
    icon: ProfileOutlined,
    available: () => true,
    implemented: true,
  },
  {
    key: 'schema',
    // Official EntityRightPanelVerticalNav uses label.schema (数据模式).
    labelKey: 'explore.previewSchema',
    testId: 'schema-tab',
    icon: ApartmentOutlined,
    available: (entityType) => PREVIEW_SCHEMA_TAB_TYPES.has(entityType),
    implemented: true,
  },
  {
    key: 'lineage',
    labelKey: 'asset.tabs.lineage',
    testId: 'lineage-tab',
    icon: PartitionOutlined,
    available: (entityType) => PREVIEW_LINEAGE_TAB_TYPES.has(entityType),
    implemented: true,
  },
  {
    key: 'dataQuality',
    // Official uses label.data-quality (数据质控), not 数据质量.
    labelKey: 'explore.tabDataQuality',
    testId: 'data-quality-tab',
    icon: SafetyCertificateOutlined,
    available: (entityType) => entityType === 'table',
    implemented: true,
  },
  {
    key: 'customProperties',
    labelKey: 'asset.tabs.customProperties',
    testId: 'custom-properties-tab',
    icon: AppstoreAddOutlined,
    available: (entityType) => PREVIEW_CUSTOM_PROPERTIES_TAB_TYPES.has(entityType),
    implemented: true,
  },
];

const tabs = computed(() =>
  PREVIEW_TABS.filter((tab) => tab.implemented && props.hit && tab.available(props.hit.entityType)),
);
const activeTab = ref<PreviewTabKey>('overview');

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

// Column hits open their parent table (official column cards link to the
// parent table; there is no column detail page). Null otherwise, including
// column hits without a parent table FQN.
const columnParent = computed(() =>
  props.hit ? parentTableLocation(props.hit.entityType, props.hit.tableFqn) : null,
);

// D26: the navigation target for this hit, or null when the hit is
// honestly unwired (no parent table, no wired asset detail, no
// governance id). Covers the parent-table case too, so it is the
// single unwired check for the template.
const detailLocation = computed(() => {
  const location = props.hit ? detailLocationForHit(props.hit) : null;
  return resolvableLocation(location) ? location : null;
});

// D25: pin EntitySummaryPanel shows its Lineage tab for exactly the 11
// lineage-capable types; glossaryTerm, tag and dataProduct have no
// lineage entry in the pin preview.
const showLineage = computed(() => Boolean(props.hit && isLineageCapable(props.hit.entityType)));

// E-3a (EXP-P1-25): pin EntitySummaryPanel fetches the canonical entity by
// FQN (`owners,domains,tags,extension`) and merges it over the search hit
// (`EntitySummaryPanel.component.tsx:458-460`, `mergeEntityData`). The
// product's `fetchAssetDetail` requests that field set (and more) through
// the existing DETAIL_ENDPOINTS map, so no new client is invented. Types
// without a detail endpoint (tableColumn, governance types, services
// without a wired collection) render from the hit as-is — pin does the
// same for types with no fetch entry (`resolveEntityFetch` immediate /
// search-data fallback). A failed fetch also falls back to the hit; the
// detail page's own fetch surfaces the error if it matters.
const entity = ref<AssetDetail | null>(null);
const queryCount = ref<number | undefined>(undefined);
const incidentCount = ref<number | undefined>(undefined);
// E-3b: extension for the four Custom Properties tab types that E-3a's
// fetch does not cover (glossaryTerm / dataProduct / domain stay out of
// DETAIL_ENDPOINTS on purpose; tableColumn has no standalone API). It is
// fetched on tab activation — pin `EntitySummaryPanel.component.tsx:895-896`
// fetches entity data + type detail when the Custom Properties tab
// becomes active — not on preview open, so the E-3a "no column fetch"
// behaviour for the Overview stays intact. `entityLoading` is the tab's
// Loader flag (pin CustomPropertiesSection.tsx:112-114).
const extraExtension = ref<PreviewExtensionSource | null>(null);
const extraExtensionFqn = ref<string | undefined>(undefined);
const entityLoading = ref(false);
// E-3c: post-save read-back for the four types with no detail endpoint
// (domain / dataProduct / glossaryTerm / tableColumn). Declared before
// the entity watcher: that watcher runs immediately and clears it on
// entity change.
const savedRefresh = ref<PreviewOverviewRefresh | null>(null);
// A save bumps this so the watchers refetch (and the merged extension
// refreshes) without changing the FQN.
const detailRefresh = ref(0);
let fetchGeneration = 0;
let extraGeneration = 0;
let lastFetchedFqn: string | undefined;

watch(
  [() => props.hit?.fullyQualifiedName, detailRefresh],
  async () => {
    // Pin EntitySummaryPanel.component.tsx:881-884 resets the active tab
    // to OVERVIEW when the entity changes — a save refetch (same FQN)
    // keeps the Custom Properties tab open.
    const fqn = props.hit?.fullyQualifiedName;
    if (fqn !== lastFetchedFqn) {
      activeTab.value = 'overview';
      lastFetchedFqn = fqn;
      // A new entity starts from its own fetched/hit data, never from
      // the previous entity's post-save read-back.
      savedRefresh.value = null;
    }
    entity.value = null;
    extraExtension.value = null;
    extraExtensionFqn.value = undefined;
    queryCount.value = undefined;
    incidentCount.value = undefined;
    const hit = props.hit;
    if (!hit?.fullyQualifiedName) {
      entityLoading.value = false;
      return;
    }
    if (!resolveDetailEndpoint(hit.entityType, hit.fullyQualifiedName)) {
      return;
    }
    entityLoading.value = true;
    const generation = ++fetchGeneration;
    try {
      const fetched = await fetchAssetDetail(hit.entityType, hit.fullyQualifiedName);
      if (generation === fetchGeneration) {
        entity.value = fetched;
      }
    } catch {
      // Hit-only fallback (see above).
    } finally {
      if (generation === fetchGeneration) {
        entityLoading.value = false;
      }
    }
  },
  { immediate: true },
);

// E-3b activation fetch for the four types above (see the note on
// `extraExtension`). Skipped when the source for this FQN is already
// loaded, so switching tabs back and forth does not refetch; a save
// clears it (via `detailRefresh`) so the new values are read back.
watch(
  [() => activeTab.value, detailRefresh],
  async ([tab]) => {
    const hit = props.hit;
    if (
      tab !== 'customProperties' ||
      !hit?.fullyQualifiedName ||
      !PREVIEW_CUSTOM_PROPERTIES_EXTRA_EXTENSION_TYPES.has(hit.entityType) ||
      (extraExtension.value !== null && extraExtensionFqn.value === hit.fullyQualifiedName)
    ) {
      return;
    }
    entityLoading.value = true;
    const generation = ++extraGeneration;
    try {
      const extra = await fetchPreviewExtensionSource(hit);
      if (generation === extraGeneration) {
        extraExtension.value = extra;
        extraExtensionFqn.value = hit.fullyQualifiedName;
      }
    } catch {
      // No values; the tab renders "No value yet" per property.
    } finally {
      if (generation === extraGeneration) {
        entityLoading.value = false;
      }
    }
  },
);

// Merged view: fetched fields win, the hit fills every gap (pin
// `mergeEntityData` over the search hit). `savedRefresh` is the
// post-save read-back for the four types with no detail endpoint
// (domain / dataProduct / glossaryTerm / tableColumn) — it sits between
// the fetched entity and the hit, and is cleared on entity change.
const merged = computed(() => {
  const hit = props.hit;
  if (!hit) {
    return null;
  }
  const detail = entity.value;
  const refresh = savedRefresh.value;
  return {
    entityType: hit.entityType,
    displayName: refresh?.displayName || detail?.displayName || hit.displayName || hit.name,
    description: refresh?.description ?? detail?.description ?? hit.description,
    owners: refresh?.owners ?? detail?.owners ?? hit.owners ?? [],
    domains: refresh?.domains ?? detail?.domains ?? hit.domains ?? [],
    tags: refresh?.tags ?? detail?.tags ?? hit.tags ?? [],
    dataProducts: refresh?.dataProducts ?? detail?.dataProducts ?? hit.dataProducts ?? [],
    // E-3b: the Custom Properties tab reads values from the merged
    // extension — the fetched entity's for the 19 DETAIL_ENDPOINTS
    // types (their field sets all request `extension`), the extra
    // source's for the other four tab types.
    extension: detail?.extension ?? extraExtension.value?.extension,
    entityId: detail?.id ?? refresh?.id ?? extraExtension.value?.id ?? hit.id,
    tier:
      (refresh?.tags ?? detail?.tags ?? hit.tags ?? []).find((tag) => tag.tagFQN.startsWith('Tier.'))?.tagFQN ??
      hit.tier ??
      undefined,
  };
});

const layout = computed(() => (props.hit ? previewLayoutFor(props.hit.entityType) : 'common'));

const overviewRows = computed(() =>
  props.hit
    ? buildPreviewOverviewRows(
        { hit: props.hit, detail: entity.value, queryCount: queryCount.value, incidentCount: incidentCount.value },
        (key) => t(key),
      )
    : [],
);

// E-3a permission gate (part-4 #28): pin's summary memo renders a
// PermissionPlaceholder when the viewer lacks view access
// (EntitySummaryPanel.component.tsx summary memo). The product plumbing
// covers it — `useEntityPermissions` with a by-id identifier when the
// hit carries one, else by FQN — except that a tableColumn inherits its
// parent table's permissions (pin substitutes the parent table's type
// and id; the product has only the parent FQN, so it gates by-FQN on
// the parent table). Types outside the product's ResourceEntity union
// stay ungated (recorded open in the lane report); while the permission
// fetch is loading pin shows a Loader.
const permissionTarget = computed(() => (props.hit ? previewPermissionTarget(props.hit) : null));

const {
  hasViewAccess,
  can: canPermission,
  canEditDescription,
  canEditDisplayName,
  canEditAll,
  isLoading: isPermissionLoading,
} = useEntityPermissions(
  () => (permissionTarget.value?.resource ?? 'table') as ResourceEntity,
  () => permissionTarget.value?.identifier ?? { id: '' },
  { enabled: () => permissionTarget.value !== null },
);
const isViewGated = computed(() => permissionTarget.value !== null);

// E-3c: per-section edit gates (pin DataAssetSummaryPanelV1.tsx
// `:490-520` permission inputs + `:613-729` render order). The keys
// are the detail pages' D-2 widget-cell gates
// (`previewOverviewEditAccess`); columns inherit owners, domains,
// tier and data products, so those stay read-only for them.
const permissionStore = usePermissionStore();
const editAccess = computed(() =>
  previewOverviewEditAccess(props.hit?.entityType ?? '', {
    isAdmin: permissionStore.isAdminUser,
    canEditDescription: canEditDescription.value,
    canEditDisplayName: canEditDisplayName.value,
    canEditAll: canEditAll.value,
    can: (operation: string) => canPermission(operation),
  }),
);
const anyOverviewEditAllowed = computed(() => Object.values(editAccess.value).some(Boolean));

// E-3c: picker options (owners / domains / tags) come from the shared
// governance catalog, loaded once per mount — only when some Overview
// section is actually editable, so a read-only preview never pays for
// the users + teams + classifications + glossaries + domains fetch.
// A failed load degrades the pickers to remove-only and is toasted,
// never silent: an empty select must not look like an empty catalog.
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
let catalogRequested = false;
watch(anyOverviewEditAllowed, (allowed) => {
  if (!allowed || catalogRequested) {
    return;
  }
  catalogRequested = true;
  loadGovernanceCatalog()
    .then((loaded) => {
      catalog.value = loaded;
    })
    .catch((error: unknown) => {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    });
});

// E-3c: after a save, read the saved values back without leaving the
// Overview tab (the E-3b pattern). DETAIL_ENDPOINTS types refetch
// through the `detailRefresh` watcher; the four non-endpoint types
// read back through their by-name getter / parent table
// (`fetchPreviewOverviewRefresh`). A failed PATCH rejects, so the
// widget cell keeps its editor open with the error — a handler here
// must never swallow a failure.
async function afterOverviewSave(): Promise<void> {
  const hit = props.hit;
  if (hit) {
    const refresh = await fetchPreviewOverviewRefresh(hit);
    if (refresh) {
      savedRefresh.value = refresh;
    }
  }
  detailRefresh.value++;
}

async function saveDescription(next: string): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await savePreviewDescription(hit, merged.value?.entityId, merged.value?.description, next);
  await afterOverviewSave();
}

async function saveTags(next: TagLabelInput[]): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await savePreviewTags(hit, merged.value?.entityId, merged.value?.tags, next);
  await afterOverviewSave();
}

async function saveOwners(next: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await savePreviewOwners(hit, merged.value?.entityId, merged.value?.owners, next);
  await afterOverviewSave();
}

async function saveDomains(nextDomainIds: string[]): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await savePreviewDomains(hit, merged.value?.entityId, merged.value?.domains, nextDomainIds);
  await afterOverviewSave();
}

async function saveDataProducts(next: EntityRef[]): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await savePreviewDataProducts(hit, merged.value?.entityId, merged.value?.dataProducts, next);
  await afterOverviewSave();
}

// E-3c: pin EntityTitleSection.tsx:187,206 (`edit-displayName-button`
// + `EntityNameModal` onSave). Pin's Explore panel only writes the new
// name to local panel state; the product persists it with the detail
// pages' `/displayName` PATCH (see `savePreviewDisplayName`). The 1-128
// length rule is pin Form.constants (AccessManageButton's
// DISPLAY_NAME_FIELD_RULES); an over-long name errors in place and the
// modal stays open.
const displayNameEditOpen = ref(false);
const displayNameDraft = ref('');
const displayNameSaving = ref(false);

function openDisplayNameEdit(): void {
  displayNameDraft.value = merged.value?.displayName ?? '';
  displayNameEditOpen.value = true;
}

async function saveDisplayName(): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  const next = displayNameDraft.value.trim();
  if (next.length > 128) {
    message.error(
      t('message.entity-size-in-between', {
        entity: t('label.display-name'),
        min: 1,
        max: 128,
      }),
    );
    return;
  }
  displayNameSaving.value = true;
  try {
    await savePreviewDisplayName(hit, merged.value?.entityId, merged.value?.displayName, next);
    await afterOverviewSave();
    displayNameEditOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    displayNameSaving.value = false;
  }
}

// E-3b: pin `handleExtensionUpdate` — JSON PATCH on `extension` (the
// tab component passes the modal's whole-record next extension); the
// refetch bumps `detailRefresh` so the merged extension refreshes
// without leaving the Custom Properties tab. A failed save rejects so
// the modal stays open.
async function saveCustomProperties(next: Record<string, unknown>): Promise<void> {
  const hit = props.hit;
  if (!hit) {
    return;
  }
  await patchPreviewExtension(hit, merged.value?.entityId, merged.value?.extension, next);
  // Clear the activation-fetched source so the tab watcher reads the
  // saved values back; the entity watcher refetches the endpoint types.
  extraExtension.value = null;
  extraExtensionFqn.value = undefined;
  detailRefresh.value++;
}

// Table Queries row (pin `QueryCount`): the REST list count for the
// table id; a failed count resolves to 0, as in pin's catch.
let queryGeneration = 0;
watch(
  [() => entity.value?.id ?? props.hit?.id, () => props.hit?.entityType],
  async ([id, entityType]) => {
    if (entityType !== 'table' || !id) {
      queryCount.value = undefined;
      return;
    }
    const generation = ++queryGeneration;
    try {
      const count = await getQueryCount(id);
      if (generation === queryGeneration) {
        queryCount.value = count;
      }
    } catch {
      if (generation === queryGeneration) {
        queryCount.value = 0;
      }
    }
  },
  { immediate: true },
);

// Table Incidents row (pin `fetchIncidentCount` in
// DataAssetSummaryPanelV1.tsx:403-423): latest incident statuses for the
// table FQN over the last 30 days, gated on ViewDataProfile; a failed
// fetch resolves to 0, as in pin's catch. Without the permission the row
// shows 0 (pin `additionalInfo?.incidentCount ?? 0`).
let incidentGeneration = 0;
watch(
  [() => props.hit?.fullyQualifiedName, () => props.hit?.entityType, isPermissionLoading],
  async ([fqn, entityType]) => {
    if (entityType !== 'table' || !fqn || isPermissionLoading.value) {
      return;
    }
    const generation = ++incidentGeneration;
    if (!canPermission('ViewDataProfile')) {
      incidentCount.value = 0;
      return;
    }
    const now = Date.now();
    try {
      const page = await listTestCaseIncidentsFromSearch({
        limit: 0,
        latest: true,
        originEntityFQN: fqn,
        startTs: now - 30 * 24 * 60 * 60 * 1000,
        endTs: now,
      });
      if (generation === incidentGeneration) {
        incidentCount.value = page.total ?? 0;
      }
    } catch {
      if (generation === incidentGeneration) {
        incidentCount.value = 0;
      }
    }
  },
  { immediate: true },
);

// E-3d: the Overview Data Quality strip (pin
// `DataAssetSummaryPanelV1.tsx:586-610,627` `renderDataQualitySection`,
// TABLE only): success / aborted / failed counts + total from
// `listTestCases`, limit 100, fields `testCaseResult,incidentId`.
// Pin fetches it separately from the Data Quality tab (which uses the
// search/list endpoint at limit 50), so the strip has its own watcher;
// a failed fetch leaves the zero counts, as in pin's catch.
const testCaseCounts = ref({ success: 0, failed: 0, aborted: 0, total: 0 });
const testCaseCountsLoading = ref(false);
let testCaseCountsGeneration = 0;
watch(
  [() => props.hit?.fullyQualifiedName, () => props.hit?.entityType],
  async ([fqn, entityType]) => {
    if (entityType !== 'table' || !fqn) {
      testCaseCounts.value = { success: 0, failed: 0, aborted: 0, total: 0 };
      testCaseCountsLoading.value = false;
      return;
    }
    const generation = ++testCaseCountsGeneration;
    testCaseCountsLoading.value = true;
    try {
      const page = await listTestCases({ entityFQN: fqn, includeAllTests: true, limit: 100 });
      if (generation !== testCaseCountsGeneration) {
        return;
      }
      const next = { success: 0, failed: 0, aborted: 0, total: 0 };
      for (const testCase of page.data ?? []) {
        const status = (testCase.testCaseResult?.testCaseStatus ?? '').toLowerCase();
        if (!status) {
          continue;
        }
        if (status === 'success') {
          next.success++;
        } else if (status === 'failed') {
          next.failed++;
        } else if (status === 'aborted') {
          next.aborted++;
        }
        next.total++;
      }
      testCaseCounts.value = next;
    } catch {
      if (generation === testCaseCountsGeneration) {
        testCaseCounts.value = { success: 0, failed: 0, aborted: 0, total: 0 };
      }
    } finally {
      if (generation === testCaseCountsGeneration) {
        testCaseCountsLoading.value = false;
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <aside class="preview" data-testid="explore-preview">
    <template v-if="merged">
      <div class="preview__body">
      <div class="preview__bar">
        <Tag :color="entityTypeColor(merged.entityType)">{{ entityLabel(merged.entityType) }}</Tag>
        <!-- Pin EntityTitleSection.tsx:177-179: the display name is a link
             to the detail page. The FQN line below it had no pin
             counterpart (part-4 #7) and is dropped. -->
        <router-link
          v-if="detailLocation"
          :to="detailLocation"
          class="preview__name"
          data-testid="explore-preview-title-link"
        >
          <Typography.Title :level="5" class="preview__name-title">{{ merged.displayName }}</Typography.Title>
        </router-link>
        <Typography.Title v-else :level="5" class="preview__name-title">{{ merged.displayName }}</Typography.Title>
        <!-- E-3c: pin EntityTitleSection.tsx:187 (`edit-displayName-button`
             beside the name, gated by `canEditDisplayName`). -->
        <Button
          v-if="editAccess.displayName"
          type="text"
          size="small"
          class="preview__edit-name"
          data-testid="explore-preview-edit-displayName"
          :title="t('label.edit-entity', { entity: t('label.display-name') })"
          :aria-label="t('label.edit-entity', { entity: t('label.display-name') })"
          @click="openDisplayNameEdit"
        >
          <EditOutlined />
        </Button>
      </div>
        <div class="preview__content">
          <Spin v-if="isViewGated && isPermissionLoading" data-testid="explore-preview-loading" />
          <PermissionPlaceholder
            v-else-if="isViewGated && !hasViewAccess"
            :permission-value="entityLabel(merged.entityType)"
          />
          <template v-else-if="activeTab === 'overview'">
            <section class="preview__block" data-testid="explore-preview-description">
              <Typography.Text type="secondary">{{ t('asset.fields.description') }}</Typography.Text>
              <!-- E-3c: the detail page's description cell (pin
                   DescriptionSection, DataAssetSummaryPanelV1.tsx:613-620):
                   rich-text preview with the `explore.noDescription`
                   empty text, edit modal gated by `editDescriptionPermission`. -->
              <EntityDescriptionCell
                :key="props.hit?.fullyQualifiedName"
                :description="merged.description"
                :entity-name="merged.displayName"
                :has-edit-access="editAccess.description"
                :empty-text="t('explore.noDescription')"
                :on-description-update="saveDescription"
              />
            </section>
            <section v-if="layout !== 'knowledgePage' && overviewRows.length" class="preview__block" data-testid="explore-preview-overview">
              <Typography.Text type="secondary">{{ t('explore.overview') }}</Typography.Text>
              <dl class="preview__dl">
                <template v-for="row in overviewRows" :key="row.key">
                  <dt>{{ row.label }}</dt>
                  <dd>
                    <router-link v-if="row.to && resolvableLocation(row.to)" :to="row.to">{{ row.value }}</router-link>
                    <a v-else-if="row.href" :href="row.href" target="_blank" rel="noopener">{{ row.value }}</a>
                    <template v-else>{{ row.value }}</template>
                  </dd>
                </template>
              </dl>
            </section>
            <!-- E-3d: pin DataAssetSummaryPanelV1.tsx:586-610,627 mounts
                 the Data Quality strip after overview, TABLE only
                 (success / aborted / failed counts + total). -->
            <section
              v-if="layout === 'common' && merged.entityType === 'table'"
              class="preview__block"
              data-testid="explore-preview-data-quality"
            >
              <Typography.Text type="secondary">{{ t('explore.tabDataQuality') }}</Typography.Text>
              <Spin v-if="testCaseCountsLoading" size="small" data-testid="preview-dq-strip-loading" />
              <dl v-else class="preview__dl">
                <dt>{{ t('label.success') }}</dt>
                <dd data-testid="preview-dq-strip-success">{{ testCaseCounts.success }}</dd>
                <dt>{{ t('label.aborted') }}</dt>
                <dd data-testid="preview-dq-strip-aborted">{{ testCaseCounts.aborted }}</dd>
                <dt>{{ t('label.failed') }}</dt>
                <dd data-testid="preview-dq-strip-failed">{{ testCaseCounts.failed }}</dd>
                <dt>{{ t('label.total') }}</dt>
                <dd data-testid="preview-dq-strip-total">{{ testCaseCounts.total }}</dd>
              </dl>
            </section>
            <!-- Q-TAB-4 item 1 (host lane): pin DataAssetSummaryPanelV1.tsx:
                 628-634 mounts LineageSection after overview, gated by
                 hasLineageTab (the 11-type set in catalog/lineageSection.ts). -->
            <LineageSection
              v-if="layout === 'common' && hasLineageSection(merged.entityType)"
              :entity-type="merged.entityType"
              :fqn="props.hit!.fullyQualifiedName"
            />
            <section class="preview__block" data-testid="explore-preview-owners">
              <Typography.Text type="secondary">{{ t('asset.fields.owners') }}</Typography.Text>
              <!-- E-3c: the detail page's owners cell (pin
                   DataAssetSummaryPanelV1.tsx:636-665 `UserTeamSelectableList`
                   + `Owner`); tableColumn inherits — never editable. -->
              <WidgetOwnersCell
                :key="props.hit?.fullyQualifiedName"
                :owners="merged.owners"
                :options="catalog.owners"
                :has-edit-access="editAccess.owners"
                :on-change="saveOwners"
              />
            </section>
            <section v-if="layout === 'common' || layout === 'dataProduct'" class="preview__block" data-testid="explore-preview-domains">
              <Typography.Text type="secondary">{{ t('asset.fields.domains') }}</Typography.Text>
              <!-- E-3c: the detail page's domains cell (pin `:668-680`
                   `DomainsSection`); tableColumn inherits, and a domain has
                   no `domains` field — both stay read-only. -->
              <WidgetDomainCell
                :key="props.hit?.fullyQualifiedName"
                :domains="merged.domains ?? []"
                :options="catalog.domains"
                :has-edit-access="editAccess.domains"
                :on-change="saveDomains"
              />
            </section>
            <section v-if="layout === 'common' || layout === 'dataProduct'" class="preview__block" data-testid="explore-preview-tier">
              <Typography.Text type="secondary">{{ t('explore.facets.tier') }}</Typography.Text>
              <!-- E-3c: the detail page's tier cell (pin `:681-691`
                   `TierSection`, tier derived from `Tier.*` tags);
                   tableColumn inherits — never editable. -->
              <WidgetTierCell
                :key="props.hit?.fullyQualifiedName"
                :tags="merged.tags ?? []"
                :options="catalog.tags"
                :has-edit-access="editAccess.tier"
                :on-tags-change="saveTags"
              />
            </section>
            <section v-if="layout === 'common' || layout === 'knowledgePage'" class="preview__block" data-testid="explore-preview-glossary">
              <Typography.Text type="secondary">{{ t('explore.glossaryTerms') }}</Typography.Text>
              <!-- E-3c: the detail page's glossary cell (pin `:692-704`
                   `GlossaryTermsSection`), capped at pin's 3 visible
                   terms behind a "+N more" toggle. -->
              <WidgetTagsCell
                :key="props.hit?.fullyQualifiedName"
                tag-type="Glossary"
                :tags="merged.tags ?? []"
                :options="catalog.tags"
                :has-edit-access="editAccess.glossaryTerms"
                :max-visible="3"
                :on-tags-change="saveTags"
              />
            </section>
            <section class="preview__block" data-testid="explore-preview-tags">
              <Typography.Text type="secondary">{{ t('asset.fields.tags') }}</Typography.Text>
              <!-- E-3c: the detail page's tags cell (pin `:705-714`
                   `TagsSection`, Classification source only). -->
              <WidgetTagsCell
                :key="props.hit?.fullyQualifiedName"
                tag-type="Classification"
                :tags="merged.tags ?? []"
                :options="catalog.tags"
                :has-edit-access="editAccess.tags"
                :on-tags-change="saveTags"
              />
            </section>
            <section v-if="layout === 'common'" class="preview__block" data-testid="explore-preview-products">
              <Typography.Text type="secondary">{{ t('explore.facets.dataProduct') }}</Typography.Text>
              <!-- E-3c: the detail page's data-products cell (pin `:715-729`
                   `DataProductsSection`); tableColumn inherits, and domain /
                   glossaryTerm have no `dataProducts` field — read-only. -->
              <WidgetDataProductsCell
                :key="props.hit?.fullyQualifiedName"
                :data-products="merged.dataProducts ?? []"
                :domains="merged.domains ?? []"
                :has-edit-access="editAccess.dataProducts"
                :on-save="saveDataProducts"
              />
            </section>
            <Typography.Text v-if="!detailLocation" type="secondary">
              {{ t('explore.unwired') }}
            </Typography.Text>
            <Button
              v-else
              type="primary"
              data-testid="explore-preview-open"
              @click="emit('open', props.hit!)"
            >
              {{ columnParent ? t('explore.openParentTable') : t('explore.openAsset') }}
            </Button>
            <!--
              D25: lineage entry for the 11 pin lineage-capable types. An emit,
              not a router-link: this shared preview is mounted in views whose
              test routers do not register the `lineage` route, and
              router.resolve throws for an unregistered named route; the owning
              view navigates via assetTabLocation (E-3d: the product analogue
              of pin EntitySummaryPanel handleLineageClick, the detail page's
              Lineage tab).
            -->
            <a
              v-if="showLineage"
              href="#"
              data-testid="explore-preview-lineage"
              @click.prevent="emit('openLineage', props.hit!)"
            >
              {{ t('explore.openLineage') }}
            </a>
          </template>
          <!-- E-3d: pin EntitySummaryPanel renderSchemaTab (:1028-1048)
               — per-type child list from the already-fetched entity;
               the Schema tab mounts with `v-if`, so mount = activation. -->
          <PreviewSchemaTab
            v-else-if="activeTab === 'schema'"
            :entity-type="merged.entityType"
            :detail="entity"
            :loading="entityLoading"
          />
          <!-- E-3d: pin EntitySummaryPanel renderLineageTab (:1050-1066)
               — `LineageTabContent` with the upstream/downstream filter. -->
          <PreviewLineageTab
            v-else-if="activeTab === 'lineage'"
            :entity-type="merged.entityType"
            :fqn="props.hit!.fullyQualifiedName"
          />
          <!-- E-3d: pin EntitySummaryPanel renderDataQualityTab
               (:1068-1082) — `DataQualityTab`, TABLE only; the view gate
               is pin's `hasViewTests` (`canPermission('ViewTests')`). -->
          <PreviewDataQuality
            v-else-if="activeTab === 'dataQuality'"
            :fqn="props.hit!.fullyQualifiedName"
            :can-view="canPermission('ViewTests')"
          />
          <!-- E-3b: pin CustomPropertiesSection (EntitySummaryPanel
               renderCustomPropertiesTab, :1084-1110). The view/edit
               gates come from the same permission fetch as the panel
               gate (`canPermission('ViewCustomFields')` /
               `'EditCustomFields'`); while that fetch loads, the Spin
               above covers the tab. -->
          <PreviewCustomProperties
            v-else-if="activeTab === 'customProperties'"
            :entity-type="merged.entityType"
            :entity-label="entityLabel(merged.entityType)"
            :extension="merged.extension ?? {}"
            :entity-id="merged.entityId"
            :loading="entityLoading"
            :can-view="canPermission('ViewCustomFields')"
            :can-edit="canPermission('EditCustomFields')"
            :on-save="saveCustomProperties"
          />
        </div>
      </div>
        <nav class="preview__nav" data-testid="explore-preview-nav" :aria-label="t('explore.overview')">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="preview__nav-tab"
            :class="{ 'preview__nav-tab--active': activeTab === tab.key }"
            :data-testid="tab.testId"
            :aria-current="activeTab === tab.key ? 'true' : undefined"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" class="preview__nav-icon" />
            <span class="preview__nav-label">{{ t(tab.labelKey) }}</span>
          </button>
        </nav>
    </template>
    <!-- E-3c: pin EntityTitleSection.tsx:206 `EntityNameModal` (display
         name only; the entity `name` is immutable). A failed save
         toasts in place and the modal stays open. -->
    <Modal
      :open="displayNameEditOpen"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('label.edit-entity', { entity: t('label.display-name') })"
      @cancel="displayNameEditOpen = false"
    >
      <Input
        v-model:value="displayNameDraft"
        data-testid="explore-preview-displayName-input"
        :placeholder="t('message.enter-display-name')"
      />
      <template #footer>
        <Button data-testid="explore-preview-cancel-displayName" @click="displayNameEditOpen = false">
          {{ t('label.cancel') }}
        </Button>
        <Button
          type="primary"
          data-testid="explore-preview-save-displayName"
          :loading="displayNameSaving"
          @click="saveDisplayName"
        >
          {{ t('label.save') }}
        </Button>
      </template>
    </Modal>
  </aside>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.preview__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 12px;
}
.preview__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview__name {
  flex: 1;
  min-width: 0;
}
.preview__name-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview__close {
  flex-shrink: 0;
  color: var(--sm-text-tertiary);
}
.preview__edit-name {
  flex-shrink: 0;
  color: var(--sm-text-tertiary);
}
.preview__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.preview__nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  gap: 20px;
  flex-shrink: 0;
  width: 80px;
  height: auto;
  padding-top: 20px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
}
.preview__nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 0 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--sm-text-tertiary);
  cursor: pointer;
}
.preview__nav-icon {
  font-size: 22px;
}
.preview__nav-label {
  width: 54px;
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  white-space: normal;
}
.preview__nav-tab--active {
  color: var(--sm-color-primary);
}
.preview__block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preview__block :deep(.ant-typography) {
  margin-bottom: 4px;
}
.preview__dl {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 4px 8px;
  margin: 4px 0 0;
}
.preview__dl dt {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.preview__dl dd {
  margin: 0;
  font-size: 14px;
}
</style>
