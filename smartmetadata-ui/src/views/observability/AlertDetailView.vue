<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Descriptions, Table } from 'ant-design-vue';
import { getEventSubscription } from '@/api/eventSubscriptions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { EventSubscription } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const alert = ref<EventSubscription | null>(null);
const activeTab = ref('overview');

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('observability.alerts.title'), to: { name: 'observability-alerts' } },
  { label: entityLabel(alert.value) || t('observability.alerts.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'alert-tab-overview' },
  { key: 'destinations', label: t('observability.alerts.destinationsTab'), testId: 'alert-tab-destinations' },
]);

const destinationColumns = computed<EntityListColumn[]>(() => [
  { title: t('observability.alerts.category'), dataIndex: 'category', key: 'category' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type' },
  { title: t('observability.alerts.endpoint'), dataIndex: 'endpoint', key: 'endpoint' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    alert.value = await getEventSubscription(props.id);
  } catch (error) {
    alert.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(alert) || t('observability.alerts.title')"
    :name="alert?.name"
    :fqn="alert?.fullyQualifiedName"
    :lead="t('observability.alerts.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!alert && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="alert ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #overview>
      <Descriptions v-if="alert" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ alert.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('observability.alerts.type')">{{ alert.alertType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.enabled')">
          {{ alert.enabled === false ? t('crud.no') : t('crud.yes') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ alert.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #destinations>
      <Table
        v-if="alert"
        row-key="type"
        size="small"
        :columns="destinationColumns"
        :data-source="alert.destinations"
        :pagination="false"
      />
    </template>
  </EntityDetailShell>
</template>
