<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createTestCase, deleteTestCase, listTestCases, listTestCasesBySearch } from '@/api/testCases';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { listTestDefinitions } from '@/api/testDefinitions';
import { ApiError } from '@/api/client';
import { formatChartTs } from '@/features/charts/series';
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
import { filterCasesForSearch } from '@/quality/landing';
import { toEntityLink } from '@/quality/entityLink';
import { TEST_CASE_STATUSES, type TestCase, type TestDefinition } from '@/types/quality';

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    preferSearch?: boolean;
    ownerFqn?: string;
    tier?: string;
    tags?: string;
    dataProductFqn?: string;
    startTs?: number;
    endTs?: number;
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
const cases = ref<TestCase[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const offset = ref(0);
const usingSearch = ref(false);
const statusFilter = ref<string | undefined>();
const searchValue = ref('');
const definitions = ref<TestDefinition[]>([]);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  testDefinition: '',
  entityType: 'table',
  entityFqn: '',
  column: '',
  parameterText: '',
});

const columns = computed<EntityListColumn[]>(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (left, right) =>
      entityLabel(left as TestCase).localeCompare(entityLabel(right as TestCase)),
  },
  { title: t('quality.testCases.asset'), key: 'entityFQN' },
  { title: t('quality.testCases.definition'), key: 'testDefinition' },
  {
    title: t('quality.testCases.latestStatus'),
    key: 'status',
    width: 140,
    sorter: (left, right) =>
      String((left as TestCase).testCaseResult?.testCaseStatus || (left as TestCase).testCaseStatus || '').localeCompare(
        String((right as TestCase).testCaseResult?.testCaseStatus || (right as TestCase).testCaseStatus || ''),
      ),
  },
  {
    title: t('quality.testCases.lastRun'),
    key: 'lastRun',
    width: 160,
    sorter: (left, right) =>
      ((left as TestCase).testCaseResult?.timestamp ?? 0) - ((right as TestCase).testCaseResult?.timestamp ?? 0),
  },
]);

const visibleCases = computed(() =>
  usingSearch.value ? cases.value : filterCasesForSearch(cases.value, searchValue.value),
);

const hasNext = computed(() =>
  usingSearch.value
    ? offset.value + cases.value.length < (total.value ?? 0) ||
      (total.value === undefined && cases.value.length === DEFAULT_PAGE_SIZE)
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (usingSearch.value ? offset.value > 0 : canGoPrev(cursor.value)));

function parseParameterValues(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const eq = line.indexOf('=');
      if (eq <= 0) {
        return [];
      }
      return [{ name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }];
    });
}

