<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Select, Skeleton, Typography, message } from 'ant-design-vue';
import { createMetric } from '@/api/metrics';
import { getPropertyConfigSummary } from '@/api/customProperties';
import type { IntakeFormField } from '@/api/intakeForms';
import type { CustomPropertyDef } from '@/types/collaboration';
import type { EntityRef } from '@/types/api';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import {
  METRIC_FORM_DEFAULTS,
  METRIC_GRANULARITY_VALUES,
  METRIC_LANGUAGE_VALUES,
  METRIC_TYPE_VALUES,
  METRIC_UNIT_VALUES,
  transformMetricFormData,
  validateMetricForm,
  type MetricFormError,
  type MetricFormValues,
} from '@/features/metrics/metricForm';
import { useMetricIntakeForm } from '@/features/metrics/metricIntakeForm';
import {
  fetchDomainOptions,
  fetchParentMetricOptions,
  fetchRelatedMetricOptions,
  fetchUserTeamOptions,
  type MetricOption,
} from '@/features/metrics/metricOptionLoaders';

/**
 * Official AddMetricForm + useMetricCreateDrawer (components/Metric/
 * AddMetric) equivalent, rendered through the product's SmDrawer.
 *
 * - Width is the product `form` tier (700), not the official 670 —
 *   drawer width is visual sizing, product style rules (see
 *   ADR:2026-11-08-metric-create-drawer-width-700).
 * - Mask click / Escape do NOT close the drawer (official
 *   closeOnEscape/closeOnBackdrop = false); navigation still closes
 *   it (SmDrawer's existing close-on-navigation).
 * - The save button is disabled until the intake form is loaded
 *   (official: the button is gated on intake.isLoaded); the submit
 *   handler checks again as a second line of defense.
 * - Success resets the form and emits `created` with the new FQN —
 *   the list navigates to the metric detail page. Failure toasts and
 *   leaves the drawer open with the form intact.
 * - Extension fields render per custom-property type: an enum select
 *   for enum values, a number input for integer/number/timestamp,
 *   a text input otherwise. Table / entity-reference / hyperlink /
 *   time-interval extension types have no dedicated editor in this
 *   batch and render as text inputs; their values still serialize
 *   through the official per-type serializers.
 */
const props = defineProps<{ open: boolean; parentMetricFqn?: string }>();
const emit = defineEmits<{
  'update:open': [open: boolean];
  created: [fqn: string];
}>();

const { t, te } = useI18n();

const SEARCH_DEBOUNCE_MS = 250;

function freshDefaults(): MetricFormValues {
  return {
    ...METRIC_FORM_DEFAULTS,
    owners: [],
    reviewers: [],
    domains: [],
    relatedMetrics: [],
    extensionFormValues: {},
  };
}

const values = ref<MetricFormValues>(freshDefaults());
const errors = ref<MetricFormError[]>([]);
const submitting = ref(false);
const loadIntake = ref(false);

const intakeEnabled = computed(() => props.open && loadIntake.value);
const intake = useMetricIntakeForm(intakeEnabled);

const userTeamOptions = ref<MetricOption[]>([]);
const domainOptions = ref<MetricOption[]>([]);
const metricOptions = ref<MetricOption[]>([]);
const userTeamRefs = new Map<string, EntityRef>();
const domainRefs = new Map<string, EntityRef>();
const metricRefs = new Map<string, EntityRef>();

function upsertOptions(
  refs: Map<string, EntityRef>,
  current: MetricOption[],
  next: MetricOption[],
): MetricOption[] {
  for (const option of next) {
    refs.set(option.value, option.ref);
  }
  const seen = new Set(next.map((option) => option.value));
  return [...next, ...current.filter((option) => !seen.has(option.value))];
}

async function loadUserTeamOptions(searchText: string): Promise<void> {
  userTeamOptions.value = upsertOptions(
    userTeamRefs,
    userTeamOptions.value,
    await fetchUserTeamOptions(searchText),
  );
}

async function loadDomainOptions(searchText: string): Promise<void> {
  domainOptions.value = upsertOptions(
    domainRefs,
    domainOptions.value,
    await fetchDomainOptions(searchText),
  );
}

