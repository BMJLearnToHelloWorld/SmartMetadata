<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestDefinitionFormBody fields (Vue3 + ant-design-vue). No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Input, Select, Switch } from 'ant-design-vue';
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

const locked = computed(() => Boolean(props.readOnlyExceptDimension));

onMounted(async () => {
  try {
    const page = await listDataQualityDimensions({ limit: 100 });
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
    <Form.Item :label="t('label.name')" required>
      <Input
        v-model:value="form.name"
        :disabled="isEdit || locked"
        :placeholder="t('label.name')"
        data-testid="test-definition-name"
      />
    </Form.Item>
    <Form.Item :label="t('label.display-name')">
      <Input
        v-model:value="form.displayName"
        :disabled="locked"
        :placeholder="t('label.display-name')"
        data-testid="display-name"
      />
    </Form.Item>
    <Form.Item :label="t('label.description')">
      <Input.TextArea
        v-model:value="form.description"
        :rows="3"
        :disabled="locked"
        :placeholder="t('label.description')"
        data-testid="description"
      />
    </Form.Item>
    <Form.Item
      :label="t('label.sql-expression')"
      :extra="t('quality.testDefinitions.sqlExpressionHelp')"
    >
      <Input.TextArea
        v-model:value="form.sqlExpression"
        :rows="6"
        :disabled="locked"
        data-testid="sql-expression"
      />
    </Form.Item>
    <Form.Item :label="t('label.entity-type')" required>
      <Select
        v-model:value="form.entityType"
        :disabled="locked"
        :placeholder="t('label.select-entity', { entity: t('label.entity-type') })"
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
        :disabled="locked"
        :placeholder="t('label.select-entity', { entity: t('label.test-platform-plural') })"
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
        :placeholder="t('label.select-entity', { entity: t('label.data-quality-dimension') })"
        data-testid="data-quality-dimension"
      />
    </Form.Item>
    <Form.Item
      :label="t('label.supported-service-plural')"
      :extra="t('quality.testDefinitions.supportedServicesHelp')"
    >
      <Select
        v-model:value="form.supportedServices"
        mode="multiple"
        allow-clear
        :disabled="locked"
        :placeholder="t('quality.testDefinitions.emptyMeansAllServices')"
        data-testid="supported-services"
      >
        <Select.Option v-for="service in DATABASE_SERVICE_TYPES" :key="service" :value="service">
          {{ service }}
        </Select.Option>
      </Select>
    </Form.Item>
    <Form.Item
      :label="t('label.supported-data-type-plural')"
      :extra="t('quality.testDefinitions.supportedDataTypesHelp')"
    >
      <Select
        v-model:value="form.supportedDataTypes"
        mode="multiple"
        allow-clear
        :disabled="locked"
        :placeholder="t('quality.testDefinitions.emptyMeansAllDataTypes')"
        data-testid="supported-data-types"
      >
        <Select.Option v-for="type in COLUMN_DATA_TYPES" :key="type" :value="type">
          {{ type }}
        </Select.Option>
      </Select>
    </Form.Item>
    <div data-testid="parameter-definition">
      <div
        v-for="(param, index) in form.parameterDefinition"
        :key="index"
        class="td-param"
        :data-testid="`parameter-card-${index}`"
      >
        <div class="td-param__head">
          <strong>{{ t('quality.testDefinitions.parameterCard', { index: index + 1 }) }}</strong>
          <Button
            type="link"
            danger
            :disabled="locked"
            :data-testid="`remove-parameter-${index}`"
            @click="removeParameter(index)"
          >
            {{ t('label.delete') }}
          </Button>
        </div>
        <Form.Item :label="t('label.name')" required>
          <Input
            v-model:value="param.name"
            :disabled="locked"
            :placeholder="t('quality.testDefinitions.paramNamePlaceholder')"
            :data-testid="`parameter-name-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.display-name')">
          <Input
            v-model:value="param.displayName"
            :disabled="locked"
            :placeholder="t('quality.testDefinitions.paramDisplayNamePlaceholder')"
            :data-testid="`parameter-display-name-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.description')">
          <Input
            v-model:value="param.description"
            :disabled="locked"
            :placeholder="t('quality.testDefinitions.paramDescriptionPlaceholder')"
            :data-testid="`parameter-description-${index}`"
          />
        </Form.Item>
        <Form.Item :label="t('label.type')">
          <Select
            v-model:value="param.dataType"
            :disabled="locked"
            :placeholder="t('quality.testDefinitions.paramDataTypePlaceholder')"
            :data-testid="`parameter-data-type-${index}`"
          >
            <Select.Option v-for="type in TEST_DATA_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('label.required')">
          <Switch v-model:checked="param.required" :disabled="locked" :data-testid="`parameter-required-${index}`" />
        </Form.Item>
      </div>
      <Button :disabled="locked" data-testid="add-parameter-button" @click="addParameter">
        {{ t('label.add-entity', { entity: t('label.parameter') }) }}
      </Button>
    </div>
    <Form.Item v-if="isEdit" :label="t('label.enabled')">
      <Switch v-model:checked="form.enabled" :disabled="locked" data-testid="enabled-toggle" />
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
</style>