function resetPager(): void {
  cursor.value = createCursorPager();
  offset.value = 0;
  pageAfter.value = undefined;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (props.preferSearch) {
      try {
        const page = await listTestCasesBySearch({
          q: searchValue.value.trim() || undefined,
          limit: DEFAULT_PAGE_SIZE,
          offset: offset.value,
          includeAllTests: true,
          testCaseStatus: statusFilter.value,
          owner: props.ownerFqn,
          tier: props.tier,
          tags: props.tags,
          dataProductFqn: props.dataProductFqn,
          startTimestamp: props.startTs,
          endTimestamp: props.endTs,
          sortField: 'testCaseResult.timestamp',
          sortType: 'desc',
        });
        cases.value = page.data;
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
    const page = await listTestCases({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      includeAllTests: true,
      testCaseStatus: statusFilter.value,
    });
    cases.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    cases.value = [];
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

function onFilterChange(): void {
  resetPager();
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
    const created = await createTestCase({
      name: form.name.trim(),
      testDefinition: form.testDefinition,
      entityLink: toEntityLink(form.entityType, form.entityFqn, form.column),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
      parameterValues: parseParameterValues(form.parameterText),
    });
    createOpen.value = false;
    message.success(t('quality.testCases.created', { name: created.name }));
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

watch(
  () =>
    [
      props.preferSearch,
      props.ownerFqn,
      props.tier,
      props.tags,
      props.dataProductFqn,
      props.startTs,
      props.endTs,
    ].join('|'),
  () => {
    resetPager();
    void load();
  },
);

async function onDelete(record: TestCase): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: record.displayName || record.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestCase(record.id, { hardDelete: true });
    message.success(t('crud.deletedName', { name: record.displayName || record.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
  void listTestDefinitions({ limit: 100 })
    .then((page) => {
      definitions.value = page.data;
    })
    .catch(() => undefined);
});

defineExpose({ openCreate });
</script>

<template>
  <EntityListShell
    :title="t('quality.testCases.title')"
    :lead="t('quality.testCases.lead')"
    :hide-heading="embedded"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="visibleCases"
    table-test-id="test-cases-table"
    show-search
    :search-value="searchValue"
    :search-placeholder="t('quality.testCases.searchPlaceholder')"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    :empty-text="t('quality.testCases.empty')"
    @update:search-value="searchValue = $event"
    @search="onSearch"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
    @edit="(record) => router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
    @delete="(record) => onDelete(record as TestCase)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-test-case" @click="openCreate">
        {{ t('quality.testCases.create') }}
      </Button>
    </template>
    <template #filters>
      <Select
        v-model:value="statusFilter"
        allow-clear
        :placeholder="t('quality.testCases.statusFilter')"
        data-testid="test-cases-status-filter"
        style="width: 160px"
        @change="onFilterChange"
      >
        <Select.Option v-for="status in TEST_CASE_STATUSES" :key="status" :value="status">
          {{ status }}
        </Select.Option>
      </Select>
    </template>
    <template #emptyExtra>
      <Button type="primary" data-testid="test-cases-empty-cta" @click="openCreate">
        {{ t('quality.testCases.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`test-case-row-${(record as TestCase).id}`"
          @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
        >
          {{ entityLabel(record as TestCase) }}
        </a>
      </template>
      <template v-else-if="column.key === 'entityFQN'">
        {{ (record as TestCase).entityFQN || (record as TestCase).entityLink || '—' }}
      </template>
      <template v-else-if="column.key === 'testDefinition'">
        {{
          (record as TestCase).testDefinition?.fullyQualifiedName ||
          (record as TestCase).testDefinition?.name ||
          '—'
        }}
      </template>
      <template v-else-if="column.key === 'status'">
        {{
          (record as TestCase).testCaseResult?.testCaseStatus || (record as TestCase).testCaseStatus || '—'
        }}
      </template>
      <template v-else-if="column.key === 'lastRun'">
        {{ formatChartTs((record as TestCase).testCaseResult?.timestamp) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('quality.testCases.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-test-case-name" />
      </Form.Item>
      <Form.Item :label="t('quality.testCases.definition')" required>
        <Select
          v-model:value="form.testDefinition"
          show-search
          option-filter-prop="label"
          data-testid="create-test-case-definition"
        >
          <Select.Option
            v-for="definition in definitions"
            :key="definition.id"
            :value="definition.fullyQualifiedName || definition.name"
            :label="entityLabel(definition)"
          >
            {{ entityLabel(definition) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('quality.testCases.entityType')" required>
        <Select v-model:value="form.entityType">
          <Select.Option value="table">table</Select.Option>
          <Select.Option value="topic">topic</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('quality.testCases.entityFqn')" required>
        <Input v-model:value="form.entityFqn" data-testid="create-test-case-fqn" />
      </Form.Item>
      <Form.Item :label="t('quality.testCases.column')">
        <Input v-model:value="form.column" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
      <Form.Item :label="t('quality.testCases.parameters')">
        <Input.TextArea v-model:value="form.parameterText" :rows="3" placeholder="minValue=1&#10;maxValue=100" />
      </Form.Item>
    </Form>
  </Modal>
</template>