async function loadMetricOptions(searchText: string): Promise<void> {
  const [related, parents] = await Promise.all([
    fetchRelatedMetricOptions(searchText),
    fetchParentMetricOptions(searchText),
  ]);
  metricOptions.value = upsertOptions(metricRefs, metricOptions.value, [
    ...related,
    ...parents,
  ]);
}

function debounced(loader: (text: string) => Promise<void>): (text: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (text: string) => {
    window.clearTimeout(timer);
    timer = setTimeout(() => {
      void loader(text);
    }, SEARCH_DEBOUNCE_MS);
  };
}

const debouncedUserTeamSearch = debounced(loadUserTeamOptions);
const debouncedDomainSearch = debounced(loadDomainOptions);
const debouncedMetricSearch = debounced(loadMetricOptions);

const metricTypeOptions = computed(() =>
  METRIC_TYPE_VALUES.map((value) => ({
    value,
    label: t(`metrics.enums.metricType.${value}`),
  })),
);
const granularityOptions = computed(() =>
  METRIC_GRANULARITY_VALUES.map((value) => ({
    value,
    label: t(`metrics.enums.granularity.${value}`),
  })),
);
const unitOptions = computed(() =>
  METRIC_UNIT_VALUES.map((value) => ({
    value,
    label: t(`metrics.enums.unitOfMeasurement.${value}`),
  })),
);
const languageOptions = computed(() =>
  METRIC_LANGUAGE_VALUES.map((value) => ({
    value,
    label: t(`metrics.enums.language.${value}`),
  })),
);

const isCustomUnit = computed(() => values.value.unitOfMeasurement === 'OTHER');

const requiredExtensionNames = computed(() =>
  intake.extensionFormFields.value
    .filter((field) => field.required)
    .map((field) => extensionPropertyName(field)),
);

function extensionPropertyName(field: IntakeFormField): string {
  return field.fieldPath.startsWith('extension.')
    ? field.fieldPath.slice('extension.'.length)
    : field.fieldPath;
}

function extensionDefinition(field: IntakeFormField): CustomPropertyDef | undefined {
  const name = extensionPropertyName(field);
  return intake.customProperties.value.find((property) => property.name === name);
}

function extensionValue(name: string): unknown {
  return values.value.extensionFormValues[name];
}

function setExtensionValue(name: string, value: unknown): void {
  values.value.extensionFormValues = {
    ...values.value.extensionFormValues,
    [name]: value,
  };
}

function fieldLabel(field: string): string {
  if (field.startsWith('extension.')) {
    const name = field.slice('extension.'.length);
    const found = intake.extensionFormFields.value.find(
      (entry) => extensionPropertyName(entry) === name,
    );
    return found?.fieldLabel ?? name;
  }
  return te(`metrics.form.${field}`) ? t(`metrics.form.${field}`) : field;
}

function errorFor(field: string): string {
  const error = errors.value.find((entry) => entry.field === field);
  if (!error) {
    return '';
  }
  const params: Record<string, string | number> = { ...(error.params ?? {}) };
  if (typeof params.field === 'string') {
    params.field = fieldLabel(params.field);
  }
  return t(`metrics.validation.${error.messageKey}`, params);
}

function isRequired(field: string): boolean {
  if (field === 'name' || field === 'code') {
    return true;
  }
  if (field === 'customUnitOfMeasurement') {
    return isCustomUnit.value;
  }
  return intake.requiredNativeFields.value.has(field);
}

function refsForOptions(
  refs: Map<string, EntityRef>,
  selected: EntityRef[],
  keyOf: (ref: EntityRef) => string,
): string[] {
  return selected
    .map((ref) => keyOf(ref))
    .filter((value) => refs.has(value));
}

function refsFromValues(
  refs: Map<string, EntityRef>,
  selectedValues: string[],
): EntityRef[] {
  return selectedValues.flatMap((value) => {
    const ref = refs.get(value);
    return ref ? [ref] : [];
  });
}

function userTeamKey(ref: EntityRef): string {
  return `${ref.type}:${ref.name}`;
}

function fqnKey(ref: EntityRef): string {
  return ref.fullyQualifiedName ?? ref.name ?? '';
}

function onOwnersChange(selectedValues: string[]): void {
  values.value.owners = refsFromValues(userTeamRefs, selectedValues);
}

function onReviewersChange(selectedValues: string[]): void {
  values.value.reviewers = refsFromValues(userTeamRefs, selectedValues);
}

