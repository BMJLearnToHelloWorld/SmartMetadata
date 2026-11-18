<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official per-assetType searchFields / highlightFields editor.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {Alert, Button, Form, Input, InputNumber, Select, Space, Spin, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import {
  buildEntitySearchSettingsPayload,
  getEffectiveRankingConfiguration,
  getTypedSetting,
  settingAsSearch,
  updateSetting,
} from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { searchEntitySettingBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryDescription,
  registryTitle,
  searchSettingsEntityForSegment,
  type SettingsTranslator,
} from '@/settings/registry';
import type { AssetTypeConfiguration, SearchRankingConfiguration, SearchSettings } from '@/types/admin';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const full = ref<SearchSettings | null>(null);
const form = reactive<
  Pick<AssetTypeConfiguration, 'assetType' | 'searchFields' | 'highlightFields' | 'scoreMode' | 'boostMode'>
>({
  assetType: '',
  searchFields: [],
  highlightFields: [],
});
// Evaluated once from the loaded configuration, never recomputed from edits:
// the official effective ranking is a function of the loaded config only.
const effectiveRanking = ref<SearchRankingConfiguration | undefined>(undefined);

const tabSegment = computed(() => String(route.params.tab ?? ''));
const entityType = computed(() => searchSettingsEntityForSegment(tabSegment.value) ?? '');
// Pin EntitySearchSettings header is the category entry's label /
// description (entityData?.label / ?.description): the registry
// nested item for the segment. An unknown segment yields no item
// and renders an empty header, exactly like pin — never a throw,
// never a fallback to another entity (D-10).
const entityItem = computed(() =>
  findSettingsRegistryItem(`preferences.search-settings.${tabSegment.value}`),
);
const header = computed(() =>
  entityItem.value ? registryTitle(settingsTranslator, entityItem.value) : '',
);
const subHeader = computed(() =>
  entityItem.value ? registryDescription(settingsTranslator, entityItem.value) : '',
);
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    searchEntitySettingBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      tabSegment.value,
    ),
  ),
);

const fieldColumns = [
  { title: t('settings.searchPrefs.fieldName'), key: 'field', width: 240 },
  { title: t('settings.searchPrefs.boost'), key: 'boost', width: 140 },
  { title: '', key: 'actions', width: 90 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('searchSettings', settingAsSearch);
    full.value = cfg;
    const match = (cfg.assetTypeConfigurations ?? []).find((item) => item.assetType === entityType.value);
    if (!match) {
      effectiveRanking.value = undefined;
      errorMessage.value = t('settings.searchPrefs.entityMissing', { type: entityType.value });
      return;
    }
    effectiveRanking.value = getEffectiveRankingConfiguration(cfg, match);
    Object.assign(form, {
      assetType: match.assetType,
      searchFields: (match.searchFields ?? []).map((field) => ({ ...field })),
      highlightFields: [...(match.highlightFields ?? [])],
      scoreMode: match.scoreMode,
      boostMode: match.boostMode,
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed');
  } finally {
    loading.value = false;
  }
}

function addField(): void {
  form.searchFields = [...(form.searchFields ?? []), { field: '', boost: 1 }];
}

function removeField(index: number): void {
  form.searchFields?.splice(index, 1);
}

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
async function save(): Promise<void> {
  if (!full.value) return;
  saving.value = true;
  try {
    await updateSetting(
      'searchSettings',
      buildEntitySearchSettingsPayload(full.value, entityType.value, {
        searchFields: form.searchFields,
        highlightFields: form.highlightFields,
        scoreMode: form.scoreMode,
        boostMode: form.boostMode,
        ranking: effectiveRanking.value,
      }),
    );
    message.success(t('settings.searchPrefs.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function goBack(): void {
  void router.push({ name: 'settings-preferences-search' });
}

watch(entityType, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="search-entity-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader :header="header" :sub-header="subHeader" test-id="search-entity-settings" />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Space style="margin-bottom: 12px">
        <Button data-testid="search-entity-back" @click="goBack">{{ t('settings.searchPrefs.back') }}</Button>
        <Button data-testid="search-entity-add-field" @click="addField">{{ t('settings.searchPrefs.addField') }}</Button>
        <Button type="primary" :loading="saving" data-testid="search-entity-save" @click="save">
          {{ t('settings.searchPrefs.save') }}
        </Button>
      </Space>

      <Form layout="vertical">
        <Form.Item :label="t('settings.searchPrefs.highlightFields')">
          <Select
            v-model:value="form.highlightFields"
            mode="tags"
            style="width: 100%"
            data-testid="search-highlight-fields"
          />
        </Form.Item>
      </Form>

      <SmTable
        row-key="__idx"
        :columns="fieldColumns"
        :data-source="(form.searchFields ?? []).map((row, index) => ({ ...row, __idx: index }))"
        :pagination="false"
        test-id="search-fields-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'field'">
            <Input v-model:value="form.searchFields![(record as { __idx: number }).__idx].field" />
          </template>
          <template v-else-if="column.key === 'boost'">
            <InputNumber
              v-model:value="form.searchFields![(record as { __idx: number }).__idx].boost"
              :min="0"
              :step="0.1"
            />
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button type="link" danger @click="removeField((record as { __idx: number }).__idx)">
              {{ t('settings.searchPrefs.remove') }}
            </Button>
          </template>
        </template>
      </SmTable>
    </Spin>
  </div>
</template>
