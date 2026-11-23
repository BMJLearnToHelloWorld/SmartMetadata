<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, DatePicker, Input, InputNumber, Select, Typography } from 'ant-design-vue';
import {
  createQueryRule,
  defaultRuleValue,
  emptyQueryGroup,
  fieldLabel,
  findFieldDef,
  type QueryBuilderFieldDef,
  type QueryFieldOption,
  type QueryGroup,
  type QueryNode,
  type QueryOperator,
  type QueryRule,
  type QueryValue,
} from '@/catalog/queryBuilder';

defineOptions({ name: 'AdvancedSearchGroup' });

const props = withDefaults(
  defineProps<{
    group: QueryGroup;
    fields: QueryBuilderFieldDef[];
    fetchOptions: (field: QueryBuilderFieldDef, searchText: string) => Promise<QueryFieldOption[]>;
    path?: string;
    depth?: number;
    testIdPrefix?: string;
  }>(),
  { path: '', depth: 0, testIdPrefix: 'advanced-search' },
);

const emit = defineEmits<{
  'update:group': [group: QueryGroup];
  remove: [];
}>();

const { t, te } = useI18n();

const MULTI_VALUE_OPERATORS: readonly QueryOperator[] = [
  'select_any_in',
  'select_not_any_in',
  'multiselect_contains',
  'multiselect_not_contains',
  'multiselect_equals',
  'multiselect_not_equals',
];
const NULL_CHECK_OPERATORS: readonly QueryOperator[] = ['is_null', 'is_not_null'];
const BETWEEN_OPERATORS: readonly QueryOperator[] = ['between', 'not_between'];

/** Options fetched per rule path; capped by the tree itself (one entry per rule). */
const optionsByPath = ref<Record<string, QueryFieldOption[]>>({});
const loadingPaths = ref<Set<string>>(new Set());
const searchTimers = new Map<string, ReturnType<typeof setTimeout>>();

const sortedFields = computed(() => {
  const base = props.fields.filter((field) => !field.entityType);
  return [...base].sort((a, b) => fieldLabel(a, (key) => t(key)).localeCompare(fieldLabel(b, (key) => t(key))));
});

const extensionGroups = computed(() => {
  const groups = new Map<string, QueryBuilderFieldDef[]>();
  for (const field of props.fields) {
    if (!field.entityType) {
      continue;
    }
    const key = field.optGroupKey ?? `explore.entity.${field.entityType}`;
    const list = groups.get(key) ?? [];
    list.push(field);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([labelKey, fields]) => ({
    label: te(labelKey) ? t(labelKey) : labelKey,
    fields: [...fields].sort((a, b) =>
      fieldLabel(a, (key) => t(key)).localeCompare(fieldLabel(b, (key) => t(key))),
    ),
  }));
});

const fieldSelectOptions = computed(() => {
  const options: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
    {
      label: t('explore.advancedFieldsGroup'),
      options: sortedFields.value.map((field) => ({
        value: field.key,
        label: fieldLabel(field, (key) => t(key)),
      })),
    },
  ];
  for (const group of extensionGroups.value) {
    options.push({
      label: group.label,
      options: group.fields.map((field) => ({
        value: field.key,
        label: fieldLabel(field, (key) => t(key)),
      })),
    });
  }
  return options;
});

function filterFieldOption(input: string, option?: { label?: unknown }): boolean {
  // Pin `getInitialConfigWithoutFields` searches the field select by label,
  // since the default search matches the (ES key) value instead.
  return String(option?.label ?? '').toLowerCase().includes(input.toLowerCase());
}

function childPath(index: number): string {
  return props.path ? `${props.path}-${index}` : `${index}`;
}

function ruleField(rule: QueryRule): QueryBuilderFieldDef | undefined {
  return findFieldDef(props.fields, rule.field);
}

function defaultField(): QueryBuilderFieldDef {
  return findFieldDef(props.fields, 'ownerDisplayName') ?? sortedFields.value[0] ?? props.fields[0];
}

function emitGroup(next: QueryGroup): void {
  emit('update:group', next);
}

function updateChild(index: number, next: QueryNode): void {
  const children = [...props.group.children];
  children[index] = next;
  emitGroup({ ...props.group, children });
}

function removeChild(index: number): void {
  const children = props.group.children.filter((_, item) => item !== index);
  emitGroup({ ...props.group, children });
}

