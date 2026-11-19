<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  InputPassword,
  Select,
} from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JsonSchema } from './appAssets';
import {
  dotPathForPath,
  fieldIdForPath,
  fieldLabel,
  getNextEnumSelection,
  type SchemaFormError,
} from './schemaFormUtils';
import { startCase } from '@/utils/text';

const props = withDefaults(
  defineProps<{
    schema: JsonSchema;
    fieldName: string;
    path: string[];
    modelValue: unknown;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    isFieldReadonly?: (dotPath: string) => boolean;
    hiddenPaths: ReadonlySet<string>;
    errors: SchemaFormError[];
    flatPropertyLayout?: boolean;
    hideLabel?: boolean;
  }>(),
  {
    required: false,
    disabled: false,
    readonly: false,
    isFieldReadonly: undefined,
    flatPropertyLayout: false,
    hideLabel: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: unknown];
  focus: [id: string, meta: { title?: string; description?: string }];
}>();

const { t } = useI18n();
const wrapperRef = ref<HTMLElement | null>(null);

const dotPath = computed(() => dotPathForPath(props.path));
const fieldId = computed(() => fieldIdForPath(props.path));
const isHidden = computed(() => props.path.length > 0 && props.hiddenPaths.has(dotPath.value));
const fieldReadonly = computed(() => props.readonly || props.isFieldReadonly?.(dotPath.value));
const controlDisabled = computed(() => props.disabled || fieldReadonly.value);
const label = computed(() => fieldLabel(props.schema, props.fieldName));
const myErrors = computed(() => props.errors.filter((error) => error.path === dotPath.value));
const hasErrors = computed(() => myErrors.value.length > 0);

const isObject = computed(() => props.schema.type === 'object');
const additionalSchema = computed(() => {
  const additional = props.schema.additionalProperties;
  return additional && typeof additional === 'object' ? additional : undefined;
});
const isTreeSelect = computed(
  () => props.schema.type === 'array' && props.schema.uiFieldType === 'treeSelect',
);
const isArray = computed(() => props.schema.type === 'array' && !isTreeSelect.value);
const isEnum = computed(
  () => Array.isArray(props.schema.enum) && props.schema.type !== 'array',
);
const isBoolean = computed(() => props.schema.type === 'boolean');
const isNumber = computed(
  () => props.schema.type === 'integer' || props.schema.type === 'number',
);

function errorMessage(error: SchemaFormError): string {
  if (error.name === 'required') {
    return t('message.field-text-is-required', { fieldText: startCase(String(error.param)) });
  }
  if (error.name === 'minimum') {
    return t('message.value-must-be-greater-than', {
      field: startCase(dotPath.value),
      minimum: error.param,
    });
  }
  return t('message.value-must-be-less-than-or-equal', {
    field: startCase(dotPath.value),
    maximum: error.param,
  });
}

/**
 * Focus seeding (FormBuilderV1 `onFocus` via formContext.handleFocus):
 * only the innermost field wrapper answers a focusin, so a focus inside
 * a nested group seeds the leaf field, never the group. The id uses the
 * RJSF `root/...` form with the `/` separator.
 */
function onFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  const wrapper = wrapperRef.value;
  if (!target || !wrapper || target.closest('[data-schema-field]') !== wrapper) {
    return;
  }
  if (!target.closest('input, textarea, select')) {
    return;
  }
  emit('focus', fieldId.value, {
    title: props.schema.title,
    description: props.schema.description,
  });
}

function forwardFocus(id: string, meta: { title?: string; description?: string }): void {
  emit('focus', id, meta);
}

function objectValue(): Record<string, unknown> {
  return (props.modelValue ?? {}) as Record<string, unknown>;
}

function updateChild(key: string, value: unknown): void {
  emit('update:modelValue', { ...objectValue(), [key]: value });
}

function arrayValue(): unknown[] {
  return Array.isArray(props.modelValue) ? [...props.modelValue] : [];
}

function updateItem(index: number, value: unknown): void {
  const next = arrayValue();
  next[index] = value;
  emit('update:modelValue', next);
}

function addItem(): void {
  const items = props.schema.items ?? {};
  emit('update:modelValue', [...arrayValue(), items.default ?? '']);
}

function removeItem(index: number): void {
  const next = arrayValue();
  next.splice(index, 1);
  emit('update:modelValue', next);
}

