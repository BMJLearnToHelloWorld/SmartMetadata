<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Port of AccessControlRuleForm.tsx as consumed by the Settings rule pages
  (03 §9): field order name, description, resources, operations, effect,
  condition. Settings pages never pass takenNames, so duplicate names are
  rejected by the server (409), not by the form. Condition validation only
  feeds local feedback state and never blocks submission. Resources and
  operations share the pin 'All' mutual-exclusion rules; any resources
  change clears operations. The form exposes validate() and getRule() for
  the page-level submit; trimming and empty-condition omission happen at
  the page, exactly where the pin does them.
-->
<script setup lang="ts">
import { AutoComplete, Form, Input, Select, message } from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import {
  getPolicyFunctions,
  getPolicyResources,
  validateRuleCondition,
  type PolicyFunctionDescriptor,
  type PolicyResourceDescriptor,
} from '@/api/policies';
import { getErrorText } from './accessApiErrors';
import { INITIAL_RULE, buildConditionOptions, type RuleFormValue } from './accessRuleForm';
import { capitalize, startCase } from './accessText';

const props = withDefaults(
  defineProps<{
    initialRule?: RuleFormValue;
  }>(),
  { initialRule: () => ({ ...INITIAL_RULE }) },
);

const { t } = useI18n();

const formState = reactive<RuleFormValue>({ ...props.initialRule });
const formRef = ref<FormInstance | null>(null);
const descriptionEditorKey = ref(0);

const resourceDescriptors = ref<PolicyResourceDescriptor[]>([]);
const functionDescriptors = ref<PolicyFunctionDescriptor[]>([]);

const conditionError = ref('');
const conditionValidating = ref(false);
const isValidCondition = ref(false);
const currentConditionRef = ref('');
let conditionTimer: ReturnType<typeof setTimeout> | undefined;

const resourceOptions = computed(() => [
  { value: 'All', label: t('label.all') },
  ...resourceDescriptors.value
    .filter((descriptor) => descriptor.name !== 'all' && descriptor.name !== 'All')
    .map((descriptor) => ({ value: descriptor.name, label: startCase(descriptor.name) })),
]);

const operationOptions = computed(() => {
  const selected = new Set(formState.resources);
  const operations = new Set<string>();
  for (const descriptor of resourceDescriptors.value) {
    const isAllDescriptor = descriptor.name === 'all' || descriptor.name === 'All';
    if (selected.has(descriptor.name) || (isAllDescriptor && selected.has('All'))) {
      for (const operation of descriptor.operations) {
        if (operation !== 'All') {
          operations.add(operation);
        }
      }
    }
  }
  return [
    { value: 'All', label: t('label.all') },
    ...[...operations].map((operation) => ({ value: operation, label: operation })),
  ];
});

const conditionSuggestions = computed(() => {
  const examples = functionDescriptors.value.flatMap((descriptor) => descriptor.examples);
  return buildConditionOptions(examples)
    .filter((option) => option.label.includes(formState.condition))
    .map((option) => ({ value: option.id, label: option.label }));
});

function resolveAllSelection(previous: string[], next: string[]): string[] {
  const addedAll = next.includes('All') && !previous.includes('All');
  if (addedAll) {
    return ['All'];
  }
  const removedAll = previous.includes('All') && !next.includes('All');
  if (removedAll) {
    return [];
  }
  if (previous.includes('All')) {
    return next.filter((value) => value !== 'All');
  }
  return next;
}

/**
 * antd Select/AutoComplete emit SelectValue (RawValue | LabeledValue,
 * single or array); these controls only ever carry plain string values,
 * so normalise to string terms here and keep the handlers in string
 * terms (same shape as MetricCreateDrawer / UserTeamPicker).
 */
function asStringArray(value: SelectValue): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return list.map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
}

function asSingleString(value: SelectValue): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const labeled = value.value;
    return typeof labeled === 'string' ? labeled : undefined;
  }
  return undefined;
}

function onResourcesChange(value: SelectValue): void {
  const next = asStringArray(value);
  formState.resources = resolveAllSelection(formState.resources, next);
  formState.operations = [];
}

function onOperationsChange(value: SelectValue): void {
  formState.operations = resolveAllSelection(
    formState.operations,
    asStringArray(value),
  );
}

function onEffectChange(value: SelectValue): void {
  formState.effect = asSingleString(value) ?? formState.effect;
}

async function validateCondition(condition: string): Promise<void> {
  currentConditionRef.value = condition;
  if (!condition) {
    conditionError.value = '';
    isValidCondition.value = false;
    conditionValidating.value = false;
    return;
  }
  conditionValidating.value = true;
  try {
    await validateRuleCondition(condition);
    if (currentConditionRef.value !== condition) {
      return;
    }
    conditionError.value = '';
    isValidCondition.value = true;
  } catch (error) {
    if (currentConditionRef.value !== condition) {
      return;
    }
    conditionError.value = getErrorText(
      error,
      t('message.field-text-is-invalid', { fieldText: t('label.condition') }),
    );
    isValidCondition.value = false;
  } finally {
    if (currentConditionRef.value === condition) {
      conditionValidating.value = false;
    }
  }
}