function onDomainsChange(selectedValues: string[]): void {
  values.value.domains = refsFromValues(domainRefs, selectedValues);
}

function onRelatedMetricsChange(selectedValues: string[]): void {
  values.value.relatedMetrics = refsFromValues(metricRefs, selectedValues);
}

function onParentMetricChange(selectedValue: string | undefined): void {
  values.value.parentMetric = selectedValue
    ? (metricRefs.get(selectedValue) ?? null)
    : null;
}

function close(): void {
  emit('update:open', false);
}

async function handleSubmit(): Promise<void> {
  errors.value = validateMetricForm(
    values.value,
    intake.requiredNativeFields.value,
    requiredExtensionNames.value,
  );
  if (errors.value.length > 0) {
    return;
  }
  // Second line of defense: the save button is already disabled while
  // the intake form is loading (official handleCreate throws when
  // !intake.isLoaded).
  if (!intake.isLoaded.value) {
    return;
  }
  submitting.value = true;
  try {
    const payload = transformMetricFormData(
      values.value,
      props.parentMetricFqn,
      intake.customProperties.value,
    );
    const metric = await createMetric(payload);
    values.value = freshDefaults();
    errors.value = [];
    emit('update:open', false);
    emit('created', metric.fullyQualifiedName);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      loadIntake.value = true;
      values.value = freshDefaults();
      errors.value = [];
    }
  },
);
</script>

