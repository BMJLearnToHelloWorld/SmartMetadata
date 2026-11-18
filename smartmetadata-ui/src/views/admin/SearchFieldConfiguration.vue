<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official FieldConfiguration: a field card with a header
  (name, custom badge, description, zero-padded weight, delete) and a
  panel that mounts only while open (highlight toggle, weight slider,
  match-type select).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DeleteOutlined, FilterOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Collapse,
  Divider,
  Select,
  Slider,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import type { AllowedSearchField } from '@/types/admin';
import { MATCH_TYPE_OPTIONS } from './searchSettingsConstants';

export interface FieldConfigurationField {
  fieldName: string;
  weight: number;
  matchType?: string;
}

const props = defineProps<{
  field: FieldConfigurationField;
  index: number;
  highlightFields?: string[];
  entityFields: AllowedSearchField[];
  initialOpen?: boolean;
}>();
const emit = defineEmits<{
  delete: [fieldName: string];
  weightChange: [fieldName: string, value: number];
  matchTypeChange: [fieldName: string, matchType: string];
  highlightChange: [fieldName: string];
}>();
const { t } = useI18n();

const activeKeys = ref<string[]>(props.initialOpen ? [String(props.index)] : []);
const fieldWeight = ref(props.field.weight);
const fieldMatchType = ref(props.field.matchType || 'standard');

watch(
  () => props.initialOpen,
  (initialOpen) => {
    if (initialOpen) {
      activeKeys.value = [String(props.index)];
    }
  },
);

const entityFieldConfig = computed(() =>
  props.entityFields.find((entityField) => entityField.name === props.field.fieldName),
);
const fieldDescription = computed(() => entityFieldConfig.value?.description);
// Only analyzed text fields can be highlighted. The server derives this
// from the index mapping and rejects a save that targets a flattened or
// non-indexed path, so offering the toggle here would only produce a
// 400 the admin cannot act on.
const isHighlightAllowed = computed(() => Boolean(entityFieldConfig.value?.highlight));
const isCustomProperty = computed(() => props.field.fieldName.startsWith('extension.'));

function handleWeightChange(value: unknown): void {
  const numeric =
    typeof value === 'number' ? value : Array.isArray(value) ? value[0] : undefined;
  if (typeof numeric !== 'number') {
    return;
  }
  fieldWeight.value = numeric;
  emit('weightChange', props.field.fieldName, numeric);
}

function handleMatchTypeChange(value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  fieldMatchType.value = value;
  emit('matchTypeChange', props.field.fieldName, value);
}
</script>

<template>
  <Collapse
    v-model:active-key="activeKeys"
    :destroy-inactive-panel="true"
    :data-field-name="field.fieldName"
  >
    <Collapse.Panel
      :key="String(index)"
      :data-testid="`field-configuration-panel-${field.fieldName}`"
    >
      <template #header>
        <div class="field-configuration__header" data-testid="field-container-header">
          <div class="field-configuration__header-top">
            <Typography.Text data-testid="field-name">
              {{ field.fieldName }}
            </Typography.Text>
            <Tag
              v-if="isCustomProperty"
              color="blue"
              class="custom-property-badge"
              data-testid="custom-property-badge"
            >
              {{ t('settings.searchPrefs.custom') }}
            </Tag>
          </div>
          <div class="field-configuration__header-bottom">
            <span class="field-configuration__description">
              {{ fieldDescription ?? t('settings.searchPrefs.noDescription') }}
            </span>
            <span
              class="field-configuration__weight"
              data-testid="field-weight"
            >
              <FilterOutlined />
              {{ fieldWeight < 10 ? `0${fieldWeight}` : fieldWeight }}
            </span>
          </div>
        </div>
      </template>
      <template #extra>
        <span @click.stop>
          <Button
            type="text"
            size="small"
            :aria-label="t('settings.searchPrefs.delete')"
            data-testid="delete-search-field"
            @click="emit('delete', field.fieldName)"
          >
            <DeleteOutlined />
          </Button>
        </span>
      </template>
      <Divider style="margin: 0" />
      <div class="field-configuration__panel">
        <div class="field-configuration__row">
          <Typography.Text>{{ t('settings.searchPrefs.highlightFields') }}</Typography.Text>
          <Switch
            v-if="isHighlightAllowed"
            :checked="highlightFields?.includes(field.fieldName) ?? false"
            size="small"
            data-testid="highlight-field-switch"
            @change="emit('highlightChange', field.fieldName)"
          />
          <Tooltip v-else :title="t('settings.searchPrefs.fieldCannotBeHighlighted')">
            <span>
              <Switch
                :checked="false"
                :disabled="true"
                size="small"
                data-testid="highlight-field-switch"
              />
            </span>
          </Tooltip>
        </div>
        <Divider />
        <div class="field-configuration__row">
          <Typography.Text>{{ t('settings.searchPrefs.weight') }}</Typography.Text>
          <Typography.Text strong data-testid="field-weight-value">
            {{ fieldWeight }}
          </Typography.Text>
        </div>
        <div data-testid="field-weight-slider">
          <Slider
            :value="fieldWeight"
            :aria-label="t('settings.searchPrefs.value')"
            :min="0"
            :max="100"
            :step="0.1"
            @update:value="handleWeightChange"
          />
        </div>
        <Divider />
        <div class="field-configuration__row">
          <Typography.Text>{{ t('settings.searchPrefs.matchType') }}</Typography.Text>
          <Select
            :value="fieldMatchType"
            :aria-label="t('settings.searchPrefs.matchType')"
            :options="MATCH_TYPE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))"
            data-testid="match-type-select"
            @update:value="handleMatchTypeChange"
          />
        </div>
      </div>
    </Collapse.Panel>
  </Collapse>
</template>

<style scoped>
.field-configuration__header {
  width: 100%;
}

.field-configuration__header-top {
  display: flex;
  gap: 8px;
  align-items: center;
}

.field-configuration__header-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 0;
}

.field-configuration__description {
  font-size: 12px;
  color: var(--sm-text-secondary);
}

.field-configuration__weight {
  display: flex;
  gap: 4px;
  align-items: center;
  font-weight: 600;
}

.field-configuration__panel {
  padding: 10px;
}

.field-configuration__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 20px;
}
</style>
