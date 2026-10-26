<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Descriptions, Table } from 'ant-design-vue';
import { getPolicy } from '@/api/policies';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { AdminPolicy, PolicyRule } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const policy = ref<AdminPolicy | null>(null);
const activeTab = ref('overview');

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.policies.title'), to: { name: 'admin-policies' } },
  { label: entityLabel(policy.value) || t('admin.policies.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'policy-tab-overview' },
  { key: 'rules', label: t('admin.policies.rulesTab'), testId: 'policy-tab-rules' },
  { key: 'roles', label: t('admin.policies.rolesTab'), testId: 'policy-tab-roles' },
  { key: 'teams', label: t('admin.policies.teamsTab'), testId: 'policy-tab-teams' },
]);

const ruleColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.policies.effect'), dataIndex: 'effect', key: 'effect', width: 100 },
  { title: t('admin.policies.operations'), key: 'operations' },
  { title: t('admin.policies.resources'), key: 'resources' },
  { title: t('admin.policies.condition'), dataIndex: 'condition', key: 'condition' },
]);

const refColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 100 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    policy.value = await getPolicy(props.id);
  } catch (error) {
    policy.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => props.id,
  () => {
    void load();
  },
);
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(policy) || t('admin.policies.title')"
    :name="policy?.name"
    :lead="t('admin.policies.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!policy && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="policy ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #overview>
      <Descriptions v-if="policy" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ policy.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ policy.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.enabled')">
          {{
            policy.enabled === undefined
              ? '—'
              : policy.enabled
                ? t('settings.system.enabled')
                : t('settings.system.disabled')
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(policy.owners) || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #rules>
      <Table
        row-key="name"
        data-testid="policy-rules-table"
        :columns="ruleColumns"
        :data-source="policy?.rules ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'operations'">
            {{ (record as PolicyRule).operations.join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'resources'">
            {{ (record as PolicyRule).resources.join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'condition'">
            {{ (record as PolicyRule).condition || '—' }}
          </template>
        </template>
      </Table>
    </template>
    <template #roles>
      <Table
        row-key="id"
        data-testid="policy-roles-table"
        :columns="refColumns"
        :data-source="policy?.roles ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'admin-role', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </Table>
    </template>
    <template #teams>
      <Table
        row-key="id"
        data-testid="policy-teams-table"
        :columns="refColumns"
        :data-source="policy?.teams ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'admin-team', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
</template>