function mapKeys(): string[] {
  const declared = new Set(Object.keys(props.schema.properties ?? {}));
  return Object.keys(objectValue()).filter((key) => !declared.has(key));
}

function nextMapKey(): string {
  const used = new Set(Object.keys(objectValue()));
  let index = 1;
  while (used.has(`newKey${index}`)) {
    index += 1;
  }
  return `newKey${index}`;
}

function addMapRow(): void {
  emit('update:modelValue', { ...objectValue(), [nextMapKey()]: additionalSchema.value?.default });
}

function removeMapRow(key: string): void {
  const next = { ...objectValue() };
  delete next[key];
  emit('update:modelValue', next);
}

function renameMapKey(oldKey: string, newKey: string): void {
  if (!newKey || newKey === oldKey || newKey in objectValue()) {
    return;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(objectValue())) {
    next[key === oldKey ? newKey : key] = value;
  }
  emit('update:modelValue', next);
}

const treeSelectOptions = computed(() => {
  const enumValues = (((props.schema.items ?? {}).enum ?? []) as unknown[])
    .map(String)
    .filter((value) => value !== 'all');
  return [
    { value: 'all', label: t('label.all') },
    ...enumValues.map((value) => ({ value, label: startCase(value) })),
  ];
});

function onTreeSelectChange(next: string[]): void {
  const current = arrayValue().map(String);
  const added = next.find((value) => !current.includes(value));
  if (added === undefined) {
    emit('update:modelValue', next);
    return;
  }
  emit('update:modelValue', getNextEnumSelection(current, added));
}

function onNumberChange(value: number | string | null): void {
  if (value === null || value === '') {
    emit('update:modelValue', undefined);
    return;
  }
  emit('update:modelValue', typeof value === 'string' ? Number(value) : value);
}
</script>

