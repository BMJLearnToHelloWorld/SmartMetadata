<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestDefinitionFormBody fields (Vue3 + ant-design-vue). No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Input, Select, Switch } from 'ant-design-vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import { CSMode } from '@/utils/codeMirrorUtils';
import { listDataQualityDimensions } from '@/api/dataQualityDimensions';
import { TEST_DEFINITION_ENTITY_TYPES, TEST_PLATFORMS } from '@/types/quality';
import type { DataQualityDimension } from '@/types/admin';
import {
  COLUMN_DATA_TYPES,
  DATABASE_SERVICE_TYPES,
  TEST_DATA_TYPES,
  emptyParameter,
  type TestDefinitionFormValues,
} from '@/quality/testDefinitionForm';

const props = defineProps<{
  form: TestDefinitionFormValues;
  isEdit?: boolean;
  readOnlyExceptDimension?: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  'dismiss-error': [];
}>();

const { t } = useI18n();
const dimensions = ref<DataQualityDimension[]>([]);

const dimensionOptions = computed(() => {
  const options = dimensions.value.map((item) => ({
    value: item.name,
    label: item.displayName || item.name,
  }));
  const current = props.form.dataQualityDimension;
  if (current && !options.some((item) => item.value === current)) {
    options.unshift({ value: current, label: current });
  }
  return options;
});

/** Official isReadOnlyField: structural fields locked; display/description stay editable. */
const providerFieldsLocked = computed(() => Boolean(props.readOnlyExceptDimension));
const nameDisabled = computed(() => Boolean(props.isEdit) || providerFieldsLocked.value);

onMounted(async () => {
  try {
    const page = await listDataQualityDimensions({ limit: 1000 });
    dimensions.value = page.data;
  } catch {
    dimensions.value = [];
  }
});

function addParameter(): void {
  props.form.parameterDefinition.push(emptyParameter());
}

function removeParameter(index: number): void {
  props.form.parameterDefinition.splice(index, 1);
}
</script>

