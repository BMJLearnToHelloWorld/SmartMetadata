<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Tabs } from 'ant-design-vue';
import { permissionFlags } from '@/api/permissions';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
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
import {
  getResourceEntityFromServiceCategory,
  getServiceNameForTab,
  startCase,
} from '@/settings/serviceCategoryResources';
import { resolveServiceTab, type ListableServiceKind } from '@/router/serviceTabSegments';
import { serviceCategoryByKind } from '@/ingestion/serviceCategories';
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
 * serviceName).
 *
 * The pin in-page view-permission gate (DESIGN §6.4 页内视图门,
 * §6A GAP-HUB-1→(a)) is implemented below the `none` route guard:
 * the gate checks ViewBasic/ViewAll on the resource for the raw
 * `:tab` segment (ServicesPage.tsx:90-100, `hasViewPermissions` in
 * PermissionsUtils.ts:160-165) and, while the permission is
 * unloaded or denied, renders only the bare PermissionPlaceholder
 * — no breadcrumb, no inner Tabs (ServicesPage.tsx:171-172,
 * 201-212). The resource lookup runs on the raw segment, so tabs
 * absent from the pin map (including `dataObservability`) check the
 * database-service permission via the pin fallback.
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

/** Pin `serviceName` for the current tab (drives the gate's permissionValue). */
const serviceName = computed(() => getServiceNameForTab(kindSegment.value));

/**
 * Pin `viewAllPermission` (ServicesPage.tsx:90-100): the permission
 * must have loaded and grant ViewBasic or ViewAll on the resource
 * for the raw tab segment. Unloaded and failed reads fail closed
 * into the placeholder, as pin's empty-permissions check does. The
 * watcher keys on the mapped resource, so tabs sharing a resource
 * (including every fallback tab) reuse the same loaded grant.
 */
const gateResourceKey = computed(() => getResourceEntityFromServiceCategory(kindSegment.value));
const viewPermissionLoaded = ref(false);
const viewPermissionGranted = ref(false);
let viewPermissionRun = 0;

/**
 * Pin `addServicePermission` (Services.tsx:243-251): Create on the
 * resource for the current tab's service category. It is derived from
 * the same single permission fetch as the view gate (D-17): the header
 * Add Service button renders only when it holds, and the button lands
 * on that category's own `/:serviceCategory/add-service` page.
 */
const canCreateService = ref(false);

async function loadViewPermission(run: number): Promise<void> {
  try {
    const ops = await permissionStore.getResourcePermission(gateResourceKey.value);
    if (run === viewPermissionRun) {
      viewPermissionGranted.value = permissionFlags(ops).hasViewAccess;
      canCreateService.value = permissionFlags(ops).canCreate;
      viewPermissionLoaded.value = true;
    }
  } catch {
    if (run === viewPermissionRun) {
      viewPermissionGranted.value = false;
      canCreateService.value = false;
      viewPermissionLoaded.value = false;
    }
  }
}

watch(
  gateResourceKey,
  () => {
    viewPermissionRun += 1;
    viewPermissionLoaded.value = false;
    viewPermissionGranted.value = false;
    canCreateService.value = false;
    void loadViewPermission(viewPermissionRun);
  },
  { immediate: true },
);

const viewAllPermission = computed(
  () => viewPermissionLoaded.value && viewPermissionGranted.value,
);

/** The current tab's ServiceCategory enum value (pin `serviceName`). */
const serviceCategoryEnumValue = computed(() => {
  const resolved = resolution.value;
  if (resolved === null || 'dataObservability' in resolved) {
    return undefined;
  }
  return serviceCategoryByKind(resolved.kind)?.enumValue;
});

function addService(): void {
  if (serviceCategoryEnumValue.value === undefined) {
    return;
  }
  void router.push({
    name: 'ingestion-service-add',
    params: { serviceCategory: serviceCategoryEnumValue.value },
  });
}

/**
 * Pin `permissionValue`: t('label.view-entity', { entity:
 * startCase(serviceName) }) — en "View Database Services", zh
 * "查看Database Services" (product key `label.viewEntity`).
 */
const permissionValue = computed(() =>
  t('label.viewEntity', { entity: startCase(serviceName.value) }),
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
  if (!viewAllPermission.value || resolved === null || 'dataObservability' in resolved) {
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

// The list loads only once the view gate passes (pin renders the
// Services content only in the permitted branch, so a denied tab
// issues no list request); the watcher re-runs when the gate resolves.
watch(
  [resolution, viewAllPermission],
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
    <PermissionPlaceholder v-if="!viewAllPermission" :permission-value="permissionValue" />
    <template v-else>
      <SmBreadcrumb :items="breadcrumbItems" />
      <div
        v-if="activeInnerTab === SERVICES_INNER_TAB && !isDataObservability && canCreateService"
        class="settings-services__header"
      >
        <Button type="primary" data-testid="add-service-button" @click="addService">
          {{ t('settings.services.addNewService') }}
        </Button>
      </div>
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
    </template>
  </PageLayout>
</template>
