<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, InputNumber, Radio, Select, Typography } from 'ant-design-vue';
import FileOrInputField from '@/components/ingestion/FileOrInputField.vue';
import FilterPatternCard from '@/components/ingestion/FilterPatternCard.vue';
import FormSectionCard from '@/components/ingestion/FormSectionCard.vue';
import MapEditor from '@/components/ingestion/MapEditor.vue';
import ToggleField from '@/components/shared/ToggleField.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  buildConnectionSections,
  clearInactiveAlationDbAuthBranchFields,
  clearInactiveAuthBranchFields,
  clearInactiveBranchFields,
  clearInactiveSupersetDbAuthBranchFields,
  connectionFieldGroupName,
  connectionFieldsForType,
  hasStoredFileFieldValue,
  isConnectionFieldVisible,
  parseMapFieldValue,
  stringifyMapFieldValue,
  type ConnectionFieldDef,
  type ConnectionFormGroup,
  type ConnectionFormSection,
} from '@/ingestion/connectionFields';
import type { FieldFocusMeta } from '@/ingestion/fieldFocus';
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';
import type { ServiceConnectionConfig, ServiceFormValues } from '@/types/ingestion';

/**
 * Sectioned connection-form renderer (live-issues S-09/S-10/S-12/S-13/
 * S-14/S-15/S-16/S-17): pin's ConnectionObjectFieldTemplate structure
 * over the lean-forms table — four titled sections from
 * buildConnectionSections, schema titles as labels (EN in both
 * locales), branch selectors with pin sanitize-on-switch, file-or-input
 * SSL leaves, map editors, toggles for booleans (with the schema
 * description beneath, pin `BooleanFieldTemplate`), and no inline hints
 * except the blank-means-keep secret hint. Focus/blur reports drive
 * the parent's doc panel; the create wizard passes no listeners.
 */
const props = defineProps<{
  form: ServiceFormValues;
  storedConfig?: ServiceConnectionConfig;
}>();

const emit = defineEmits<{
  focus: [fieldId: string, meta: FieldFocusMeta];
  blur: [];
}>();

const { t } = useI18n();

const type = computed(() => props.form.serviceType);
const record = computed(() => props.form as unknown as Record<string, unknown>);
const sectionsResult = computed(() => buildConnectionSections(type.value, record.value));
const allFields = computed(() => connectionFieldsForType(type.value));

function visible(field: ConnectionFieldDef): boolean {
  return isConnectionFieldVisible(field, record.value);
}

function fieldLabel(field: ConnectionFieldDef): string {
  return field.title ?? (field.labelKey ? t(field.labelKey) : '');
}

function optionLabel(option: { value: string; labelKey?: string; title?: string }): string {
  return option.title ?? (option.labelKey ? t(option.labelKey) : option.value);
}

function stringValue(field: ConnectionFieldDef): string {
  const value = record.value[field.key];
  return typeof value === 'string' ? value : '';
}

function numberValue(field: ConnectionFieldDef): number | undefined {
  const value = record.value[field.key];
  return typeof value === 'number' ? value : undefined;
}

function booleanValue(field: ConnectionFieldDef): boolean {
  return record.value[field.key] === true;
}

function setField(field: ConnectionFieldDef, value: unknown): void {
  record.value[field.key] = value;
}

/**
 * Branch sanitize on selector change (pin AuthSelectField/oneOf): the
 * authTypeBranch selector clears every other auth branch's keys
 * (including nested GCP variant fields); the Alation nested auth selector
 * (`alationDbAuthBranch`) gets the same key-set wipe plus the generic
 * clear for its gated leaves; any other selector clears the branch-tagged
 * fields gated on it. Selectors without gated branch fields are unaffected.
 */
function onSelectorChange(field: ConnectionFieldDef, value: string | undefined): void {
  setField(field, value ?? '');
  const next = value ?? '';
  if (field.key === 'authTypeBranch') {
    clearInactiveAuthBranchFields(type.value, props.form, next || 'basic');
  } else if (field.key === 'alationDbAuthBranch') {
    clearInactiveAlationDbAuthBranchFields(props.form, next || 'basic');
    clearInactiveBranchFields(allFields.value, props.form, String(field.key), next);
  } else if (field.key === 'supersetDbAuthBranch') {
    clearInactiveSupersetDbAuthBranchFields(props.form, next || 'basic');
    clearInactiveBranchFields(allFields.value, props.form, String(field.key), next);
  } else {
    clearInactiveBranchFields(allFields.value, props.form, String(field.key), next);
  }
}