<template>
  <Form layout="vertical" data-testid="test-definition-form-body">
    <Alert
      v-if="errorMessage"
      type="error"
      :message="t('label.error')"
      :description="errorMessage"
      closable
      show-icon
      class="td-form-error"
      @close="emit('dismiss-error')"
    />
    <Form.Item :label="t('label.name')" required>
      <Input
        v-model:value="form.name"
        :disabled="nameDisabled"
        :placeholder="t('label.enter-entity-name', { entity: t('label.test-definition') })"
        data-testid="test-definition-name"
      />
    </Form.Item>
    <Form.Item :label="t('label.display-name')">
      <Input
        v-model:value="form.displayName"
        :placeholder="t('label.enter-entity-name', { entity: t('label.display-name') })"
        data-testid="display-name"
      />
    </Form.Item>
    <Form.Item :label="t('label.description')">
      <Input.TextArea
        v-model:value="form.description"
        :rows="3"
        :placeholder="t('label.enter-entity-description', { entity: t('label.test-definition') })"
        data-testid="description"
      />
    </Form.Item>
    <Form.Item
      :label="t('label.sql-query')"
      :extra="t('message.test-definition-sql-query-help')"
    >
      <div data-testid="sql-expression">
        <SmCodeEditor
          v-if="!providerFieldsLocked"
          variant="code"
          :mode="{ name: CSMode.SQL }"
          :model-value="form.sqlExpression"
          show-copy-button
          class-name="custom-query-editor query-editor-h-200"
          @update:model-value="(value) => (form.sqlExpression = value)"
        />
        <textarea
          v-else
          class="td-sql-readonly"
          :aria-label="t('label.sql-query')"
          disabled
          rows="8"
          :value="form.sqlExpression"
        />
      </div>
    </Form.Item>
    <Form.Item :label="t('label.entity-type')" required>
      <Select
        v-model:value="form.entityType"
        :disabled="providerFieldsLocked"
        :placeholder="t('label.select-field', { field: t('label.entity-type') })"
        data-testid="entity-type"
      >
        <Select.Option v-for="type in TEST_DEFINITION_ENTITY_TYPES" :key="type" :value="type">
          {{ type }}
        </Select.Option>
      </Select>
    </Form.Item>
    <Form.Item :label="t('label.test-platform-plural')" required>
      <Select
        v-model:value="form.testPlatforms"
        mode="multiple"
        :disabled="providerFieldsLocked"
        :placeholder="t('label.select-field', { field: t('label.test-platform-plural') })"
        data-testid="test-platforms"
      >
        <Select.Option v-for="platform in TEST_PLATFORMS" :key="platform" :value="platform">
          {{ platform }}
        </Select.Option>
      </Select>
    </Form.Item>
    <Form.Item :label="t('label.data-quality-dimension')">
      <Select
        v-model:value="form.dataQualityDimension"
        allow-clear
        :options="dimensionOptions"
        :placeholder="t('label.select-field', { field: t('label.data-quality-dimension') })"
        data-testid="data-quality-dimension"
      />
    </Form.Item>
    <Form.Item
      :label="t('label.supported-service-plural')"
      :extra="t('message.supported-services-help')"
    >
      <Select
        v-model:value="form.supportedServices"
        mode="multiple"
        allow-clear
        :disabled="providerFieldsLocked"
        :placeholder="t('message.empty-means-all-services')"
        data-testid="supported-services"
      >
        <Select.Option v-for="service in DATABASE_SERVICE_TYPES" :key="service" :value="service">
          {{ service }}
        </Select.Option>
      </Select>
    </Form.Item>
    <Form.Item
      :label="t('label.supported-data-type-plural')"
      :extra="t('message.supported-data-types-help')"
    >
      <Select
        v-model:value="form.supportedDataTypes"
        mode="multiple"
        allow-clear
        :disabled="providerFieldsLocked"
        :placeholder="t('message.empty-means-all-data-types')"
        data-testid="supported-data-types"
      >
        <Select.Option v-for="type in COLUMN_DATA_TYPES" :key="type" :value="type">
          {{ type }}
        </Select.Option>
      </Select>
    </Form.Item>
    <div data-testid="parameter-definition">
      <p class="td-param__section-label">
        {{ t('label.parameter-plural') }}
        <span class="td-param__section-hint" :title="t('message.test-definition-parameters-description')">
          ⓘ
        </span>
      </p>
      <div
        v-for="(param, index) in form.parameterDefinition"
        :key="index"
        class="td-param"
        :data-testid="`parameter-card-${index}`"
      >
        <div class="td-param__head">
          <strong>{{ t('label.parameter') }} {{ index + 1 }}</strong>
          <Button
            v-if="!providerFieldsLocked"
            type="link"
            danger
            :data-testid="`remove-parameter-${index}`"
            @click="removeParameter(index)"
          >
            {{ t('label.delete') }}
          </Button>
        </div>
        <Form.Item :label="t('label.name')" required>
          <Input
            v-model:value="param.name"
            :disabled="providerFieldsLocked"
            :placeholder="t('label.parameter-name')"
            :data-testid="`parameter-name-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.display-name')">
          <Input
            v-model:value="param.displayName"
            :disabled="providerFieldsLocked"
            :placeholder="t('label.parameter-display-name')"
            :data-testid="`parameter-display-name-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.description')">
          <Input.TextArea
            v-model:value="param.description"
            :rows="3"
            :disabled="providerFieldsLocked"
            :placeholder="t('label.parameter-description')"
            :data-testid="`parameter-description-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.data-type')">
          <Select
            v-model:value="param.dataType"
            :disabled="providerFieldsLocked"
            :placeholder="t('label.select-field', { field: t('label.data-type') })"
            :data-testid="`parameter-data-type-${index}`"
          >
            <Select.Option v-for="type in TEST_DATA_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('label.required')" class="td-param__required">
          <Switch v-model:checked="param.required" :disabled="providerFieldsLocked" :data-testid="`parameter-required-${index}`" />
        </Form.Item>
      </div>
      <Button
        v-if="!providerFieldsLocked"
        block
        class="td-param-add"
        data-testid="add-parameter-button"
        @click="addParameter"
      >
        {{ t('label.add-entity', { entity: t('label.parameter') }) }}
      </Button>
    </div>
    <Form.Item v-if="isEdit" :label="t('label.enabled')" class="td-enabled">
      <Switch v-model:checked="form.enabled" :disabled="providerFieldsLocked" data-testid="enabled-toggle" />
    </Form.Item>
  </Form>
</template>

<style scoped>
.td-param {
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.td-param__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.td-param__section-label {
  font-weight: 600;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.td-param__section-hint {
  cursor: help;
  font-weight: 400;
  color: var(--sm-text-secondary);
}
.td-param-add {
  border-style: dashed;
  margin-top: 4px;
}
.td-param__required :deep(.ant-form-item-row) {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.td-enabled :deep(.ant-form-item-row) {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.td-form-error {
  margin-bottom: 16px;
}
.td-sql-readonly {
  width: 100%;
  min-height: 200px;
  resize: vertical;
  padding: 12px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
  background: var(--sm-bg-secondary, #f5f5f5);
  color: var(--sm-text-secondary);
}
</style>
