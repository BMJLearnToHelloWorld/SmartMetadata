<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official SearchSettingsPage: immediate-save global toggles
  and numeric settings, term and field-value boosts, entity cards,
  and the admin-only reset. Every save is a single-key PUT whose
  response becomes the new state; there is no batch Save button.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Collapse, Modal, Row, Switch, Typography, message } from 'ant-design-vue';
import {
  buildSearchSettingsPayload,
  getTypedSetting,
  restoreSettingsConfig,
  settingAsSearch,
  updateSetting,
} from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import { usePermissionStore } from '@/stores/permissions';
import type {
  SearchFieldValueBoost,
  SearchSettings,
  SearchTermBoost,
} from '@/types/admin';
import FieldValueBoostDialog from './FieldValueBoostDialog.vue';
import FieldValueBoostList from './FieldValueBoostList.vue';
import GlobalSettingItem from './GlobalSettingItem.vue';
import SearchEntityIcon from './SearchEntityIcon.vue';
import TermBoostList from './TermBoostList.vue';
import {
  GLOBAL_SETTING_PROPERTIES,
  SEARCH_ENTITY_SEGMENTS,
  isCompleteTermBoost,
} from './searchSettingsConstants';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.search-settings');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.search-settings');
}
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'preferences',
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
const router = useRouter();
const permissionStore = usePermissionStore();

const searchConfig = ref<SearchSettings | null>(null);
const isLoading = ref(true);
const isUpdating = ref(false);
const termBoostsChanged = ref(false);
const showNewTermBoost = ref(false);
const showFieldValueBoostModal = ref(false);
const selectedFieldValueBoost = ref<SearchFieldValueBoost | undefined>(undefined);
const showColumnIndexingConfirm = ref(false);
const showResetConfirm = ref(false);
const isResetting = ref(false);

const isAdminUser = computed(() => permissionStore.isAdminUser);
const globalSettings = computed(() => searchConfig.value?.globalSettings);
const isAccessControlEnabled = computed(() => Boolean(globalSettings.value?.enableAccessControl));
const isColumnIndexingEnabled = computed(() => globalSettings.value?.enableColumnIndexing ?? true);
const termBoosts = computed(() => globalSettings.value?.termBoosts ?? []);
const fieldValueBoosts = computed(() => globalSettings.value?.fieldValueBoosts ?? []);
const fieldOptions = computed(
  () =>
    searchConfig.value?.allowedFieldValueBoosts?.[0]?.fields?.map((field) => field.name) ?? [],
);