function addRule(): void {
  const field = defaultField();
  if (!field) {
    return;
  }
  emitGroup({ ...props.group, children: [...props.group.children, createQueryRule(field)] });
}

function addGroup(): void {
  emitGroup({ ...props.group, children: [...props.group.children, emptyQueryGroup()] });
}

function onConjunctionChange(value: unknown): void {
  emitGroup({ ...props.group, conjunction: value === 'OR' ? 'OR' : 'AND' });
}

function onFieldChange(index: number, key: unknown): void {
  const field = findFieldDef(props.fields, String(key ?? ''));
  if (!field) {
    return;
  }
  const next = createQueryRule(field);
  delete optionsByPath.value[childPath(index)];
  updateChild(index, next);
}

function onOperatorChange(index: number, operator: unknown): void {
  const child = props.group.children[index];
  if (!child || child.kind !== 'rule') {
    return;
  }
  const field = ruleField(child);
  if (!field) {
    return;
  }
  const nextOperator = operator as QueryOperator;
  updateChild(index, { ...child, operator: nextOperator, value: defaultRuleValue(field, nextOperator) });
}

function onValueChange(index: number, value: QueryValue): void {
  const child = props.group.children[index];
  if (!child || child.kind !== 'rule') {
    return;
  }
  updateChild(index, { ...child, value });
}

function onBetweenChange(index: number, position: 0 | 1, value: unknown): void {
  const child = props.group.children[index];
  if (!child || child.kind !== 'rule') {
    return;
  }
  const current: [number | null, number | null] = Array.isArray(child.value)
    ? (child.value as [number | null, number | null])
    : [null, null];
  const next: [number | null, number | null] = [...current];
  next[position] = typeof value === 'number' ? value : null;
  // Keep a half-filled pair in the tree (the rule stays incomplete until
  // both bounds are set); collapsing it to null here would lose the bound
  // just entered and the range could never be completed.
  updateChild(index, { ...child, value: next });
}

function onDateBetweenChange(index: number, position: 0 | 1, dateString: unknown): void {
  const child = props.group.children[index];
  if (!child || child.kind !== 'rule') {
    return;
  }
  const current: [string | null, string | null] = Array.isArray(child.value)
    ? (child.value as [string | null, string | null])
    : [null, null];
  const next: [string | null, string | null] = [...current];
  next[position] = typeof dateString === 'string' && dateString ? dateString : null;
  // Keep a half-filled pair in the tree (see onBetweenChange).
  updateChild(index, { ...child, value: next });
}

function betweenNumberBound(rule: QueryRule, position: 0 | 1): number | undefined {
  const value = rule.value;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const bound = value[position];
  return typeof bound === 'number' ? bound : undefined;
}

function betweenDateBound(rule: QueryRule, position: 0 | 1): string | undefined {
  const value = rule.value;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const bound = value[position];
  return typeof bound === 'string' ? bound : undefined;
}

