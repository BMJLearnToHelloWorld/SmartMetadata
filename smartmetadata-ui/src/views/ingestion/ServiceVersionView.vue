<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Badge, Button, Divider, Spin, Table, Tabs, Tooltip, message } from 'ant-design-vue';
import type { ChangeDescription, EntityVersion } from '@/api/entities';
import { getLimitByResource } from '@/api/limits';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { ServicePageData } from '@/api/servicePageData';
import {
  buildServiceChildrenFields,
  CHILD_ENTITY_TYPE_BY_KIND,
  fetchServiceChildren,
} from '@/api/serviceChildren';
import { getServiceByFqn } from '@/api/serviceLookup';
import { getServiceVersion, listServiceVersions, serviceKindFromCategory } from '@/api/serviceVersions';
import { getServiceDetailsPath, getServiceVersionPath } from '@/utils/fqnPaths';
import { createEmptyPaging } from '@/catalog/servicePaging';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { getCountLabel } from '@/catalog/serviceCountLabel';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import { getUsagePercentile } from '@/catalog/usagePercentile';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmState from '@/components/shared/SmState.vue';
import ServiceChildNameCell from '@/components/ingestion/ServiceChildNameCell.vue';
import ServiceChildOwnersCell from '@/components/ingestion/ServiceChildOwnersCell.vue';
import ServiceChildTagsCell from '@/components/ingestion/ServiceChildTagsCell.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import ServiceVersionTimeline from '@/components/ingestion/ServiceVersionTimeline.vue';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import {
  certificationCellTags,
  serviceChildColumns,
  tierCellTags,
  visibleChildTags,
} from '@/components/ingestion/serviceChildTable';
import { usePermissionStore } from '@/stores/permissions';
import { entityTypeForKind } from '@/ingestion/connections';
import { getTierTag } from '@/ingestion/tierTags';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import {
  getCommonDiffsFromVersionData,
  getCommonExtraInfoForVersionDetails,
  type DiffLabel,
  type TextDiffResult,
} from '@/ingestion/versionDiff';
import type { CatalogService, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ serviceCategory: string; fqn: string; version: string }>();

const router = useRouter();
const { t } = useI18n();
const permissionStore = usePermissionStore();

// D-11: no kind fallback. An unknown kind never fetches and lands in the
// error state.
const kind: ServiceKind | undefined = serviceKindFromCategory(props.serviceCategory);

const childEntityType = computed(() =>
  kind ? CHILD_ENTITY_TYPE_BY_KIND[kind] : undefined,
);
// Pin tabs memo (ServiceVersionPage.tsx:470-507): metadata has no tab;
// every other category shows the single count tab, including categories
// without a child table (their table renders the empty state).
const hasMainTab = computed(() => kind !== undefined && kind !== 'metadata');
const countLabel = computed(() => (kind ? getCountLabel(kind) : undefined));

// Two loading segments, as in the pin: page loading (permission +
// versions list) and version-data loading (the snapshot). The timeline
// renders from phase-1 data and stays visible while the snapshot loads.
const loading = ref(true);
const versionLoading = ref(true);
const errorMessage = ref('');
const forbidden = ref(false);
const permissionsSettled = ref(false);
/** The id→FQN resolution record. The pin reads the FQN from its route
 * param; the product fetches by id, so one entity fetch resolves the
 * FQN the permission check needs. Transitional until FQN addressing. */
const resolvedService = ref<CatalogService | null>(null);
const versions = ref<EntityVersion[]>([]);
const snapshot = ref<CatalogService | null>(null);
const maxVersions = ref(-1);
let pageToken = 0;
let versionToken = 0;

const breadcrumbItems = computed(() => {
  if (!snapshot.value || !kind) {
    return [];
  }
  const category = SERVICE_CATEGORIES.find((row) => row.key === kind);
  return [
    {
      label: category ? t(category.labelKey) : kind,
      routeName: 'connections',
    },
    {
      label: getEntityName(snapshot.value),
      to: getServiceDetailsPath(props.fqn, props.serviceCategory),
    },
  ];
});

