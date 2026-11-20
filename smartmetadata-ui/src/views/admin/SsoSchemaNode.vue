<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Checkbox, Input, InputNumber, RadioGroup, Select } from 'ant-design-vue';
import type { RadioChangeEvent } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveSsoFieldText } from '@/admin/ssoFieldText';
import type { SsoJsonSchema } from '@/admin/ssoSchemas';
import { isPointerManaged } from '@/utils/settingsSource';
import type { SsoSecuritySources } from '@/admin/ssoSecuritySources';
import {
  buildSsoFieldGroups,
  isSsoDeprecatedProperty,
  isSsoUiHidden,
  resolveSsoFieldLabel,
  resolveSsoObjectTitle,
  resolveSsoWidgetKind,
  splitSsoAdvancedProperties,
  type SsoUiSchemaEntry,
} from '@/admin/ssoUiSchema';
import SsoArrayField from './SsoArrayField.vue';
import SsoLdapRoleMappingWidget from './SsoLdapRoleMappingWidget.vue';
import SsoRolesSelectField from './SsoRolesSelectField.vue';

const TextArea = Input.TextArea;
const InputPassword = Input.Password;

const props = withDefaults(
  defineProps<{
    fieldId: string;
    path: string[];
    schema: SsoJsonSchema;
    entry?: SsoUiSchemaEntry;
    modelValue?: unknown;
    required?: boolean;
    disabled?: boolean;
    getFieldErrors: (fieldId: string) => string[];
    managedPaths: SsoSecuritySources['managedPaths'];
    locale: string;
    brandName: string;
    bare?: boolean;
  }>(),
  {
    entry: undefined,
    modelValue: undefined,
    required: false,
    disabled: false,
    bare: false,
  },
);

const emit = defineEmits<{
  change: [fieldId: string, value: unknown];
  'clear-error': [fieldId: string];
}>();

const { t, te } = useI18n();

const propertyName = computed(() => props.path[props.path.length - 1] ?? '');
const errors = computed(() => props.getFieldErrors(props.fieldId));

// Section-relative JSON pointer for the managed check (`/` for the
// section root itself, i.e. the whole setting).
const pointer = computed(() =>
  props.path.length <= 1 ? '/' : `/${props.path.slice(1).join('/')}`,
);
const sectionPaths = computed(
  () =>
    props.managedPaths[
      props.path[0] as keyof SsoSecuritySources['managedPaths']
    ] ?? [],
);
// Managed disabling is ancestor-or-self, matching pin's
// `applyManagedPathsToUiSchema` + RJSF disabled propagation.
const effectiveDisabled = computed(
  () =>
    props.disabled || isPointerManaged(sectionPaths.value, pointer.value),
);
const isReadonly = computed(() => props.entry?.['ui:readonly'] === true);
const controlDisabled = computed(
  () => effectiveDisabled.value || isReadonly.value,
);

const kind = computed(() => resolveSsoWidgetKind(props.entry, props.schema));
const label = computed(() =>
  resolveSsoFieldLabel({
    entry: props.entry,
    schema: props.schema,
    propertyName: propertyName.value,
    isArrayField: kind.value === 'array' || kind.value === 'roles-select',
    locale: props.locale,
    brandName: props.brandName,
  }),
);
const deprecated = computed(() =>
  isSsoDeprecatedProperty(props.schema, propertyName.value),
);
const placeholder = computed(() => {
  const raw = props.entry?.['ui:placeholder'];
  return raw === undefined
    ? undefined
    : resolveSsoFieldText(raw, props.locale, props.brandName);
});
const help = computed(() => {
  const raw = props.entry?.['ui:help'];
  return raw === undefined
    ? undefined
    : resolveSsoFieldText(raw, props.locale, props.brandName);
});
const objectTitle = computed(() => {
  const raw = resolveSsoObjectTitle(props.entry, props.schema);
  return raw === undefined
    ? undefined
    : resolveSsoFieldText(raw, props.locale, props.brandName);
});

// Object children: advanced split first, then grouping over the normal
// names (pin `SSOGroupedFieldTemplate`). Group titles are data only and
// never rendered.
const childNames = computed(() => Object.keys(props.schema.properties ?? {}));
const split = computed(() => splitSsoAdvancedProperties(childNames.value));
const groups = computed(() =>
  buildSsoFieldGroups(props.fieldId, split.value.normalProperties),
);
const advancedOpen = ref(false);

