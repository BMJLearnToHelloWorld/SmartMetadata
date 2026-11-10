<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Tabs, message } from 'ant-design-vue';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import { getServicesOverview, type ServiceHealth, type ServiceSummary } from '@/api/services';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import {
  KIND_BY_ENTITY_TYPE,
  OVERVIEW_PARAMS,
} from '@/features/home/widgets/usePlatformHealth';
import { SERVICE_DELETE_API, SERVICE_LIST_API } from '@/ingestion/serviceApis';
import type { CatalogService, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const errorMessage = ref('');
const services = ref<CatalogService[]>([]);
const total = ref<number | undefined>();
const activeKind = ref<string>('all');

/**
 * The `?health=` filter the PlatformHealth widget links with (condition 8):
 * `failing` / `healthy` / `notRun`, the same three buckets the card counts.
 * An unknown value is no filter, never a broken page.
 * ADR:2026-11-08-my-data-services-health-filter
 */
type HealthFilter = 'failing' | 'healthy' | 'notRun';
const HEALTH_FILTER_TO_SERVICE_HEALTH: Record<HealthFilter, ServiceHealth> = {
  failing: 'failed',
  healthy: 'success',
  notRun: 'notRun',
};
const healthFilter = computed<HealthFilter | undefined>(() => {
  const value = route.query.health;
  return value === 'failing' || value === 'healthy' || value === 'notRun' ? value : undefined;
});
const healthCounts = ref<Record<HealthFilter, number>>({
  failing: 0,
  healthy: 0,
  notRun: 0,
});

const supportedCategories = computed(() => SERVICE_CATEGORIES.filter((row) => row.supported));
const filteredServices = computed(() =>
  activeKind.value === 'all' ? services.value : services.value.filter((item) => item.kind === activeKind.value),
);
const displayedTotal = computed(() =>
  activeKind.value === 'all' ? total.value : filteredServices.value.length,
);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.services.kind'), dataIndex: 'kind', key: 'kind', width: 120 },
  { title: t('crud.type'), dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (healthFilter.value) {
      // The health buckets come from the server's own tally — the overview
      // endpoint reduces every service's pipelines worst-wins. The page is
      // narrowed by health; the counts in the chips are estate-wide.
      const overview = await getServicesOverview({
        ...OVERVIEW_PARAMS,
        health: [HEALTH_FILTER_TO_SERVICE_HEALTH[healthFilter.value]],
        limit: 100,
      });
      services.value = overview.data.map((summary: ServiceSummary) => ({
        id: summary.id,
        name: summary.name,
        displayName: summary.displayName,
        description: summary.description,
        fullyQualifiedName: summary.fullyQualifiedName,
        kind: KIND_BY_ENTITY_TYPE[summary.entityType] ?? 'database',
        serviceType: summary.serviceType ?? '',
      }));
      total.value = overview.total;
      return;
    }
    const kinds = supportedCategories.value.map((row) => row.key as ServiceKind);
    const settled = await Promise.allSettled(kinds.map((kind) => SERVICE_LIST_API[kind]({ limit: 100 })));
    const pages = settled.map((result) =>
      result.status === 'fulfilled' ? result.value : { data: [], total: undefined },
    );
    services.value = pages.flatMap((page) => page.data);
    total.value = pages.every((page) => page.total !== undefined)
      ? pages.reduce((sum, page) => sum + (page.total ?? 0), 0)
      : undefined;
    if (settled.every((result) => result.status === 'rejected')) {
      const first = settled.find((item) => item.status === 'rejected') as PromiseRejectedResult;
      throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
    }
  } catch (error) {
    services.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadHealthCounts(): Promise<void> {
  try {
    const overview = await getServicesOverview(OVERVIEW_PARAMS);
    const sum = (health: ServiceHealth): number =>
      Object.values(overview.healthCounts ?? {}).reduce(
        (acc, byHealth) => acc + (byHealth[health] ?? 0),
        0,
      );
    healthCounts.value = {
      failing: sum('failed'),
      healthy: sum('success'),
      notRun: sum('notRun'),
    };
  } catch {
    healthCounts.value = { failing: 0, healthy: 0, notRun: 0 };
  }
}

function setHealthFilter(filter: HealthFilter | undefined): void {
  void router.replace({
    name: 'ingestion-services',
    query: filter ? { health: filter } : {},
  });
}

function openDetail(service: CatalogService): void {
  void router.push({
    name: 'ingestion-service',
    params: { kind: service.kind, id: service.id },
  });
}

async function onDelete(service: CatalogService): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.services.deleteConfirm', { name: service.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await SERVICE_DELETE_API[service.kind](service.id);
    message.success(t('ingestion.services.deleted', { name: service.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
  void loadHealthCounts();
});

watch(healthFilter, () => {
  void load();
});
</script>

<template>
  <EntityListShell
    data-tour-step="services"
    data-tour-page
    :title="t('ingestion.services.title')"
    :lead="t('ingestion.services.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="filteredServices"
    table-test-id="services-table"
    show-row-actions
    show-edit-action
    show-delete-action
    :total="displayedTotal"
    @refresh="load"
    @view="openDetail($event as CatalogService)"
    @edit="openDetail($event as CatalogService)"
    @delete="onDelete($event as CatalogService)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-service-wizard" @click="router.push({ name: 'ingestion-service-add' })">
        {{ t('ingestion.services.createWizard') }}
      </Button>
    </template>
    <template #filters>
      <div class="services-list__health" data-testid="services-health-filter" role="group" :aria-label="t('ingestion.services.health')">
        <button
          type="button"
          class="services-list__health-chip"
          :class="{ 'services-list__health-chip--active': !healthFilter }"
          :aria-pressed="!healthFilter"
          data-testid="services-health-all"
          @click="setHealthFilter(undefined)"
        >
          {{ t('ingestion.services.allServices') }}
        </button>
        <button
          v-for="option in (['failing', 'healthy', 'notRun'] as const)"
          :key="option"
          type="button"
          class="services-list__health-chip"
          :class="{ 'services-list__health-chip--active': healthFilter === option }"
          :aria-pressed="healthFilter === option"
          :data-testid="`services-health-${option}`"
          @click="setHealthFilter(option)"
        >
          {{ t(`ingestion.services.health${option[0].toUpperCase()}${option.slice(1)}`) }} · {{ healthCounts[option] }}
        </button>
      </div>
      <Tabs :active-key="activeKind" data-testid="services-kind-tabs" @change="(key) => (activeKind = String(key))">
        <Tabs.TabPane key="all" :tab="t('ingestion.services.allKinds')" />
        <Tabs.TabPane
          v-for="row in supportedCategories"
          :key="row.key"
          :tab="t(row.labelKey)"
        />
      </Tabs>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`service-row-${(record as CatalogService).id}`"
          @click.prevent="openDetail(record as CatalogService)"
        >
          {{ entityLabel(record as CatalogService) }}
        </a>
      </template>
    </template>
  </EntityListShell>
</template>

<style scoped>
.services-list__health {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.services-list__health-chip {
  border: 1px solid #d9d9d9;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
}

.services-list__health-chip--active {
  border-color: #005587;
  color: #005587;
  font-weight: 600;
}
</style>
