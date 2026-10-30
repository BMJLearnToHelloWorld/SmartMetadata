<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official entityRulesSettings.entitySemantics toggles (Data Asset Rules).
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Switch, Table, message } from 'ant-design-vue';
import { getTypedSetting, settingAsEntityRules, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { EntityRulesSettings, SemanticsRule } from '@/types/admin';

const { t } = useI18n();
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
  <PreferencePageShell
    test-id="entity-rules-settings"
    :title="t('settings.entityRules.title')"
    :lead="t('settings.entityRules.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Table
      row-key="name"
      :columns="columns"
      :data-source="form.entitySemantics"
      :pagination="false"
      data-testid="entity-semantics-table"
      style="margin-bottom: 16px"
    >
      <template #bodyCell="{ column, index }">
        <template v-if="column.key === 'enabled'">
          <Switch v-model:checked="form.entitySemantics[index].enabled" />
        </template>
      </template>
    </Table>
    <Button type="primary" :loading="saving" data-testid="entity-rules-save" @click="save">
      {{ t('settings.entityRules.save') }}
    </Button>
  </PreferencePageShell>
</template>
