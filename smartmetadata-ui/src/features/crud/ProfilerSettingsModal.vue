<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Input, InputNumber, Select, Switch, message } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import FormModal from '@/components/shared/FormModal.vue';
import { getTableProfilerConfig, putTableProfilerConfig } from '@/api/profiler';
import {
  DEFAULT_SETTINGS_VALUES,
  INTERVAL_TYPE_OPTIONS,
  INTERVAL_UNIT_OPTIONS,
  MIN_PROFILE_SAMPLE,
  PROFILE_SAMPLE_OPTIONS,
  PROFILER_ALL,
  PROFILER_SETTINGS_METRICS,
  cloneSettingsValues,
  collapseMetricSelection,
  partitionColumnsFor,
  resetPartitionFields,
  toFormValues,
  toProfilerConfig,
  type PartitionIntervalType,
  type ProfilerSettingsValues,
} from '@/quality/profilerSettings';

const props = defineProps<{
  open: boolean;
  tableId: string;
  columns: { name: string; dataType: string }[];
}>();

const emit = defineEmits<{
  (event: 'cancel'): void;
  (event: 'saved'): void;
}>();

const { t } = useI18n();
const formRef = ref();
const loading = ref(false);
const saving = ref(false);
const fetchFailed = ref(false);
const values = reactive<ProfilerSettingsValues>(cloneSettingsValues(DEFAULT_SETTINGS_VALUES));

// InputNumber's value type has no null: the form stores null for "unset"
// (the pin's shape), the input sees undefined, and clearing maps back.
const samplePercentage = computed<number | undefined>({
  get: () => values.profileSamplePercentage ?? undefined,
  set: (value) => {
    values.profileSamplePercentage = value ?? null;
  },
});

const columnOptions = computed(() => props.columns.map((column) => ({ value: column.name, label: column.name })));
const includeColumnOptions = computed(() => [
  { value: PROFILER_ALL, label: t('profilerSettings.all') },
  ...columnOptions.value,
]);
const metricOptions = computed(() => [
  { value: PROFILER_ALL, label: t('profilerSettings.all') },
  ...PROFILER_SETTINGS_METRICS.map((metric) => ({ value: metric, label: metric })),
]);
const partitionColumnOptions = computed(() =>
  partitionColumnsFor(props.columns, values.partitionIntervalType).map((column) => ({
    value: column.name,
    label: column.name,
  })),
);
const sampleOptions = computed(() =>
  PROFILE_SAMPLE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
);
const intervalTypeOptions = computed(() =>
  INTERVAL_TYPE_OPTIONS.map((type) => ({ value: type, label: type })),
);
const intervalUnitOptions = computed(() =>
  INTERVAL_UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
);

async function load() {
  loading.value = true;
  fetchFailed.value = false;
  try {
    const stored = await getTableProfilerConfig(props.tableId);
    Object.assign(values, cloneSettingsValues(stored ? toFormValues(stored) : DEFAULT_SETTINGS_VALUES));
  } catch {
    // A failed load disables save: saving defaults over a stored config
    // the load could not read would silently wipe it (the pin's rule).
    fetchFailed.value = true;
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void load();
    }
  },
  { immediate: true },
);

function onIntervalTypeChange(type: PartitionIntervalType | undefined) {
  values.partitionIntervalType = type;
  // The fields belong to the previous interval type: switching types
  // clears them (the pin's resetPartitionFields), so stale values never
  // survive into the saved payload or reappear when switching back.
  resetPartitionFields(values);
}

function onEnablePartitioningChange() {
  // Toggling partitioning either way clears the interval type and its
  // fields (the pin's toggle behavior): disabling must not leave stale
  // values for the next enable to restore.
  values.partitionIntervalType = undefined;
  resetPartitionFields(values);
}

function onSampleTypeChange() {
  // The PUT replaces the stored config whole, so a newly shown PERCENTAGE
  // field left empty would drop the stored sampling config; the pin seeds
  // the default (100) when the percentage value is unset.
  if (values.profileSamplePercentage == null) {
    values.profileSamplePercentage = DEFAULT_SETTINGS_VALUES.profileSamplePercentage;
  }
}

function onMetricChange(index: number, next: string[]) {
  const row = values.includeColumns[index];
  if (!row) {
    return;
  }
  row.metrics = collapseMetricSelection(next, row.metrics ?? []);
}

function onMetricSelectChange(index: number, value: unknown) {
  onMetricChange(index, (value ?? []) as string[]);
}

function onIntervalTypeSelectChange(value: unknown) {
  onIntervalTypeChange(value as PartitionIntervalType | undefined);
}

function addIncludeColumn() {
  values.includeColumns.push({ columnName: undefined, metrics: [PROFILER_ALL] });
}

function removeIncludeColumn(index: number) {
  values.includeColumns.splice(index, 1);
}

function addPartitionValue() {
  values.partitionValues.push({ value: '' });
}

