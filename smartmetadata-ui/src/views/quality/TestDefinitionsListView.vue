<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createTestDefinition, listTestDefinitions } from '@/api/testDefinitions';
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
import { TEST_DEFINITION_ENTITY_TYPES, TEST_PLATFORMS, type TestDefinition } from '@/types/quality';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const definitions = ref<TestDefinition[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  entityType: 'TABLE',
  testPlatforms: ['OpenMetadata'] as string[],
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testDefinitions.entityType'), dataIndex: 'entityType', key: 'entityType', width: 130 },
  { title: t('quality.testDefinitions.platforms'), key: 'testPlatforms' },
  {
    title: t('quality.testDefinitions.dimension'),
    dataIndex: 'dataQualityDimension',
    key: 'dataQualityDimension',
    width: 140,
  },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestDefinitions({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    definitions.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    definitions.value = [];
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
    const created = await createTestDefinition({
      name: form.name.trim(),
      entityType: form.entityType,
      testPlatforms: form.testPlatforms,
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
    });
    createOpen.value = false;
    message.success(t('quality.testDefinitions.created', { name: created.name }));
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
    :title="t('quality.testDefinitions.title')"
    :lead="t('quality.testDefinitions.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="definitions"
    table-test-id="test-definitions-table"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'quality-test-definition', params: { id: (record as TestDefinition).id } })"
    @edit="(record) => router.push({ name: 'quality-test-definition', params: { id: (record as TestDefinition).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-test-definition" @click="createOpen = true">
        {{ t('quality.testDefinitions.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`test-definition-row-${(record as TestDefinition).id}`"
          @click.prevent="
            router.push({ name: 'quality-test-definition', params: { id: (record as TestDefinition).id } })
          "
        >
          {{ entityLabel(record as TestDefinition) }}
        </a>
      </template>
      <template v-else-if="column.key === 'testPlatforms'">
        {{ (record as TestDefinition).testPlatforms.join(', ') || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('quality.testDefinitions.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-test-definition-name" />
      </Form.Item>
      <Form.Item :label="t('quality.testDefinitions.entityType')" required>
        <Select v-model:value="form.entityType" data-testid="create-test-definition-entity-type">
          <Select.Option v-for="type in TEST_DEFINITION_ENTITY_TYPES" :key="type" :value="type">
            {{ type }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('quality.testDefinitions.platforms')" required>
        <Select v-model:value="form.testPlatforms" mode="multiple">
          <Select.Option v-for="platform in TEST_PLATFORMS" :key="platform" :value="platform">
            {{ platform }}
          </Select.Option>
        </Select>
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
