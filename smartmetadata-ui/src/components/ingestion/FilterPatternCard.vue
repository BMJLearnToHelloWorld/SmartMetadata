<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Card, Tag } from 'ant-design-vue';
import { CloseOutlined, DownOutlined, RightOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import ToggleField from '@/components/shared/ToggleField.vue';
import {
  buildInitialFilterState,
  buildPatternFromState,
  conditionKey,
  conditionToRegex,
  FILTER_OPERATOR_LABEL_KEYS,
  getFilterSectionLabels,
  getRuleLabelKey,
  getScopeSummaryKey,
  getSummaryPill,
  parseRegexPattern,
  removeConditionAtIndex,
  type FilterCondition,
  type FilterPatternConfig,
  type FilterSectionState,
} from '@/ingestion/filterPatterns';
import FilterConditionComposer from './FilterConditionComposer.vue';

/**
 * Port of official FilterPatternField + FilterSectionCard (pin
 * a3012259ca): one collapsible card per filter-pattern field. Scan-all
 * vs only-specific modes; include/exclude condition composers with
 * chips; a scope preview; a show/hide equivalent-regex disclosure;
 * and a system-excludes toggle when the schema defines default
 * excludes. Emits `{includes, excludes}` FilterPattern objects;
 * includes are emitted only in restrict (only-specific) mode.
 *
 * System excludes are merged into a fresh field's state (no stored
 * data) but reach the parent only on the first user edit of the
 * card, as in pin. The card re-derives its state when the parent
 * supplies a value it did not emit (e.g. a kind switch).
 */
const props = withDefaults(
  defineProps<{
    fieldName: string;
    modelValue?: FilterPatternConfig;
    schemaTitle?: string;
    defaultOpen?: boolean;
    /** Schema default excludes (plus the Snowflake sample-DB rule); regex strings. */
    systemExcludes?: string[];
    /** True when the field already has stored data (system excludes are not auto-added). */
    hasExistingData?: boolean;
    disabled?: boolean;
  }>(),
  {
    modelValue: undefined,
    schemaTitle: undefined,
    defaultOpen: false,
    systemExcludes: () => [],
    hasExistingData: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: FilterPatternConfig];
  focus: [fieldName: string];
}>();

const { t } = useI18n();

const labels = computed(() =>
  getFilterSectionLabels(props.fieldName, props.schemaTitle, (key) => t(key)),
);
const entityLabel = computed(() => labels.value.label.toLowerCase());
const systemExcludeConditions = computed(() =>
  props.systemExcludes.map(parseRegexPattern),
);

function initialState(value: FilterPatternConfig | undefined): FilterSectionState {
  const state = buildInitialFilterState(value);
  if (!props.hasExistingData && systemExcludeConditions.value.length > 0) {
    const existingKeys = new Set(state.excludes.map(conditionKey));
    const additions = systemExcludeConditions.value.filter(
      (condition) => !existingKeys.has(conditionKey(condition)),
    );
    if (additions.length > 0) {
      return { ...state, excludes: [...state.excludes, ...additions] };
    }
  }
  return state;
}

const filter = ref<FilterSectionState>(initialState(props.modelValue));
const isOpen = ref(props.defaultOpen);
const showRegex = ref(false);
let lastEmitted = JSON.stringify(buildPatternFromState(filter.value));

watch(
  () => props.modelValue,
  (value) => {
    const incoming = JSON.stringify(value ?? { excludes: [], includes: [] });
    const current = JSON.stringify(buildPatternFromState(filter.value));
    if (incoming !== lastEmitted && incoming !== current) {
      filter.value = initialState(value);
      lastEmitted = JSON.stringify(buildPatternFromState(filter.value));
    }
  },
  { deep: true },
);

function applyChange(next: FilterSectionState): void {
  filter.value = next;
  const pattern = buildPatternFromState(next);
  lastEmitted = JSON.stringify(pattern);
  emit('update:modelValue', pattern);
}

function addCondition(bucket: 'includes' | 'excludes', condition: FilterCondition): void {
  applyChange({
    ...filter.value,
    [bucket]: [...filter.value[bucket], condition],
    restrict: bucket === 'includes' ? true : filter.value.restrict,
  });
}

const systemExcludeKeys = computed(
  () => new Set(systemExcludeConditions.value.map(conditionKey)),
);
const hasSystemExcludes = computed(() => systemExcludeConditions.value.length > 0);
const hasSystemExcludesEnabled = computed(
  () =>
    hasSystemExcludes.value &&
    systemExcludeConditions.value.every((condition) =>
      filter.value.excludes.some(
        (existing) => conditionKey(existing) === conditionKey(condition),
      ),
    ),
);

function toggleSystemExcludes(): void {
  if (!hasSystemExcludes.value) {
    return;
  }
  if (hasSystemExcludesEnabled.value) {
    applyChange({
      ...filter.value,
      excludes: filter.value.excludes.filter(
        (condition) => !systemExcludeKeys.value.has(conditionKey(condition)),
      ),
    });
    return;
  }
  const currentKeys = new Set(filter.value.excludes.map(conditionKey));
  applyChange({
    ...filter.value,
    excludes: [
      ...filter.value.excludes,
      ...systemExcludeConditions.value.filter(
        (condition) => !currentKeys.has(conditionKey(condition)),
      ),
    ],
  });
}

const summary = computed(() => getSummaryPill(filter.value));
const includeCount = computed(() => (filter.value.restrict ? filter.value.includes.length : 0));
const excludeCount = computed(() => filter.value.excludes.length);
const previewRegexes = computed(() => ({
  includes: filter.value.restrict ? filter.value.includes.map(conditionToRegex) : [],
  excludes: filter.value.excludes.map(conditionToRegex),
}));

function onHeaderClick(): void {
  emit('focus', props.fieldName);
  isOpen.value = !isOpen.value;
}

function operatorLabel(condition: FilterCondition): string {
  return t(FILTER_OPERATOR_LABEL_KEYS[condition.op]);
}
</script>

<template>
  <Card :data-testid="`filter-section-${fieldName}`" class="filter-pattern-card">
    <button type="button" class="filter-pattern-header" @click="onHeaderClick">
      <span class="filter-pattern-header-label">
        <span class="filter-pattern-title">{{ labels.label }}</span>
        <Tag :color="summary.tone === 'success' ? 'success' : 'processing'">
          {{ t(summary.textKey, summary.values) }}
        </Tag>
      </span>
      <DownOutlined :class="['filter-pattern-chevron', { open: isOpen }]" />
    </button>

    <div v-show="isOpen" class="filter-pattern-body">
      <div class="filter-pattern-scan">
        <div class="filter-pattern-field-label">{{ t('forms.filter.whatToScan') }}</div>
        <div class="filter-pattern-scan-options">
          <button
            type="button"
            :class="['filter-pattern-scan-option', { active: !filter.restrict }]"
            :data-testid="`${fieldName}-scan-all-button`"
            :disabled="disabled"
            @click="applyChange({ ...filter, includes: [], restrict: false })"
          >
            {{ t('forms.filter.scanAll', { entity: entityLabel }) }}
          </button>
          <button
            type="button"
            :class="['filter-pattern-scan-option', { active: filter.restrict }]"
            :data-testid="`${fieldName}-only-specific-button`"
            :disabled="disabled"
            @click="applyChange({ ...filter, restrict: true })"
          >
            {{ t('forms.filter.onlySpecific', { entity: entityLabel }) }}
          </button>
        </div>
      </div>

      <div v-if="filter.restrict" class="filter-pattern-include">
        <div class="filter-pattern-include-label">
          {{ t('forms.filter.includeOnlyWhere', { entity: entityLabel }) }}
        </div>
        <div v-if="filter.includes.length > 0" class="filter-pattern-chips">
          <span
            v-for="(condition, index) in filter.includes"
            :key="conditionKey(condition)"
            class="filter-pattern-chip filter-pattern-chip-include"
            :data-testid="`include-chip-${conditionKey(condition)}`"
          >
            <span data-testid="label">{{ operatorLabel(condition) }}</span>
            <span data-testid="value">{{ condition.value }}</span>
            <button
              type="button"
              data-testid="remove-button"
              :aria-label="t('crud.remove')"
              @click="
                applyChange({
                  ...filter,
                  includes: removeConditionAtIndex(filter.includes, index),
                })
              "
            >
              <CloseOutlined />
            </button>
          </span>
        </div>
        <FilterConditionComposer
          default-operator="contains"
          :field-name="fieldName"
          :placeholder="
            t('forms.filter.exampleValue', {
              value: t('forms.filter.entityNameExample', {
                entity: labels.singleLabel.toLowerCase(),
              }),
            })
          "
          :disabled="disabled"
          @add="(condition) => addCondition('includes', condition)"
          @focus="emit('focus', $event)"
        />
      </div>

      <div class="filter-pattern-exclude">
        <ToggleField
          v-if="hasSystemExcludes"
          :model-value="hasSystemExcludesEnabled"
          :label="t('forms.filter.excludeSystem', { entity: entityLabel })"
          :description="t('forms.filter.excludeSystemDescription', { entity: entityLabel })"
          :field-id="`${fieldName}-exclude-system-filters`"
          :test-id="`${fieldName}-exclude-system-filters`"
          :disabled="disabled"
          @update:model-value="toggleSystemExcludes"
          @focus="emit('focus', $event ?? '')"
        />
        <div class="filter-pattern-exclude-label">{{ t('forms.filter.alwaysExclude') }}</div>
        <div v-if="filter.excludes.length > 0" class="filter-pattern-chips">
          <span
            v-for="(condition, index) in filter.excludes"
            :key="conditionKey(condition)"
            class="filter-pattern-chip filter-pattern-chip-exclude"
            :data-testid="`exclude-chip-${conditionKey(condition)}`"
          >
            <span data-testid="label">{{ operatorLabel(condition) }}</span>
            <span data-testid="value">{{ condition.value }}</span>
            <button
              type="button"
              data-testid="remove-button"
              :aria-label="t('crud.remove')"
              @click="
                applyChange({
                  ...filter,
                  excludes: removeConditionAtIndex(filter.excludes, index),
                })
              "
            >
              <CloseOutlined />
            </button>
          </span>
        </div>
        <FilterConditionComposer
          default-operator="startsWith"
          tone="exclude"
          :field-name="fieldName"
          :placeholder="t('forms.filter.exampleValue', { value: 'TMP_' })"
          :disabled="disabled"
          @add="(condition) => addCondition('excludes', condition)"
          @focus="emit('focus', $event)"
        />
      </div>

      <div class="filter-pattern-preview">
        <div class="filter-pattern-preview-title">{{ t('forms.filter.preview') }}</div>
        <p class="filter-pattern-preview-text">
          {{
            t(getScopeSummaryKey(filter), {
              entity: entityLabel,
              includeCount,
              includeRule: t(getRuleLabelKey(includeCount)),
              excludeCount,
              excludeRule: t(getRuleLabelKey(excludeCount)),
            })
          }}
        </p>
        <div v-if="includeCount > 0" class="filter-pattern-preview-rules">
          <span class="filter-pattern-preview-rules-label">
            {{ t('forms.filter.includeEntity', { entity: t(getRuleLabelKey(includeCount)) }) }}
          </span>
          <span class="filter-pattern-chips">
            <span
              v-for="condition in filter.includes"
              :key="conditionKey(condition)"
              class="filter-pattern-chip filter-pattern-chip-include"
            >
              <span>{{ operatorLabel(condition) }}</span>
              <span>{{ condition.value }}</span>
            </span>
          </span>
        </div>
        <div v-if="excludeCount > 0" class="filter-pattern-preview-rules">
          <span class="filter-pattern-preview-rules-label">
            {{ t('forms.filter.excludeEntity', { entity: t(getRuleLabelKey(excludeCount)) }) }}
          </span>
          <span class="filter-pattern-chips">
            <span
              v-for="condition in filter.excludes"
              :key="conditionKey(condition)"
              class="filter-pattern-chip filter-pattern-chip-exclude"
            >
              <span>{{ operatorLabel(condition) }}</span>
              <span>{{ condition.value }}</span>
            </span>
          </span>
        </div>
      </div>

      <div
        v-if="previewRegexes.includes.length > 0 || previewRegexes.excludes.length > 0"
        class="filter-pattern-regex"
      >
        <Button type="link" size="small" @click="showRegex = !showRegex">
          <template #icon><RightOutlined :class="{ rotated: showRegex }" /></template>
          {{
            showRegex ? t('forms.filter.hideRegex') : t('forms.filter.showRegex')
          }}
        </Button>
        <div v-if="showRegex" class="filter-pattern-regex-lines">
          <code v-for="regex in previewRegexes.includes" :key="`include-${regex}`">
            {{ t('forms.filter.includesRegexLine', { regex }) }}
          </code>
          <code v-for="regex in previewRegexes.excludes" :key="`exclude-${regex}`">
            {{ t('forms.filter.excludesRegexLine', { regex }) }}
          </code>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.filter-pattern-card {
  margin-bottom: 12px;
}

.filter-pattern-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.filter-pattern-header-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-pattern-title {
  font-weight: 500;
}

.filter-pattern-chevron {
  transition: transform 0.15s;
}

.filter-pattern-chevron.open {
  transform: rotate(180deg);
}

.filter-pattern-body {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.filter-pattern-field-label,
.filter-pattern-include-label,
.filter-pattern-exclude-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
}

.filter-pattern-include-label {
  color: var(--sm-color-primary);
}

.filter-pattern-scan-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  background: var(--sm-bg-elevated);
}

