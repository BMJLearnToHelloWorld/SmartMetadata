<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Checkbox, Divider, Input, Space, Spin, Switch, Tag, Typography } from 'ant-design-vue';
import type { CreateIntakeForm, IntakeForm, TargetEntityType } from '@/api/intakeForms';
import { listCustomProperties } from '@/api/customProperties';
import {
  buildIntakeFormPayload,
  computeFieldRows,
  ENTITY_TYPE_LABEL_KEYS,
  NATIVE_FIELDS_BY_ENTITY_TYPE,
  type IntakeFormFieldRow,
} from '@/views/admin/intakeFormDesigner';

const props = defineProps<{
  entityType: TargetEntityType;
  initialValue: IntakeForm | null;
}>();

const emit = defineEmits<{ submit: [payload: CreateIntakeForm] }>();

const { t } = useI18n();

const description = ref('');
const enabled = ref(true);
const edits = ref<Record<string, Partial<IntakeFormFieldRow>>>({});
const customProperties = ref<Array<{ name: string; displayName?: string }>>([]);
const loadingProps = ref(true);
const propsError = ref('');

function reset(): void {
  description.value = props.initialValue?.description ?? '';
  enabled.value = props.initialValue?.enabled ?? true;
  edits.value = {};
}

async function loadCustomProperties(): Promise<void> {
  loadingProps.value = true;
  propsError.value = '';
  try {
    customProperties.value = await listCustomProperties(props.entityType);
  } catch (error) {
    customProperties.value = [];
    propsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loadingProps.value = false;
  }
}

const rows = computed<IntakeFormFieldRow[]>(() =>
  computeFieldRows({
    nativeFields: NATIVE_FIELDS_BY_ENTITY_TYPE[props.entityType],
    customProperties: customProperties.value,
    initialValue: props.initialValue,
    t: (key: string) => t(key),
  }).map((row) => ({ ...row, ...edits.value[row.path] })),
);

const nativeRows = computed(() => rows.value.filter((row) => row.kind === 'native'));
const customRows = computed(() => rows.value.filter((row) => row.kind === 'customProperty'));

function updateRow(path: string, patch: Partial<IntakeFormFieldRow>): void {
  edits.value = { ...edits.value, [path]: { ...edits.value[path], ...patch } };
}

function buildPayload(): CreateIntakeForm {
  const defaultDisplayName = t('intakeForms.entityForm', {
    entity: t(ENTITY_TYPE_LABEL_KEYS[props.entityType]),
  });
  return buildIntakeFormPayload({
    rows: rows.value,
    entityType: props.entityType,
    name: props.entityType,
    displayName: props.initialValue?.displayName ?? defaultDisplayName,
    description: description.value,
    enabled: enabled.value,
    owners: props.initialValue?.owners,
  });
}

function submit(): void {
  emit('submit', buildPayload());
}

defineExpose({ submit });

watch(
  () => props.initialValue,
  () => {
    reset();
  },
);

onMounted(() => {
  reset();
  void loadCustomProperties();
});
</script>