/** A single-option select displays its only option without writing back. */
function selectDisplayValue(field: ConnectionFieldDef): string | undefined {
  const value = stringValue(field);
  if (value) {
    return value;
  }
  if (field.options?.length === 1) {
    return field.options[0].value;
  }
  return undefined;
}

function activeBranchTitle(field: ConnectionFieldDef): string {
  const current = stringValue(field) || field.defaultValue;
  const option = (field.options ?? []).find((entry) => entry.value === current);
  return option ? optionLabel(option) : (current ?? '');
}

function fieldIdFor(field: ConnectionFieldDef, group: ConnectionFormGroup): string {
  const groupName = connectionFieldGroupName(field);
  if (group.fields.length > 1) {
    return `root/${groupName}/${String(field.key)}`;
  }
  return `root/${groupName}`;
}

function reportFocus(
  field: ConnectionFieldDef,
  group: ConnectionFormGroup,
  section: ConnectionFormSection,
): void {
  emit('focus', fieldIdFor(field, group), {
    title: field.title ?? (field.labelKey ? t(field.labelKey) : ''),
    description: field.description,
    section: section.key as FieldFocusMeta['section'],
  });
}

function onFocusOut(event: FocusEvent): void {
  const current = event.currentTarget;
  if (
    current instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    current.contains(event.relatedTarget)
  ) {
    return;
  }
  emit('blur');
}

function visibleGroups(section: ConnectionFormSection): ConnectionFormGroup[] {
  return section.groups.filter((group) => group.fields.some((field) => visible(field)));
}

function visibleFields(group: ConnectionFormGroup): ConnectionFieldDef[] {
  return group.fields.filter((field) => visible(field));
}

function badgeText(section: ConnectionFormSection): string | undefined {
  if (!section.badge) {
    return undefined;
  }
  if (section.badge.kind === 'required') {
    return t('forms.sections.requiredCount', { count: section.badge.count });
  }
  return t('forms.sections.optional');
}

function onHeaderActivate(section: ConnectionFormSection): void {
  const groups = visibleGroups(section);
  const group =
    groups.find((entry) => entry.name === section.focusName) ?? groups[0];
  const field = group ? visibleFields(group)[0] : undefined;
  if (group && field) {
    reportFocus(field, group, section);
  }
}

function fieldKey(field: ConnectionFieldDef, group: ConnectionFormGroup, index: number): string {
  return field.testId ?? `${group.name}-${String(field.key)}-${index}`;
}
</script>

