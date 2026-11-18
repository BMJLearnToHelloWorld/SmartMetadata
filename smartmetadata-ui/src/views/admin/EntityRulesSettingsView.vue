<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official entityRulesSettings.entitySemantics toggles (Data Asset Rules).
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {Alert, Button, Spin, Switch, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { getTypedSetting, settingAsEntityRules, updateSetting } from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { dataAssetRulesBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { EntityRulesSettings, SemanticsRule } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.dataAssetRules');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.dataAssetRules');
}
const header = computed(() => registryTitle(settingsTranslator, registryEntry));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    dataAssetRulesBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      (entity) => t('settings.shell.entityConfiguration', { entity }),
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<EntityRulesSettings>({ entitySemantics: [] });

const columns = [
  { title: t('settings.entityRules.name'), dataIndex: 'name', key: 'name', width: 200 },
  { title: t('settings.entityRules.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.entityRules.entityType'), dataIndex: 'entityType', key: 'entityType', width: 140 },
  { title: t('settings.entityRules.enabled'), key: 'enabled', width: 120 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('entityRulesSettings', settingAsEntityRules);
    form.entitySemantics = [...(cfg.entitySemantics ?? [])];
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.entityRules.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('entityRulesSettings', {
      entitySemantics: form.entitySemantics.map((rule: SemanticsRule) => ({ ...rule })),
    });
    message.success(t('settings.entityRules.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.entityRules.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="entity-rules-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="entity-rules-settings"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <SmTable
        row-key="name"
        :columns="columns"
        :data-source="form.entitySemantics"
        :pagination="false"
        test-id="entity-semantics-table"
        style="margin-bottom: 16px"
      >
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'enabled'">
            <Switch v-model:checked="form.entitySemantics[index].enabled" />
          </template>
        </template>
      </SmTable>
      <Button type="primary" :loading="saving" data-testid="entity-rules-save" @click="save">
        {{ t('settings.entityRules.save') }}
      </Button>
    </Spin>
  </div>
</template>