function scheduleConditionValidation(condition: string): void {
  currentConditionRef.value = condition;
  if (conditionTimer) {
    clearTimeout(conditionTimer);
  }
  if (!condition) {
    conditionError.value = '';
    isValidCondition.value = false;
    conditionValidating.value = false;
    return;
  }
  conditionTimer = setTimeout(() => {
    void validateCondition(condition);
  }, 300);
}

function onConditionSearch(value: string): void {
  formState.condition = value;
  scheduleConditionValidation(value);
}

function onConditionSelect(value: SelectValue): void {
  const next = asSingleString(value);
  if (next === undefined) {
    return;
  }
  formState.condition = next;
  scheduleConditionValidation(next);
}

async function fetchOptions(): Promise<void> {
  try {
    resourceDescriptors.value = await getPolicyResources();
  } catch (error) {
    resourceDescriptors.value = [];
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
  try {
    functionDescriptors.value = await getPolicyFunctions();
  } catch (error) {
    functionDescriptors.value = [];
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
}

onMounted(() => {
  void fetchOptions();
});

onUnmounted(() => {
  if (conditionTimer) {
    clearTimeout(conditionTimer);
  }
});

function setRule(rule: RuleFormValue): void {
  Object.assign(formState, { ...INITIAL_RULE, ...rule });
  descriptionEditorKey.value += 1;
}

async function validate(): Promise<boolean> {
  try {
    await formRef.value?.validate();
    return true;
  } catch {
    return false;
  }
}

function getRule(): RuleFormValue {
  return { ...formState };
}

defineExpose({ validate, getRule, setRule });
</script>

<template>
  <Form ref="formRef" layout="vertical" :model="formState">
    <Form.Item
      :label="t('label.rule-name')"
      name="name"
      :rules="[
        { required: true, message: t('label.field-required', { field: t('label.rule-name') }) },
      ]"
    >
      <Input
        v-model:value="formState.name"
        data-testid="rule-name"
        :placeholder="t('label.rule-name')"
      />
    </Form.Item>
    <Form.Item :label="t('label.description')" name="description">
      <div data-testid="rule-description">
        <SmRichTextEditor
          :key="descriptionEditorKey"
          :initial-value="formState.description"
          @text-change="formState.description = $event"
        />
      </div>
    </Form.Item>
    <Form.Item
      :label="t('label.resource-plural')"
      name="resources"
      :rules="[
        {
          required: true,
          message: t('label.field-required-plural', { field: t('label.resource-plural') }),
        },
      ]"
    >
      <Select
        mode="multiple"
        data-testid="resources"
        :value="formState.resources"
        :options="resourceOptions"
        :placeholder="t('label.select-field', { field: t('label.resource-plural') })"
        @change="onResourcesChange"
      />
    </Form.Item>
    <Form.Item
      :label="t('label.operation-plural')"
      name="operations"
      :rules="[
        {
          required: true,
          message: t('label.field-required-plural', { field: t('label.operation-plural') }),
        },
      ]"
    >
      <Select
        mode="multiple"
        data-testid="operations"
        :value="formState.operations"
        :options="operationOptions"
        :placeholder="t('label.select-field', { field: t('label.operation-plural') })"
        @change="onOperationsChange"
      />
    </Form.Item>
    <Form.Item :label="t('label.rule-effect')" name="effect">
      <Select
        data-testid="effect"
        :value="formState.effect"
        :options="[
          { value: 'allow', label: capitalize('allow') },
          { value: 'deny', label: capitalize('deny') },
        ]"
        :placeholder="t('label.select-field', { field: t('label.rule-effect') })"
        @change="onEffectChange"
      />
    </Form.Item>
    <Form.Item :label="t('label.condition')" name="condition">
      <AutoComplete
        data-testid="condition"
        :value="formState.condition"
        :options="conditionSuggestions"
        :placeholder="t('label.condition')"
        @search="onConditionSearch"
        @select="onConditionSelect"
      />
      <div v-if="conditionError" data-testid="condition-error">
        ❌ {{ t('label.invalid-condition') }}: {{ conditionError }}
      </div>
      <div v-else-if="conditionValidating">{{ t('label.validating-condition') }}</div>
      <div v-else-if="isValidCondition && !conditionValidating && !conditionError" data-testid="condition-success">
        ✅ {{ t('label.valid-condition') }}
      </div>
    </Form.Item>
  </Form>
</template>
