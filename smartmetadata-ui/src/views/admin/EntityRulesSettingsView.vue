<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataAssetRules: three columns, description as a rich-text
  preview, enabled toggles that save immediately, the add/edit modal
  reachable only from the empty-list quick-add, and a delete
  confirmation modal that is built but has no trigger entries. Every
  save is a whole-table bulk PUT (A1 branch one) followed by a refetch.
  The rule editor is a textarea holding the verbatim JSONLogic string:
  no product QueryBuilder equivalent exists (see the report residual).
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PlusOutlined } from '@ant-design/icons-vue';
import { Button, Form, Input, Modal, Switch, Typography, message } from 'ant-design-vue';
import { getTypedSetting, settingAsEntityRules, updateSetting } from '@/api/system';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmTable from '@/components/shared/SmTable.vue';
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
import type { SemanticsRule } from '@/types/admin';

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

const rules = ref<SemanticsRule[]>([]);
const isLoading = ref(false);
const isSaveLoading = ref(false);
const addEditRule = ref<SemanticsRule | null>(null);
const deleteRule = ref<SemanticsRule | null>(null);

const tableLoading = computed(
  () => isLoading.value || (isSaveLoading.value && !addEditRule.value && !deleteRule.value),
);

const columns = computed(() => [
  { title: t('settings.entityRules.name'), dataIndex: 'name', key: 'name' },
  { title: t('settings.entityRules.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.entityRules.enabled'), dataIndex: 'enabled', key: 'enabled' },
]);

