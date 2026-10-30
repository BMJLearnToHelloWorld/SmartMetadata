<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official per-assetType searchFields / highlightFields editor.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Form, Input, InputNumber, Select, Space, Table, message } from 'ant-design-vue';
import { getTypedSetting, settingAsSearch, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { AssetTypeConfiguration, SearchSettings } from '@/types/admin';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const full = ref<SearchSettings | null>(null);
const form = reactive<AssetTypeConfiguration>({
  assetType: '',
  searchFields: [],
  highlightFields: [],
});

const entityType = computed(() => String(route.params.entityType ?? ''));

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
      errorMessage.value = t('settings.searchPrefs.entityMissing', { type: entityType.value });
      return;
    }
    Object.assign(form, {
      assetType: match.assetType,
      searchFields: [...(match.searchFields ?? [])],
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

async function save(): Promise<void> {
  if (!full.value) return;
  saving.value = true;
  try {
    const nextAssets = (full.value.assetTypeConfigurations ?? []).map((item) =>
      item.assetType === entityType.value
        ? {
            assetType: form.assetType,
            searchFields: form.searchFields,
            highlightFields: form.highlightFields,
            scoreMode: form.scoreMode,
            boostMode: form.boostMode,
          }
        : item,
    );
    await updateSetting('searchSettings', {
      ...full.value,
      assetTypeConfigurations: nextAssets,
    });
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
  <PreferencePageShell
    test-id="search-entity-settings"
    :title="t('settings.searchPrefs.entityTitle', { type: entityType })"
    :lead="t('settings.searchPrefs.entityLead')"
    :loading="loading"
    :error-message="errorMessage"
  >
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

    <Table
      row-key="__idx"
      :columns="fieldColumns"
      :data-source="(form.searchFields ?? []).map((row, index) => ({ ...row, __idx: index }))"
      :pagination="false"
      data-testid="search-fields-table"
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
    </Table>
  </PreferencePageShell>
</template>
