<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Col, Row, Spin } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SettingItemCard from '@/components/shared/SettingItemCard.vue';
import {
  filterVisibleSettingsItems,
  loadAuthProvider,
} from '@/settings/permissionRules';
import {
  SETTINGS_REGISTRY,
  defaultSettingsPathForKey,
  resolveSettingsNavigation,
  type SettingsRegistryItem,
} from '@/settings/registry';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Settings Hub (DESIGN §5), the product equivalent of official
 * `GlobalSettingPage.tsx` (pin a3012259ca): one card per category from
 * the registry, in pin order, filtered by the two-stage `isProtected`
 * semantics (§5.2) through the live permission evaluator. The Hub has
 * no breadcrumbs. While the permission evaluation is in flight only a
 * loading state renders, never the full card set (§11.1); when the
 * filter leaves zero categories, the shared placeholder renders in
 * place of the header and the grid (§5.4). There is no residual
 * concept (§5.5).
 *
 * Card navigation resolves the registry-derived settings path through
 * the live router table and navigates by route name, so no route name
 * is hard-coded here.
 */
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();

/** Visible categories, or null while the permission evaluation is in flight. */
const visibleCategories = ref<readonly SettingsRegistryItem[] | null>(null);
let filterRun = 0;

const subHeader = computed(() =>
  t('settings.shell.hubDescription', { brandName: t('product.name') }),
);

async function loadVisibleCategories(run: number): Promise<void> {
  const filtered = await filterVisibleSettingsItems(SETTINGS_REGISTRY, {
    isAdminUser: permissionStore.isAdminUser,
    authProvider: await loadAuthProvider(),
    getResourceOps: (resourceKey) => permissionStore.getResourcePermission(resourceKey),
  });
  if (run === filterRun) {
    visibleCategories.value = filtered;
  }
}

watch(
  () => permissionStore.isAdminUser,
  () => {
    visibleCategories.value = null;
    filterRun += 1;
    void loadVisibleCategories(filterRun);
  },
  { immediate: true },
);

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
</script>

<template>
  <PageLayout test-id="settings-hub">
    <Spin v-if="visibleCategories === null" data-testid="settings-hub-loading" />
    <PermissionPlaceholder
      v-else-if="visibleCategories.length === 0"
      :permission-value="t('settings.title')"
    />
    <template v-else>
      <PageHeader
        :header="t('settings.title')"
        :sub-header="subHeader"
        learning-page-id="settings"
        test-id="settings-hub-title"
      />
      <Row :gutter="[20, 20]" class="settings-hub__grid" data-testid="settings-hub-grid">
        <Col v-for="category in visibleCategories" :key="category.key" :xs="24" :md="12" :lg="8">
          <SettingItemCard
            :data="category"
            :on-click="navigateToKey"
            class-name="global-setting-card"
          />
        </Col>
      </Row>
    </template>
  </PageLayout>
</template>

<style scoped>
.settings-hub__grid {
  margin-top: 20px;
}
</style>
