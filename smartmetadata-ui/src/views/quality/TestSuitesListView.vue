<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Radio, message } from 'ant-design-vue';
import { ApiError } from '@/api/client';
import { createTestSuite, listTestSuites, listTestSuitesBySearch } from '@/api/testSuites';
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
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (left, right) =>
      entityLabel(left as TestSuite).localeCompare(entityLabel(right as TestSuite)),
  },
  { title: t('quality.testSuites.suiteType'), key: 'basic', width: 110 },
  { title: t('quality.testSuites.tests'), key: 'tests', width: 90 },
  { title: t('quality.testSuites.successPercent'), key: 'successPercent', width: 110 },
  { title: t('quality.testSuites.owners'), key: 'owners' },
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
const emptyText = computed(() =>
  subTab.value === 'table-suites' ? t('quality.testSuites.emptyTable') : t('quality.testSuites.emptyBundle'),
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
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
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
    message.success(t('quality.testSuites.created', { name: created.name }));
    subTab.value = 'bundle-suites';
    resetPager();
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

function openCreate(): void {
  createOpen.value = true;
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

onMounted(() => {
  void load();
});

defineExpose({ openCreate });
</script>

<template>
  <EntityListShell
    :title="t('quality.testSuites.title')"
    :lead="t('quality.testSuites.lead')"
    :hide-heading="embedded"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="visibleSuites"
    table-test-id="test-suites-table"
    show-search
    :search-value="searchValue"
    :search-placeholder="t('quality.testSuites.searchPlaceholder')"
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
  >
    <template #actions>
      <Button
        v-if="subTab === 'bundle-suites'"
        type="primary"
        data-testid="create-test-suite"
        @click="openCreate"
      >
        {{ t('quality.testSuites.create') }}
      </Button>
    </template>
    <template #filters>
      <Radio.Group
        v-model:value="subTab"
        button-style="solid"
        data-testid="test-suites-subtabs"
      >
        <Radio.Button value="table-suites" data-testid="test-suites-table-subtab">
          {{ t('quality.testSuites.tableSuites') }}
        </Radio.Button>
        <Radio.Button value="bundle-suites" data-testid="test-suites-bundle-subtab">
          {{ t('quality.testSuites.bundleSuites') }}
        </Radio.Button>
      </Radio.Group>
    </template>
    <template #emptyExtra>
      <Button
        v-if="subTab === 'bundle-suites'"
        type="primary"
        data-testid="test-suites-empty-cta"
        @click="openCreate"
      >
        {{ t('quality.testSuites.create') }}
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
      <template v-else-if="column.key === 'basic'">
        {{ (record as TestSuite).basic ? t('quality.testSuites.basic') : t('quality.testSuites.logical') }}
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
  <Modal
    v-model:open="createOpen"
    :title="t('quality.testSuites.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-test-suite-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
    </Form>
  </Modal>
</template>
