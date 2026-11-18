<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Tabs } from 'ant-design-vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { SERVICE_LIST_API } from '@/ingestion/serviceApis';
import { usePermissionStore } from '@/stores/permissions';
import type { CatalogService } from '@/types/ingestion';
import type { EntityListColumn } from '@/features/crud/types';
import {
  getSettingPageBreadcrumbs,
  buildSettingsBreadcrumbCatalog,
  servicesTabEntityName,
  toSmBreadcrumbItems,
} from '@/settings/breadcrumbs';
import { settingsLocationResolver } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  type SettingsTranslator,
} from '@/settings/registry';
import { resolveServiceTab, type ListableServiceKind } from '@/router/serviceTabSegments';
import PipelinesListView from '@/views/ingestion/PipelinesListView.vue';

/**
 * Settings services list page (DESIGN §6.4), the product equivalent of
 * official `ServicesPage.tsx` (pin a3012259ca): the `:tab` segment is
 * URL-driven (a SERVICE_CATEGORY mapping key, a ServiceCategory enum
 * value, or `dataObservability`; anything else — including `llm`/`mcp`
 * — replaces to the not-found route, D-18/D-10), and the inner
 * Services/Pipelines tabs are driven by `?tab=`. There is no `all`/kind
 * tab set, no show-deleted switch, no health filter, and `?health=` is
 * not consumed: the aggregate list (ServicesListView) stays staged and
 * untouched. The breadcrumb follows the pin `capitalize(tab)` rule,
 * with the Data Observability label for that tab.
 *
 * The Pipelines tab embeds PipelinesListView as a controlled
 * content component: the scope prop is the resolved kind, or
 * `testSuites` for the Data Observability tab (pin ServicesPage
 * serviceName). The pin in-page
 * view-permission gate (ServicesPage.tsx:85-93, 200-211) is NOT
 * implemented: DESIGN §6.4/§10.2 specify only the `none` route guard,
 * and adding the gate would invent behaviour beyond the approved
 * contract — flagged as an open pin gap for the coordinator.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

const translate: SettingsTranslator = (key, params) => t(key, params ?? {});

const SERVICES_INNER_TAB = 'services';
const PIPELINES_INNER_TAB = 'pipelines';

const kindSegment = computed(() => {
  const raw = route.params.tab;
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
});

const resolution = computed(() => resolveServiceTab(kindSegment.value));

watch(
  resolution,
  (value) => {
    if (value === null && route.name !== 'not-found') {
      void router.replace({ name: 'not-found' });
    }
  },
  { immediate: true },
);

const isDataObservability = computed(
  () => resolution.value !== null && 'dataObservability' in resolution.value,
);

/** Pipelines scope: null while the segment is unresolved (the watcher above replaces to not-found). */
const pipelineScope = computed<ListableServiceKind | 'testSuites' | null>(() => {
  const resolved = resolution.value;
  if (resolved === null) {
    return null;
  }
  return 'dataObservability' in resolved ? 'testSuites' : resolved.kind;
});

const breadcrumbItems = computed(() => {
  const catalog = buildSettingsBreadcrumbCatalog(
    'settings.title',
    SETTINGS_BREADCRUMB_NAMES,
    translate,
  );
  const entityName = servicesTabEntityName(
    kindSegment.value,
    t('settings.registry.services.dataObservability.title'),
  );
  return toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(catalog, settingsLocationResolver, 'services', entityName),
  );
});

/** Pin tabItems: Services except dataObservability, Pipelines admin-only. */
const tabItems = computed(() => {
  const items: { key: string; label: string }[] = [];
  if (!isDataObservability.value) {
    items.push({ key: SERVICES_INNER_TAB, label: t('settings.services.servicesTab') });
  }
  if (permissionStore.isAdminUser) {
    items.push({ key: PIPELINES_INNER_TAB, label: t('settings.services.pipelinesTab') });
  }
  return items;
});

/** Pin `getRenderedActiveTab`: the query tab if rendered, else the first item. Null when no tab renders. */
const activeInnerTab = computed(() => {
  if (tabItems.value.length === 0) {
    return null;
  }
  const queryTab = route.query.tab;
  const queryValue = Array.isArray(queryTab) ? queryTab[0] : queryTab;
  if (typeof queryValue === 'string' && tabItems.value.some((item) => item.key === queryValue)) {
    return queryValue;
  }
  return tabItems.value[0].key;
});

function switchInnerTab(key: string): void {
  void router.replace({ query: { tab: key } });
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.services.kind'), dataIndex: 'kind', key: 'kind', width: 120 },
  { title: t('crud.type'), dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

const services = ref<CatalogService[]>([]);
const servicesLoading = ref(false);
const servicesError = ref('');
let servicesRun = 0;

async function loadServices(run: number): Promise<void> {
  const resolved = resolution.value;
  if (resolved === null || 'dataObservability' in resolved) {
    services.value = [];
    servicesLoading.value = false;
    return;
  }
  servicesLoading.value = true;
  servicesError.value = '';
  try {
    const page = await SERVICE_LIST_API[resolved.kind]({ limit: 100, include: 'non-deleted' });
    if (run === servicesRun) {
      services.value = page.data;
    }
  } catch (error) {
    if (run === servicesRun) {
      services.value = [];
      servicesError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (run === servicesRun) {
      servicesLoading.value = false;
    }
  }
}

watch(
  resolution,
  () => {
    servicesRun += 1;
    void loadServices(servicesRun);
  },
  { immediate: true },
);

function openService(record: CatalogService): void {
  void router.push({ name: 'ingestion-service', params: { kind: record.kind, id: record.id } });
}

function serviceRow(record: CatalogService) {
  return { onClick: () => openService(record) };
}
</script>

<template>
  <PageLayout test-id="settings-services">
    <SmBreadcrumb :items="breadcrumbItems" />
    <Tabs
      v-if="tabItems.length > 0"
      :active-key="activeInnerTab ?? undefined"
      data-testid="settings-services-tabs"
      @change="switchInnerTab(String($event))"
    >
      <Tabs.TabPane v-for="item in tabItems" :key="item.key" :tab="item.label" />
    </Tabs>
    <template v-if="activeInnerTab === SERVICES_INNER_TAB && !isDataObservability">
      <Alert v-if="servicesError" type="error" :message="servicesError" show-icon />
      <SmTable
        :columns="columns"
        :data-source="services"
        :loading="servicesLoading"
        :custom-row="serviceRow"
        :pagination="false"
        test-id="settings-services-table"
      />
    </template>
    <PipelinesListView v-else-if="activeInnerTab === PIPELINES_INNER_TAB && pipelineScope !== null" :kind-filter="pipelineScope" />
  </PageLayout>
</template>