<template>
  <div
    v-if="!isHidden"
    ref="wrapperRef"
    :aria-invalid="hasErrors || undefined"
    data-schema-field
    :data-field-name="fieldName"
    :data-testid="`schema-field-${dotPath}`"
    :id="fieldId"
    style="margin-bottom: 16px"
    @focusin="onFocusIn"
  >
    <!-- Object group: one rendering; only the chrome differs between the
         bordered group and the flat property layout. -->
    <template v-if="isObject">
      <div
        :style="
          path.length > 0 && !flatPropertyLayout
            ? { border: '1px solid #d9d9d9', borderRadius: '8px', padding: '16px' }
            : undefined
        "
      >
        <div v-if="path.length > 0 && !hideLabel" style="font-weight: 600; margin-bottom: 4px">
          {{ label }}
        </div>
        <div
          v-if="path.length > 0 && schema.description"
          style="color: #8c8c8c; font-size: 12px; margin-bottom: 12px"
        >
          {{ schema.description }}
        </div>
        <AppSchemaField
          v-for="(propSchema, propName) in schema.properties"
          :key="propName"
          :disabled="disabled"
          :errors="errors"
          :field-name="propName"
          :flat-property-layout="flatPropertyLayout"
          :hidden-paths="hiddenPaths"
          :is-field-readonly="isFieldReadonly"
          :model-value="objectValue()[propName]"
          :path="[...path, propName]"
          :readonly="readonly"
          :required="(schema.required ?? []).includes(propName)"
          :schema="propSchema"
          @focus="forwardFocus"
          @update:model-value="updateChild(propName, $event)"
        />
        <template v-if="additionalSchema">
          <div
            v-for="(key, index) in mapKeys()"
            :key="index"
            style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px"
          >
            <Input
              :disabled="controlDisabled"
              style="width: 200px"
              :value="key"
              @update:value="renameMapKey(key, $event)"
            />
            <div style="flex: 1">
              <AppSchemaField
                :disabled="disabled"
                :errors="errors"
                :field-name="key"
                :flat-property-layout="flatPropertyLayout"
                :hidden-paths="hiddenPaths"
                hide-label
                :is-field-readonly="isFieldReadonly"
                :model-value="objectValue()[key]"
                :path="[...path, key]"
                :readonly="readonly"
                :schema="additionalSchema"
                @focus="forwardFocus"
                @update:model-value="updateChild(key, $event)"
              />
            </div>
            <Button
              :aria-label="t('label.remove')"
              danger
              :disabled="controlDisabled"
              type="text"
              @click="removeMapRow(key)"
            >
              <DeleteOutlined />
            </Button>
          </div>
          <Button
            :aria-label="t('label.add-entity', { entity: label })"
            :data-testid="`add-item-${label}`"
            :disabled="controlDisabled"
            type="dashed"
            @click="addMapRow"
          >
            <PlusOutlined />
          </Button>
        </template>
      </div>
    </template>

    <!-- Leaf field -->
    <template v-else>
      <div v-if="!hideLabel" style="margin-bottom: 4px">
        <span style="font-weight: 600">
          {{ label }}
          <span v-if="required" style="color: #ff4d4f">*</span>
        </span>
        <div v-if="schema.description" style="color: #8c8c8c; font-size: 12px">
          {{ schema.description }}
        </div>
      </div>

      <!-- Boolean -->
      <Checkbox
        v-if="isBoolean"
        :checked="modelValue === true"
        :disabled="controlDisabled"
        @update:checked="$emit('update:modelValue', $event)"
      >
        <span v-if="hideLabel">{{ label }}</span>
      </Checkbox>

      <!-- Enum select -->
      <Select
        v-else-if="isEnum"
        :disabled="controlDisabled"
        :options="(schema.enum ?? []).map((value) => ({ value: String(value), label: String(value) }))"
        style="width: 100%"
        :value="modelValue === undefined ? undefined : String(modelValue)"
        @update:value="$emit('update:modelValue', $event)"
      />

      <!-- TreeSelect multi enum -->
      <Select
        v-else-if="isTreeSelect"
        :disabled="controlDisabled"
        mode="multiple"
        :options="treeSelectOptions"
        style="width: 100%"
        :value="arrayValue().map(String)"
        @update:value="onTreeSelectChange($event as string[])"
      />

      <!-- String array -->
      <template v-else-if="isArray">
        <div
          v-for="(_item, index) in arrayValue()"
          :key="index"
          style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px"
        >
          <div style="flex: 1">
            <AppSchemaField
              :disabled="disabled"
              :errors="errors"
              :field-name="String(index)"
              :flat-property-layout="flatPropertyLayout"
              :hidden-paths="hiddenPaths"
              hide-label
              :is-field-readonly="isFieldReadonly"
              :model-value="arrayValue()[index]"
              :path="[...path, String(index)]"
              :readonly="readonly"
              :schema="schema.items ?? {}"
              @focus="forwardFocus"
              @update:model-value="updateItem(index, $event)"
            />
          </div>
          <Button
            :aria-label="t('label.remove')"
            danger
            :disabled="controlDisabled"
            type="text"
            @click="removeItem(index)"
          >
            <DeleteOutlined />
          </Button>
        </div>
        <Button
          :aria-label="t('label.add-entity', { entity: label })"
          :data-testid="`add-item-${label}`"
          :disabled="controlDisabled"
          type="dashed"
          @click="addItem"
        >
          <PlusOutlined />
        </Button>
      </template>

      <!-- Number -->
      <InputNumber
        v-else-if="isNumber"
        :disabled="controlDisabled"
        :max="schema.maximum"
        :min="schema.minimum"
        style="width: 100%"
        :value="typeof modelValue === 'number' ? modelValue : undefined"
        @change="onNumberChange"
      />

      <!-- Date -->
      <DatePicker
        v-else-if="schema.format === 'date'"
        :disabled="controlDisabled"
        style="width: 100%"
        :value="typeof modelValue === 'string' ? modelValue : undefined"
        value-format="YYYY-MM-DD"
        @change="(_date: unknown, dateString: string) => $emit('update:modelValue', dateString || undefined)"
      />

      <!-- Password -->
      <InputPassword
        v-else-if="schema.format === 'password'"
        :disabled="controlDisabled"
        :value="typeof modelValue === 'string' ? modelValue : ''"
        @update:value="$emit('update:modelValue', $event)"
      />

      <!-- Text / email / uri -->
      <Input
        v-else
        :disabled="controlDisabled"
        :value="typeof modelValue === 'string' ? modelValue : ''"
        @update:value="$emit('update:modelValue', $event)"
      />

      <div v-for="error in myErrors" :key="error.name" style="color: #ff4d4f; font-size: 12px">
        {{ errorMessage(error) }}
      </div>
    </template>
  </div>
</template>
