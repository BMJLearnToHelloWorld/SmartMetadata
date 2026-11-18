<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Col, Row, Skeleton, Spin, Tooltip } from 'ant-design-vue';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SettingItemCard from '@/components/shared/SettingItemCard.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import {
  getSettingPageBreadcrumbs,
  buildSettingsBreadcrumbCatalog,
  toSmBreadcrumbItems,
} from '@/settings/breadcrumbs';
import { settingsLocationResolver } from '@/settings/locationResolver';
import {
  canCreateAnyServiceCategory,
  filterVisibleSettingsItems,
  loadAuthProvider,
} from '@/settings/permissionRules';
import {
  SETTINGS_BREADCRUMB_NAMES,
  SETTINGS_REGISTRY,
  defaultSettingsPathForKey,
  registryDescription,
  registryTitle,
  resolveSettingsNavigation,
  sortSettingsItemsByRenderedTitle,
  type SettingsRegistryItem,
  type SettingsTranslator,
} from '@/settings/registry';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Settings category page (DESIGN §6), the product equivalent of official
 * `GlobalSettingCategoryPage.tsx` (pin a3012259ca): breadcrumb, category
 * header (no learning page id), and the entry cards on the same grid and
 * with the same card component as the Hub. Entry visibility is the same
 * `isProtected` filtering as the Hub, evaluated through the live
 * permission evaluator; an empty result renders the header and an empty
 * grid with no placeholder (D-12). An unknown `:category` renders the pin
 * empty page: breadcrumb with an empty name, an empty header, an empty
 * grid, no redirect (D-10).
 *
 * Navigation resolves the registry-derived settings path through the
 * live router table and navigates by route name, so no route name is
 * hard-coded here. Breadcrumb locations use the shared
 * `settingsLocationResolver` (DESIGN §3.6, R-CRUMB-7).
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

/** Pin `GlobalSettingsMenuCategory.SERVICES`: the only category with an Add Service button. */
const SERVICES_CATEGORY_KEY = 'services';

const translate: SettingsTranslator = (key, params) => t(key, params ?? {});

const category = computed(() => {
  const raw = route.params.category;
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
});

/** Raw registry lookup: the header renders even when no entry is visible (D-12). */
const categoryItem = computed(() =>
  SETTINGS_REGISTRY.find((entry) => entry.key === category.value),
);

const header = computed(() =>
  categoryItem.value ? registryTitle(translate, categoryItem.value) : '',
);
const subHeader = computed(() =>
  categoryItem.value ? registryDescription(translate, categoryItem.value) : '',
);

const breadcrumbItems = computed(() => {
  const catalog = buildSettingsBreadcrumbCatalog(
    'settings.title',
    SETTINGS_BREADCRUMB_NAMES,
    translate,
  );
  return toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(catalog, settingsLocationResolver, category.value),
  );
});

/** Visible entries, or null while the permission evaluation is in flight. */
const visibleItems = ref<readonly SettingsRegistryItem[] | null>(null);
let filterRun = 0;

async function loadVisibleItems(run: number): Promise<void> {
  const items = categoryItem.value?.items;
  if (!items) {
    if (run === filterRun) {
      visibleItems.value = [];
    }
    return;
  }
  const filtered = await filterVisibleSettingsItems(items, {
    isAdminUser: permissionStore.isAdminUser,
    authProvider: await loadAuthProvider(),
    getResourceOps: (resourceKey) => permissionStore.getResourcePermission(resourceKey),
  });
  if (run === filterRun) {
    visibleItems.value = filtered;
  }
}

watch(
  category,
  () => {
    visibleItems.value = null;
    filterRun += 1;
    void loadVisibleItems(filterRun);
  },
  { immediate: true },
);

const displayedItems = computed(() => {
  const items = visibleItems.value ?? [];
  if (!categoryItem.value?.sortByLabel) {
    return items;
  }
  return sortSettingsItemsByRenderedTitle(items, (key) =>
    t(key, { brandName: t('product.name') }),
  );
});

function navigateToKey(key: string): void {
  const target = resolveSettingsNavigation(key);
  if (!target) {
    return;
  }
  const resolved = router.resolve(defaultSettingsPathForKey(target.key));
  if (typeof resolved.name === 'string') {
    void router.push({ name: resolved.name, params: resolved.params });
  } else {
    void router.push(defaultSettingsPathForKey(target.key));
  }
}

/** Add Service button (DESIGN §6.4, pin `GlobalSettingCategoryPage.tsx:196-227`). */
const addServiceAllowed = ref(false);
const addServiceReady = ref(false);
let addServiceRun = 0;

async function loadAddServicePermission(run: number): Promise<void> {
  const allowed = await canCreateAnyServiceCategory((resourceKey) =>
    permissionStore.getResourcePermission(resourceKey),
  );
  if (run === addServiceRun) {
    addServiceAllowed.value = allowed;
    addServiceReady.value = true;
  }
}

watch(
  category,
  () => {
    if (category.value !== SERVICES_CATEGORY_KEY) {
      return;
    }
    addServiceRun += 1;
    void loadAddServicePermission(addServiceRun);
  },
  { immediate: true },
);

const addServiceTooltip = computed(() =>
  addServiceAllowed.value ? t('settings.services.addNewService') : t('crud.noPermissionForAction'),
);

function addService(): void {
  // D-17 coordination reading: the button navigates by route name to the
  // retained wizard route. The official `/:serviceCategory/add-service`
  // form and the button switch belong to the partition batch (atomic
  // handoff, DESIGN §4.5): the wizard view does not read the kind
  // parameter yet, so this batch must not reroute first.
  void router.push({ name: 'ingestion-service-add' });
}
</script>

<template>
  <PageLayout test-id="settings-category">
    <SmBreadcrumb :items="breadcrumbItems" />
    <div class="settings-category__header-row">
      <PageHeader :header="header" :sub-header="subHeader" test-id="settings-category-title" />
      <template v-if="category === SERVICES_CATEGORY_KEY">
        <Skeleton.Button v-if="!addServiceReady" active data-testid="add-service-skeleton" />
        <Tooltip v-else :title="addServiceTooltip" placement="left">
          <LimitWrapper
            v-if="addServiceAllowed"
            v-slot="{ limitReached }"
            resource="dataAssets"
          >
            <Button
              type="primary"
              data-testid="add-service-button"
              :disabled="limitReached"
              @click="addService"
            >
              {{ t('settings.services.addNewService') }}
            </Button>
          </LimitWrapper>
        </Tooltip>
      </template>
    </div>
    <Spin v-if="visibleItems === null" data-testid="settings-category-loading" />
    <Row v-else :gutter="[20, 20]" data-testid="settings-category-grid">
      <Col v-for="item in displayedItems" :key="item.key" :xs="24" :md="12" :lg="8">
        <SettingItemCard :data="item" :on-click="navigateToKey" class-name="global-setting-card" />
      </Col>
    </Row>
  </PageLayout>
</template>

<style scoped>
.settings-category__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
