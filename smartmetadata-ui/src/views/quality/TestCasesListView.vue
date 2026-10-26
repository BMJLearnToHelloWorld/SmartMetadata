<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createTestCase, listTestCases } from '@/api/testCases';
import { listTestDefinitions } from '@/api/testDefinitions';
import EntityListShell from '@/features/crud/EntityListShell.vue';
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
import { toEntityLink } from '@/quality/entityLink';
import type { TestCase, TestDefinition } from '@/types/quality';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const cases = ref<TestCase[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
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
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testCases.asset'), key: 'entityFQN' },
  { title: t('quality.testCases.definition'), key: 'testDefinition' },
  { title: t('quality.testCases.latestStatus'), key: 'status', width: 140 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

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

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestCases({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      includeAllTests: true,
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
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
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
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
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
</script>

<template>
  <EntityListShell
    :title="t('quality.testCases.title')"
    :lead="t('quality.testCases.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="cases"
    table-test-id="test-cases-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
  >
    <template #actions>
      <Button type="primary" data-testid="create-test-case" @click="createOpen = true">
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
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('quality.testCases.createTitle')"
    :ok-text="t('crud.create')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
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
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
      <Form.Item :label="t('quality.testCases.parameters')">
        <Input.TextArea v-model:value="form.parameterText" :rows="3" placeholder="minValue=1&#10;maxValue=100" />
      </Form.Item>
    </Form>
  </Modal>
</template>
