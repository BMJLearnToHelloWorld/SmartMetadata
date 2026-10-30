<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official SearchSettingsPage: global toggles + asset-type cards.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Form, InputNumber, Row, Switch, message } from 'ant-design-vue';
import { getTypedSetting, settingAsSearch, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { AssetTypeConfiguration, SearchSettings } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<SearchSettings>({
  globalSettings: {},
  assetTypeConfigurations: [],
});

const entityCards = computed(() => form.assetTypeConfigurations ?? []);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('searchSettings', settingAsSearch);
    form.globalSettings = { ...(cfg.globalSettings ?? {}) };
    form.assetTypeConfigurations = [...(cfg.assetTypeConfigurations ?? [])];
    form.defaultConfiguration = cfg.defaultConfiguration;
    form.allowedFields = cfg.allowedFields;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function saveGlobal(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('searchSettings', {
      globalSettings: {
        enableAccessControl: Boolean(form.globalSettings?.enableAccessControl),
        enableColumnIndexing: Boolean(form.globalSettings?.enableColumnIndexing),
        maxAggregateSize: form.globalSettings?.maxAggregateSize,
        maxResultHits: form.globalSettings?.maxResultHits,
        maxAnalyzedOffset: form.globalSettings?.maxAnalyzedOffset,
        highlightFields: form.globalSettings?.highlightFields,
        keywordWeight: form.globalSettings?.keywordWeight,
        semanticWeight: form.globalSettings?.semanticWeight,
        termBoosts: form.globalSettings?.termBoosts,
        fieldValueBoosts: form.globalSettings?.fieldValueBoosts,
        aggregations: form.globalSettings?.aggregations,
      },
      assetTypeConfigurations: form.assetTypeConfigurations,
      defaultConfiguration: form.defaultConfiguration,
      allowedFields: form.allowedFields,
    });
    message.success(t('settings.searchPrefs.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function openEntity(entity: AssetTypeConfiguration): void {
  if (!entity.assetType) return;
  void router.push({
    name: 'settings-preferences-search-entity',
    params: { entityType: entity.assetType },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="search-settings"
    :title="t('settings.searchPrefs.title')"
    :lead="t('settings.searchPrefs.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
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
      <Col v-for="entity in entityCards" :key="entity.assetType" :xs="24" :sm="12" :md="8">
        <Card hoverable :data-testid="`search-entity-${entity.assetType}`" @click="openEntity(entity)">
          <Card.Meta :title="entity.assetType" :description="t('settings.searchPrefs.editEntity')" />
        </Card>
      </Col>
    </Row>
  </PreferencePageShell>
</template>