async function load(): Promise<void> {
  isLoading.value = true;
  try {
    searchConfig.value = await getTypedSetting('searchSettings', settingAsSearch);
    termBoostsChanged.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

async function handleUpdateSearchConfig(options: {
  field?: string;
  value?: unknown;
  enabled?: boolean;
  successMessage?: string;
}): Promise<void> {
  if (!searchConfig.value) {
    return;
  }
  const field = options.field ?? 'enableAccessControl';
  const value = options.enabled === undefined ? options.value : options.enabled;
  try {
    isUpdating.value = true;
    const updated = {
      ...searchConfig.value,
      globalSettings: {
        ...searchConfig.value.globalSettings,
        [field]: value,
      },
    };
    const response = await updateSetting(
      'searchSettings',
      buildSearchSettingsPayload(updated),
    );
    searchConfig.value = settingAsSearch(response.configValue);
    if (field === 'termBoosts') {
      termBoostsChanged.value = false;
    }
    message.success(options.successMessage ?? t('settings.searchPrefs.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    isUpdating.value = false;
  }
}

function handleColumnIndexingToggle(): void {
  if (isColumnIndexingEnabled.value) {
    showColumnIndexingConfirm.value = true;
    return;
  }
  void handleUpdateSearchConfig({
    field: 'enableColumnIndexing',
    enabled: true,
    successMessage: t('settings.searchPrefs.columnIndexingEnabledReindex'),
  });
}

async function handleDisableColumnIndexing(): Promise<void> {
  await handleUpdateSearchConfig({ field: 'enableColumnIndexing', enabled: false });
  showColumnIndexingConfirm.value = false;
}

function handleTermBoostChange(termBoost: SearchTermBoost): void {
  if (!isCompleteTermBoost(termBoost)) {
    return;
  }
  const next = [...termBoosts.value];
  const index = next.findIndex((item) => item.value === termBoost.value);
  if (index >= 0) {
    next[index] = termBoost;
  } else {
    next.push(termBoost);
  }
  searchConfig.value = {
    ...searchConfig.value,
    globalSettings: { ...globalSettings.value, termBoosts: next },
  };
  showNewTermBoost.value = false;
  termBoostsChanged.value = true;
}

function handleTermBoostSave(): void {
  void handleUpdateSearchConfig({ field: 'termBoosts', value: termBoosts.value });
  termBoostsChanged.value = false;
  showNewTermBoost.value = false;
}

function handleDeleteTermBoost(value: string): void {
  if (!value) {
    showNewTermBoost.value = false;
    return;
  }
  void handleUpdateSearchConfig({
    field: 'termBoosts',
    value: termBoosts.value.filter((item) => item.value !== value),
  });
}

async function handleSaveFieldValueBoost(boost: SearchFieldValueBoost): Promise<void> {
  const next = [...fieldValueBoosts.value];
  const index = next.findIndex((item) => item.field === boost.field);
  if (index >= 0) {
    next[index] = boost;
  } else {
    next.push(boost);
  }
  await handleUpdateSearchConfig({ field: 'fieldValueBoosts', value: next });
  showFieldValueBoostModal.value = false;
}

function handleDeleteFieldValueBoost(field: string): void {
  void handleUpdateSearchConfig({
    field: 'fieldValueBoosts',
    value: fieldValueBoosts.value.filter((item) => item.field !== field),
  });
}

async function handleReset(): Promise<void> {
  try {
    isResetting.value = true;
    await restoreSettingsConfig('searchSettings');
    await load();
    message.success(t('settings.searchPrefs.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    isResetting.value = false;
    showResetConfirm.value = false;
  }
}

function openEntity(segment: string): void {
  void router.push({
    name: 'settings-preferences-search-entity',
    params: { tab: segment },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmBreadcrumb :items="breadcrumbItems" />
  <PreferencePageShell
    test-id="search-settings"
    :title="t('settings.searchPrefs.title')"
    :lead="t('settings.searchPrefs.lead')"
    :loading="isLoading"
  >
    <div class="search-settings">
      <div class="search-settings__toggles">
        <Card size="small" class="search-settings__toggle-card">
          <div class="search-settings__toggle-row">
            <Typography.Text>
              {{ t('settings.searchPrefs.enableRolesPoliciesInSearch') }}
            </Typography.Text>
            <Switch
              :checked="isAccessControlEnabled"
              :disabled="isUpdating"
              data-testid="enable-roles-polices-in-search-switch"
              @change="handleUpdateSearchConfig({ enabled: !isAccessControlEnabled })"
            />
          </div>
        </Card>
        <Card size="small" class="search-settings__toggle-card">
          <div class="search-settings__toggle-row">
            <Typography.Text>
              {{ t('settings.searchPrefs.enableColumnIndexing') }}
            </Typography.Text>
            <Switch
              :checked="isColumnIndexingEnabled"
              :disabled="isUpdating"
              :aria-label="t('settings.searchPrefs.enableColumnIndexing')"
              data-testid="enable-column-indexing-switch"
              @change="handleColumnIndexingToggle"
            />
          </div>
        </Card>
      </div>

      <Card size="small">
        <GlobalSettingItem
          v-for="property in GLOBAL_SETTING_PROPERTIES"
          :key="property.key"
          :label="t(property.labelKey)"
          :value="globalSettings?.[property.key] ?? 0"
          :min="property.min"
          :max="property.max"
          :on-update="(value) => handleUpdateSearchConfig({ field: property.key, value })"
        />
      </Card>

      <div class="search-settings__reset">
        <Button
          v-if="isAdminUser"
          danger
          :disabled="isUpdating"
          data-testid="reset-search-settings-btn"
          @click="showResetConfirm = true"
        >
          {{ t('settings.searchPrefs.reset') }}
        </Button>
      </div>

      <Collapse>
        <Collapse.Panel key="1" data-testid="term-boost-panel">
          <template #header>
            <span>{{ t('settings.searchPrefs.termBoost') }}</span>
            <Typography.Text type="secondary">
              ({{ termBoosts.length }})
            </Typography.Text>
          </template>
          <template #extra>
            <span class="search-settings__panel-actions" @click.stop>
              <Button
                type="primary"
                size="small"
                :disabled="!termBoostsChanged"
                data-testid="term-boost-save-btn"
                @click="handleTermBoostSave"
              >
                {{ t('settings.searchPrefs.save') }}
              </Button>
              <Button
                size="small"
                :disabled="isUpdating || showNewTermBoost"
                data-testid="term-boost-add-btn"
                @click="showNewTermBoost = true"
              >
                {{ t('settings.searchPrefs.add') }}
              </Button>
            </span>
          </template>
          <TermBoostList
            :term-boosts="termBoosts"
            :show-new-term-boost="showNewTermBoost"
            @change="handleTermBoostChange"
            @delete="handleDeleteTermBoost"
          />
        </Collapse.Panel>
        <Collapse.Panel key="2" data-testid="field-value-boost-panel">
          <template #header>
            <span>{{ t('settings.searchPrefs.fieldValueBoost') }}</span>
            <Typography.Text type="secondary">
              ({{ fieldValueBoosts.length }})
            </Typography.Text>
          </template>
          <template #extra>
            <span class="search-settings__panel-actions" @click.stop>
              <Button
                size="small"
                :disabled="isUpdating || showFieldValueBoostModal"
                data-testid="add-field-value-boost-btn"
                @click="
                  selectedFieldValueBoost = undefined;
                  showFieldValueBoostModal = true;
                "
              >
                {{ t('settings.searchPrefs.add') }}
              </Button>
            </span>
          </template>
          <FieldValueBoostList
            :field-value-boosts="fieldValueBoosts"
            :is-loading="isLoading"
            data-test-id="field-value-boost-table"
            @edit="
              selectedFieldValueBoost = $event;
              showFieldValueBoostModal = true;
            "
            @delete="handleDeleteFieldValueBoost"
          />
        </Collapse.Panel>
      </Collapse>

      <Row :gutter="[16, 16]" data-testid="search-entity-cards">
        <Col
          v-for="segment in SEARCH_ENTITY_SEGMENTS"
          :key="segment.segment"
          :xs="24"
          :sm="12"
          :md="8"
        >
          <Card
            hoverable
            :data-testid="`preferences.searchSettings.${segment.segment}`"
            @click="openEntity(segment.segment)"
          >
            <div class="search-settings__entity-card">
              <SearchEntityIcon :entity-type="segment.entityType" :size="40" />
              <Typography.Text strong>{{ t(segment.labelKey) }}</Typography.Text>
              <Typography.Paragraph
                :ellipsis="{ rows: 2 }"
                type="secondary"
                class="search-settings__entity-card-description"
              >
                {{
                  t('settings.searchPrefs.searchSettingsForEntity', {
                    entity: t(segment.labelKey),
                  })
                }}
              </Typography.Paragraph>
            </div>
          </Card>
        </Col>
      </Row>
    </div>

    <Modal
      :open="showColumnIndexingConfirm"
      :title="t('settings.searchPrefs.columnIndexing')"
      :ok-text="t('settings.searchPrefs.disable')"
      @cancel="showColumnIndexingConfirm = false"
      @ok="handleDisableColumnIndexing"
    >
      {{ t('settings.searchPrefs.disableColumnIndexingConfirmation') }}
    </Modal>

    <Modal
      :open="showResetConfirm"
      :title="t('settings.searchPrefs.reset')"
      :ok-text="t('settings.searchPrefs.reset')"
      :confirm-loading="isResetting"
      @cancel="showResetConfirm = false"
      @ok="handleReset"
    >
      {{ t('settings.searchPrefs.resetSearchSettingsConfirmation') }}
    </Modal>

    <FieldValueBoostDialog
      v-if="showFieldValueBoostModal"
      :boost="selectedFieldValueBoost"
      :field-options="fieldOptions"
      @save="handleSaveFieldValueBoost"
      @close="showFieldValueBoostModal = false"
    />
  </PreferencePageShell>
</template>

<style scoped>
.search-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-settings__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.search-settings__toggle-card {
  flex: 1 1 280px;
}

.search-settings__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.search-settings__reset {
  display: flex;
  justify-content: flex-end;
}

.search-settings__panel-actions {
  display: flex;
  gap: 8px;
}

.search-settings__entity-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-settings__entity-card-description {
  margin-bottom: 0;
}
</style>
