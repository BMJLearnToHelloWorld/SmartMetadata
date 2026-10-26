<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listRoles, searchRoles } from '@/api/roles';
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
  >
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
</template>
