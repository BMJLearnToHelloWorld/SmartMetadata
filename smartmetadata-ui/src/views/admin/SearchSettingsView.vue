<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official SearchSettingsPage: global toggles + asset-type cards.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Col, Form, InputNumber, Row, Spin, Switch, message } from 'ant-design-vue';
import { buildSearchSettingsPayload, getTypedSetting, settingAsSearch, updateSetting } from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SettingItemCard from '@/components/shared/SettingItemCard.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import { filterVisibleSettingsItems, loadAuthProvider } from '@/settings/permissionRules';
import {
  SETTINGS_BREADCRUMB_NAMES,
  defaultSettingsPathForKey,
  findSettingsRegistryItem,
  registryDescription,
  registryTitle,
  resolveSettingsNavigation,
  sortSettingsItemsByRenderedTitle,
  type SettingsRegistryItem,
  type SettingsTranslator,
} from '@/settings/registry';
import { usePermissionStore } from '@/stores/permissions';
import type { SearchSettings } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'preferences',
      t('settings.registry.preferences.searchSettings.breadcrumbName'),
    ),
  ),
);
const router = useRouter();
const permissionStore = usePermissionStore();
const registryEntry = findSettingsRegistryItem('preferences.search-settings');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.search-settings');
}
// Hoisted: narrowing does not survive into the `function` declaration
// below, so the nested items are captured here, in the narrowed scope.
const nestedItems = registryEntry.items ?? [];
const header = computed(() => registryTitle(settingsTranslator, registryEntry));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));

/**
 * Entity cards come from the registry nested items (§3.4/§6.3), not
 * from the loaded assetTypeConfigurations: the server list drives
 * only the save payload (ADR:2026-11-18-search-settings-save-preserves-unedited-fields).
 * Cards are permission-filtered with the Hub/Category context and
 * sorted by rendered title.
 */
const visibleItems = ref<readonly SettingsRegistryItem[] | null>(null);
let filterRun = 0;

async function loadVisibleItems(run: number): Promise<void> {
  const filtered = await filterVisibleSettingsItems(nestedItems, {
    isAdminUser: permissionStore.isAdminUser,
    authProvider: await loadAuthProvider(),
    getResourceOps: (resourceKey) => permissionStore.getResourcePermission(resourceKey),
  });
  if (run === filterRun) {
    visibleItems.value = filtered;
  }
}

watch(
  () => permissionStore.isAdminUser,
  () => {
    visibleItems.value = null;
    filterRun += 1;
    void loadVisibleItems(filterRun);
  },
  { immediate: true },
);

const displayedItems = computed(() => {
  const items = visibleItems.value ?? [];
  if (!registryEntry.sortByLabel) {
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

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<SearchSettings>({
  globalSettings: {},
  assetTypeConfigurations: [],
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('searchSettings', settingAsSearch);
    form.globalSettings = { ...(cfg.globalSettings ?? {}) };
    form.assetTypeConfigurations = [...(cfg.assetTypeConfigurations ?? [])];
    form.defaultConfiguration = cfg.defaultConfiguration;
    form.allowedFields = cfg.allowedFields;
    form.allowedFieldValueBoosts = cfg.allowedFieldValueBoosts;
    form.nlqConfiguration = cfg.nlqConfiguration;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed');
  } finally {
    loading.value = false;
  }
}

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
async function saveGlobal(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('searchSettings', buildSearchSettingsPayload(form));
    message.success(t('settings.searchPrefs.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="search-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader :header="header" :sub-header="subHeader" test-id="search-settings" />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.searchPrefs.enableAccessControl')">
          <Switch v-model:checked="form.globalSettings!.enableAccessControl" data-testid="search-access-control" />
        </Form.Item>
        <Form.Item :label="t('settings.searchPrefs.enableColumnIndexing')">
          <Switch v-model:checked="form.globalSettings!.enableColumnIndexing" data-testid="search-column-indexing" />
        </Form.Item>
        <Form.Item :label="t('settings.searchPrefs.maxAggregateSize')">
          <InputNumber v-model:value="form.globalSettings!.maxAggregateSize" :min="1" data-testid="search-max-aggregate" />
        </Form.Item>
        <Form.Item :label="t('settings.searchPrefs.maxResultHits')">
          <InputNumber v-model:value="form.globalSettings!.maxResultHits" :min="1" data-testid="search-max-hits" />
        </Form.Item>
        <Form.Item :label="t('settings.searchPrefs.maxAnalyzedOffset')">
          <InputNumber v-model:value="form.globalSettings!.maxAnalyzedOffset" :min="0" data-testid="search-max-offset" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="search-save-global" @click="saveGlobal">
          {{ t('settings.searchPrefs.save') }}
        </Button>
      </Form>

      <h3 style="margin-top: 24px">{{ t('settings.searchPrefs.entityTypes') }}</h3>
      <Row :gutter="[16, 16]" data-testid="search-entity-cards">
        <Col v-for="item in displayedItems" :key="item.key" :xs="24" :sm="12" :md="8">
          <SettingItemCard :data="item" :on-click="navigateToKey" />
        </Col>
      </Row>
    </Spin>
  </div>
</template>