const permissionValue = computed(() =>
  t('settings.services.viewEntity', {
    entity: `${getEntityName(resolvedService.value)} ${t('settings.services.version.service')}`,
  }),
);

// The pin reads changeDescription from the version snapshot; the product's
// service mapper drops it, so the view reads it from the matching versions
// list entry — the same stored record, same redaction, identical data.
const changeDescription = computed<ChangeDescription | undefined>(() => {
  const entry = versions.value.find(
    (item) => String(item.version) === String(props.version),
  );
  return entry?.changeDescription;
});

const versionDiffs = computed(() => {
  if (!snapshot.value) {
    return null;
  }
  return getCommonDiffsFromVersionData(
    {
      tags: snapshot.value.tags,
      displayName: snapshot.value.displayName,
      description: snapshot.value.description,
    },
    changeDescription.value,
  );
});

const displayNameDiff = computed<TextDiffResult | null>(
  () => versionDiffs.value?.displayName ?? null,
);
// Pin EntityHeaderTitle: an empty displayName falls back to the name.
const titleShowsName = computed(
  () =>
    displayNameDiff.value !== null &&
    displayNameDiff.value.type === 'plain' &&
    displayNameDiff.value.text === '',
);

const extraInfo = computed(() =>
  getCommonExtraInfoForVersionDetails(
    changeDescription.value,
    snapshot.value?.owners,
    snapshot.value ? getTierTag(snapshot.value.tags ?? []) : undefined,
    snapshot.value?.domains,
  ),
);

const hasTier = computed(
  () =>
    !(
      extraInfo.value.tierDisplayName.type === 'plain' &&
      extraInfo.value.tierDisplayName.text === ''
    ),
);

// One diff segment per reference label, rendered through VersionDiffText
// so added/removed/normal share one visual language with the text diffs.
function labelDiff(label: DiffLabel): TextDiffResult {
  return {
    type: 'diff',
    parts: [
      {
        value: label.text,
        added: label.change === 'added',
        removed: label.change === 'removed',
      },
    ],
  };
}

const domainLabels = computed(() => extraInfo.value.domainDisplayName);
const ownerLabels = computed<DiffLabel[]>(() =>
  extraInfo.value.ownerRef.map(
    (ref) =>
      extraInfo.value.ownerDisplayName.get(ref.name ?? '') ?? {
        text: getEntityName(ref),
        change: 'normal' as const,
      },
  ),
);

// Tag panel groups, one per TagSource in enum order, non-empty only. The
// pin renders a TagsContainerV2 per source; an empty read-only container
// shows nothing, so empty groups are omitted rather than headed.
const tagGroups = computed(() => {
  const tags = versionDiffs.value?.tags ?? [];
  return (['Classification', 'Glossary'] as const)
    .map((source) => ({
      source,
      tags: tags.filter((tag) => tag.source === source),
    }))
    .filter((group) => group.tags.length > 0);
});

function tagChipClass(tag: { added?: boolean; removed?: boolean }): string {
  if (tag.added) {
    return 'service-version__tag--added';
  }
  if (tag.removed) {
    return 'service-version__tag--removed';
  }
  return '';
}

function detailTarget() {
  return getServiceDetailsPath(props.fqn, props.serviceCategory);
}

function onBack(): void {
  void router.push(detailTarget());
}

function onSelectVersion(version: string): void {
  void router.push(getServiceVersionPath(props.serviceCategory, props.fqn, version));
}