function childEntry(name: string): SsoUiSchemaEntry | undefined {
  return props.entry?.children?.[name];
}
function childValue(name: string): unknown {
  const record = props.modelValue as Record<string, unknown> | undefined;
  return record?.[name];
}
function childRequired(name: string): boolean {
  return (props.schema.required ?? []).includes(name);
}
function childFieldId(name: string): string {
  return `${props.fieldId}/${name}`;
}

function handleChange(fieldId: string, value: unknown): void {
  emit('change', fieldId, value);
}
function handleClearError(fieldId: string): void {
  emit('clear-error', fieldId);
}

function emitValue(value: unknown): void {
  emit('change', props.fieldId, value);
}

const stringValue = computed(() =>
  props.modelValue == null ? '' : String(props.modelValue),
);
const numericValue = computed(() =>
  typeof props.modelValue === 'number' ? props.modelValue : undefined,
);
const booleanValue = computed(() => Boolean(props.modelValue));

function handleNumberChange(value: number | string | null): void {
  emitValue(value == null || value === '' ? undefined : Number(value));
}
function handleCheckboxChange(event: { target: { checked: boolean } }): void {
  emitValue(event.target.checked);
}
function handleRadioChange(event: RadioChangeEvent): void {
  emitValue(event.target.value);
}
function handleSelectChange(value: unknown): void {
  emitValue(value === undefined ? undefined : value);
}

const selectOptions = computed(() =>
  (props.schema.enum ?? []).map((option) => ({
    value: String(option),
    label: String(option),
  })),
);
// Radio labels resolve through the client-type translations when the
// key exists (clientType in Chinese); every other enum renders raw.
const radioOptions = computed(() =>
  (props.schema.enum ?? []).map((option) => {
    const value = String(option);
    const key = `sso.clientTypes.${value}`;
    return {
      value,
      label: props.locale === 'zh-CN' && te(key) ? t(key) : value,
    };
  }),
);
const arrayEnumOptions = computed(() => {
  const items = props.schema.items;
  if (
    items &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    items.type === 'string' &&
    Array.isArray(items.enum)
  ) {
    return items.enum.map((option) => String(option));
  }
  return [];
});
const isUrlField = computed(
  () =>
    props.fieldId.includes('publicKeyUrls') || props.fieldId.includes('Url'),
);
const isScopeField = computed(() => props.fieldId.includes('scope'));
</script>

