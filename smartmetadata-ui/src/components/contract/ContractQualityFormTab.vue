<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractQualityFormTab: paged test-case selection, off-page
  storedRefsById, official Filters dropdown, search-by-name, official
  empty placeholders, optional TestCaseFormDrawer.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckSquareOutlined, DownOutlined, SearchOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Input, Menu, Table, message } from 'ant-design-vue';
import type { DataContract, EntityRefLike } from '@/api/dataContracts';
import { listTestCasesBySearch } from '@/api/testCases';
import { CONTRACT_TEST_TYPE_LABEL_MAP } from '@/catalog/dataContractTabs';
import { mergeQualityExpectations } from '@/catalog/dataContractForm';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import { toEntityLink } from '@/quality/entityLink';
import { TEST_CASE_STATUS_LABELS, type TestCase, type TestCaseStatus } from '@/types/quality';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{
  entityType: string;
  entityFqn?: string;
  selectedQuality?: string[];
  initialValues?: Partial<DataContract>;
  nextLabel?: string;
  prevLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  next: [];
  prev: [];
}>();

const { t } = useI18n();
const testType = ref('all');
const searchDraft = ref('');
const searchValue = ref('');
const allTestCases = ref<TestCase[]>([]);
const loading = ref(false);
const selectedKeys = ref<string[]>([...(props.selectedQuality ?? [])]);
const pageSize = 15;
const currentPage = ref(1);
const total = ref(0);
const drawerOpen = ref(false);
/** Official TableV2 Searchbar default `typingInterval`. */
const SEARCH_TYPING_INTERVAL_MS = 500;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const storedRefsById = computed(() => {
  return new Map((props.initialValues?.qualityExpectations ?? []).map((item) => [item.id ?? '', item]));
});

const isFiltered = computed(() => Boolean(searchValue.value) || testType.value !== 'all');
const hasNoTests = computed(() => !isFiltered.value && allTestCases.value.length === 0);
const testTypeOptions = computed(() =>
  Object.entries(CONTRACT_TEST_TYPE_LABEL_MAP).map(([value, labelKey]) => ({ value, label: t(labelKey) })),
);

async function fetchAllTests(offset = 0, q?: string): Promise<void> {
  if (!props.entityFqn) {
    return;
  }
  loading.value = true;
  try {
    const query = q !== undefined ? q : searchValue.value;
    const page = await listTestCasesBySearch({
      sortType: 'desc',
      sortField: 'testCaseResult.timestamp',
      testCaseType: testType.value,
      fields: 'testCaseResult',
      entityLink: toEntityLink(props.entityType || 'table', props.entityFqn),
      includeAllTests: true,
      limit: pageSize,
      offset,
      include: 'non-deleted',
      q: query || undefined,
    });
    allTestCases.value = page.data;
    total.value = page.total ?? page.data.length;
  } catch (error) {
    message.error(getErrorText(error, t('server.unexpected-error')));
  } finally {
    loading.value = false;
  }
}

function applySearch(value: string): void {
  searchValue.value = value;
  currentPage.value = 1;
  void fetchAllTests(0, value);
}

function onSearchDraftChange(value: string): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  if (value === '') {
    applySearch('');
    return;
  }
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    applySearch(value);
  }, SEARCH_TYPING_INTERVAL_MS);
}

function statusLabel(status: string): string {
  const key = TEST_CASE_STATUS_LABELS[status as TestCaseStatus];
  return key ? t(key) : status;
}

function handleSelection(keys: (string | number)[]): void {
  const ids = keys.map(String);
  selectedKeys.value = ids;
  emit('change', {
    qualityExpectations: mergeQualityExpectations(
      ids,
      allTestCases.value.map((item) => ({ id: item.id, name: item.name, description: item.description })),
      storedRefsById.value,
    ) as EntityRefLike[],
  });
}

function onTestTypeSelect(key: string): void {
  if (key === testType.value) {
    return;
  }
  testType.value = key;
}

watch(testType, () => {
  currentPage.value = 1;
  void fetchAllTests(0);
});

function onPageChange(page: number): void {
  currentPage.value = page;
  void fetchAllTests((page - 1) * pageSize);
}

onMounted(() => {
  void fetchAllTests(0);
});

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <ContractFormStep
    :title="t('label.quality')"
    :description="t('message.quality-contract-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <template #extra>
      <Button data-testid="add-test-button" @click="drawerOpen = true">
        {{ t('label.add-entity', { entity: t('label.test') }) }}
      </Button>
    </template>
    <div class="quality-form-toolbar" data-testid="table-toolbar">
      <div class="quality-form-search" data-testid="search-bar-container">
        <Input
          v-model:value="searchDraft"
          allow-clear
          data-testid="searchbar"
          :placeholder="t('label.search-by-type', { type: t('label.name') })"
          @update:value="onSearchDraftChange"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </Input>
      </div>
      <div class="quality-form-filters">
        <Dropdown :trigger="['click']" :disabled="hasNoTests">
          <Button data-testid="quality-filter-button" :disabled="hasNoTests">
            {{ t('label.filter-plural') }}
            <DownOutlined />
          </Button>
          <template #overlay>
            <Menu
              :selected-keys="[testType]"
              :aria-label="t('label.filter-plural')"
              @click="({ key }) => onTestTypeSelect(String(key))"
            >
              <Menu.Item v-for="option in testTypeOptions" :id="option.value" :key="option.value">
                {{ option.label }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </div>
    <Table
      row-key="id"
      :data-source="allTestCases"
      :loading="loading"
      :pagination="{ current: currentPage, pageSize, total, onChange: onPageChange }"
      :row-selection="{ selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: handleSelection, columnWidth: 48 }"
      :columns="[
        { title: t('label.name'), dataIndex: 'name', key: 'name' },
        { title: t('label.status'), dataIndex: 'testCaseResult', key: 'testCaseResult' },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'testCaseResult'">
          <StatusBadge
            v-if="record.testCaseResult?.testCaseStatus"
            :data-test-id="`status-badge-${record.name}`"
            :label="statusLabel(record.testCaseResult.testCaseStatus)"
            :status="String(record.testCaseResult.testCaseStatus).toLowerCase()"
          />
          <template v-else>--</template>
        </template>
      </template>
      <template #emptyText>
        <NoSearchResultsPlaceholder
          v-if="isFiltered && searchValue"
          :icon="SearchOutlined"
          :title="t('label.no-matching-result-plural')"
          :description="t('message.check-spelling-or-try-shorter-term')"
        />
        <NoFilteredResultsPlaceholder
          v-else-if="isFiltered"
          :icon="SearchOutlined"
          :title="t('label.no-matching-result-plural')"
          :description="t('message.check-spelling-or-try-shorter-term')"
        />
        <NoDataPlaceholder
          v-else
          :icon="CheckSquareOutlined"
          :title="t('label.no-entity-available', { entity: t('label.test-case-plural') })"
        />
      </template>
    </Table>
    <TestCaseFormDrawer
      :open="drawerOpen"
      :initial-table-fqn="entityFqn"
      @cancel="drawerOpen = false"
      @submitted="() => { drawerOpen = false; void fetchAllTests((currentPage - 1) * pageSize); }"
    />
  </ContractFormStep>
</template>

<style scoped>
.quality-form-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.quality-form-search {
  flex: 1;
  min-width: 0;
}

.quality-form-filters {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 0;
}

.quality-form-filters :deep(.anticon) {
  margin-inline-start: 4px;
}
</style>