async function loadPage(): Promise<void> {
  const token = ++pageToken;
  versionToken++;
  permissionsSettled.value = false;
  loading.value = true;
  errorMessage.value = '';
  forbidden.value = false;
  resolvedService.value = null;
  versions.value = [];
  snapshot.value = null;
  maxVersions.value = -1;
  if (!kind) {
    loading.value = false;
    versionLoading.value = false;
    errorMessage.value = t('asset.versionsFailed');
    return;
  }
  try {
    const resolved = await getServiceByFqn(kind, props.fqn);
    if (token !== pageToken) {
      return;
    }
    resolvedService.value = resolved;
    // Permission-first (pin ServiceVersionPage.tsx:132-138): the versions
    // list and the snapshot are never fetched when denied. A permission
    // failure denies (fail-closed) and toasts, as the pin's error effect
    // does; an empty permission set denies.
    let ops: Awaited<
      ReturnType<typeof permissionStore.getEntityPermissionByFqn>
    > | null = null;
    try {
      ops = resolved.fullyQualifiedName
        ? await permissionStore.getEntityPermissionByFqn(
            entityTypeForKind(kind),
            resolved.fullyQualifiedName,
          )
        : null;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
    if (token !== pageToken) {
      return;
    }
    if (!getDerivedPermissionFlags(ops ?? {}).hasViewAccess) {
      forbidden.value = true;
      return;
    }
    const [list, limit, childOps] = await Promise.all([
      listServiceVersions(kind, resolved.id),
      // Fail-open: a limit fetch failure leaves maxVersions at -1 (no
      // truncation), the limits module's documented failure semantics.
      getLimitByResource(entityTypeForKind(kind)).catch(() => null),
      // The child resource's ViewUsage bit decides the usageSummary
      // field, as on the detail page; a failed fetch denies.
      (async () => {
        const childType = childEntityType.value;
        if (!childType) {
          return null;
        }
        return permissionStore.getResourcePermission(childType).catch(() => null);
      })(),
    ]);
    if (token !== pageToken) {
      return;
    }
    versions.value = list;
    maxVersions.value =
      limit?.featureLimitStatuses[0]?.configuredLimit.maxVersions ?? -1;
    childViewUsageAllowed.value = childOps
      ? getDerivedPermissionFlags(childOps).canViewUsage
      : false;
  } catch (error) {
    if (token !== pageToken) {
      return;
    }
    versions.value = [];
    snapshot.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('asset.versionsFailed');
  } finally {
    if (token === pageToken) {
      loading.value = false;
      permissionsSettled.value = true;
    }
  }
}

async function loadVersionData(): Promise<void> {
  if (!kind || forbidden.value) {
    return;
  }
  const token = ++versionToken;
  versionLoading.value = true;
  try {
    const serviceId = resolvedService.value?.id;
    if (!serviceId) {
      snapshot.value = null;
      versionLoading.value = false;
      return;
    }
    const snap = await getServiceVersion(kind, serviceId, props.version);
    if (token !== versionToken) {
      return;
    }
    snapshot.value = snap;
  } catch (error) {
    if (token !== versionToken) {
      return;
    }
    snapshot.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('asset.versionsFailed');
  } finally {
    if (token === versionToken) {
      versionLoading.value = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Current children for the main tab (pin ServiceVersionMainTabContent
// fetches the CURRENT child list, not the historical one). Fixed page
// size 10 (pin PAGE_SIZE); no size dropdown, no T-5 persistence.
// ---------------------------------------------------------------------------

const paging = useCursorPaging(10, [10]);
const children = ref<ServicePageData[]>([]);
const childrenLoading = ref(false);
const childViewUsageAllowed = ref(false);
let childrenRequest = 0;

async function loadChildren(): Promise<void> {
  const fqn = snapshot.value?.fullyQualifiedName;
  if (!fqn || !hasMainTab.value || !permissionsSettled.value || forbidden.value || !kind) {
    return;
  }
  const cursor = paging.pagingCursor.value;
  const page = fetchServiceChildren(kind, {
    service: fqn,
    fields: buildServiceChildrenFields(kind, childViewUsageAllowed.value),
    paging: {
      limit: paging.pageSize.value,
      after: cursor.cursorType === 'after' ? cursor.cursorValue : undefined,
      before: cursor.cursorType === 'before' ? cursor.cursorValue : undefined,
    },
    include: 'non-deleted',
  });
  if (!page) {
    children.value = [];
    paging.handlePagingChange(createEmptyPaging());
    return;
  }
  const token = ++childrenRequest;
  childrenLoading.value = true;
  try {
    const result = await page;
    if (token !== childrenRequest) {
      return;
    }
    children.value = result.data;
    paging.handlePagingChange({
      total: result.total ?? 0,
      after: result.after ?? '',
      before: result.before ?? '',
    });
  } catch {
    if (token !== childrenRequest) {
      return;
    }
    children.value = [];
    paging.handlePagingChange(createEmptyPaging());
  } finally {
    if (token === childrenRequest) {
      childrenLoading.value = false;
    }
  }
}

// Pin showPagination (ServiceVersionMainTabContent.tsx:102-110): a cursor
// exists on either side AND the table is non-empty.
const showPagination = computed(
  () =>
    Boolean(paging.paging.value.after || paging.paging.value.before) &&
    children.value.length > 0,
);

watch(
  [
    () => snapshot.value?.fullyQualifiedName,
    () => paging.pagingCursor.value,
    () => permissionsSettled.value,
    () => forbidden.value,
  ],
  () => {
    void loadChildren();
  },
);

watch(
  () => [props.serviceCategory, props.fqn],
  async () => {
    await loadPage();
    if (!forbidden.value) {
      await loadVersionData();
    }
  },
);

watch(
  () => props.version,
  () => {
    if (permissionsSettled.value && !forbidden.value) {
      void loadVersionData();
    }
  },
);

onMounted(async () => {
  await loadPage();
  if (!forbidden.value) {
    await loadVersionData();
  }
});

function pagingHandler(params: {
  currentPage: number;
  cursorType?: 'after' | 'before';
}): void {
  if (params.cursorType) {
    paging.handlePageChange(
      params.currentPage,
      {
        cursorType: params.cursorType,
        cursorValue: paging.paging.value[params.cursorType],
      },
      paging.pageSize.value,
    );
  }
}

function childLocation(row: ServicePageData): ReturnType<typeof assetLocation> | undefined {
  const entityType = childEntityType.value;
  if (!entityType || !isDetailWired(entityType) || !row.fullyQualifiedName) {
    return undefined;
  }
  return assetLocation(entityType, row.fullyQualifiedName);
}

/** Table bodyCell slots type `record` loosely; same boundary cast as before. */
function asPageData(record: Record<string, any>): ServicePageData {
  return record as ServicePageData;
}

const childColumns = computed(() =>
  serviceChildColumns(
    {
      name: t('crud.name'),
      description: t('crud.description'),
      owners: t('explore.facets.owner'),
      tags: t('explore.facets.tagFqn'),
      tier: t('label.tier'),
      certification: t('label.certification'),
    },
    {
      domains: t('settings.services.version.domains'),
      dataProducts: t('settings.services.version.dataProducts'),
      scheduleInterval:
        kind === 'pipeline' ? t('settings.services.version.scheduleInterval') : undefined,
      usage: kind === 'database' ? t('usage.usage') : undefined,
    },
  ),
);

const noDataText = computed(() =>
  countLabel.value
    ? t('serviceDetail.main.noEntityDataAvailable', {
        entity: t(countLabel.value.labelKey),
      })
    : '',
);

function referenceNames(refs: Array<{ displayName?: string; name?: string }>): string {
  return refs.map((ref) => getEntityName(ref)).filter(Boolean).join(', ');
}
</script>

<template>
  <PageLayout>
    <SmBreadcrumb :items="breadcrumbItems" />
    <div v-if="loading" class="service-version__loading">
      <Spin size="large" />
    </div>
    <PermissionPlaceholder
      v-else-if="forbidden"
      :permission-value="permissionValue"
    />
    <SmState
      v-else-if="errorMessage || (!versionLoading && !snapshot)"
      state="error"
      :error-text="errorMessage || t('asset.versionsFailed')"
      test-id="service-version-state"
    />
    <div v-else class="service-version__body">
      <div class="service-version__main">
        <div v-if="versionLoading" class="service-version__loading">
          <Spin size="large" />
        </div>
        <template v-else-if="snapshot">
          <div class="service-version__header">
            <div class="service-version__header-main">
              <div class="service-version__title-row">
                <ServiceLogo
                  v-if="snapshot.serviceType"
                  :source="snapshot"
                  :size="36"
                />
                <h1 class="service-version__title">
                  <span
                    v-if="snapshot.deleted"
                    class="service-version__deleted-badge"
                    data-testid="deleted-badge"
                  >
                    {{ t('settings.services.version.deleted') }}
                  </span>
                  <template v-if="titleShowsName">{{ snapshot.name }}</template>
                  <VersionDiffText v-else-if="displayNameDiff" :diff="displayNameDiff" />
                </h1>
              </div>
              <div class="service-version__meta-row">
                <template v-if="kind !== 'metadata'">
                  <span class="service-version__domains">
                    <template v-if="domainLabels.length > 0">
                      <template v-for="(label, index) in domainLabels" :key="index">
                        <span v-if="index > 0">, </span>
                        <VersionDiffText :diff="labelDiff(label)" />
                      </template>
                    </template>
                    <template v-else>
                      {{ t('settings.services.version.noDomains') }}
                    </template>
                  </span>
                  <Divider type="vertical" />
                </template>
                <span class="service-version__owners">
                  <template v-if="ownerLabels.length > 0">
                    <template v-for="(label, index) in ownerLabels" :key="index">
                      <span v-if="index > 0">, </span>
                      <VersionDiffText :diff="labelDiff(label)" />
                    </template>
                  </template>
                  <template v-else>
                    {{ t('settings.services.version.noOwner') }}
                  </template>
                </span>
                <Divider type="vertical" />
                <span data-testid="Tier">
                  <VersionDiffText
                    v-if="hasTier"
                    :diff="extraInfo.tierDisplayName"
                  />
                  <template v-else>
                    {{ t('settings.services.version.noTier') }}
                  </template>
                </span>
              </div>
            </div>
            <div class="service-version__header-actions">
              <Tooltip :title="t('settings.services.version.exitVersionHistory')">
                <Button data-testid="version-button" @click="onBack">
                  {{ props.version }}
                </Button>
              </Tooltip>
            </div>
          </div>
          <Tabs v-if="hasMainTab && countLabel" data-testid="tabs">
            <Tabs.TabPane :key="countLabel.key">
              <template #tab>
                <span>{{ t(countLabel.labelKey) }}</span>
                <Badge :count="paging.paging.value.total" show-zero />
              </template>
              <div class="service-version__tab-body">
                <div class="service-version__content">
                  <section data-testid="description-container">
                    <VersionDiffText
                      v-if="versionDiffs"
                      :diff="versionDiffs.description"
                    />
                  </section>
                  <section data-testid="table-container">
                    <NoDataPlaceholder
                      v-if="!childrenLoading && children.length === 0"
                      :title="noDataText"
                    >
                      <template #icon>
                        <ServiceLogo :default-kind="kind" :size="48" />
                      </template>
                    </NoDataPlaceholder>
                    <Table
                      v-else
                      data-testid="service-children-table"
                      row-key="name"
                      size="small"
                      :columns="childColumns"
                      :data-source="children"
                      :loading="childrenLoading"
                      :pagination="false"
                    >
                      <template #bodyCell="{ column, record, text }">
                        <template v-if="column.key === 'name'">
                          <ServiceChildNameCell
                            :name="record.name"
                            :display-name="record.displayName"
                            :to="childLocation(asPageData(record))"
                          />
                        </template>
                        <template v-else-if="column.key === 'description'">
                          <SmMarkdown
                            v-if="record.description"
                            :markdown="record.description"
                          />
                        </template>
                        <template v-else-if="column.key === 'scheduleInterval'">
                          {{ text || '--' }}
                        </template>
                        <template v-else-if="column.key === 'owners'">
                          <ServiceChildOwnersCell :owners="asPageData(record).owners" />
                        </template>
                        <template v-else-if="column.key === 'domains'">
                          {{
                            asPageData(record).domains?.length
                              ? referenceNames(asPageData(record).domains)
                              : t('settings.services.version.noDomains')
                          }}
                        </template>
                        <template v-else-if="column.key === 'dataProducts'">
                          {{ referenceNames(asPageData(record).dataProducts ?? []) }}
                        </template>
                        <template v-else-if="column.key === 'tags'">
                          <ServiceChildTagsCell
                            :tags="visibleChildTags(asPageData(record).tags)"
                            :size-cap="3"
                          />
                        </template>
                        <template v-else-if="column.key === 'tier'">
                          <ServiceChildTagsCell
                            :tags="tierCellTags(asPageData(record).tags)"
                            :size-cap="1"
                          />
                        </template>
                        <template v-else-if="column.key === 'certification'">
                          <ServiceChildTagsCell
                            :tags="certificationCellTags(asPageData(record))"
                            :size-cap="1"
                          />
                        </template>
                        <template v-else-if="column.key === 'usageSummary'">
                          {{
                            getUsagePercentile(
                              asPageData(record).usageSummary?.weeklyStats?.percentileRank ?? 0,
                              false,
                              t,
                            )
                          }}
                        </template>
                        <template v-else>{{ text ?? '—' }}</template>
                      </template>
                    </Table>
                    <NextPrevious
                      v-if="showPagination"
                      :paging="paging.paging.value"
                      :paging-handler="pagingHandler"
                      :page-size="paging.pageSize.value"
                      :current-page="paging.currentPage.value"
                      :is-loading="childrenLoading"
                    />
                  </section>
                </div>
                <aside
                  class="service-version__tag-panel"
                  data-testid="entity-right-panel"
                >
                  <div
                    v-for="group in tagGroups"
                    :key="group.source"
                    class="service-version__tag-group"
                  >
                    <h4>{{ group.source }}</h4>
                    <span
                      v-for="tag in group.tags"
                      :key="tag.tagFQN"
                      :class="['service-version__tag', tagChipClass(tag)]"
                    >
                      {{ tag.displayName ?? tag.tagFQN }}
                    </span>
                  </div>
                </aside>
              </div>
            </Tabs.TabPane>
          </Tabs>
        </template>
      </div>
      <ServiceVersionTimeline
        :versions="versions"
        :current-version="props.version"
        :max-versions="maxVersions"
        @select="onSelectVersion"
        @close="onBack"
      />
    </div>
  </PageLayout>
</template>

<style scoped>
.service-version__loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.service-version__body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.service-version__main {
  flex: 1;
  min-width: 0;
}

.service-version__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.service-version__header-main {
  min-width: 0;
}

.service-version__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.service-version__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.service-version__deleted-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 4px;
  margin-right: 8px;
}

.service-version__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.service-version__tab-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.service-version__content {
  flex: 1;
  min-width: 0;
}

.service-version__tag-panel {
  flex: 0 0 220px;
}

.service-version__tag-group {
  margin-bottom: 16px;
}

.service-version__tag-group h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
}

.service-version__tag {
  display: inline-block;
  margin: 0 8px 8px 0;
}

/* Same marks as VersionDiffText: added underlines, removed strikes. */
.service-version__tag--added {
  text-decoration: underline;
}

.service-version__tag--removed {
  color: rgba(0, 0, 0, 0.45);
  text-decoration: line-through;
}
</style>
