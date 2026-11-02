<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { createRole, listRoles, searchRoles } from '@/api/roles';
import { listPolicies } from '@/api/policies';
import FormModal from '@/components/shared/FormModal.vue';
import { Button, Form, Input, Select, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  joinRefNames,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { AdminRole } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const roles = ref<AdminRole[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const query = ref('');
const createOpen = ref(false);
const creating = ref(false);
const policies = ref<{ id: string; name: string }[]>([]);
const createForm = reactive({ name: '', displayName: '', description: '', policyIds: [] as string[] });

async function openCreate(): Promise<void> {
  createOpen.value = true;
  try {
    const page = await listPolicies({ limit: 100 });
    policies.value = page.data.filter((item) => item.id).map((item) => ({ id: item.id as string, name: item.name }));
  } catch {
    policies.value = [];
  }
}

async function onCreate(): Promise<void> {
  if (!createForm.name.trim()) {
    return;
  }
  creating.value = true;
  try {
    const created = await createRole({
      name: createForm.name.trim(),
      displayName: createForm.displayName.trim() || undefined,
      description: createForm.description.trim() || undefined,
      policies: createForm.policyIds,
    });
    createOpen.value = false;
    message.success(t('admin.roles.created', { name: created.name }));
    createForm.name = '';
    createForm.displayName = '';
    createForm.description = '';
    createForm.policyIds = [];
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.roles.createFailed'));
  } finally {
    creating.value = false;
  }
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.roles.policies'), key: 'policies' },
  { title: t('admin.roles.users'), key: 'users', width: 90 },
  { title: t('admin.roles.teams'), key: 'teams', width: 90 },
]);

const searching = computed(() => query.value.trim().length > 0);
const hasNext = computed(() => (searching.value ? false : canGoNext(pageAfter.value)));
const hasPrev = computed(() => (searching.value ? false : canGoPrev(cursor.value)));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (searching.value) {
      const page = await searchRoles(query.value.trim(), DEFAULT_PAGE_SIZE);
      roles.value = page.data;
      total.value = page.total;
      pageAfter.value = undefined;
    } else {
      const page = await listRoles(DEFAULT_PAGE_SIZE, cursor.value.after);
      roles.value = page.data;
      total.value = page.total;
      pageAfter.value = page.after;
    }
  } catch (error) {
    roles.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  cursor.value = resetCursor();
  void load();
}

function onNext(): void {
  if (searching.value || !pageAfter.value) {
    return;
  }
  cursor.value = goNext(cursor.value, pageAfter.value);
  void load();
}

function onPrev(): void {
  if (searching.value) {
    return;
  }
  cursor.value = goPrev(cursor.value);
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.roles.title')"
    :lead="t('admin.roles.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="roles"
    table-test-id="admin-roles-table"
    show-row-actions
    show-search
    :search-value="query"
    :search-placeholder="t('admin.roles.searchPlaceholder')"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @update:search-value="query = $event"
    @search="onSearch"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'admin-role', params: { id: (record as AdminRole).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-role" @click="openCreate">
        {{ t('admin.roles.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`role-row-${(record as AdminRole).id}`"
          @click.prevent="router.push({ name: 'admin-role', params: { id: (record as AdminRole).id } })"
        >
          {{ entityLabel(record as AdminRole) }}
        </a>
      </template>
      <template v-else-if="column.key === 'policies'">
        {{ joinRefNames((record as AdminRole).policies) || '—' }}
      </template>
      <template v-else-if="column.key === 'users'">
        {{ (record as AdminRole).users.length }}
      </template>
      <template v-else-if="column.key === 'teams'">
        {{ (record as AdminRole).teams.length }}
      </template>
    </template>
  </EntityListShell>
  <FormModal
    :open="createOpen"
    :title="t('admin.roles.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
    @cancel="createOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')">
        <Input v-model:value="createForm.name" data-testid="create-role-name" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="createForm.displayName" data-testid="create-role-display-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="createForm.description" data-testid="create-role-description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('admin.roles.policies')">
        <Select
          v-model:value="createForm.policyIds"
          mode="multiple"
          data-testid="create-role-policies"
          style="width: 100%"
          :options="policies.map((item) => ({ value: item.id, label: item.name }))"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>