<template>
  <SmDrawer
    :open="open"
    :title="t('metrics.createTitle')"
    :ok-text="t('crud.create')"
    :confirm-loading="submitting"
    :ok-disabled="!intake.isLoaded.value || submitting"
    :mask-closable="false"
    :keyboard="false"
    width-key="form"
    test-id="metric-create-drawer"
    @ok="handleSubmit"
    @cancel="close"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="intake.isError.value" data-testid="metric-create-intake-error">
      <Alert type="error" :message="t('metrics.intakeLoadFailed')" show-icon>
        <template #description>
          <Button
            type="link"
            data-testid="metric-intake-retry"
            @click="intake.retry()"
          >
            {{ t('shared.retry') }}
          </Button>
        </template>
      </Alert>
    </div>
    <div v-else-if="!intake.isLoaded.value" data-testid="metric-create-intake-loading">
      <Skeleton :active="true" :paragraph="{ rows: 6 }" />
    </div>
    <div v-else class="metric-create-drawer__form" data-testid="metric-create-form">
      <Alert
        v-if="parentMetricFqn"
        type="info"
        data-testid="parent-metric-inherited"
        :message="t('metrics.parentMetric')"
        :description="parentMetricFqn"
        show-icon
        style="margin-bottom: 16px"
      />
      <div class="metric-create-drawer__field">
        <label>{{ t('metrics.form.name') }} *</label>
        <Input
          :value="values.name"
          data-testid="metric-create-name"
          :placeholder="t('metrics.form.name')"
          @update:value="(value: string) => { values.name = value; }"
        />
        <Typography.Text v-if="errorFor('name')" type="danger">
          {{ errorFor('name') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>{{ t('metrics.form.displayName') }}</label>
        <Input
          :value="values.displayName"
          data-testid="metric-create-display-name"
          :placeholder="t('metrics.form.displayName')"
          @update:value="(value: string) => { values.displayName = value; }"
        />
        <Typography.Text v-if="errorFor('displayName')" type="danger">
          {{ errorFor('displayName') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>{{ t('metrics.form.description') }}</label>
        <Input.TextArea
          :value="values.description"
          data-testid="metric-create-description"
          :placeholder="t('metrics.form.description')"
          :rows="3"
          @update:value="(value: string) => { values.description = value; }"
        />
        <Typography.Text v-if="errorFor('description')" type="danger">
          {{ errorFor('description') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.metricType') }}
          <span v-if="isRequired('metricType')"> *</span>
        </label>
        <Select
          :value="values.metricType ?? undefined"
          :options="metricTypeOptions"
          data-testid="metric-create-metric-type"
          allow-clear
          :placeholder="t('metrics.form.metricType')"
          style="width: 100%"
          @change="(value: string | undefined) => { values.metricType = value ?? null; }"
        />
        <Typography.Text v-if="errorFor('metricType')" type="danger">
          {{ errorFor('metricType') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.granularity') }}
          <span v-if="isRequired('granularity')"> *</span>
        </label>
        <Select
          :value="values.granularity ?? undefined"
          :options="granularityOptions"
          data-testid="metric-create-granularity"
          allow-clear
          :placeholder="t('metrics.form.granularity')"
          style="width: 100%"
          @change="(value: string | undefined) => { values.granularity = value ?? null; }"
        />
        <Typography.Text v-if="errorFor('granularity')" type="danger">
          {{ errorFor('granularity') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.unitOfMeasurement') }}
          <span v-if="isRequired('unitOfMeasurement')"> *</span>
        </label>
        <Select
          :value="values.unitOfMeasurement ?? undefined"
          :options="unitOptions"
          data-testid="metric-create-unit"
          allow-clear
          :placeholder="t('metrics.form.unitOfMeasurement')"
          style="width: 100%"
          @change="(value: string | undefined) => { values.unitOfMeasurement = value ?? null; }"
        />
        <Typography.Text v-if="errorFor('unitOfMeasurement')" type="danger">
          {{ errorFor('unitOfMeasurement') }}
        </Typography.Text>
      </div>
      <div v-if="isCustomUnit" class="metric-create-drawer__field">
        <label>{{ t('metrics.form.customUnitOfMeasurement') }} *</label>
        <Input
          :value="values.customUnitOfMeasurement"
          data-testid="metric-create-custom-unit"
          :placeholder="t('metrics.form.customUnitOfMeasurement')"
          @update:value="(value: string) => { values.customUnitOfMeasurement = value; }"
        />
        <Typography.Text v-if="errorFor('customUnitOfMeasurement')" type="danger">
          {{ errorFor('customUnitOfMeasurement') }}
        </Typography.Text>
      </div>
      <div v-if="!parentMetricFqn" class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.parentMetric') }}
          <span v-if="isRequired('parentMetric')"> *</span>
        </label>
        <Select
          :value="values.parentMetric ? fqnKey(values.parentMetric) : undefined"
          :options="metricOptions"
          show-search
          :filter-option="false"
          data-testid="metric-create-parent-metric"
          allow-clear
          :placeholder="t('metrics.form.parentMetric')"
          style="width: 100%"
          @focus="() => { if (metricOptions.length === 0) void loadMetricOptions(''); }"
          @search="debouncedMetricSearch"
          @change="(value: string | undefined) => onParentMetricChange(value)"
        />
        <Typography.Text v-if="errorFor('parentMetric')" type="danger">
          {{ errorFor('parentMetric') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.owners') }}
          <span v-if="isRequired('owners')"> *</span>
        </label>
        <Select
          :value="refsForOptions(userTeamRefs, values.owners, userTeamKey)"
          :options="userTeamOptions"
          show-search
          :filter-option="false"
          mode="multiple"
          data-testid="metric-create-owners"
          :placeholder="t('metrics.form.owners')"
          style="width: 100%"
          @focus="() => { if (userTeamOptions.length === 0) void loadUserTeamOptions(''); }"
          @search="debouncedUserTeamSearch"
          @change="(selected: string[]) => onOwnersChange(selected)"
        />
        <Typography.Text v-if="errorFor('owners')" type="danger">
          {{ errorFor('owners') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.reviewers') }}
          <span v-if="isRequired('reviewers')"> *</span>
        </label>
        <Select
          :value="refsForOptions(userTeamRefs, values.reviewers, userTeamKey)"
          :options="userTeamOptions"
          show-search
          :filter-option="false"
          mode="multiple"
          data-testid="metric-create-reviewers"
          :placeholder="t('metrics.form.reviewers')"
          style="width: 100%"
          @focus="() => { if (userTeamOptions.length === 0) void loadUserTeamOptions(''); }"
          @search="debouncedUserTeamSearch"
          @change="(selected: string[]) => onReviewersChange(selected)"
        />
        <Typography.Text v-if="errorFor('reviewers')" type="danger">
          {{ errorFor('reviewers') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.domains') }}
          <span v-if="isRequired('domains')"> *</span>
        </label>
        <Select
          :value="refsForOptions(domainRefs, values.domains, fqnKey)"
          :options="domainOptions"
          show-search
          :filter-option="false"
          mode="multiple"
          data-testid="metric-create-domains"
          :placeholder="t('metrics.form.domains')"
          style="width: 100%"
          @focus="() => { if (domainOptions.length === 0) void loadDomainOptions(''); }"
          @search="debouncedDomainSearch"
          @change="(selected: string[]) => onDomainsChange(selected)"
        />
        <Typography.Text v-if="errorFor('domains')" type="danger">
          {{ errorFor('domains') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>{{ t('metrics.form.relatedMetrics') }}</label>
        <Select
          :value="refsForOptions(metricRefs, values.relatedMetrics, fqnKey)"
          :options="metricOptions"
          show-search
          :filter-option="false"
          mode="multiple"
          data-testid="metric-create-related-metrics"
          :placeholder="t('metrics.form.relatedMetrics')"
          style="width: 100%"
          @focus="() => { if (metricOptions.length === 0) void loadMetricOptions(''); }"
          @search="debouncedMetricSearch"
          @change="(selected: string[]) => onRelatedMetricsChange(selected)"
        />
        <Typography.Text v-if="errorFor('relatedMetrics')" type="danger">
          {{ errorFor('relatedMetrics') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>
          {{ t('metrics.form.language') }}
          <span v-if="isRequired('language')"> *</span>
        </label>
        <Select
          :value="values.language"
          :options="languageOptions"
          data-testid="metric-create-language"
          :placeholder="t('metrics.form.language')"
          style="width: 100%"
          @change="(value: string) => { values.language = value; }"
        />
        <Typography.Text v-if="errorFor('language')" type="danger">
          {{ errorFor('language') }}
        </Typography.Text>
      </div>
      <div class="metric-create-drawer__field">
        <label>{{ t('metrics.form.code') }} *</label>
        <Input.TextArea
          :value="values.code"
          data-testid="metric-create-code"
          :placeholder="t('metrics.form.code')"
          :rows="4"
          @update:value="(value: string) => { values.code = value; }"
        />
        <Typography.Text v-if="errorFor('code')" type="danger">
          {{ errorFor('code') }}
        </Typography.Text>
      </div>
      <div
        v-for="field in intake.extensionFormFields.value"
        :key="field.fieldPath"
        class="metric-create-drawer__field"
      >
        <label>
          {{ field.fieldLabel }}
          <span v-if="field.required"> *</span>
        </label>
        <Select
          v-if="
            extensionDefinition(field) &&
            getPropertyConfigSummary(extensionDefinition(field)!)?.kind === 'values'
          "
          :value="extensionValue(extensionPropertyName(field)) as string | string[] | undefined"
          :options="
            (getPropertyConfigSummary(extensionDefinition(field)!)?.values ?? []).map(
              (value) => ({ value, label: value }),
            )
          "
          :mode="
            getPropertyConfigSummary(extensionDefinition(field)!)?.multiSelect
              ? 'multiple'
              : undefined
          "
          :data-testid="`metric-create-extension-${extensionPropertyName(field)}`"
          allow-clear
          style="width: 100%"
          @change="(value: string | string[]) => setExtensionValue(extensionPropertyName(field), value)"
        />
        <Input
          v-else-if="
            extensionDefinition(field) &&
            ['integer', 'number', 'timestamp'].includes(
              extensionDefinition(field)!.propertyType ?? '',
            )
          "
          :value="String(extensionValue(extensionPropertyName(field)) ?? '')"
          type="number"
          :data-testid="`metric-create-extension-${extensionPropertyName(field)}`"
          style="width: 100%"
          @update:value="
            (value: string) => setExtensionValue(extensionPropertyName(field), value)
          "
        />
        <Input
          v-else
          :value="String(extensionValue(extensionPropertyName(field)) ?? '')"
          :data-testid="`metric-create-extension-${extensionPropertyName(field)}`"
          style="width: 100%"
          @update:value="
            (value: string) => setExtensionValue(extensionPropertyName(field), value)
          "
        />
        <Typography.Text
          v-if="errorFor(`extension.${extensionPropertyName(field)}`)"
          type="danger"
        >
          {{ errorFor(`extension.${extensionPropertyName(field)}`) }}
        </Typography.Text>
      </div>
    </div>
  </SmDrawer>
</template>

<style scoped>
.metric-create-drawer__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.metric-create-drawer__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-create-drawer__field > label {
  font-weight: 500;
}
</style>
