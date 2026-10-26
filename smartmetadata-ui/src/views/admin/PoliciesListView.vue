<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listPolicies } from '@/api/policies';
import EntityListShell from '@/features/crud/EntityListShell.vue';
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
import type { AdminPolicy } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const policies = ref<AdminPolicy[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.policies.rules'), key: 'rules', width: 90 },
  { title: t('admin.policies.roles'), key: 'roles', width: 90 },
  { title: t('admin.policies.teams'), key: 'teams', width: 90 },
  { title: t('crud.enabled'), key: 'enabled', width: 100 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listPolicies({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    policies.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    policies.value = [];
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

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.policies.title')"
    :lead="t('admin.policies.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="policies"
    table-test-id="admin-policies-table"
    show-row-actions
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'admin-policy', params: { id: (record as AdminPolicy).id } })"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`policy-row-${(record as AdminPolicy).id}`"
          @click.prevent="router.push({ name: 'admin-policy', params: { id: (record as AdminPolicy).id } })"
        >
          {{ entityLabel(record as AdminPolicy) }}
        </a>
      </template>
      <template v-else-if="column.key === 'rules'">
        {{ (record as AdminPolicy).rules.length }}
      </template>
      <template v-else-if="column.key === 'roles'">
        {{ (record as AdminPolicy).roles.length }}
      </template>
      <template v-else-if="column.key === 'teams'">
        {{ (record as AdminPolicy).teams.length }}
      </template>
      <template v-else-if="column.key === 'enabled'">
        {{
          (record as AdminPolicy).enabled === undefined
            ? '—'
            : (record as AdminPolicy).enabled
              ? t('settings.system.enabled')
              : t('settings.system.disabled')
        }}
      </template>
    </template>
  </EntityListShell>
</template>