<template>
  <div
    v-if="kind === 'object'"
    :id="fieldId"
    :class="{ 'sso-object-field': !bare }"
  >
    <label
      v-if="objectTitle !== undefined && !bare"
      :id="`${fieldId}__title`"
      class="control-label"
    >
      {{ objectTitle }}
    </label>
    <div v-for="(group, groupIndex) in groups" :key="groupIndex">
      <div
        v-for="name in group.properties"
        :key="name"
        class="property-wrapper"
      >
        <SsoSchemaNode
          v-if="!isSsoUiHidden(childEntry(name))"
          :brand-name="brandName"
          :disabled="effectiveDisabled"
          :entry="childEntry(name)"
          :field-id="childFieldId(name)"
          :get-field-errors="getFieldErrors"
          :locale="locale"
          :managed-paths="managedPaths"
          :model-value="childValue(name)"
          :path="[...path, name]"
          :required="childRequired(name)"
          :schema="schema.properties![name]!"
          @change="handleChange"
          @clear-error="handleClearError"
        />
      </div>
    </div>
    <div v-if="split.advancedProperties.length > 0">
      <button
        type="button"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        {{ t('sso.advancedConfig') }}
      </button>
      <div v-show="advancedOpen">
        <div v-for="name in split.advancedProperties" :key="name">
          <div
            v-if="isSsoUiHidden(childEntry(name))"
            style="display: none"
          >
            <SsoSchemaNode
              bare
              :brand-name="brandName"
              :disabled="effectiveDisabled"
              :entry="childEntry(name)"
              :field-id="childFieldId(name)"
              :get-field-errors="getFieldErrors"
              :locale="locale"
              :managed-paths="managedPaths"
              :model-value="childValue(name)"
              :path="[...path, name]"
              :required="childRequired(name)"
              :schema="schema.properties![name]!"
              @change="handleChange"
              @clear-error="handleClearError"
            />
          </div>
          <SsoSchemaNode
            v-else
            :brand-name="brandName"
            :disabled="effectiveDisabled"
            :entry="childEntry(name)"
            :field-id="childFieldId(name)"
            :get-field-errors="getFieldErrors"
            :locale="locale"
            :managed-paths="managedPaths"
            :model-value="childValue(name)"
            :path="[...path, name]"
            :required="childRequired(name)"
            :schema="schema.properties![name]!"
            @change="handleChange"
            @clear-error="handleClearError"
          />
        </div>
      </div>
    </div>
  </div>

  <SsoArrayField
    v-else-if="kind === 'array'"
    :deprecated="deprecated"
    :disabled="controlDisabled"
    :field-id="fieldId"
    :has-field-error="errors.length > 0"
    :is-scope-field="isScopeField"
    :is-url-field="isUrlField"
    :label="label"
    :model-value="modelValue as string | string[] | undefined"
    :name="propertyName"
    :options="arrayEnumOptions"
    :placeholder="placeholder ?? t('sso.enterEachValueAndPressEnter')"
    :required="required"
    @change="emitValue"
    @clear-error="handleClearError"
  />

  <SsoRolesSelectField
    v-else-if="kind === 'roles-select'"
    :disabled="controlDisabled"
    :field-id="fieldId"
    :has-field-error="errors.length > 0"
    :label="label"
    :model-value="(modelValue as string[] | undefined) ?? []"
    :name="propertyName"
    :placeholder="placeholder ?? t('sso.selectField')"
    :required="required"
    @change="emitValue"
    @clear-error="handleClearError"
  />

  <div v-else-if="kind !== 'hidden'" :class="['form-group', entry?.['ui:classNames']]">
    <label
      v-if="kind !== 'checkbox' && !bare"
      :for="fieldId"
      class="control-label"
    >
      {{ label }}
      <span v-if="required" class="required">*</span>
      <span v-if="deprecated" class="sso-deprecated-tag">{{
        t('sso.deprecated')
      }}</span>
    </label>

    <div v-if="kind === 'checkbox'" :class="{ 'sso-deprecated-boolean-wrapper': deprecated && !bare }">
      <Checkbox
        :id="fieldId"
        :checked="booleanValue"
        :disabled="controlDisabled"
        @change="handleCheckboxChange"
      >
        {{ label }}
      </Checkbox>
      <span v-if="deprecated && !bare" class="sso-deprecated-tag">{{
        t('sso.deprecated')
      }}</span>
    </div>
    <InputPassword
      v-else-if="kind === 'password'"
      :id="fieldId"
      :disabled="controlDisabled"
      :placeholder="placeholder"
      :value="stringValue"
      @update:value="emitValue"
    />
    <TextArea
      v-else-if="kind === 'textarea'"
      :id="fieldId"
      :disabled="controlDisabled"
      :placeholder="placeholder"
      :value="stringValue"
      @update:value="emitValue"
    />
    <InputNumber
      v-else-if="kind === 'number'"
      :id="fieldId"
      :disabled="controlDisabled"
      :placeholder="placeholder"
      :value="numericValue"
      @change="handleNumberChange"
    />
    <Select
      v-else-if="kind === 'select'"
      :id="fieldId"
      allow-clear
      :disabled="controlDisabled"
      :options="selectOptions"
      :placeholder="placeholder"
      :value="(modelValue as string | undefined)"
      @change="handleSelectChange"
    />
    <RadioGroup
      v-else-if="kind === 'radio'"
      :id="fieldId"
      :disabled="controlDisabled"
      :options="radioOptions"
      :value="(modelValue as string | undefined)"
      @change="handleRadioChange"
    />
    <SsoLdapRoleMappingWidget
      v-else-if="kind === 'ldap-role-mapping'"
      :disabled="effectiveDisabled"
      :field-id="fieldId"
      :model-value="(modelValue as string | undefined)"
      :readonly="isReadonly"
      @change="emitValue"
    />
    <Input
      v-else
      :id="fieldId"
      :disabled="controlDisabled"
      :placeholder="placeholder"
      :value="stringValue"
      @update:value="emitValue"
    />

    <ul v-if="!bare && errors.length > 0">
      <li v-for="error in errors" :key="error" class="form-field-error">
        {{ error }}
      </li>
    </ul>
    <div v-if="!bare && help !== undefined" class="help-block">
      {{ help }}
    </div>
  </div>
</template>
