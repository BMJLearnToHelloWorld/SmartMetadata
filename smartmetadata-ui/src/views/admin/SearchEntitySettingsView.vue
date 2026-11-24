<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official EntitySearchSettings: the edit state seeds from the
  loaded entity configuration (a missing configuration renders the
  empty edit state and save is a no-op), edits stay local until the
  preview Save button persists them, and the preview always runs
  against the current edit state.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Dropdown,
  InputNumber,
  Menu,
  Select,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import { listCustomProperties } from '@/api/customProperties';
import { startCase } from '@/utils/text';
import { asNumber, asRecord, asString } from '@/api/json';

import {
  buildEntitySearchSettingsPayload,
  getEffectiveRankingConfiguration,
  getTypedSetting,
  restoreSettingsConfig,
  settingAsSearch,
  updateSetting,
  type EntitySearchDraft,
} from '@/api/system';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { searchEntitySettingBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryDescription,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import type {
  AllowedSearchField,
  AssetTypeConfiguration,
  SearchFieldBoost,
  SearchFieldValueBoost,
  SearchRankingConfiguration,
  SearchSettings,
  SearchTermBoost,
} from '@/types/admin';
import FieldValueBoostDialog from './FieldValueBoostDialog.vue';
import FieldValueBoostList from './FieldValueBoostList.vue';
import SearchEntityIcon from '@/components/shared/SearchEntityIcon.vue';
import SearchFieldConfiguration, {
  type FieldConfigurationField,
} from './SearchFieldConfiguration.vue';
import SearchPreview from './SearchPreview.vue';
import TermBoostList from './TermBoostList.vue';
import {
  SEARCH_ENTITY_SEGMENTS,
  boostModeOptions,
  isCompleteTermBoost,
  resolveSearchEntityType,
  scoreModeOptions,
} from './searchSettingsConstants';


const { t } = useI18n();
const route = useRoute();

const rawParam = computed(() => String(route.params.entityType ?? route.params.tab ?? ''));
const entityType = computed(() => resolveSearchEntityType(rawParam.value));
const segmentEntry = computed(() =>
  SEARCH_ENTITY_SEGMENTS.find((entry) => entry.entityType === entityType.value),
);

const searchConfig = ref<SearchSettings | null>(null);
const isSaving = ref(false);
const activeKey = ref<string | string[]>('ranking');
const showNewTermBoost = ref(false);
const showFieldValueBoostModal = ref(false);
const selectedFieldValueBoost = ref<SearchFieldValueBoost | undefined>(undefined);
const lastAddedSearchField = ref<string | undefined>(undefined);
const customProperties = ref<AllowedSearchField[]>([]);
const previewSearchConfig = ref<SearchSettings | null>(null);

const entityConfig = computed<AssetTypeConfiguration | undefined>(() =>
  searchConfig.value?.assetTypeConfigurations?.find(
    (item) => item.assetType === entityType.value,
  ),
);
const rankingConfiguration = computed(() =>
  getEffectiveRankingConfiguration(searchConfig.value ?? undefined, entityConfig.value ?? null),
);

// The edit state starts empty and is overwritten wholesale by the
// seeding watch when the loaded configuration arrives; a missing
// configuration leaves it exactly here, and save is a no-op.
const searchSettings = reactive<{
  searchFields?: SearchFieldBoost[];
  fieldValueBoosts: SearchFieldValueBoost[];
  boostMode?: string;
  scoreMode?: string;
  highlightFields: string[];
  termBoosts: SearchTermBoost[];
  ranking?: SearchRankingConfiguration;
  isUpdated: boolean;
}>({
  searchFields: undefined,
  fieldValueBoosts: [],
  boostMode: 'multiply',
  scoreMode: 'avg',
  highlightFields: [],
  termBoosts: [],
  ranking: undefined,
  isUpdated: false,
});

// The segment comes from either route param: the shell router uses
// :tab, the sections router :entityType. Both spell the same segment.
const tabSegment = computed(() => String(route.params.tab ?? route.params.entityType ?? ''));
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
function seedFromLoaded(config: AssetTypeConfiguration): void {
  searchSettings.searchFields = config.searchFields;
  searchSettings.fieldValueBoosts = config.fieldValueBoosts ?? [];
  searchSettings.boostMode = config.boostMode;
  searchSettings.scoreMode = config.scoreMode;
  searchSettings.highlightFields = config.highlightFields ?? [];
  searchSettings.termBoosts = config.termBoosts ?? [];
  searchSettings.ranking = rankingConfiguration.value;
  searchSettings.isUpdated = false;
}


watch([entityConfig, rankingConfiguration], () => {
  if (entityConfig.value) {
    seedFromLoaded(entityConfig.value);
  }
});

async function load(): Promise<void> {
  try {
    searchConfig.value = await getTypedSetting('searchSettings', settingAsSearch);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed'));
  }
}

async function fetchCustomProperties(): Promise<void> {
  if (!entityType.value) {
    customProperties.value = [];
    return;
  }
  try {
    const properties = await listCustomProperties(entityType.value);
    customProperties.value = properties.map((property) => ({
      name: `extension.${property.name}`,
      description: `${property.description ?? property.displayName} (${t('settings.searchPrefs.customProperty')})`,
    }));
  } catch {
    customProperties.value = [];
  }
}

const entityFields = computed<AllowedSearchField[]>(() => {
  const allowed =
    searchConfig.value?.allowedFields?.find((entry) => entry.entityType === entityType.value)
      ?.fields ?? [];
  return [...allowed, ...customProperties.value];
});

const entitySearchFields = computed<FieldConfigurationField[]>(
  () =>
    searchSettings.searchFields?.map((field) => ({
      fieldName: field.field ?? '',
      weight: field.boost ?? 0,
      matchType: field.matchType || 'standard',
    })) ?? [],
);

const unselectedFields = computed(() =>
  entityFields.value.filter(
    (entityField) =>
      !entitySearchFields.value.some((field) => field.fieldName === entityField.name),
  ),
);

const fieldOptions = computed(
  () =>
    searchConfig.value?.allowedFieldValueBoosts?.[0]?.fields?.map((field) => field.name) ?? [],
);

function handleFieldSelection(fieldName: string): void {
  const selected = entitySearchFields.value.some((field) => field.fieldName === fieldName);
  searchSettings.searchFields = selected
    ? (searchSettings.searchFields ?? []).filter((field) => field.field !== fieldName)
    : [{ field: fieldName, boost: 0 }, ...(searchSettings.searchFields ?? [])];
  activeKey.value = '1';
  lastAddedSearchField.value = fieldName;
  searchSettings.isUpdated = true;
}

function handleWeightChange(fieldName: string, value: number): void {
  searchSettings.searchFields = (searchSettings.searchFields ?? []).map((field) =>
    field.field === fieldName ? { ...field, boost: value } : field,
  );
  searchSettings.isUpdated = true;
}

function handleMatchTypeChange(fieldName: string, matchType: string): void {
  searchSettings.searchFields = (searchSettings.searchFields ?? []).map((field) =>
    field.field === fieldName ? { ...field, matchType } : field,
  );
  searchSettings.isUpdated = true;
}

function handleHighlightChange(fieldName: string): void {
  const highlighted = searchSettings.highlightFields.includes(fieldName);
  searchSettings.highlightFields = highlighted
    ? searchSettings.highlightFields.filter((field) => field !== fieldName)
    : [...searchSettings.highlightFields, fieldName];
  searchSettings.isUpdated = true;
}

function handleDeleteField(fieldName: string): void {
  searchSettings.searchFields = (searchSettings.searchFields ?? []).filter(
    (field) => field.field !== fieldName,
  );
  searchSettings.isUpdated = true;
}

function handleModeUpdate(field: 'scoreMode' | 'boostMode', value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  searchSettings[field] = value;
  searchSettings.isUpdated = true;
}

function handleTermBoostChange(termBoost: SearchTermBoost): void {
  if (!isCompleteTermBoost(termBoost)) {
    return;
  }
  const next = [...searchSettings.termBoosts];
  const index = next.findIndex((item) => item.value === termBoost.value);
  if (index >= 0) {
    next[index] = termBoost;
  } else {
    next.push(termBoost);
  }
  searchSettings.termBoosts = next;
  searchSettings.isUpdated = true;
  showNewTermBoost.value = false;
}

function handleDeleteTermBoost(value: string): void {
  if (!value) {
    showNewTermBoost.value = false;
    return;
  }
  searchSettings.termBoosts = searchSettings.termBoosts.filter((item) => item.value !== value);
  searchSettings.isUpdated = true;
}

function handleSaveFieldValueBoost(boost: SearchFieldValueBoost): void {
  const next = [...searchSettings.fieldValueBoosts];
  const index = next.findIndex((item) => item.field === boost.field);
  if (index >= 0) {
    next[index] = boost;
  } else {
    next.push(boost);
  }
  searchSettings.fieldValueBoosts = next;
  searchSettings.isUpdated = true;
  showFieldValueBoostModal.value = false;
}

function handleDeleteFieldValueBoost(field: string): void {
  searchSettings.fieldValueBoosts = searchSettings.fieldValueBoosts.filter(
    (item) => item.field !== field,
  );
  searchSettings.isUpdated = true;
}

function updateRankingSettings(update: Record<string, unknown>): void {
  searchSettings.ranking = { ...(searchSettings.ranking ?? {}), ...update };
  searchSettings.isUpdated = true;
}

// The ranking subtree is an opaque record; edits read through this
// structural view and spread every other key back untouched.
const ranking = computed(() => asRecord(searchSettings.ranking));
const rankingStages = computed(() => {
  const stages = ranking.value?.stages;
  return Array.isArray(stages) ? stages.map((stage) => asRecord(stage)) : [];
});
const rankingSignals = computed(() => asRecord(ranking.value?.signals));
const rankingAlgorithm = computed(() => asString(ranking.value?.algorithm));
const rankingEnabled = computed(() => ranking.value?.enabled ?? false);

function stageMatchTypeText(stage: Record<string, unknown> | null): string | null {
  if (!stage) {
    return null;
  }
  const matchType = asString(stage.matchType);
  if (!matchType) {
    return null;
  }
  const minimumShouldMatch = stage.minimumShouldMatch;
  return minimumShouldMatch === undefined
    ? startCase(matchType)
    : `${startCase(matchType)} (${String(minimumShouldMatch)})`;
}

function stageFields(stage: Record<string, unknown> | null): string[] {
  if (!stage || !Array.isArray(stage.fields)) {
    return [];
  }
  return stage.fields.filter((field): field is string => typeof field === 'string');
}

function handleStageWeightChange(index: number, value: unknown): void {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  const next = rankingStages.value.map((stage, stageIndex) => {
    if (stageIndex !== index || !stage) {
      return stage;
    }
    if (Number.isNaN(numeric)) {
      const { weight: _weight, ...rest } = stage;
      return rest;
    }
    return { ...stage, weight: numeric };
  });
  updateRankingSettings({ stages: next });
}

function handleSignalsUpdate(update: Record<string, unknown>): void {
  updateRankingSettings({ signals: { ...(rankingSignals.value ?? {}), ...update } });
}

function handleSignalsMaxBoostChange(value: unknown): void {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (Number.isNaN(numeric)) {
    const { maxBoost: _maxBoost, ...rest } = rankingSignals.value ?? {};
    updateRankingSettings({ signals: rest });
    return;
  }
  handleSignalsUpdate({ maxBoost: numeric });
}

function entityDraft(): EntitySearchDraft {
  return {
    searchFields: searchSettings.searchFields,
    highlightFields: searchSettings.highlightFields,
    termBoosts: searchSettings.termBoosts,
    fieldValueBoosts: searchSettings.fieldValueBoosts,
    scoreMode: searchSettings.scoreMode,
    boostMode: searchSettings.boostMode,
    ranking: searchSettings.ranking,
  };
}

async function handleSaveChanges(): Promise<void> {
  if (!entityConfig.value) {
    return;
  }
  if (!searchConfig.value || !entityType.value) {
    return;
  }
  try {
    isSaving.value = true;
    const response = await updateSetting(
      'searchSettings',
      buildEntitySearchSettingsPayload(searchConfig.value, entityType.value, entityDraft()),
    );
    const saved = settingAsSearch(response.configValue);
    searchConfig.value = saved;
    const savedEntityConfig = saved.assetTypeConfigurations?.find(
      (item) => item.assetType === entityType.value,
    );
    if (savedEntityConfig) {
      seedFromLoaded(savedEntityConfig);
    }
    message.success(t('settings.searchPrefs.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}

async function handleRestoreDefaults(): Promise<void> {
  try {
    // The restore endpoint returns a bare SearchSettings, not a
    // wrapped setting: parse it directly, like the load path.
    const restored = settingAsSearch(await restoreSettingsConfig('searchSettings'));
    searchConfig.value = restored;
    const restoredEntityConfig = restored.assetTypeConfigurations?.find(
      (item) => item.assetType === entityType.value,
    );
    if (restoredEntityConfig) {
      seedFromLoaded(restoredEntityConfig);
    }
    message.success(t('settings.searchPrefs.restored'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.saveFailed'));
  }
}

// The preview runs against the edit state, not the loaded config: every
// edit rebuilds the preview configuration, but identical serializations
// do not replace the previous object, so the preview does not refetch
// for a no-op edit.
watch(
  [searchConfig, () => searchSettings, entityType],
  () => {
    if (!searchConfig.value || !entityType.value || searchSettings.searchFields === undefined) {
      return;
    }
    const next = buildEntitySearchSettingsPayload(
      searchConfig.value,
      entityType.value,
      entityDraft(),
    );
    if (JSON.stringify(next) !== JSON.stringify(previewSearchConfig.value)) {
      previewSearchConfig.value = next;
    }
  },
  { deep: true },
);

watch(entityType, () => {
  void load();
  void fetchCustomProperties();
});

onMounted(() => {
  void load();
  void fetchCustomProperties();
});
</script>

<template>
  <div data-testid="search-entity-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="search-entity-settings"
    />
    <Alert
      v-if="!entityType"
      type="error"
      show-icon
      :message="t('settings.searchPrefs.unknownEntity', { type: rawParam })"
    />
    <template v-else>
      <div
        class="entity-search-settings__header"
        data-testid="entity-search-settings-header"
      >
        <SearchEntityIcon :entity-type="entityType" :size="55" />
        <div class="entity-search-settings__header-text">
          <Typography.Title :level="4" data-testid="heading">
            {{ segmentEntry ? t(segmentEntry.labelKey) : startCase(entityType) }}
          </Typography.Title>
          <Typography.Text
            type="secondary"
            data-testid="sub-heading"
            class="entity-search-settings__header-description"
          >
            {{
              t('settings.searchPrefs.searchSettingsForEntity', {
                entity: segmentEntry ? t(segmentEntry.labelKey) : startCase(entityType),
              })
            }}
          </Typography.Text>
        </div>
      </div>

      <div class="entity-search-settings__columns">
        <div class="entity-search-settings__editor">
          <Collapse v-model:active-key="activeKey" accordion>
            <Collapse.Panel key="ranking">
              <template #header>
                {{ t('settings.searchPrefs.ranking') }}
              </template>
              <Typography.Text v-if="!ranking" type="secondary">
                {{ t('settings.searchPrefs.noDataAvailable') }}
              </Typography.Text>
              <div v-else class="entity-search-settings__ranking">
                <Card size="small">
                  <div class="entity-search-settings__row">
                    <Typography.Text strong>
                      {{
                        rankingAlgorithm
                          ? startCase(rankingAlgorithm)
                          : t('settings.searchPrefs.noDataAvailable')
                      }}
                    </Typography.Text>
                    <Switch
                      :checked="Boolean(rankingEnabled)"
                      data-testid="ranking-enabled-switch"
                      @change="updateRankingSettings({ enabled: !rankingEnabled })"
                    />
                  </div>
                </Card>
                <Card
                  v-for="(stage, index) in rankingStages"
                  :key="index"
                  size="small"
                  :data-testid="
                    stage && asString(stage.name)
                      ? `ranking-stage-${asString(stage.name)}`
                      : `ranking-stage-unnamed-${index}`
                  "
                >
                  <div class="entity-search-settings__stage">
                    <Typography.Text strong>
                      {{
                        stage && asString(stage.name)
                          ? startCase(asString(stage.name))
                          : t('settings.searchPrefs.noDataAvailable')
                      }}
                    </Typography.Text>
                    <div class="entity-search-settings__row">
                      <Typography.Text>{{ t('settings.searchPrefs.weight') }}</Typography.Text>
                      <InputNumber
                        :value="stage ? asNumber(stage.weight) ?? undefined : undefined"
                        :min="1"
                        @update:value="handleStageWeightChange(index, $event)"
                      />
                    </div>
                    <Typography.Paragraph v-if="stage && asString(stage.purpose)" type="secondary">
                      {{ asString(stage?.purpose) }}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary">
                      {{
                        stageMatchTypeText(stage) ?? t('settings.searchPrefs.noDataAvailable')
                      }}
                    </Typography.Text>
                    <div class="entity-search-settings__badges">
                      <Tooltip v-for="field in stageFields(stage)" :key="field" :title="field">
                        <Tag class="entity-search-settings__badge">{{ field }}</Tag>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
                <Card v-if="rankingSignals" size="small" data-testid="ranking-signals">
                  <div class="entity-search-settings__stage">
                    <Typography.Text strong>
                      {{ t('settings.searchPrefs.signals') }}
                    </Typography.Text>
                    <Typography.Paragraph v-if="asString(rankingSignals.purpose)" type="secondary">
                      {{ asString(rankingSignals.purpose) }}
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary">
                      {{ t('settings.searchPrefs.rankingSignalsExplanation') }}
                    </Typography.Paragraph>
                    <div class="entity-search-settings__row">
                      <Typography.Text>{{ t('settings.searchPrefs.boostMode') }}</Typography.Text>
                      <Select
                        :value="asString(rankingSignals.boostMode) || undefined"
                        :options="boostModeOptions"
                        @update:value="handleSignalsUpdate({ boostMode: $event })"
                      />
                    </div>
                    <div class="entity-search-settings__row">
                      <Typography.Text>{{ t('settings.searchPrefs.scoreMode') }}</Typography.Text>
                      <Select
                        :value="asString(rankingSignals.scoreMode) || undefined"
                        :options="scoreModeOptions"
                        @update:value="handleSignalsUpdate({ scoreMode: $event })"
                      />
                    </div>
                    <div class="entity-search-settings__row">
                      <Typography.Text>{{ t('settings.searchPrefs.maxBoost') }}</Typography.Text>
                      <InputNumber
                        :value="asNumber(rankingSignals.maxBoost) ?? undefined"
                        :min="0.1"
                        :step="0.1"
                        @update:value="handleSignalsMaxBoostChange($event)"
                      />
                    </div>
                    <div class="entity-search-settings__badges">
                      <Tooltip
                        v-for="field in stageFields(rankingSignals)"
                        :key="field"
                        :title="field"
                      >
                        <Tag class="entity-search-settings__badge">{{ field }}</Tag>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              </div>
            </Collapse.Panel>

            <Collapse.Panel key="1">
              <template #header>
                {{ t('settings.searchPrefs.matchingFields') }}
              </template>
              <template #extra>
                <span @click.stop>
                  <Dropdown trigger="click">
                    <Button size="small" data-testid="add-field-btn">
                      {{ t('settings.searchPrefs.add') }}
                    </Button>
                    <template #overlay>
                      <Menu @click="handleFieldSelection(String($event.key))">
                        <Menu.Item
                          v-for="entityField in unselectedFields"
                          :key="entityField.name"
                        >
                          {{ entityField.name }}
                        </Menu.Item>
                      </Menu>
                    </template>
                  </Dropdown>
                </span>
              </template>
              <div class="entity-search-settings__fields">
                <SearchFieldConfiguration
                  v-for="(field, index) in entitySearchFields"
                  :key="field.fieldName"
                  :field="field"
                  :index="index"
                  :highlight-fields="searchSettings.highlightFields"
                  :entity-fields="entityFields"
                  :initial-open="field.fieldName === lastAddedSearchField"
                  @delete="handleDeleteField"
                  @weight-change="handleWeightChange"
                  @match-type-change="handleMatchTypeChange"
                  @highlight-change="handleHighlightChange"
                />
              </div>
              <div class="entity-search-settings__modes">
                <div class="entity-search-settings__row">
                  <Typography.Text>{{ t('settings.searchPrefs.scoreMode') }}</Typography.Text>
                  <Select
                    :value="searchSettings.scoreMode ?? undefined"
                    :options="scoreModeOptions"
                    data-testid="score-mode-select"
                    @update:value="handleModeUpdate('scoreMode', $event)"
                  />
                </div>
                <div class="entity-search-settings__row">
                  <Typography.Text>{{ t('settings.searchPrefs.boostMode') }}</Typography.Text>
                  <Select
                    :value="searchSettings.boostMode ?? undefined"
                    :options="boostModeOptions"
                    data-testid="boost-mode-select"
                    @update:value="handleModeUpdate('boostMode', $event)"
                  />
                </div>
              </div>
            </Collapse.Panel>

            <Collapse.Panel key="2">
              <template #header>
                {{ t('settings.searchPrefs.termBoost') }}
              </template>
              <template #extra>
                <span @click.stop>
                  <Button
                    size="small"
                    data-testid="add-term-boost-btn"
                    @click="
                      showNewTermBoost = true;
                      activeKey = '2';
                    "
                  >
                    {{ t('settings.searchPrefs.add') }}
                  </Button>
                </span>
              </template>
              <TermBoostList
                :term-boosts="searchSettings.termBoosts"
                :show-new-term-boost="showNewTermBoost"
                class="entity-search-settings__term-boosts"
                @change="handleTermBoostChange"
                @delete="handleDeleteTermBoost"
              />
            </Collapse.Panel>

            <Collapse.Panel key="3">
              <template #header>
                {{ t('settings.searchPrefs.fieldValueBoost') }}
              </template>
              <template #extra>
                <span @click.stop>
                  <Button
                    size="small"
                    data-testid="add-field-value-boost-btn"
                    @click="
                      selectedFieldValueBoost = undefined;
                      showFieldValueBoostModal = true;
                      activeKey = '3';
                    "
                  >
                    {{ t('settings.searchPrefs.add') }}
                  </Button>
                </span>
              </template>
              <FieldValueBoostList
                entity-search-settings-page
                :field-value-boosts="searchSettings.fieldValueBoosts"
                :is-loading="false"
                data-test-id="entity-field-value-boost-table"
                @edit="
                  selectedFieldValueBoost = $event;
                  showFieldValueBoostModal = true;
                "
                @delete="handleDeleteFieldValueBoost"
              />
            </Collapse.Panel>
          </Collapse>
        </div>
        <div class="entity-search-settings__preview">
          <SearchPreview
            :search-config="previewSearchConfig ?? {}"
            :entity-type="entityType"
            :disabled-save="!searchSettings.isUpdated"
            :is-saving="isSaving"
            @restore="handleRestoreDefaults"
            @save="handleSaveChanges"
          />
        </div>
      </div>
    </template>

    <FieldValueBoostDialog
      v-if="showFieldValueBoostModal"
      :boost="selectedFieldValueBoost"
      :field-options="fieldOptions"
      @save="handleSaveFieldValueBoost"
      @close="showFieldValueBoostModal = false"
    />
  </div>
</template>

<style scoped>
.entity-search-settings__header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.entity-search-settings__header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.entity-search-settings__header-description {
  max-width: 720px;
}

.entity-search-settings__columns {
  display: flex;
  gap: 16px;
}

.entity-search-settings__editor {
  flex: 0 0 33.3333%;
  max-width: 33.3333%;
  min-width: 0;
}

.entity-search-settings__preview {
  flex: 0 0 66.6667%;
  max-width: 66.6667%;
  min-width: 0;
}

.entity-search-settings__ranking {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entity-search-settings__stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entity-search-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.entity-search-settings__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.entity-search-settings__badge {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-search-settings__fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entity-search-settings__modes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.entity-search-settings__term-boosts {
  flex-direction: column;
  align-items: stretch;
}
</style>
