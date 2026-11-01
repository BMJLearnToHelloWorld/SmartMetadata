<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, Modal, message } from 'ant-design-vue';
import { createGlossary, listGlossaries } from '@/api/glossaries';
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
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { Glossary } from '@/types/governance';
import PageHeader from '@/components/shared/PageHeader.vue';

/**
 * Stage 4: this page used to fetch one glossary and redirect to its
 * detail view. The official GlossaryPage is a list + left panel, so this
 * page is now a real list: cursor paging, row click into detail, and
 * the same create modal. The detail page keeps its own left list pane.
 */
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const glossaries = ref<Glossary[]>([]);
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
  { title: t('governance.glossaries.termCount'), key: 'termCount', width: 110 },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listGlossaries({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    glossaries.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    glossaries.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (!pageAfter.value) {
    return;
  }
  cursor.value = goNext(cursor.value, pageAfter.value);
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function onRefresh(): void {
  cursor.value = resetCursor();
  void load();
}

function openDetail(glossary: Glossary): void {
  if (!glossary.id) {
    return;
  }
  void router.push({ name: 'governance-glossary', params: { id: glossary.id } });
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createGlossary({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      mutuallyExclusive: form.mutuallyExclusive,
    });
    createOpen.value = false;
    message.success(t('governance.glossaries.created', { name: created.name }));
    if (created.id) {
      await router.push({ name: 'governance-glossary', params: { id: created.id } });
    } else {
      await load();
    }
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
  <PageHeader
    :header="t('governance.glossaries.title')"
    :sub-header="t('governance.glossaries.lead')"
    test-id="glossaries-header"
  />
  <EntityListShell
    :title="t('governance.glossaries.title')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="glossaries"
    table-test-id="glossaries-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    :empty-text="t('governance.glossaries.emptyList')"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => openDetail(record as Glossary)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-glossary" @click="createOpen = true">
        {{ t('governance.glossaries.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`glossary-row-${(record as Glossary).id}`"
          @click.prevent="openDetail(record as Glossary)"
        >
          {{ entityLabel(record as Glossary) }}
        </a>
      </template>
      <template v-else-if="column.key === 'termCount'">
        {{ (record as Glossary).termCount ?? '—' }}
      </template>
      <template v-else-if="column.key === 'description'">
        {{ (record as Glossary).description || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('governance.glossaries.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-glossary-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" data-testid="create-glossary-description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>
