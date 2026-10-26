<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createDataProduct, listDataProducts } from '@/api/dataProducts';
import { listDomains } from '@/api/domains';
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
  joinRefNames,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { DataProduct, Domain } from '@/types/governance';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const products = ref<DataProduct[]>([]);
const domains = ref<Domain[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  domainFqns: [] as string[],
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('governance.dataProducts.domains'), key: 'domains' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listDataProducts({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    products.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    products.value = [];
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
    const created = await createDataProduct({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      domains: form.domainFqns,
    });
    createOpen.value = false;
    message.success(t('governance.dataProducts.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
  void listDomains({ limit: 100 })
    .then((page) => {
      domains.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <EntityListShell
    :title="t('governance.dataProducts.title')"
    :lead="t('governance.dataProducts.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="products"
    table-test-id="data-products-table"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })"
    @edit="(record) => router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-data-product" @click="createOpen = true">
        {{ t('governance.dataProducts.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`data-product-row-${(record as DataProduct).id}`"
          @click.prevent="
            router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })
          "
        >
          {{ entityLabel(record as DataProduct) }}
        </a>
      </template>
      <template v-else-if="column.key === 'domains'">
        {{ joinRefNames((record as DataProduct).domains) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('governance.dataProducts.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-data-product-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.dataProducts.domains')" required>
        <Select v-model:value="form.domainFqns" mode="multiple" data-testid="create-data-product-domains">
          <Select.Option
            v-for="domain in domains"
            :key="domain.id"
            :value="domain.fullyQualifiedName || domain.name"
          >
            {{ entityLabel(domain) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
    </Form>
  </Modal>
</template>