/** The Select value for a select/multiselect rule (single string, or the string options). */
function selectValue(rule: QueryRule): string | string[] | undefined {
  const value = rule.value;
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

function operatorOptions(rule: QueryRule): Array<{ value: string; label: string }> {
  const field = ruleField(rule);
  return (field?.operators ?? []).map((operator) => ({
    value: operator,
    label: t(`explore.operators.${operator}`),
  }));
}

function isMultiValue(rule: QueryRule): boolean {
  return MULTI_VALUE_OPERATORS.includes(rule.operator);
}

function needsValue(rule: QueryRule): boolean {
  return !NULL_CHECK_OPERATORS.includes(rule.operator);
}

function isBetween(rule: QueryRule): boolean {
  return BETWEEN_OPERATORS.includes(rule.operator);
}

function optionLabel(option: QueryFieldOption): string {
  return option.labelKey ? t(option.labelKey) : option.label;
}

function valueOptions(path: string, rule: QueryRule): Array<{ value: string; label: string }> {
  const field = ruleField(rule);
  if (!field) {
    return [];
  }
  const fetched = (optionsByPath.value[path] ?? []).map((option) => ({
    value: option.value,
    label: optionLabel(option),
  }));
  const selected: string[] = Array.isArray(rule.value)
    ? rule.value.filter((item): item is string => typeof item === 'string')
    : typeof rule.value === 'string'
      ? [rule.value]
      : [];
  const seen = new Set(fetched.map((option) => option.value));
  for (const value of selected) {
    if (value && !seen.has(value)) {
      fetched.push({ value, label: value });
    }
  }
  return fetched;
}

function scheduleFetch(path: string, field: QueryBuilderFieldDef, searchText: string): void {
  const pending = searchTimers.get(path);
  if (pending) {
    clearTimeout(pending);
  }
  // Pin `autocomplete` debounces the aggregate fetch 300ms.
  searchTimers.set(
    path,
    setTimeout(() => {
      void loadOptions(path, field, searchText);
    }, 300),
  );
}

async function loadOptions(path: string, field: QueryBuilderFieldDef, searchText: string): Promise<void> {
  if (loadingPaths.value.has(path)) {
    return;
  }
  loadingPaths.value.add(path);
  try {
    optionsByPath.value = { ...optionsByPath.value, [path]: await props.fetchOptions(field, searchText) };
  } catch {
    optionsByPath.value = { ...optionsByPath.value, [path]: [] };
  } finally {
    loadingPaths.value.delete(path);
  }
}

function onValueSearch(path: string, rule: QueryRule, searchText: string): void {
  const field = ruleField(rule);
  if (!field) {
    return;
  }
  scheduleFetch(path, field, searchText);
}

function onValueDropdown(path: string, rule: QueryRule, open: boolean): void {
  if (!open) {
    return;
  }
  const field = ruleField(rule);
  if (!field || optionsByPath.value[path] !== undefined) {
    return;
  }
  void loadOptions(path, field, '');
}
</script>

<template>
  <div
    class="advanced-search-group"
    :class="{ 'advanced-search-group--nested': depth > 0 }"
    :data-testid="`${testIdPrefix}-group-${path || 'root'}`"
  >
    <div class="advanced-search-group__header">
      <Select
        :data-testid="`${testIdPrefix}-group-${path || 'root'}-conjunction`"
        class="advanced-search-group__conjunction"
        size="small"
        :value="group.conjunction"
        :aria-label="t('explore.advancedConjunction')"
        :options="[
          { value: 'AND', label: 'AND' },
          { value: 'OR', label: 'OR' },
        ]"
        @change="onConjunctionChange"
      />
      <Button size="small" :data-testid="`${testIdPrefix}-group-${path || 'root'}-add-rule`" @click="addRule">
        {{ t('explore.advancedAddRule') }}
      </Button>
      <Button size="small" :data-testid="`${testIdPrefix}-group-${path || 'root'}-add-group`" @click="addGroup">
        {{ t('explore.advancedAddGroup') }}
      </Button>
      <Button
        v-if="depth > 0"
        size="small"
        danger
        :data-testid="`${testIdPrefix}-group-${path || 'root'}-remove`"
        @click="emit('remove')"
      >
        {{ t('explore.advancedRemove') }}
      </Button>
    </div>
    <div class="advanced-search-group__children">
      <template v-for="(child, index) in group.children" :key="index">
        <AdvancedSearchGroup
          v-if="child.kind === 'group'"
          :group="child"
          :fields="fields"
          :fetch-options="fetchOptions"
          :path="childPath(index)"
          :depth="depth + 1"
          :test-id-prefix="testIdPrefix"
          @update:group="updateChild(index, $event)"
          @remove="removeChild(index)"
        />
        <div v-else class="advanced-search-group__rule">
          <Select
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-field`"
            class="advanced-search-group__field"
            show-search
            :value="child.field"
            :aria-label="t('explore.advancedField')"
            :options="fieldSelectOptions"
            :filter-option="filterFieldOption"
            @change="(key: unknown) => onFieldChange(index, key)"
          />
          <Select
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-operator`"
            class="advanced-search-group__operator"
            :value="child.operator"
            :aria-label="t('explore.advancedOperator')"
            :options="operatorOptions(child)"
            @change="(operator: unknown) => onOperatorChange(index, operator)"
          />
          <span v-if="!needsValue(child)" class="advanced-search-group__no-value">
            {{ t('explore.advancedNoValue') }}
          </span>
          <template v-else-if="isBetween(child)">
            <template v-if="ruleField(child)?.type === 'date'">
              <DatePicker
                :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value-from`"
                class="advanced-search-group__value"
                :value="betweenDateBound(child, 0)"
                value-format="YYYY-MM-DD"
                :aria-label="t('explore.advancedValue')"
                @change="(_date: unknown, dateString: unknown) => onDateBetweenChange(index, 0, dateString)"
              />
              <DatePicker
                :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value-to`"
                class="advanced-search-group__value"
                :value="betweenDateBound(child, 1)"
                value-format="YYYY-MM-DD"
                :aria-label="t('explore.advancedValue')"
                @change="(_date: unknown, dateString: unknown) => onDateBetweenChange(index, 1, dateString)"
              />
            </template>
            <template v-else>
              <InputNumber
                :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value-from`"
                class="advanced-search-group__value"
                :value="betweenNumberBound(child, 0)"
                :aria-label="t('explore.advancedValue')"
                @change="(value: unknown) => onBetweenChange(index, 0, value)"
              />
              <InputNumber
                :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value-to`"
                class="advanced-search-group__value"
                :value="betweenNumberBound(child, 1)"
                :aria-label="t('explore.advancedValue')"
                @change="(value: unknown) => onBetweenChange(index, 1, value)"
              />
            </template>
          </template>
          <Select
            v-else-if="ruleField(child)?.type === 'select' || ruleField(child)?.type === 'multiselect'"
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value`"
            class="advanced-search-group__value"
            show-search
            :mode="isMultiValue(child) ? 'multiple' : undefined"
            :value="selectValue(child)"
            :aria-label="t('explore.advancedValue')"
            :options="valueOptions(childPath(index), child)"
            :filter-option="false"
            :loading="loadingPaths.has(childPath(index))"
            @search="(text: string) => onValueSearch(childPath(index), child, text)"
            @dropdown-visible-change="(open: boolean) => onValueDropdown(childPath(index), child, open)"
            @change="(value: unknown) => onValueChange(index, value as QueryValue)"
          />
          <Select
            v-else-if="ruleField(child)?.type === 'boolean'"
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value`"
            class="advanced-search-group__value"
            :value="typeof child.value === 'boolean' ? String(child.value) : undefined"
            :aria-label="t('explore.advancedValue')"
            :options="[
              { value: 'true', label: t('explore.advancedTrue') },
              { value: 'false', label: t('explore.advancedFalse') },
            ]"
            @change="(value: unknown) => onValueChange(index, value === 'true')"
          />
          <InputNumber
            v-else-if="ruleField(child)?.type === 'number'"
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value`"
            class="advanced-search-group__value"
            :value="typeof child.value === 'number' ? child.value : undefined"
            :aria-label="t('explore.advancedValue')"
            @change="(value: unknown) => onValueChange(index, typeof value === 'number' ? value : null)"
          />
          <DatePicker
            v-else-if="ruleField(child)?.type === 'date'"
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value`"
            class="advanced-search-group__value"
            :value="typeof child.value === 'string' ? child.value : undefined"
            value-format="YYYY-MM-DD"
            :aria-label="t('explore.advancedValue')"
            @change="(_date: unknown, dateString: unknown) => onValueChange(index, typeof dateString === 'string' && dateString ? dateString : null)"
          />
          <Input
            v-else
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-value`"
            class="advanced-search-group__value"
            :value="typeof child.value === 'string' ? child.value : ''"
            :aria-label="t('explore.advancedValue')"
            :placeholder="t('explore.advancedValue')"
            @update:value="(value: string) => onValueChange(index, value)"
          />
          <Button
            size="small"
            danger
            :data-testid="`${testIdPrefix}-rule-${childPath(index)}-remove`"
            :aria-label="t('explore.advancedRemove')"
            @click="removeChild(index)"
          >
            {{ t('explore.advancedRemove') }}
          </Button>
        </div>
      </template>
      <Typography.Text v-if="!group.children.length" type="secondary">
        {{ t('explore.advancedEmptyGroup') }}
      </Typography.Text>
    </div>
  </div>
</template>

<style scoped>
.advanced-search-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.advanced-search-group--nested {
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 8px;
}
.advanced-search-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.advanced-search-group__conjunction {
  min-width: 90px;
}
.advanced-search-group__children {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 12px;
}
.advanced-search-group__rule {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(140px, 180px) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.advanced-search-group__no-value {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
</style>