function removePartitionValue(index: number) {
  values.partitionValues.splice(index, 1);
}

function requiredRule(fieldText: string) {
  return { required: true, message: t('profilerSettings.required', { fieldText }) };
}

async function save() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    await putTableProfilerConfig(props.tableId, toProfilerConfig(values));
    message.success(t('profilerSettings.saveSuccess'));
    emit('saved');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('profilerSettings.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('profilerSettings.title')"
    :confirm-loading="saving"
    :ok-disabled="fetchFailed || loading"
    test-id="profiler-settings-modal"
    @ok="save"
    @cancel="emit('cancel')"
  >
    <Alert
      v-if="fetchFailed"
      type="error"
      show-icon
      :message="t('profilerSettings.fetchFailed')"
      class="settings__alert"
    >
      <template #action>
        <Button size="small" @click="load">{{ t('profilerSettings.retry') }}</Button>
      </template>
    </Alert>
    <Form
      v-else
      ref="formRef"
      layout="vertical"
      :model="values"
      :disabled="loading"
    >
      <Form.Item :label="t('profilerSettings.profileSampleType')" name="profileSampleType">
        <Select
          v-model:value="values.profileSampleType"
          :options="sampleOptions"
          :placeholder="t('profilerSettings.selectSampleType')"
          allow-clear
          data-testid="profiler-sample-type"
          @change="onSampleTypeChange"
        />
      </Form.Item>
      <Form.Item
        v-if="values.profileSampleType === 'PERCENTAGE'"
        :label="t('profilerSettings.profileSampleValue')"
        name="profileSamplePercentage"
        :rules="[requiredRule(t('profilerSettings.profileSampleValue'))]"
      >
        <InputNumber
          v-model:value="samplePercentage"
          :min="MIN_PROFILE_SAMPLE"
          class="settings__number"
          data-testid="profiler-sample-percentage"
        />
      </Form.Item>
      <Form.Item
        v-if="values.profileSampleType === 'ROWS'"
        :label="t('profilerSettings.profileSampleValue')"
        name="profileSampleRows"
        :rules="[requiredRule(t('profilerSettings.profileSampleValue'))]"
      >
        <InputNumber
          v-model:value="values.profileSampleRows"
          :min="MIN_PROFILE_SAMPLE"
          class="settings__number"
          data-testid="profiler-sample-rows"
        />
      </Form.Item>
      <Form.Item :label="t('profilerSettings.sampleDataCount')" name="sampleDataCount">
        <InputNumber
          v-model:value="values.sampleDataCount"
          :min="0"
          class="settings__number"
          data-testid="profiler-sample-data-count"
        />
      </Form.Item>
      <Form.Item :label="t('profilerSettings.profileQuery')" name="profileQuery">
        <Input.TextArea
          v-model:value="values.profileQuery"
          :rows="4"
          class="settings__query"
          data-testid="profiler-query"
        />
      </Form.Item>
      <p class="settings__section">{{ t('profilerSettings.enableColumnProfile') }}</p>
      <Form.Item :label="t('profilerSettings.exclude')" name="excludeColumns">
        <Select
          v-model:value="values.excludeColumns"
          mode="multiple"
          :options="columnOptions"
          :placeholder="t('profilerSettings.selectColumnsToExclude')"
          data-testid="profiler-exclude-columns"
        />
      </Form.Item>
      <p class="settings__section">{{ t('profilerSettings.include') }}</p>
      <div
        v-for="(row, index) in values.includeColumns"
        :key="index"
        class="settings__row"
      >
        <Form.Item class="settings__row-field" :name="['includeColumns', index, 'columnName']">
          <Select
            v-model:value="row.columnName"
            :options="includeColumnOptions"
            :placeholder="t('profilerSettings.selectColumnsToInclude')"
            :data-testid="`profiler-include-column-${index}`"
          />
        </Form.Item>
        <Form.Item class="settings__row-field" :name="['includeColumns', index, 'metrics']">
          <Select
            :value="row.metrics"
            mode="multiple"
            :options="metricOptions"
            :data-testid="`profiler-include-metrics-${index}`"
            @change="(value) => onMetricSelectChange(index, value)"
          />
        </Form.Item>
        <Button
          v-if="values.includeColumns.length > 1"
          type="text"
          danger
          :aria-label="t('profilerSettings.removeColumn')"
          :data-testid="`profiler-include-remove-${index}`"
          @click="removeIncludeColumn(index)"
        >
          <DeleteOutlined />
        </Button>
      </div>
      <Button
        type="dashed"
        class="settings__add"
        data-testid="profiler-include-add"
        @click="addIncludeColumn"
      >
        <PlusOutlined /> {{ t('profilerSettings.addColumn') }}
      </Button>
      <p class="settings__section">{{ t('profilerSettings.enablePartition') }}</p>
      <Form.Item name="enablePartitioning">
        <Switch
          v-model:checked="values.enablePartitioning"
          :aria-label="t('profilerSettings.enablePartition')"
          data-testid="profiler-enable-partition"
          @change="onEnablePartitioningChange"
        />
      </Form.Item>
      <template v-if="values.enablePartitioning">
        <Form.Item
          :label="t('profilerSettings.intervalType')"
          name="partitionIntervalType"
          :rules="[requiredRule(t('profilerSettings.intervalType'))]"
        >
          <Select
            :value="values.partitionIntervalType"
            :options="intervalTypeOptions"
            :placeholder="t('profilerSettings.selectIntervalType')"
            data-testid="profiler-interval-type"
            @change="(value) => onIntervalTypeSelectChange(value)"
          />
        </Form.Item>
        <Form.Item
          :label="t('profilerSettings.columnName')"
          name="partitionColumnName"
          :rules="[requiredRule(t('profilerSettings.columnName'))]"
        >
          <Select
            v-model:value="values.partitionColumnName"
            :options="partitionColumnOptions"
            :placeholder="t('profilerSettings.selectColumnName')"
            data-testid="profiler-partition-column"
          />
        </Form.Item>
        <template v-if="values.partitionIntervalType === 'TIME-UNIT' || values.partitionIntervalType === 'INGESTION-TIME'">
          <Form.Item
            :label="t('profilerSettings.interval')"
            name="partitionInterval"
            :rules="[requiredRule(t('profilerSettings.interval'))]"
          >
            <InputNumber
              v-model:value="values.partitionInterval"
              :min="1"
              class="settings__number"
              :placeholder="t('profilerSettings.enterInterval')"
              data-testid="profiler-partition-interval"
            />
          </Form.Item>
          <Form.Item
            :label="t('profilerSettings.intervalUnit')"
            name="partitionIntervalUnit"
            :rules="[requiredRule(t('profilerSettings.intervalUnit'))]"
          >
            <Select
              v-model:value="values.partitionIntervalUnit"
              :options="intervalUnitOptions"
              :placeholder="t('profilerSettings.selectIntervalUnit')"
              data-testid="profiler-partition-interval-unit"
            />
          </Form.Item>
        </template>
        <template v-if="values.partitionIntervalType === 'INTEGER-RANGE'">
          <Form.Item
            :label="t('profilerSettings.startRange')"
            name="partitionIntegerRangeStart"
            :rules="[requiredRule(t('profilerSettings.startRange'))]"
          >
            <InputNumber
              v-model:value="values.partitionIntegerRangeStart"
              class="settings__number"
              :placeholder="t('profilerSettings.enterField', { field: t('profilerSettings.startRange') })"
              data-testid="profiler-partition-range-start"
            />
          </Form.Item>
          <Form.Item
            :label="t('profilerSettings.endRange')"
            name="partitionIntegerRangeEnd"
            :rules="[requiredRule(t('profilerSettings.endRange'))]"
          >
            <InputNumber
              v-model:value="values.partitionIntegerRangeEnd"
              class="settings__number"
              :placeholder="t('profilerSettings.enterField', { field: t('profilerSettings.endRange') })"
              data-testid="profiler-partition-range-end"
            />
          </Form.Item>
        </template>
        <template v-if="values.partitionIntervalType === 'COLUMN-VALUE'">
          <p class="settings__section">{{ t('profilerSettings.value') }}</p>
          <div
            v-for="(entry, index) in values.partitionValues"
            :key="index"
            class="settings__row"
          >
            <Form.Item
              class="settings__row-field"
              :name="['partitionValues', index, 'value']"
              :rules="[requiredRule(t('profilerSettings.value'))]"
            >
              <Input
                v-model:value="entry.value"
                :placeholder="t('profilerSettings.enterField', { field: t('profilerSettings.value') })"
                :aria-label="`${t('profilerSettings.value')} ${index + 1}`"
                :data-testid="`profiler-partition-value-${index}`"
              />
            </Form.Item>
            <Button
              type="text"
              danger
              :aria-label="t('profilerSettings.removeValue')"
              :data-testid="`profiler-partition-value-remove-${index}`"
              @click="removePartitionValue(index)"
            >
              <DeleteOutlined />
            </Button>
          </div>
          <Button
            type="dashed"
            class="settings__add"
            data-testid="profiler-partition-value-add"
            @click="addPartitionValue"
          >
            <PlusOutlined /> {{ t('profilerSettings.addValue') }}
          </Button>
        </template>
      </template>
    </Form>
  </FormModal>
</template>

<style scoped>
.settings__alert {
  margin-bottom: 16px;
}
.settings__number {
  width: 100%;
}
.settings__query {
  font-family: ui-monospace, monospace;
}
.settings__section {
  font-weight: 600;
  margin-block: 8px;
}
.settings__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.settings__row-field {
  flex: 1;
}
.settings__add {
  margin-bottom: 8px;
}
</style>