.filter-pattern-scan-option {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.filter-pattern-scan-option.active {
  border-color: var(--sm-border-color);
  background: var(--sm-bg-container);
  font-weight: 500;
}

.filter-pattern-exclude {
  padding-top: 4px;
  border-top: 1px dashed var(--sm-border-color);
}

.filter-pattern-exclude-label {
  color: var(--sm-color-error);
}

.filter-pattern-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.filter-pattern-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.filter-pattern-chip-include {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
}

.filter-pattern-chip-exclude {
  border-color: var(--sm-color-error);
  background: var(--sm-color-error-bg);
  color: var(--sm-color-error);
}

.filter-pattern-chip button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.filter-pattern-preview {
  padding: 14px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
  background: var(--sm-bg-elevated);
}

.filter-pattern-preview-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
}

.filter-pattern-preview-text {
  margin: 0;
  line-height: 20px;
  color: var(--sm-text-tertiary);
}

.filter-pattern-preview-rules {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.filter-pattern-preview-rules-label {
  font-size: 12px;
  font-weight: 500;
}

.filter-pattern-preview-rules .filter-pattern-chips {
  margin-bottom: 0;
}

.filter-pattern-regex-lines {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: var(--sm-text-primary);
}

.filter-pattern-regex-lines code {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-palette-bright-blue);
}

.rotated {
  transform: rotate(90deg);
}
</style>
