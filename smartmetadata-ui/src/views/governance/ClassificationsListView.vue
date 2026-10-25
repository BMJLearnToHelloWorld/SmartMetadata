<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, Modal, message } from 'ant-design-vue';
import { createClassification, listClassifications } from '@/api/classifications';
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
import type { Classification } from '@/types/governance';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const classifications = ref<Classification[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('governance.classifications.tags'), key: 'termCount', width: 90 },
  { title: t('governance.classifications.exclusive'), key: 'mutuallyExclusive', width: 110 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listClassifications({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    classifications.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    classifications.value = [];
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
    const created = await createClassification({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      mutuallyExclusive: form.mutuallyExclusive,
    });
    createOpen.value = false;
    message.success(t('governance.classifications.created', { name: created.name }));
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
    :title="t('governance.classifications.title')"
    :lead="t('governance.classifications.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="classifications"
    table-test-id="classifications-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
  >
    <template #actions>
      <Button type="primary" data-testid="create-classification" @click="createOpen = true">
        {{ t('governance.classifications.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`classification-row-${(record as Classification).id}`"
          @click.prevent="
            router.push({
              name: 'governance-classification',
              params: { id: (record as Classification).id },
            })
          "
        >
          {{ entityLabel(record as Classification) }}
        </a>
      </template>
      <template v-else-if="column.key === 'termCount'">
        {{ (record as Classification).termCount ?? '—' }}
      </template>
      <template v-else-if="column.key === 'mutuallyExclusive'">
        {{ (record as Classification).mutuallyExclusive ? t('crud.yes') : t('crud.no') }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('governance.classifications.createTitle')"
    :ok-text="t('crud.create')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="form.name" data-testid="create-classification-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.mutuallyExclusive">
          {{ t('governance.classifications.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>
