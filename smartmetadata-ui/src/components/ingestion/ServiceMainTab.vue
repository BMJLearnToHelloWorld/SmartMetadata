<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { EditOutlined } from '@ant-design/icons-vue';
import { Button, Input, Select, Switch, message } from 'ant-design-vue';
import { computed, onMounted, ref, toValue, watch, type MaybeRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { listDataProducts } from '@/api/dataProducts';
import { patchDriveAsset } from '@/api/driveAssets';
import { patchAsset } from '@/api/entities';
import { asRecord } from '@/api/json';
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import { buildSchemaQueryFilter, getSearchIndexForService, searchServiceIndex } from '@/api/serviceSearch';
import { CHILD_ENTITY_TYPE_BY_KIND } from '@/api/serviceChildren';
import { mapServicePageData, type ServicePageData } from '@/api/servicePageData';
import { setFieldPatch } from '@/admin/jsonPatch';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { splitFqn } from '@/catalog/fqn';
import { getCountLabel } from '@/catalog/serviceCountLabel';
import type { CursorPagingState } from '@/catalog/servicePaging';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { DEFAULT_ENTITY_PERMISSION } from '@/composables/useEntityPermissions';
import { toTagLabel } from '@/governance/assetPatch';
import {
  classificationTagOptions,
  loadGovernanceCatalog,
  type GovernanceCatalog,
} from '@/governance/catalogOptions';
import { entityTypeForKind } from '@/ingestion/connections';
import { getTagsWithoutTier, getTierTag } from '@/ingestion/tierTags';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef } from '@/types/api';
import type { DataProduct } from '@/types/governance';
import type { CatalogService } from '@/types/ingestion';
import ServiceChildNameCell from './ServiceChildNameCell.vue';
import ServiceChildOwnersCell, { type CellOwnerRef } from './ServiceChildOwnersCell.vue';
import ServiceChildTagsCell, { type CellTagLabel } from './ServiceChildTagsCell.vue';
import ServiceChildrenPagination from './ServiceChildrenPagination.vue';
import {
  certificationCellTags,
  childTableEmptyText,
  serviceChildColumns,
  tierCellTags,
  useDebouncedTableSearch,
  visibleChildTags,
  withRequiredFqn,
} from './serviceChildTable';

/**
 * Main tab of the service detail page, ported from official
 * ServiceMainTabContent.tsx (pin a3012259ca). The page owns the list
 * fetch and passes data/paging/currentPage/pagingInfo down; this tab
 * owns the search effect, pagination handlers, display-name edit,
 * description edit, and the right panel. Columns are pin's default
 * visible set (Name + Description + Owners + Tags + Tier +
 * Certification); Schedule, Usage, Domain and Data Products are
 * defined in pin but hidden by default, and the product table has
 * no column-visibility mechanism (ADR-13). The right panel renders
 * pin's three faces (Data Products, Tags, Glossary Terms): pin's
 * ServiceMainTabContent does not pass customProperties, so the
 * Custom Properties face never renders on the service page.
 */
export interface ServiceChildRow {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName: string;
  owners?: CellOwnerRef[];
  domains?: EntityRef[];
  dataProducts?: EntityRef[];
  tags?: CellTagLabel[];
  certification?: { tagLabel?: CellTagLabel };
  deleted?: boolean;
}

export interface ServiceMainTabDetails extends Omit<CatalogService, 'tags'> {
  domains?: EntityRef[];
  tags?: CellTagLabel[];
  dataProducts?: EntityRef[];
}

export interface CursorPagingInfoProp {
  handlePageChange: (
    page: number | ((prev: number) => number),
    cursorData?: { cursorType: 'after' | 'before' | null; cursorValue?: string },
    pageSize?: number,
  ) => void;
  handlePageSizeChange: (pageSize: number) => void;
  handlePagingChange: (paging: { total: number; after?: string; before?: string }) => void;
  pageSize: MaybeRef<number>;
  showPagination: MaybeRef<boolean>;
}

