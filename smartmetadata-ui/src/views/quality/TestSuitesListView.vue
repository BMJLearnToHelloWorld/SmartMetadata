<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { useRouter } from 'vue-router';
import {Button, Form, Input, Radio, message} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import LogicalTestSuiteDrawer from '@/components/quality/LogicalTestSuiteDrawer.vue';
import { ApiError } from '@/api/client';
import { createTestSuite, deleteTestSuite, listTestSuites, listTestSuitesBySearch } from '@/api/testSuites';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import {
  filterSuitesForSearch,
  parseSuiteSubTab,
  successPercent,
  suiteTypeForSubTab,
  type DqSuiteSubTab,
} from '@/quality/landing';
import { useDataQualityContext } from '@/quality/dataQualityContext';
import type { TestSuite } from '@/types/quality';

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    preferSearch?: boolean;
    ownerFqn?: string;
    initialSubTab?: string;
  }>(),
  {
    embedded: false,
    preferSearch: false,
  },
);

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suites = ref<TestSuite[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const offset = ref(0);
const usingSearch = ref(false);
const searchValue = ref('');
const subTab = ref<DqSuiteSubTab>(parseSuiteSubTab(props.initialSubTab));
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
});

const columns = computed<EntityListColumn[]>(() => [
  {
    title: t('label.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (left, right) =>
      entityLabel(left as TestSuite).localeCompare(entityLabel(right as TestSuite)),
  },
  { title: t('label.test-plural'), key: 'tests', width: 90 },
  { title: t('label.success') + ' %', key: 'successPercent', width: 110 },
  { title: t('label.owner-plural'), key: 'owners' },
]);

const visibleSuites = computed(() =>
  usingSearch.value ? suites.value : filterSuitesForSearch(suites.value, searchValue.value),
);

const hasNext = computed(() =>
  usingSearch.value
    ? offset.value + suites.value.length < (total.value ?? 0) ||
      (total.value === undefined && suites.value.length === DEFAULT_PAGE_SIZE)
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (usingSearch.value ? offset.value > 0 : canGoPrev(cursor.value)));
const hasSuiteFilters = computed(() => Boolean(searchValue.value.trim()));
const suiteSearchPlaceholder = computed(() =>
  t('label.search-entity', {
    entity:
      subTab.value === 'table-suites' ? t('label.table-suite-plural') : t('label.bundle-suite-plural'),
  }),
);
const emptyText = computed(() =>
  hasSuiteFilters.value
    ? t('message.no-matching-test-suites')
    : subTab.value === 'table-suites'
      ? t('message.no-table-suites-yet')
      : t('message.no-bundle-suites-yet'),
);
const dqContext = useDataQualityContext();
const canCreateBundleFromContext = computed(() =>
  props.embedded
    ? Boolean(dqContext.createActions?.canCreateBundleSuite)
    : subTab.value === 'bundle-suites',
);

function resetPager(): void {
  cursor.value = createCursorPager();
  offset.value = 0;
  pageAfter.value = undefined;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  const testSuiteType = suiteTypeForSubTab(subTab.value);
  const includeEmptyTestSuites = subTab.value === 'bundle-suites';
  try {
    if (props.preferSearch) {
      try {
        const page = await listTestSuitesBySearch({
          q: searchValue.value.trim() || undefined,
          limit: DEFAULT_PAGE_SIZE,
          offset: offset.value,
          owner: props.ownerFqn,
          testSuiteType,
          includeEmptyTestSuites,
        });
        suites.value = page.data;
        total.value = page.total;
        usingSearch.value = true;
        return;
      } catch (error) {
        if (!(error instanceof ApiError && error.status >= 400 && error.status < 500)) {
          throw error;
        }
      }
    }
    usingSearch.value = false;
    const page = await listTestSuites({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      testSuiteType,
      includeEmptyTestSuites,
    });
    suites.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    suites.value = [];
    errorMessage.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (usingSearch.value) {
    offset.value += DEFAULT_PAGE_SIZE;
  } else if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  if (usingSearch.value) {
    offset.value = Math.max(0, offset.value - DEFAULT_PAGE_SIZE);
  } else {
    cursor.value = goPrev(cursor.value);
  }
  void load();
}

function onSearch(): void {
  if (usingSearch.value || props.preferSearch) {
    resetPager();
    void load();
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createTestSuite({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
    });
    createOpen.value = false;
    message.success(t('server.create-entity-success', { entity: t('label.bundle-suite') }));
    subTab.value = 'bundle-suites';
    resetPager();
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.create-entity-error', { entity: t('label.bundle-suite') })));
  } finally {
    creating.value = false;
  }
}

function openCreate(): void {
  createOpen.value = true;
}

function onBundleCreatePress(): void {
  if (props.embedded && dqContext.createActions?.onAddBundleSuite) {
    dqContext.createActions.onAddBundleSuite();
    return;
  }
  openCreate();
}

function onBundleCreated(): void {
  createOpen.value = false;
  resetPager();
  void load();
}

watch(subTab, () => {
  resetPager();
  void load();
});

watch(
  () => [props.preferSearch, props.ownerFqn, props.initialSubTab].join('|'),
  () => {
    if (props.initialSubTab) {
      subTab.value = parseSuiteSubTab(props.initialSubTab);
    }
    resetPager();
    void load();
  },
);

async function onDelete(record: TestSuite): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.delete-entity-message', { entity: record.displayName || record.name }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestSuite(record.id, { hardDelete: true });
    message.success(t('server.entity-deleted-successfully', { entity: record.displayName || record.name }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.delete-entity-error', { entity: t('label.test-suite') })));
  }
}

onMounted(() => {
  void load();
});

defineExpose({ openCreate });
</script>

<template>
  <EntityListShell
    :title="t('label.data-quality')"
    :lead="t('message.page-sub-header-for-data-quality')"
    :hide-heading="embedded"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="visibleSuites"
    table-test-id="test-suites-table"
    show-search
    :search-value="searchValue"
    :search-placeholder="suiteSearchPlaceholder"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    :empty-text="emptyText"
    @update:search-value="searchValue = $event"
    @search="onSearch"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
    @edit="(record) => router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
    @delete="(record) => onDelete(record as TestSuite)"
  >
    <template #actions>
      <Button
        v-if="subTab === 'bundle-suites' && (!embedded || canCreateBundleFromContext)"
        type="primary"
        data-testid="create-test-suite"
        @click="onBundleCreatePress"
      >
        {{ t('label.new-entity', { entity: t('label.bundle-suite') }) }}
      </Button>
    </template>
    <template #filters>
      <Radio.Group
        v-model:value="subTab"
        button-style="solid"
        data-testid="test-suites-subtabs"
      >
        <Radio.Button value="table-suites" data-testid="test-suites-table-subtab">
          {{ t('label.table-suite-plural') }}
        </Radio.Button>
        <Radio.Button value="bundle-suites" data-testid="test-suites-bundle-subtab">
          {{ t('label.bundle-suite-plural') }}
        </Radio.Button>
      </Radio.Group>
    </template>
    <template #emptyExtra>
      <Button
        v-if="subTab === 'bundle-suites' && (!embedded || canCreateBundleFromContext)"
        type="primary"
        data-testid="test-suites-empty-cta"
        @click="onBundleCreatePress"
      >
        {{ t('label.new-entity', { entity: t('label.bundle-suite') }) }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`test-suite-row-${(record as TestSuite).id}`"
          @click.prevent="router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
        >
          {{ entityLabel(record as TestSuite) }}
        </a>
      </template>
      <template v-else-if="column.key === 'tests'">
        {{ (record as TestSuite).summary?.total ?? (record as TestSuite).tests.length }}
      </template>
      <template v-else-if="column.key === 'successPercent'">
        {{
          successPercent((record as TestSuite).summary) !== undefined
            ? `${successPercent((record as TestSuite).summary)}%`
            : '—'
        }}
      </template>
      <template v-else-if="column.key === 'owners'">
        {{
          (record as TestSuite).owners
            .map((owner) => owner.displayName || owner.name)
            .filter(Boolean)
            .join(', ') || '—'
        }}
      </template>
    </template>
  </EntityListShell>
  <LogicalTestSuiteDrawer
    :open="createOpen"
    @cancel="createOpen = false"
    @submitted="onBundleCreated"
  />
  
</template>
