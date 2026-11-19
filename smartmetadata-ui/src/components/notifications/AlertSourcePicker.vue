<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Alert, Button, Select, Tag } from 'ant-design-vue';
import type { DefaultOptionType, SelectValue } from 'ant-design-vue/es/select';
import { useI18n } from 'vue-i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import {
  getEntityNameLabel,
  getSourceKindLabel,
  getSourceOptions,
  groupSourcesByKind,
} from '@/utils/notifications/alertSelection';
import type { TranslateFn } from '@/utils/notifications/alertUtils';

/**
 * Several sources for one alert, grouped by kind, ported from pin
 * components/Alerts/AlertSourcePicker/AlertSourcePicker.tsx. The
 * server lists them. A source that would break a rule is shown
 * disabled with the reason beside it, rather than failing on save. A
 * selected source that can never produce a match with what has been
 * chosen so far gets a warning, and the alert can still be saved.
 * When the server could not answer, it says so and offers to ask
 * again. Option icons are not rendered: the product has no
 * entity-icon utility for arbitrary source types.
 */
const props = withDefaults(
  defineProps<{
    value?: string[];
    capabilities: AlertSelectionState['capabilities'];
    disabled?: boolean;
    invalid?: boolean;
    hint?: string;
  }>(),
  { value: () => [], disabled: false, invalid: false, hint: undefined },
);
const emit = defineEmits<{ 'update:value': [value: string[]] }>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const withoutAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();

const sourceOptions = computed(() =>
  getSourceOptions(props.value, props.capabilities.selection, props.capabilities.knownSources),
);
const hasFailed = computed(
  () => props.capabilities.settled && !props.capabilities.loading && !props.capabilities.selection,
);
const groups = computed(() => groupSourcesByKind(sourceOptions.value));
const membersOfHeader = computed(
  () =>
    new Map(groups.value.map(({ kind, sources }) => [`header-${kind}`, sources.map((s) => s.name)])),
);

interface PickerItem {
  id: string;
  label: string;
  isDisabled: boolean;
  supportingText?: string;
}

const items = computed<PickerItem[]>(() =>
  groups.value.flatMap(({ kind, sources: members }) => [
    { id: `header-${kind}`, label: getSourceKindLabel(kind, translate), isDisabled: true },
    ...members.map((option) => ({
      id: option.name,
      label: getEntityNameLabel(option.name, translate),
      isDisabled: option.disabled,
      supportingText: option.reason,
    })),
  ]),
);

const selectedLabels = computed(() => {
  const labels = new Map<string, string>();
  for (const item of items.value) {
    labels.set(item.id, item.label);
  }
  return labels;
});

const reasonsByName = computed(() => {
  const reasons = new Map<string, string>();
  for (const item of items.value) {
    if (item.supportingText) {
      reasons.set(item.id, item.supportingText);
    }
  }
  return reasons;
});

const warnings = computed(() => sourceOptions.value.filter((option) => option.warning));

function reasonFor(value: string): string | undefined {
  return reasonsByName.value.get(value);
}

const placeholder = computed(() => {
  if (props.value.length === 0) {
    return t('label.select-field', { field: t('label.source-plural') });
  }
  return props.disabled ? '' : t('label.add-another');
});

// The dropdown never lists a source already chosen; a group's header
// stays only while one of its sources can still be picked.
const dropdownOptions = computed(() => {
  const options: Array<{
    value: string;
    label: string;
    disabled: boolean;
    title?: string;
  }> = [];
  for (const item of items.value) {
    const members = membersOfHeader.value.get(item.id);
    if (members) {
      if (members.some((name) => !props.value.includes(name))) {
        options.push({ value: item.id, label: item.label, disabled: true });
      }
      continue;
    }
    if (props.value.includes(item.id)) {
      continue;
    }
    options.push({
      value: item.id,
      label: item.label,
      disabled: item.isDisabled,
      title: item.supportingText,
    });
  }
  return options;
});

function filterOption(input: string, option?: DefaultOptionType): boolean {
  const search = withoutAccents(input.trim());
  const matches = (name: string): boolean =>
    !props.value.includes(name) &&
    withoutAccents(getEntityNameLabel(name, translate)).includes(search);
  const id = String(option?.value ?? '');
  const members = membersOfHeader.value.get(id);
  return members ? members.some(matches) : matches(id);
}

function onChange(values: SelectValue): void {
  const next = (Array.isArray(values) ? values : [values])
    .map((value) => String(value))
    .filter((value) => !value.startsWith('header-'));
  emit('update:value', next);
}

function resolveLabel(value: string): string {
  return selectedLabels.value.get(value) ?? getEntityNameLabel(value, translate);
}
</script>

<template>
  <div class="alert-source-picker">
    <Select
      :value="value"
      mode="multiple"
      show-search
      :filter-option="filterOption"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="t('label.source-plural')"
      data-testid="source-select"
      :status="invalid || hint ? 'error' : undefined"
      style="width: 100%"
      :options="dropdownOptions"
      @change="onChange"
    >
      <template #tagRender="{ value: tagValue, closable, onClose }">
        <Tag :closable="closable && !disabled" @close="onClose">
          {{ resolveLabel(String(tagValue)) }}
        </Tag>
      </template>
      <template #option="{ value: optionValue, label }">
        <span
          :data-testid="`${optionValue}-option`"
          :class="{ 'alert-source-picker__header': String(optionValue).startsWith('header-') }"
        >
          {{ label }}
          <span v-if="reasonFor(String(optionValue))" class="alert-source-picker__reason">
            {{ reasonFor(String(optionValue)) }}
          </span>
        </span>
      </template>
    </Select>
    <div v-if="hint" class="alert-source-picker__hint">{{ hint }}</div>
    <Alert
      v-if="hasFailed"
      type="error"
      data-testid="source-select-error"
      :message="t('server.entity-fetch-error', { entity: t('label.source-plural') })"
      show-icon
    >
      <template #action>
        <Button type="link" size="small" data-testid="source-select-retry" @click="capabilities.retry">
          {{ t('label.retry') }}
        </Button>
      </template>
    </Alert>
    <Alert
      v-for="option in warnings"
      :key="option.name"
      type="warning"
      :data-testid="`${option.name}-warning`"
      :message="`${getEntityNameLabel(option.name, translate)}: ${option.warning}`"
      show-icon
    />
  </div>
</template>

<style scoped>
.alert-source-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.alert-source-picker__header {
  cursor: default;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sm-text-secondary);
  opacity: 0.5;
}

.alert-source-picker__hint {
  color: var(--sm-color-error);
  font-size: 12px;
}

.alert-source-picker__reason {
  color: var(--sm-text-secondary);
  margin-left: 8px;
}
</style>