const props = defineProps<{
  serviceName: string;
  serviceDetails: ServiceMainTabDetails;
  servicePermission: OperationPermissions;
  data: ServiceChildRow[];
  isServiceLoading: boolean;
  paging: MaybeRef<CursorPagingState>;
  currentPage: MaybeRef<number>;
  pagingInfo: CursorPagingInfoProp;
  showDeleted: boolean;
  setFilters: (filters: { schema?: string }) => void;
  saveUpdatedServiceData: (updated: ServiceMainTabDetails) => Promise<unknown>;
  onDescriptionUpdate: (html: string) => Promise<unknown>;
  onDataProductUpdate: (refs: EntityRef[]) => Promise<unknown>;
  onShowDeletedChange: (checked: boolean) => void;
  setIsServiceLoading: (loading: boolean) => void;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

const kind = computed(() => props.serviceDetails.kind);
const childEntityType = computed(() => CHILD_ENTITY_TYPE_BY_KIND[kind.value]);

const flags = computed(() =>
  getDerivedPermissionFlags(props.servicePermission, Boolean(props.serviceDetails.deleted)),
);
const canEditDescription = computed(() => flags.value.can('EditDescription'));
const canEditTags = computed(() => flags.value.can('EditTags'));
const canEditGlossaryTerms = computed(() => flags.value.can('EditGlossaryTerms'));
const canEditAll = computed(() => flags.value.canEditAll);
const showDataProducts = computed(() => kind.value !== 'metadata');

const pagingValue = computed(() => toValue(props.paging));
const currentPageValue = computed(() => toValue(props.currentPage));
const pageSizeValue = computed(() => toValue(props.pagingInfo.pageSize));
const showPaginationValue = computed(() => toValue(props.pagingInfo.showPagination));

const countLabel = computed(() => getCountLabel(kind.value));

/** Resource-level display-name gate (pin 9-category map, no deleted arg). */
const resourcePermission = ref<OperationPermissions>(DEFAULT_ENTITY_PERMISSION);
onMounted(async () => {
  if (!childEntityType.value) {
    return;
  }
  try {
    resourcePermission.value = await permissionStore.getResourcePermission(
      entityTypeForKind(kind.value),
    );
  } catch {
    resourcePermission.value = DEFAULT_ENTITY_PERMISSION;
  }
});
const canEditDisplayName = computed(
  () => getDerivedPermissionFlags(resourcePermission.value).can('EditDisplayName'),
);

const pageData = ref<ServiceChildRow[]>([]);
watch(
  () => props.data,
  (next) => {
    pageData.value = [...next];
  },
  { immediate: true },
);

const searchValue = computed(() => {
  const value = route.query.schema;
  return typeof value === 'string' && value !== '' ? value : undefined;
});

async function searchService(value: string, pageNumber: number): Promise<void> {
  const index = getSearchIndexForService(kind.value);
  if (!index) {
    return;
  }
  props.setIsServiceLoading(true);
  try {
    const response = await searchServiceIndex({
      pageNumber,
      pageSize: pageSizeValue.value,
      searchIndex: index,
      query: '',
      queryFilter: buildSchemaQueryFilter(
        'service.fullyQualifiedName.keyword',
        props.serviceDetails.fullyQualifiedName ?? '',
        value,
      ),
      includeDeleted: props.showDeleted,
      trackTotalHits: true,
    });
    pageData.value = response.hits.flatMap((hit) => {
      const mapped = mapServicePageData(hit);
      return mapped ? [withRequiredFqn(mapped)] : [];
    });
    props.pagingInfo.handlePagingChange({ total: response.total });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    props.setIsServiceLoading(false);
  }
}

watch(
  [searchValue, currentPageValue, () => props.showDeleted],
  () => {
    if (searchValue.value) {
      void searchService(searchValue.value, currentPageValue.value);
    }
  },
  { immediate: true },
);

function onServiceSearch(value: string): void {
  props.setFilters({ schema: value === '' ? undefined : value });
  props.pagingInfo.handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

function tablePaginationHandler(params: {
  currentPage: number;
  cursorType?: 'after' | 'before';
}): void {
  if (searchValue.value) {
    props.pagingInfo.handlePageChange(params.currentPage);
  } else if (params.cursorType) {
    props.pagingInfo.handlePageChange(
      params.currentPage,
      { cursorType: params.cursorType, cursorValue: pagingValue.value[params.cursorType] },
      pageSizeValue.value,
    );
  }
}

function handleShowDeletedChange(checked: boolean): void {
  props.onShowDeletedChange(checked);
  props.pagingInfo.handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

function handleBulkEdit(): void {
  void router.push({
    name: 'bulk-edit',
    params: { entityType: 'databaseService', fqn: props.serviceDetails.fullyQualifiedName ?? '' },
  });
}

const inputValue = useDebouncedTableSearch(searchValue, onServiceSearch);

/** Description editing (inline form, TableQueryRightPanel precedent). */
const editingDescription = ref(false);
const descriptionDraft = ref('');
const savingDescription = ref(false);

function startDescriptionEdit(): void {
  descriptionDraft.value = props.serviceDetails.description ?? '';
  editingDescription.value = true;
}

async function saveDescription(): Promise<void> {
  const next = descriptionDraft.value;
  if (next === (props.serviceDetails.description ?? '')) {
    editingDescription.value = false;
    return;
  }
  savingDescription.value = true;
  try {
    await props.onDescriptionUpdate(next);
    editingDescription.value = false;
  } catch {
    // Pin swallows the error; the caller owns feedback. Stay in edit mode.
  } finally {
    savingDescription.value = false;
  }
}

/** Display-name editing (field-level echo of the PATCH response). */
const editingDisplayNameId = ref<string | null>(null);
const displayNameDraft = ref('');
const savingDisplayName = ref(false);

function startDisplayNameEdit(row: ServiceChildRow): void {
  displayNameDraft.value = row.displayName ?? '';
  editingDisplayNameId.value = row.id;
}

function cancelDisplayNameEdit(): void {
  editingDisplayNameId.value = null;
}

async function saveDisplayName(row: ServiceChildRow): Promise<void> {
  const next = displayNameDraft.value;
  if (next === (row.displayName ?? '') || !childEntityType.value) {
    cancelDisplayNameEdit();
    return;
  }
  const ops = setFieldPatch('/displayName', row.displayName, next);
  savingDisplayName.value = true;
  try {
    // Pin handleDisplayNameUpdate replaces the whole row with the
    // PATCH response; a response that does not map keeps the old row.
    let mapped: ServicePageData | null;
    if (childEntityType.value === 'directory') {
      mapped = await patchDriveAsset('directory', row.id, ops);
    } else {
      const record = asRecord(await patchAsset(childEntityType.value, row.id, ops));
      mapped = record ? mapServicePageData(record) : null;
    }
    const replacement = mapped ? withRequiredFqn(mapped) : null;
    pageData.value = pageData.value.map((item) =>
      item.id === row.id && replacement ? replacement : item,
    );
    cancelDisplayNameEdit();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    savingDisplayName.value = false;
  }
}

function rowLink(row: {
  fullyQualifiedName?: string;
}): { name: string; params: { entityType: string; fqn: string } } | null {
  if (!childEntityType.value || !isDetailWired(childEntityType.value) || !row.fullyQualifiedName) {
    return null;
  }
  return assetLocation(childEntityType.value, row.fullyQualifiedName);
}

/**
 * SmTable's bodyCell slot types `record` as Record<string, any>;
 * the display-name handlers need the row shape. Single documented
 * cast at the table boundary (AssetDetailView precedent).
 */
function asChildRow(record: Record<string, any>): ServiceChildRow {
  return record as ServiceChildRow;
}

const columns = computed(() =>
  serviceChildColumns({
    name: t('crud.name'),
    description: t('crud.description'),
    owners: t('explore.facets.owner'),
    tags: t('explore.facets.tagFqn'),
    tier: t('label.tier'),
    certification: t('label.certification'),
  }),
);

const emptyText = computed(() =>
  childTableEmptyText(Boolean(searchValue.value), {
    noMatchingResults: t('serviceDetail.main.noMatchingResults'),
    checkSpelling: t('serviceDetail.main.checkSpelling'),
    noData: t('serviceDetail.main.noEntityDataAvailable', { entity: t(countLabel.value.labelKey) }),
  }),
);

/** Right panel: lazy option loading (cached promises, facets precedent). */
let catalogPromise: Promise<GovernanceCatalog> | null = null;
const catalog = ref<GovernanceCatalog | null>(null);
async function ensureCatalog(): Promise<void> {
  if (!catalogPromise) {
    catalogPromise = loadGovernanceCatalog().catch(() => ({ owners: [], tags: [], domains: [] }));
  }
  catalog.value = await catalogPromise;
}

let dataProductsPromise: Promise<DataProduct[]> | null = null;
const dataProductOptions = ref<DataProduct[]>([]);
async function ensureDataProducts(): Promise<void> {
  if (!dataProductsPromise) {
    dataProductsPromise = listDataProducts({ limit: 100 })
      .then((page) => page.data)
      .catch(() => []);
  }
  dataProductOptions.value = await dataProductsPromise;
}

const classificationOptions = computed(() => classificationTagOptions(catalog.value));
const glossaryOptions = computed(() =>
  (catalog.value?.tags ?? []).filter((tag) => tag.source === 'Glossary'),
);

const serviceTags = computed(() => props.serviceDetails.tags ?? []);
const tierTag = computed((): CellTagLabel | undefined => getTierTag(serviceTags.value));
const tagsWithoutTier = computed((): CellTagLabel[] => getTagsWithoutTier(serviceTags.value));
const classificationTags = computed(() =>
  tagsWithoutTier.value.filter((tag) => (tag.source ?? 'Classification') === 'Classification'),
);
const glossaryTags = computed(() =>
  tagsWithoutTier.value.filter((tag) => tag.source === 'Glossary'),
);

/**
 * Pin handleTagSelection + onTagUpdate: keep the previous tag objects
 * for still-selected FQNs, build new labels for the rest, tier first.
 * The face being saved contributes its selection; the other source's
 * current labels are preserved through the same merge.
 */
function mergeTags(selectedFqns: string[], source: 'Classification' | 'Glossary'): CellTagLabel[] {
  const withoutTier = tagsWithoutTier.value;
  const otherSourceFqns = withoutTier
    .filter((tag) => (tag.source ?? 'Classification') !== source)
    .map((tag) => tag.tagFQN);
  const fullSelected = [...selectedFqns, ...otherSourceFqns];
  const prevTags = withoutTier.filter((tag) => fullSelected.includes(tag.tagFQN));
  const options = source === 'Classification' ? classificationOptions.value : glossaryOptions.value;
  const newTags = fullSelected
    .filter((fqn) => !prevTags.some((tag) => tag.tagFQN === fqn))
    .map((fqn) => {
      const option = options.find((entry) => entry.tagFQN === fqn);
      // Pin createTagObject spreads the whole tag: the new label
      // keeps the short name, displayName and description, not just
      // the four keys toTagLabel builds.
      return {
        ...toTagLabel({
          tagFQN: fqn,
          name: option?.name ?? splitFqn(fqn).pop() ?? fqn,
          source,
        }),
        name: splitFqn(fqn).pop() ?? fqn,
        displayName: option?.displayName,
        description: option?.description,
      };
    });
  return [...(tierTag.value ? [tierTag.value] : []), ...prevTags, ...newTags];
}

async function saveTags(selectedFqns: string[], source: 'Classification' | 'Glossary'): Promise<void> {
  const merged = mergeTags(selectedFqns, source);
  await props.saveUpdatedServiceData({ ...props.serviceDetails, tags: merged });
}

const editingTags = ref(false);
const tagDraft = ref<string[]>([]);
const savingTags = ref(false);

async function startTagsEdit(): Promise<void> {
  await ensureCatalog();
  tagDraft.value = classificationTags.value.map((tag) => tag.tagFQN);
  editingTags.value = true;
}

async function saveTagsEdit(): Promise<void> {
  savingTags.value = true;
  try {
    await saveTags(tagDraft.value, 'Classification');
    editingTags.value = false;
  } catch {
    // Caller owns feedback; stay in edit mode.
  } finally {
    savingTags.value = false;
  }
}

const editingGlossary = ref(false);
const glossaryDraft = ref<string[]>([]);
const savingGlossary = ref(false);

async function startGlossaryEdit(): Promise<void> {
  await ensureCatalog();
  glossaryDraft.value = glossaryTags.value.map((tag) => tag.tagFQN);
  editingGlossary.value = true;
}

async function saveGlossaryEdit(): Promise<void> {
  savingGlossary.value = true;
  try {
    await saveTags(glossaryDraft.value, 'Glossary');
    editingGlossary.value = false;
  } catch {
    // Caller owns feedback; stay in edit mode.
  } finally {
    savingGlossary.value = false;
  }
}

const editingDataProducts = ref(false);
const dataProductDraft = ref<string[]>([]);
const savingDataProducts = ref(false);

async function startDataProductsEdit(): Promise<void> {
  await ensureDataProducts();
  dataProductDraft.value = (props.serviceDetails.dataProducts ?? []).map(
    (ref) => ref.fullyQualifiedName ?? ref.name,
  );
  editingDataProducts.value = true;
}

async function saveDataProductsEdit(): Promise<void> {
  savingDataProducts.value = true;
  try {
    const refs: EntityRef[] = dataProductDraft.value.flatMap((fqn) => {
      const found = dataProductOptions.value.find(
        (option) => (option.fullyQualifiedName ?? option.name) === fqn,
      );
      if (!found) {
        return [];
      }
      return [
        {
          id: found.id,
          type: 'dataProduct',
          name: found.name,
          displayName: found.displayName,
          fullyQualifiedName: found.fullyQualifiedName,
        },
      ];
    });
    await props.onDataProductUpdate(refs);
    editingDataProducts.value = false;
  } catch {
    // Caller owns feedback; stay in edit mode.
  } finally {
    savingDataProducts.value = false;
  }
}
</script>

<template>
  <div class="service-main-tab">
    <div class="service-main-tab__content">
      <section data-testid="description-container" class="service-main-tab__description">
        <template v-if="editingDescription">
          <Input.TextArea
            v-model:value="descriptionDraft"
            :rows="4"
            :aria-label="t('serviceDetail.main.editDescriptionFor', { name: serviceName })"
            data-testid="edit-description-input"
          />
          <span class="service-main-tab__actions">
            <Button
              size="small"
              type="primary"
              :loading="savingDescription"
              data-testid="save-description"
              @click="saveDescription"
            >
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-description" @click="editingDescription = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <SmMarkdown
            v-if="serviceDetails.description"
            :markdown="serviceDetails.description"
            test-id="service-description"
          />
          <p v-else class="service-main-tab__empty">{{ t('serviceDetail.main.descriptionEmpty') }}</p>
          <Button
            v-if="canEditDescription"
            size="small"
            type="link"
            data-testid="edit-description"
            @click="startDescriptionEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>

      <div data-testid="table-container">
        <div class="service-main-tab__toolbar">
          <Input
            v-model:value="inputValue"
            class="service-main-tab__search"
            :placeholder="t('serviceDetail.main.searchForType', { type: t(countLabel.labelKey) })"
            allow-clear
          />
          <span class="service-main-tab__toolbar-actions">
            <Button
              v-if="kind === 'database' && canEditAll"
              size="small"
              data-testid="bulk-edit"
              @click="handleBulkEdit"
            >
              {{ t('crud.edit') }}
            </Button>
            <span class="service-main-tab__deleted-toggle">
              <Switch
                :checked="showDeleted"
                size="small"
                data-testid="show-deleted"
                @change="(checked) => handleShowDeletedChange(Boolean(checked))"
              />
              <span>{{ t('crud.deleted') }}</span>
            </span>
          </span>
        </div>
        <SmTable
          test-id="service-children-table"
          :columns="columns"
          :data-source="pageData"
          row-key="id"
          size="small"
          :loading="isServiceLoading"
          :pagination="false"
          :empty-text="emptyText"
        >
          <template #bodyCell="{ column, record, text }">
            <template v-if="column.key === 'name'">
              <span v-if="editingDisplayNameId === record.id" class="service-main-tab__name-edit">
                <Input
                  v-model:value="displayNameDraft"
                  size="small"
                  :data-testid="`display-name-input-${record.id}`"
                  @press-enter="() => saveDisplayName(asChildRow(record))"
                />
                <Button
                  size="small"
                  type="primary"
                  :loading="savingDisplayName"
                  :data-testid="`save-display-name-${record.id}`"
                  @click="() => saveDisplayName(asChildRow(record))"
                >
                  {{ t('crud.save') }}
                </Button>
                <Button
                  size="small"
                  :data-testid="`cancel-display-name-${record.id}`"
                  @click="cancelDisplayNameEdit"
                >
                  {{ t('crud.cancel') }}
                </Button>
              </span>
              <span v-else class="service-main-tab__name">
                <ServiceChildNameCell
                  :name="record.name"
                  :display-name="record.displayName"
                  :to="rowLink(record)"
                  :search-text="searchValue"
                  :test-id="`service-child-${record.id}`"
                />
                <Button
                  v-if="canEditDisplayName"
                  type="text"
                  size="small"
                  :data-testid="`edit-display-name-${record.id}`"
                  @click="() => startDisplayNameEdit(asChildRow(record))"
                >
                  <EditOutlined />
                </Button>
              </span>
            </template>
            <SmMarkdown
              v-else-if="column.key === 'description' && record.description"
              :markdown="record.description"
            />
            <ServiceChildOwnersCell
              v-else-if="column.key === 'owners'"
              :owners="record.owners ?? []"
            />
            <ServiceChildTagsCell
              v-else-if="column.key === 'tags'"
              :tags="visibleChildTags(record.tags ?? [])"
              :size-cap="3"
            />
            <ServiceChildTagsCell
              v-else-if="column.key === 'tier'"
              :tags="tierCellTags(record.tags)"
              :size-cap="1"
            />
            <ServiceChildTagsCell
              v-else-if="column.key === 'certification'"
              :tags="certificationCellTags(record)"
              :size-cap="1"
            />
            <template v-else>{{ text }}</template>
          </template>
        </SmTable>
        <ServiceChildrenPagination
          v-if="showPaginationValue"
          :paging="pagingValue"
          :current-page="currentPageValue"
          :page-size="pageSizeValue"
          :is-number-based="Boolean(searchValue)"
          :is-loading="isServiceLoading"
          @page-change="tablePaginationHandler"
          @page-size-change="pagingInfo.handlePageSizeChange"
        />
      </div>
    </div>

    <aside data-testid="entity-right-panel" class="service-main-tab__panel">
      <section v-if="showDataProducts" class="service-main-tab__face">
        <h3>{{ t('explore.facets.dataProduct') }}</h3>
        <template v-if="editingDataProducts">
          <Select
            v-model:value="dataProductDraft"
            mode="multiple"
            show-search
            :options="
              dataProductOptions.map((option) => ({
                value: option.fullyQualifiedName ?? option.name,
                label: option.displayName ?? option.name,
              }))
            "
            data-testid="edit-data-products-select"
          />
          <span class="service-main-tab__actions">
            <Button
              size="small"
              type="primary"
              :loading="savingDataProducts"
              data-testid="save-data-products"
              @click="saveDataProductsEdit"
            >
              {{ t('crud.save') }}
            </Button>
            <Button
              size="small"
              data-testid="cancel-data-products"
              @click="editingDataProducts = false"
            >
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <ul
            v-if="(serviceDetails.dataProducts ?? []).length > 0"
            class="service-main-tab__list"
          >
            <li
              v-for="product in serviceDetails.dataProducts"
              :key="product.fullyQualifiedName ?? product.name"
            >
              {{ product.displayName || product.name }}
            </li>
          </ul>
          <p v-else class="service-main-tab__empty">{{ t('explore.noDataProducts') }}</p>
          <Button
            v-if="canEditAll"
            size="small"
            type="link"
            data-testid="edit-data-products"
            @click="startDataProductsEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>

      <section class="service-main-tab__face">
        <h3>{{ t('explore.facets.tagFqn') }}</h3>
        <template v-if="editingTags">
          <Select
            v-model:value="tagDraft"
            mode="multiple"
            show-search
            :options="
              classificationOptions.map((option) => ({ value: option.tagFQN, label: option.name }))
            "
            data-testid="edit-tags-select"
          />
          <span class="service-main-tab__actions">
            <Button
              size="small"
              type="primary"
              :loading="savingTags"
              data-testid="save-tags"
              @click="saveTagsEdit"
            >
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-tags" @click="editingTags = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <ServiceChildTagsCell v-if="classificationTags.length > 0" :tags="classificationTags" :size-cap="-1" />
          <p v-else class="service-main-tab__empty">{{ t('explore.noTags') }}</p>
          <Button
            v-if="canEditTags"
            size="small"
            type="link"
            data-testid="edit-tags"
            @click="startTagsEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>

      <section class="service-main-tab__face">
        <h3>{{ t('explore.glossaryTerms') }}</h3>
        <template v-if="editingGlossary">
          <Select
            v-model:value="glossaryDraft"
            mode="multiple"
            show-search
            :options="
              glossaryOptions.map((option) => ({ value: option.tagFQN, label: option.name }))
            "
            data-testid="edit-glossary-select"
          />
          <span class="service-main-tab__actions">
            <Button
              size="small"
              type="primary"
              :loading="savingGlossary"
              data-testid="save-glossary"
              @click="saveGlossaryEdit"
            >
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-glossary" @click="editingGlossary = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <ServiceChildTagsCell v-if="glossaryTags.length > 0" :tags="glossaryTags" :size-cap="-1" />
          <p v-else class="service-main-tab__empty">{{ t('explore.noGlossary') }}</p>
          <Button
            v-if="canEditGlossaryTerms"
            size="small"
            type="link"
            data-testid="edit-glossary"
            @click="startGlossaryEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.service-main-tab {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.service-main-tab__content {
  flex: 1 1 480px;
  min-width: 0;
}

.service-main-tab__panel {
  flex: 0 0 300px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.service-main-tab__description {
  margin-bottom: 16px;
}

.service-main-tab__actions {
  display: inline-flex;
  gap: 8px;
  margin-top: 8px;
}

.service-main-tab__empty {
  color: var(--sm-text-secondary);
  margin: 0;
}

.service-main-tab__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.service-main-tab__search {
  width: 300px;
}

.service-main-tab__toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.service-main-tab__deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.service-main-tab__name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.service-main-tab__name-edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.service-main-tab__face h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.service-main-tab__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
