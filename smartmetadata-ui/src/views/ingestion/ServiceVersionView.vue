<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions } from 'ant-design-vue';
import type { ChangeField, EntityVersion } from '@/api/entities';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { ServicePageData } from '@/api/servicePageData';
import {
  buildServiceChildrenFields,
  CHILD_ENTITY_TYPE_BY_KIND,
  fetchServiceChildren,
} from '@/api/serviceChildren';
import { getServiceVersion, listServiceVersions } from '@/api/serviceVersions';
import { createEmptyPaging } from '@/catalog/servicePaging';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { getCountLabel } from '@/catalog/serviceCountLabel';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import ServiceChildNameCell from '@/components/ingestion/ServiceChildNameCell.vue';
import ServiceChildOwnersCell from '@/components/ingestion/ServiceChildOwnersCell.vue';
import ServiceChildTagsCell from '@/components/ingestion/ServiceChildTagsCell.vue';
import ServiceChildrenPagination from '@/components/ingestion/ServiceChildrenPagination.vue';
import {
  certificationCellTags,
  serviceChildColumns,
  tierCellTags,
  visibleChildTags,
} from '@/components/ingestion/serviceChildTable';
import { entityTypeForKind, SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import { getTierTag } from '@/ingestion/tierTags';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import type { CatalogService, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string; version: string }>();

const router = useRouter();
const { t } = useI18n();
const permissionStore = usePermissionStore();

const loading = ref(true);
const errorMessage = ref('');
const forbidden = ref(false);
/** True once the current load resolved the view permission; the children fetch waits for it. */
const permissionsSettled = ref(false);
let loadRequest = 0;
const versions = ref<EntityVersion[]>([]);
const snapshot = ref<CatalogService | null>(null);

const kind = computed<ServiceKind>(() =>
  (Object.keys(SERVICE_TYPES_BY_KIND) as ServiceKind[]).includes(props.kind as ServiceKind)
    ? (props.kind as ServiceKind)
    : 'database',
);
const childEntityType = computed(() => CHILD_ENTITY_TYPE_BY_KIND[kind.value]);
/** The single main tab (count label), present only for kinds with a child table; metadata services have no tab. */
const hasMainTab = computed(() => childEntityType.value !== undefined);
const countLabel = computed(() => getCountLabel(kind.value));

const snapshotName = computed(
  () => snapshot.value?.displayName || snapshot.value?.name || props.id,
);
const tierTag = computed(() => getTierTag(snapshot.value?.tags ?? []));
const tierText = computed(() =>
  tierTag.value
    ? (tierTag.value.displayName ?? tierTag.value.name ?? tierTag.value.tagFQN)
    : '—',
);
const ownersText = computed(() =>
  (snapshot.value?.owners ?? [])
    .map((owner) => owner.displayName ?? owner.name ?? '')
    .filter(Boolean)
    .join(', ') || '—',
);
const domainsText = computed(() =>
  (snapshot.value?.domains ?? [])
    .map((domain) => domain.displayName ?? domain.name ?? '')
    .filter(Boolean)
    .join(', ') || '—',
);

interface DiffRow {
  key: string;
  field: string;
  change: string;
  oldValue: string;
  newValue: string;
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// The diff is a straight presentation of the backend
// changeDescription, following the product version-page precedent
// (GovernanceVersionView): the pin renders word-level diffs inline,
// which this console does not implement.
const diffRows = computed<DiffRow[]>(() => {
  const entry = versions.value.find((item) => String(item.version) === String(props.version));
  const change = entry?.changeDescription;
  if (!change) {
    return [];
  }
  const rows: DiffRow[] = [];
  const collect = (items: ChangeField[] | undefined, changeKind: string) => {
    (items ?? []).forEach((item, index) => {
      rows.push({
        key: `${changeKind}-${item.field ?? index}`,
        field: item.field ?? '—',
        change: changeKind,
        oldValue: renderValue(item.oldValue),
        newValue: renderValue(item.newValue),
      });
    });
  };
  collect(change.fieldsAdded, 'added');
  collect(change.fieldsDeleted, 'deleted');
  collect(change.fieldsUpdated, 'updated');
  return rows;
});

async function load(): Promise<void> {
  const token = ++loadRequest;
  permissionsSettled.value = false;
  loading.value = true;
  errorMessage.value = '';
  forbidden.value = false;
  try {
    const [list, snap] = await Promise.all([
      listServiceVersions(kind.value, props.id),
      getServiceVersion(kind.value, props.id, props.version),
    ]);
    // Pin ServiceVersionPage gating: ViewBasic || ViewAll on the
    // entity permission, fetched by FQN once the snapshot supplies
    // it. A failed fetch denies (fail-closed).
    const ops = snap.fullyQualifiedName
      ? await permissionStore
          .getEntityPermissionByFqn(entityTypeForKind(kind.value), snap.fullyQualifiedName)
          .catch(() => null)
      : null;
    if (token !== loadRequest) {
      return;
    }
    versions.value = list;
    snapshot.value = snap;
    forbidden.value = !getDerivedPermissionFlags(ops ?? {}).hasViewAccess;
  } catch (error) {
    if (token !== loadRequest) {
      return;
    }
    versions.value = [];
    snapshot.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('asset.versionsFailed');
  } finally {
    if (token === loadRequest) {
      loading.value = false;
      permissionsSettled.value = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Current children for the main tab (pin ServiceVersionMainTabContent
// fetches the CURRENT child list, not the historical one)
// ---------------------------------------------------------------------------

const paging = useCursorPaging();
const children = ref<ServicePageData[]>([]);
const childrenLoading = ref(false);
const childViewUsageAllowed = ref(false);
let childrenRequest = 0;

async function loadChildren(): Promise<void> {
  const fqn = snapshot.value?.fullyQualifiedName;
  if (!fqn || !hasMainTab.value || !permissionsSettled.value || forbidden.value) {
    return;
  }
  const cursor = paging.pagingCursor.value;
  const page = fetchServiceChildren(kind.value, {
    service: fqn,
    fields: buildServiceChildrenFields(kind.value, childViewUsageAllowed.value),
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

watch(
  [
    () => snapshot.value?.fullyQualifiedName,
    () => paging.pagingCursor.value,
    () => paging.pageSize.value,
    () => permissionsSettled.value,
    () => forbidden.value,
  ],
  () => {
    void loadChildren();
  },
);

watch(
  () => [props.kind, props.id, props.version],
  () => {
    void load();
  },
);

onMounted(async () => {
  // The child resource's ViewUsage bit decides the usageSummary
  // field, as on the detail page; a failed fetch denies.
  const childType = childEntityType.value;
  if (childType) {
    const ops = await permissionStore.getResourcePermission(childType).catch(() => null);
    childViewUsageAllowed.value = ops ? getDerivedPermissionFlags(ops).canViewUsage : false;
  }
  void load();
});

function onSelectVersion(version: string): void {
  void router.push({
    name: 'ingestion-service-version',
    params: { kind: props.kind, id: props.id, version },
  });
}

function onBack(): void {
  void router.push({ name: 'ingestion-service', params: { kind: props.kind, id: props.id } });
}

function tablePaginationHandler(params: {
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

/** SmTable's bodyCell slot types `record` as Record<string, any>; same boundary cast as the main tab. */
function asPageData(record: Record<string, any>): ServicePageData {
  return record as ServicePageData;
}

/** Pin ServiceVersionMainTabContent reuses the detail page's column builder verbatim. */
const childColumns = computed(() =>
  serviceChildColumns({
    name: t('crud.name'),
    description: t('crud.description'),
    owners: t('explore.facets.owner'),
    tags: t('explore.facets.tagFqn'),
    tier: t('label.tier'),
    certification: t('label.certification'),
  }),
);

function changeKindLabel(change: string): string {
  if (change === 'added') {
    return t('serviceDetail.version.changeAdded');
  }
  if (change === 'deleted') {
    return t('serviceDetail.version.changeDeleted');
  }
  return t('serviceDetail.version.changeUpdated');
}

</script>

<template>
  <PageLayout>
    <PageHeader
      :header="snapshotName"
      :sub-header="snapshot?.fullyQualifiedName || undefined"
      test-id="service-version"
    />
    <Button data-testid="service-version-back" @click="onBack">
      {{ t('crud.back') }}
    </Button>
    <SmState
      v-if="loading || errorMessage || forbidden || !snapshot"
      :state="loading ? 'loading' : errorMessage || forbidden ? 'error' : 'empty'"
      :error-text="forbidden ? t('errors.forbidden') : errorMessage || undefined"
      :empty-text="t('asset.versionsEmpty')"
      test-id="service-version-state"
    />
    <template v-else>
      <Descriptions bordered :column="1" size="small" class="version-snapshot">
        <Descriptions.Item :label="t('crud.name')">{{ snapshot.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.displayName')">
          {{ snapshot.displayName || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.version')">{{ props.version }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ snapshot.serviceType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('explore.facets.owner')">{{ ownersText }}</Descriptions.Item>
        <Descriptions.Item :label="t('serviceDetail.facets.domain')">{{ domainsText }}</Descriptions.Item>
        <Descriptions.Item :label="t('explore.facets.tier')">{{ tierText }}</Descriptions.Item>
      </Descriptions>
      <div class="service-version__body">
        <div class="service-version__main">
          <section v-if="snapshot.description" class="service-version__description">
            <h3>{{ t('crud.description') }}</h3>
            <SmMarkdown :markdown="snapshot.description" test-id="service-version-description" />
          </section>
          <section v-if="hasMainTab" class="service-version__children">
            <h3 data-testid="service-version-main-tab">
              {{ t(countLabel.labelKey) }}
            </h3>
            <SmTable
              test-id="service-version-children-table"
              row-key="id"
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
                <SmMarkdown
                  v-else-if="column.key === 'description' && record.description"
                  :markdown="record.description"
                />
                <template v-else-if="column.key === 'owners'">
                  <ServiceChildOwnersCell :owners="asPageData(record).owners" />
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
                <template v-else>{{ text ?? '—' }}</template>
              </template>
            </SmTable>
            <ServiceChildrenPagination
              v-if="paging.showPagination.value"
              :paging="paging.paging.value"
              :current-page="paging.currentPage.value"
              :page-size="paging.pageSize.value"
              :is-loading="childrenLoading"
              @page-change="tablePaginationHandler"
              @page-size-change="paging.handlePageSizeChange"
            />
          </section>
          <div v-if="diffRows.length">
            <h3 data-testid="service-version-diff-title">
              {{ t('asset.versionDiffTitle') }} — {{ props.version }}
            </h3>
            <SmTable
              test-id="service-version-diff-table"
              row-key="key"
              :columns="[
                { title: t('asset.versionField'), key: 'field', dataIndex: 'field' },
                { title: t('serviceDetail.version.change'), key: 'change', dataIndex: 'change' },
                { title: t('asset.versionOldValue'), key: 'oldValue', dataIndex: 'oldValue' },
                { title: t('asset.versionNewValue'), key: 'newValue', dataIndex: 'newValue' },
              ]"
              :data-source="diffRows"
            >
              <template #bodyCell="{ column, record, text }">
                <template v-if="column.key === 'change'">{{
                  changeKindLabel(record.change)
                }}</template>
                <template v-else>{{ text }}</template>
              </template>
            </SmTable>
          </div>
          <SmState
            v-else
            state="empty"
            :empty-text="t('asset.versionNoChange')"
            test-id="service-version-diff-empty"
          />
        </div>
        <aside class="service-version__timeline">
          <h3>{{ t('asset.versionsTitle') }}</h3>
          <Button
            v-for="entry in versions"
            :key="String(entry.version)"
            :type="String(entry.version) === String(props.version) ? 'primary' : 'default'"
            :data-testid="`service-version-${entry.version}`"
            @click="onSelectVersion(String(entry.version))"
          >
            {{ entry.version }}
            <span v-if="entry.updatedBy"> · {{ entry.updatedBy }}</span>
            <span v-if="entry.updatedAt">
              · {{ new Date(entry.updatedAt).toLocaleString() }}
            </span>
          </Button>
        </aside>
      </div>
    </template>
  </PageLayout>
</template>

<style scoped>
.version-snapshot {
  margin: 16px 0;
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
.service-version__timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  flex-shrink: 0;
}
.service-version__description,
.service-version__children {
  margin-bottom: 24px;
}
</style>