<template>
  <div data-testid="intake-form-designer-body">
    <Alert
      :message="t('intakeForms.onePerTypeHelp', { entityType: t(ENTITY_TYPE_LABEL_KEYS[entityType]) })"
      type="info"
      show-icon
      style="margin-bottom: 16px"
    />
    <Typography.Paragraph>
      <Typography.Text strong>{{ t('crud.description') }}</Typography.Text>
    </Typography.Paragraph>
    <Input.TextArea
      v-model:value="description"
      data-testid="intake-form-description"
      :rows="3"
      :placeholder="t('intakeForms.descriptionPlaceholder')"
      style="margin-bottom: 16px"
    />
    <Space style="margin-bottom: 16px">
      <Typography.Text strong>{{ t('crud.enabled') }}</Typography.Text>
      <Switch
        v-model:checked="enabled"
        data-testid="intake-form-enabled"
        :aria-label="t('crud.enabled')"
      />
      <Typography.Text type="secondary">{{ t('intakeForms.enabledHelp') }}</Typography.Text>
    </Space>
    <Divider />
    <Typography.Title :level="5">{{ t('intakeForms.nativeFields') }}</Typography.Title>
    <Typography.Paragraph type="secondary">{{ t('intakeForms.nativeFieldsHelp') }}</Typography.Paragraph>
    <table style="width: 100%; border-collapse: collapse" data-testid="intake-form-native-table">
      <thead>
        <tr style="background: var(--sm-bg-secondary, #fafafa)">
          <th style="width: 80px; padding: 8px 16px; text-align: left">{{ t('intakeForms.required') }}</th>
          <th style="padding: 8px 16px; text-align: left">{{ t('intakeForms.field') }}</th>
          <th style="padding: 8px 16px; text-align: left">{{ t('intakeForms.customErrorMessage') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in nativeRows" :key="row.path" style="border-top: 1px solid #f0f0f0">
          <td style="padding: 8px 16px">
            <Checkbox
              :checked="row.required"
              :data-testid="`require-${row.path}`"
              :aria-label="row.label"
              @change="(event: { target: { checked: boolean } }) => updateRow(row.path, { required: event.target.checked, errorMessage: event.target.checked ? row.errorMessage : undefined })"
            />
          </td>
          <td style="padding: 8px 16px">
            <Typography.Text strong>{{ row.label }}</Typography.Text>
            <br />
            <Typography.Text type="secondary">{{ row.path }}</Typography.Text>
          </td>
          <td style="padding: 8px 16px">
            <Input
              :value="row.errorMessage ?? ''"
              :disabled="!row.required"
              :data-testid="`error-${row.path}`"
              :aria-label="t('intakeForms.customErrorMessage')"
              :placeholder="t('intakeForms.optionalCustomError')"
              @change="(event: { target: { value: string } }) => updateRow(row.path, { errorMessage: event.target.value })"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <Typography.Paragraph v-if="nativeRows.length === 0" type="secondary">
      {{ t('intakeForms.noNativeFields') }}
    </Typography.Paragraph>
    <Divider />
    <Space>
      <Typography.Title :level="5" style="margin: 0">{{ t('intakeForms.customProperties') }}</Typography.Title>
      <Tag>{{ customRows.length }}</Tag>
    </Space>
    <Typography.Paragraph type="secondary">{{ t('intakeForms.customPropertiesHelp') }}</Typography.Paragraph>
    <Typography.Paragraph v-if="propsError" type="danger">{{ propsError }}</Typography.Paragraph>
    <Spin v-if="loadingProps" />
    <template v-else>
      <table style="width: 100%; border-collapse: collapse" data-testid="intake-form-custom-table">
        <thead>
          <tr style="background: var(--sm-bg-secondary, #fafafa)">
            <th style="width: 80px; padding: 8px 16px; text-align: left">{{ t('intakeForms.include') }}</th>
            <th style="width: 80px; padding: 8px 16px; text-align: left">{{ t('intakeForms.required') }}</th>
            <th style="padding: 8px 16px; text-align: left">{{ t('intakeForms.field') }}</th>
            <th style="padding: 8px 16px; text-align: left">{{ t('intakeForms.customErrorMessage') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in customRows" :key="row.path" style="border-top: 1px solid #f0f0f0">
            <td style="padding: 8px 16px">
              <Checkbox
                :checked="row.included"
                :data-testid="`include-${row.path}`"
                :aria-label="`${t('intakeForms.include')} ${row.label}`"
                @change="(event: { target: { checked: boolean } }) => updateRow(row.path, event.target.checked ? { included: true } : { included: false, required: false, errorMessage: undefined })"
              />
            </td>
            <td style="padding: 8px 16px">
              <Checkbox
                :checked="row.required"
                :disabled="!row.included"
                :data-testid="`require-${row.path}`"
                :aria-label="row.label"
                @change="(event: { target: { checked: boolean } }) => updateRow(row.path, { required: event.target.checked, errorMessage: event.target.checked ? row.errorMessage : undefined })"
              />
            </td>
            <td style="padding: 8px 16px">
              <Typography.Text strong>{{ row.label }}</Typography.Text>
              <br />
              <Typography.Text type="secondary">{{ row.path }}</Typography.Text>
            </td>
            <td style="padding: 8px 16px">
              <Input
                :value="row.errorMessage ?? ''"
                :disabled="!row.required"
                :data-testid="`error-${row.path}`"
                :aria-label="t('intakeForms.customErrorMessage')"
                :placeholder="t('intakeForms.optionalCustomError')"
                @change="(event: { target: { value: string } }) => updateRow(row.path, { errorMessage: event.target.value })"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <Typography.Paragraph v-if="customRows.length === 0" type="secondary">
        {{ t('intakeForms.noCustomProperties') }}
      </Typography.Paragraph>
    </template>
  </div>
</template>
