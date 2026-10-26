<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createDomain, listDomains } from '@/api/domains';
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
import { DOMAIN_TYPES, type Domain } from '@/types/governance';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
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
  domainType: 'Source-aligned',
  parent: undefined as string | undefined,
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'domainType', key: 'domainType', width: 180 },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('crud.parent'), key: 'parent' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listDomains({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    domains.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    domains.value = [];
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
    const created = await createDomain({
      name: form.name.trim(),
      description: form.description.trim(),
      domainType: form.domainType,
      displayName: form.displayName.trim() || undefined,
      parent: form.parent,
    });
    createOpen.value = false;
    message.success(t('governance.domains.created', { name: created.name }));
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
    :title="t('governance.domains.title')"
    :lead="t('governance.domains.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="domains"
    table-test-id="domains-table"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'governance-domain', params: { id: (record as Domain).id } })"
    @edit="(record) => router.push({ name: 'governance-domain', params: { id: (record as Domain).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-domain" @click="createOpen = true">
        {{ t('governance.domains.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`domain-row-${(record as Domain).id}`"
          @click.prevent="router.push({ name: 'governance-domain', params: { id: (record as Domain).id } })"
        >
          {{ entityLabel(record as Domain) }}
        </a>
      </template>
      <template v-else-if="column.key === 'parent'">
        {{ (record as Domain).parent?.name || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('governance.domains.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-domain-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.domains.type')" required>
        <Select v-model:value="form.domainType">
          <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('governance.domains.parentDomain')" :extra="t('governance.domains.parentDomainHelp')">
        <Select v-model:value="form.parent" allow-clear>
          <Select.Option
            v-for="domain in domains"
            :key="domain.id"
            :value="domain.fullyQualifiedName || domain.name"
          >
            {{ entityLabel(domain) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </Modal>
</template>
