<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, message } from 'ant-design-vue';
import { createTestSuite, listTestSuites } from '@/api/testSuites';
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
import type { TestSuite } from '@/types/quality';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suites = ref<TestSuite[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testSuites.suiteType'), key: 'basic', width: 110 },
  { title: t('quality.testSuites.tests'), key: 'tests', width: 90 },
  { title: t('quality.testSuites.failed'), key: 'failed', width: 90 },
  { title: t('quality.testSuites.success'), key: 'success', width: 90 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestSuites({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
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
    const created = await createTestSuite({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
    });
    createOpen.value = false;
    message.success(t('quality.testSuites.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('quality.testSuites.title')"
    :lead="t('quality.testSuites.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="suites"
    table-test-id="test-suites-table"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
    @edit="(record) => router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-test-suite" @click="createOpen = true">
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
        {{ (record as TestSuite).tests.length }}
      </template>
      <template v-else-if="column.key === 'failed'">
        {{ (record as TestSuite).summary?.failed ?? '—' }}
      </template>
      <template v-else-if="column.key === 'success'">
        {{ (record as TestSuite).summary?.success ?? '—' }}
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
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
    </Form>
  </Modal>
</template>