<template>
  <template v-for="section in sectionsResult.sections" :key="section.key">
    <FormSectionCard
      v-if="visibleGroups(section).length > 0"
      :title="t(section.titleKey)"
      :description="t(section.descriptionKey)"
      :badge-text="badgeText(section)"
      :badge-tone="section.badge?.kind === 'required' ? 'error' : 'quiet'"
      :collapsible="section.collapsible"
      :default-open="section.defaultOpen"
      :index="section.index"
      :test-id="`connection-section-${section.key}`"
      @header-activate="onHeaderActivate(section)"
    >
      <div :class="section.layout === 'grid' ? 'svc-grid' : 'svc-stack'">
        <div
          v-for="group in visibleGroups(section)"
          :key="group.name"
          :class="['svc-group', { 'svc-group-wide': group.wide }]"
        >
          <div v-if="group.label" class="svc-group-label">{{ group.label }}</div>
          <div
            v-for="(field, fieldIndex) in visibleFields(group)"
            :key="fieldKey(field, group, fieldIndex)"
            :class="[
              'svc-field',
              {
                'svc-field-plain':
                  field.control === 'toggle' ||
                  field.control === 'map' ||
                  field.control === 'filterPattern' ||
                  field.control === 'fileOrInput',
              },
            ]"
            @focusin="reportFocus(field, group, section)"
            @focusout="onFocusOut"
          >
            <Form.Item
              v-if="
                field.control === 'text' ||
                field.control === 'password' ||
                field.control === 'select' ||
                field.control === 'number' ||
                field.control === 'textarea' ||
                field.control === 'authSelect'
              "
              :name="String(field.key)"
              :label="field.hideItemLabel ? undefined : fieldLabel(field)"
              :rules="field.required ? requiredField(t, fieldLabel(field)) : undefined"
            >
              <Input
                v-if="field.control === 'text'"
                :value="stringValue(field)"
                :data-testid="field.testId"
                autocomplete="off"
                @update:value="(value) => setField(field, value)"
              />
              <Input.Password
                v-else-if="field.control === 'password'"
                :value="stringValue(field)"
                :data-testid="field.testId"
                autocomplete="new-password"
                @update:value="(value) => setField(field, value)"
              />
              <Select
                v-else-if="field.control === 'select'"
                :value="selectDisplayValue(field)"
                :data-testid="field.testId"
                :options="(field.options ?? []).map((option) => ({ value: option.value, label: optionLabel(option) }))"
                allow-clear
                @update:value="(value) => onSelectorChange(field, value as string | undefined)"
              />
              <InputNumber
                v-else-if="field.control === 'number'"
                :value="numberValue(field)"
                :data-testid="field.testId"
                :min="field.min"
                :max="field.max"
                style="width: 100%"
                @update:value="(value) => setField(field, value)"
              />
              <Input.TextArea
                v-else-if="field.control === 'textarea'"
                :value="stringValue(field)"
                :data-testid="field.testId"
                :rows="3"
                autocomplete="off"
                @update:value="(value) => setField(field, value)"
              />
              <template v-else-if="field.control === 'authSelect'">
                <Radio.Group
                  :value="stringValue(field) || field.defaultValue"
                  :data-testid="field.testId"
                  option-type="button"
                  @update:value="(value) => onSelectorChange(field, value as string)"
                >
                  <Radio.Button
                    v-for="option in field.options ?? []"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ optionLabel(option) }}
                  </Radio.Button>
                </Radio.Group>
                <Typography.Paragraph
                  v-if="field.authNote && (field.options?.length ?? 0) > 1"
                  type="secondary"
                  class="svc-auth-note"
                >
                  {{
                    t('ingestion.services.editConnectionPage.authSingleCredential', {
                      method: activeBranchTitle(field),
                    })
                  }}
                </Typography.Paragraph>
              </template>
              <Typography.Paragraph
                v-if="field.hintKey === 'connection.secretHint'"
                type="secondary"
                class="svc-hint"
              >
                {{ t(field.hintKey) }}
              </Typography.Paragraph>
            </Form.Item>
            <ToggleField
              v-else-if="field.control === 'toggle'"
              :model-value="booleanValue(field)"
              :label="fieldLabel(field)"
              :description="field.description"
              :field-id="fieldIdFor(field, group)"
              :test-id="field.testId"
              @update:model-value="(value) => setField(field, value)"
              @focus="reportFocus(field, group, section)"
            />
            <MapEditor
              v-else-if="field.control === 'map'"
              :model-value="parseMapFieldValue(stringValue(field))"
              :title="fieldLabel(field)"
              :test-id="field.testId"
              @update:model-value="(value) => setField(field, stringifyMapFieldValue(value))"
            />
            <FilterPatternCard
              v-else-if="field.control === 'filterPattern'"
              :field-name="String(field.key)"
              :model-value="record[field.key] as FilterPatternConfig | undefined"
              :schema-title="field.title"
              @update:model-value="(value) => setField(field, value)"
              @focus="reportFocus(field, group, section)"
            />
            <FileOrInputField
              v-else-if="field.control === 'fileOrInput'"
              :model-value="stringValue(field) || undefined"
              :has-stored-value="hasStoredFileFieldValue(storedConfig, String(field.key), type)"
              :accepted-file-types="field.acceptedFileTypes ? [...field.acceptedFileTypes] : undefined"
              :label="fieldLabel(field)"
              :hint="field.hintKey === 'connection.secretHint' ? t(field.hintKey) : undefined"
              :required="field.required"
              :test-id="field.testId"
              @update:model-value="(value) => setField(field, value ?? '')"
              @focus="reportFocus(field, group, section)"
              @blur="emit('blur')"
            />
          </div>
        </div>
      </div>
    </FormSectionCard>
  </template>
  <Typography.Paragraph
    v-for="field in sectionsResult.notes"
    :key="field.textKey"
    type="secondary"
  >
    {{ field.textKey ? t(field.textKey) : '' }}
  </Typography.Paragraph>
</template>

<style scoped>
.svc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 640px) {
  .svc-grid {
    grid-template-columns: 1fr;
  }
}

.svc-group-wide {
  grid-column: 1 / -1;
}

.svc-group-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.svc-field {
  margin-bottom: 0;
}

.svc-field-plain {
  margin-bottom: 24px;
}

.svc-field .ant-form-item {
  margin-bottom: 24px;
}

.svc-hint {
  margin-top: 8px;
  margin-bottom: 0;
}

.svc-auth-note {
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