async function load(): Promise<void> {
  isLoading.value = true;
  try {
    const cfg = await getTypedSetting('entityRulesSettings', settingAsEntityRules);
    rules.value = [...(cfg.entitySemantics ?? [])];
  } catch (error) {
    // Official toasts here (with a copy-pasted email-configuration entity
    // label — not reproduced; see the implementation report) and leaves
    // the list empty, which renders the quick-add below.
    message.error(error instanceof Error ? error.message : t('settings.entityRules.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

async function updateRules(configValues: SemanticsRule[]): Promise<void> {
  try {
    isSaveLoading.value = true;
    await updateSetting('entityRulesSettings', { entitySemantics: configValues });
    await load();
    message.success(t('settings.entityRules.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.entityRules.saveFailed'));
    throw error;
  } finally {
    isSaveLoading.value = false;
  }
}

async function handleSave(values: SemanticsRule, previousName?: string): Promise<void> {
  let updated = [...rules.value];
  if (previousName && previousName !== values.name) {
    updated = updated.filter((rule) => rule.name !== previousName);
  }
  const existingIndex = updated.findIndex((rule) => rule.name === values.name);
  if (existingIndex > -1) {
    updated[existingIndex] = values;
  } else {
    updated.unshift(values);
  }
  await updateRules(updated);
  addEditRule.value = null;
}

function handleAdd(): void {
  addEditRule.value = { name: '', description: '', enabled: true, rule: '' };
}

async function onConfirmDelete(rule: SemanticsRule): Promise<void> {
  await updateRules(rules.value.filter((item) => item.name !== rule.name));
  deleteRule.value = null;
}

async function onToggle(record: SemanticsRule): Promise<void> {
  try {
    await handleSave({ ...record, enabled: !record.enabled });
  } catch {
    // The error toast already fired in updateRules; the switch is
    // controlled from data, so it stays on the stored value.
  }
}

// --- Add/edit form (seeded from the rule being edited) ---

const form = reactive({ name: '', description: '', rule: '' });
const saveAttempted = ref(false);

watch(addEditRule, (rule) => {
  if (rule) {
    form.name = rule.name ?? '';
    form.description = rule.description ?? '';
    form.rule = rule.rule ?? '';
    saveAttempted.value = false;
  }
});

const otherRules = computed(() =>
  rules.value.filter((rule) => rule.name !== addEditRule.value?.name),
);

function fieldError(field: 'name' | 'description' | 'rule'): string | null {
  const value = form[field];
  if (!value) {
    const labelKey =
      field === 'name'
        ? 'settings.entityRules.name'
        : field === 'description'
          ? 'settings.entityRules.description'
          : 'settings.entityRules.rule';
    return t('settings.entityRules.fieldRequired', { field: t(labelKey) });
  }
  if (field === 'name' && otherRules.value.some((rule) => rule.name === value)) {
    return t('settings.entityRules.nameAlreadyExists');
  }
  return null;
}

async function handleFormSave(): Promise<void> {
  saveAttempted.value = true;
  if (
    fieldError('name') !== null ||
    fieldError('description') !== null ||
    fieldError('rule') !== null
  ) {
    return;
  }
  const original = addEditRule.value;
  const values: SemanticsRule = {
    ...(original ?? { enabled: true }),
    name: form.name,
    description: form.description,
    rule: form.rule,
  };
  try {
    await handleSave(values, original?.name);
  } catch {
    // The error toast already fired in updateRules; the modal stays open
    // because addEditRule is only cleared after a successful save.
  }
}

void load();
</script>

<template>
  <div data-testid="entity-rules-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="entity-rules-settings"
    />
    <div data-testid="data-asset-rules-page">
      <div
        v-if="!isLoading && rules.length === 0"
        class="entity-rules-quick-add"
      >
        <span class="entity-rules-quick-add__icon"><PlusOutlined /></span>
        <Typography.Text>
          {{ t('settings.entityRules.quickAddMessage') }}
        </Typography.Text>
        <Button data-testid="add-widget-button" @click="handleAdd">
          <PlusOutlined />
          {{ t('settings.entityRules.add') }}
        </Button>
      </div>
      <SmTable
        v-else
        row-key="name"
        :columns="columns"
        :data-source="rules"
        :pagination="false"
        :loading="tableLoading"
        test-id="entity-semantics-table"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'description'">
            <SmMarkdown :markdown="(record as SemanticsRule).description ?? ''" />
          </template>
          <template v-else-if="column.key === 'enabled'">
            <Switch
              :checked="(record as SemanticsRule).enabled"
              @change="onToggle(rules[index])"
            />
          </template>
        </template>
      </SmTable>
    </div>

    <Modal
      :open="addEditRule !== null"
      :width="800"
      :title="addEditRule?.name ? t('settings.entityRules.editRule') : t('settings.entityRules.addRule')"
      :ok-text="t('settings.entityRules.save')"
      :confirm-loading="isSaveLoading"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      @cancel="addEditRule = null"
      @ok="handleFormSave"
    >
      <Form layout="vertical">
        <Form.Item
          :label="t('settings.entityRules.name')"
          required
          :validate-status="saveAttempted && fieldError('name') ? 'error' : ''"
          :help="saveAttempted ? (fieldError('name') ?? '') : ''"
        >
          <Input
            :value="form.name"
            data-testid="rule-name-input"
            :placeholder="t('settings.entityRules.name')"
            @update:value="form.name = $event"
          />
        </Form.Item>
        <Form.Item
          :label="t('settings.entityRules.description')"
          required
          :validate-status="saveAttempted && fieldError('description') ? 'error' : ''"
          :help="saveAttempted ? (fieldError('description') ?? '') : ''"
        >
          <Input.TextArea
            :value="form.description"
            data-testid="rule-description-input"
            :placeholder="t('settings.entityRules.description')"
            :rows="2"
            @update:value="form.description = $event"
          />
        </Form.Item>
        <Form.Item
          :label="t('settings.entityRules.rule')"
          required
          :validate-status="saveAttempted && fieldError('rule') ? 'error' : ''"
          :help="saveAttempted ? (fieldError('rule') ?? '') : ''"
        >
          <Input.TextArea
            :value="form.rule"
            data-testid="rule-input"
            :placeholder="t('settings.entityRules.rulePlaceholder')"
            :rows="6"
            @update:value="form.rule = $event"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      :open="deleteRule !== null"
      :title="t('settings.entityRules.deleteRule')"
      :ok-text="t('settings.entityRules.delete')"
      :confirm-loading="isSaveLoading"
      ok-type="danger"
      @cancel="deleteRule = null"
      @ok="deleteRule && onConfirmDelete(deleteRule)"
    >
      <p>
        {{ t('settings.entityRules.deleteConfirmation', { name: deleteRule?.name ?? '' }) }}
      </p>
    </Modal>
  </div>
</template>

<style scoped>
.entity-rules-quick-add {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.entity-rules-quick-add__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 24px;
  border: 1px solid var(--sm-border-color);
  border-radius: 50%;
}
</style>
