<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Input, Select } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { listTags } from '@/api/tags';
import type { WorkflowFlowNode } from '@/types/governance';
import { FIELD_OPTIONS, FIELD_OPTIONS_DROPDOWN } from '@/constants/workflowBuilder';
import { fetchLifecycleStatuses } from '@/utils/workflowConfig';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import {
  parseFqnList,
  serializeFqnList,
} from '@/utils/workflowSerialization';
import {
  fetchCertificationOptions,
  fetchGlossaryOptions,
  fetchTagOptions,
} from '@/utils/conditionBuilderValueFetchers';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official SetActionForm (pin a3012259ca): sets one entity field — field
 * name from FIELD_OPTIONS_DROPDOWN (name is excluded), field value per
 * field: tags → tag picker, glossaryTerms → glossary picker,
 * certification → certification picker, tier/status → option selects
 * (tier from the Tier classification, status from the lifecycle statuses
 * common to the workflow's entity types), anything else → text input.
 * R-11: the tag/glossary/certification pickers are antd multi/single
 * selects over the condition-builder fetchers; FQN lists are JSON arrays
 * (serializeFqnList / parseFqnList). Save is invalid for a status value
 * outside the fetched lifecycle options.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  entityTypes?: readonly string[];
}>();

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

interface FormData {
  displayName: string;
  description: string;
  fieldName: string;
  fieldValue: string;
  actionConditions: string;
}

const formData = ref<FormData>({
  displayName: '',
  description: '',
  fieldName: '',
  fieldValue: '',
  actionConditions: '',
});
const fieldOptions = ref<Record<string, string[]>>({ tier: [], status: [] });
const isLoadingOptions = ref(false);
// Async picker options, seeded with the stored values so a saved FQN
// still shows even before its page loads.
const tagOptions = ref<Array<{ value: string; label: string }>>([]);
const glossaryOptions = ref<Array<{ value: string; label: string }>>([]);
const certificationOptions = ref<Array<{ value: string; label: string }>>([]);

const entityTypesKey = computed(() => props.entityTypes?.join(',') ?? '');

function syncFromNode(): void {
  const nodeConfig = (props.node.data?.config ?? {}) as Record<string, unknown>;
  formData.value = {
    displayName: props.node.data?.displayName || props.node.data?.label || '',
    description: props.node.data?.description || '',
    fieldName: (nodeConfig.fieldName as string) || '',
    fieldValue: (nodeConfig.fieldValue as string) || '',
    actionConditions: (props.node.data?.actionConditions as string) || '',
  };
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function seedPickerOptions(): void {
  const fqns = parseFqnList(formData.value.fieldValue);
  if (formData.value.fieldName === FIELD_OPTIONS.TAGS) {
    tagOptions.value = fqns.map((fqn) => ({ value: fqn, label: fqn }));
  } else if (formData.value.fieldName === FIELD_OPTIONS.GLOSSARY_TERMS) {
    glossaryOptions.value = fqns.map((fqn) => ({ value: fqn, label: fqn }));
  }
}

watch(
  () => formData.value.fieldName,
  (fieldName) => {
    seedPickerOptions();
    if (fieldName === FIELD_OPTIONS.STATUS) {
      isLoadingOptions.value = true;
      fieldOptions.value = { ...fieldOptions.value, status: [] };
      void fetchLifecycleStatuses(
        entityTypesKey.value.split(',').filter(Boolean),
        'intersection',
      )
        .then((status) => {
          fieldOptions.value = { ...fieldOptions.value, status };
        })
        .catch(() => {
          // A failed lookup leaves the status list empty; save stays
          // invalid until it loads, as in official.
        })
        .finally(() => {
          isLoadingOptions.value = false;
        });
    }
    if (fieldName === FIELD_OPTIONS.TIER) {
      void (async () => {
        try {
          isLoadingOptions.value = true;
          const response = await listTags({ limit: 1000, parent: 'Tier' });
          fieldOptions.value = {
            ...fieldOptions.value,
            tier: response.data
              .map((tag) => tag.fullyQualifiedName)
              .filter(Boolean) as string[],
          };
        } catch {
          // A failed lookup leaves the tier list empty.
        } finally {
          isLoadingOptions.value = false;
        }
      })();
    }
    if (fieldName === FIELD_OPTIONS.TAGS) {
      void fetchTagOptions('').then((opts) => {
        const seen = new Set(tagOptions.value.map((o) => o.value));
        tagOptions.value = [
          ...tagOptions.value,
          ...opts
            .filter((o) => !seen.has(o.value))
            .map((o) => ({ value: o.value, label: o.label })),
        ];
      });
    }
    if (fieldName === FIELD_OPTIONS.GLOSSARY_TERMS) {
      void fetchGlossaryOptions('').then((opts) => {
        const seen = new Set(glossaryOptions.value.map((o) => o.value));
        glossaryOptions.value = [
          ...glossaryOptions.value,
          ...opts
            .filter((o) => !seen.has(o.value))
            .map((o) => ({ value: o.value, label: o.label })),
        ];
      });
    }
    if (fieldName === FIELD_OPTIONS.CERTIFICATION) {
      void fetchCertificationOptions('').then((opts) => {
        certificationOptions.value = opts.map((o) => ({
          value: o.value,
          label: o.label,
        }));
      });
    }
  },
  { immediate: true },
);

function getSelectOptions(field: string): string[] {
  return fieldOptions.value[field] || [];
}

function isSelectField(field: string): boolean {
  return ['tier', 'status'].includes(field);
}

function updateFormData<K extends keyof FormData>(field: K, value: FormData[K]): void {
  formData.value = { ...formData.value, [field]: value };
}

function handleSave(): void {
  props.onSave(
    props.node.id,
    createNodeConfig({
      displayName: formData.value.displayName,
      description: formData.value.description,
      actionConditions: formData.value.actionConditions,
      type: 'automatedTask',
      subType: 'setEntityAttributeTask',
      config: {
        fieldName: formData.value.fieldName,
        fieldValue: formData.value.fieldValue,
      },
    }),
  );
  props.onClose();
}

function handleDeleteNode(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}

function mergePickerOptions(
  current: Array<{ value: string; label: string }>,
  loaded: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const selected = new Set(parseFqnList(formData.value.fieldValue));
  const kept = current.filter((o) => selected.has(o.value));
  const seen = new Set(kept.map((o) => o.value));
  return [
    ...kept,
    ...loaded.filter((o) => !seen.has(o.value)),
  ];
}

function onTagSearch(text: string): void {
  void fetchTagOptions(text).then((opts) => {
    tagOptions.value = mergePickerOptions(
      tagOptions.value,
      opts.map((o) => ({ value: o.value, label: o.label })),
    );
  });
}

function onGlossarySearch(text: string): void {
  void fetchGlossaryOptions(text).then((opts) => {
    glossaryOptions.value = mergePickerOptions(
      glossaryOptions.value,
      opts.map((o) => ({ value: o.value, label: o.label })),
    );
  });
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="formData.displayName"
      :description="formData.description"
      :on-name-change="(value) => updateFormData('displayName', value)"
      :on-description-change="(value) => updateFormData('description', value)"
    />
    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ t('workflows.builder.fieldName') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Select
        :value="formData.fieldName"
        data-testid="field-name-select"
        :disabled="isFormDisabled"
        :options="FIELD_OPTIONS_DROPDOWN.map((opt) => ({ value: opt.value, label: opt.label }))"
        style="width: 100%"
        @change="
          (key) => {
            updateFormData('fieldName', String(key ?? ''));
            updateFormData('fieldValue', '');
          }
        "
      />
    </div>

    <div style="margin-bottom: 24px">
      <template v-if="formData.fieldName === 'tags'">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.fieldValue') }}</label>
        <Select
          mode="multiple"
          :value="parseFqnList(formData.fieldValue)"
          data-testid="field-value-select"
          :disabled="isFormDisabled"
          :options="tagOptions"
          style="width: 100%"
          @change="(values) => updateFormData('fieldValue', serializeFqnList(values as string[]))"
          @search="onTagSearch"
        />
      </template>
      <template v-else-if="formData.fieldName === 'glossaryTerms'">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.fieldValue') }}</label>
        <Select
          mode="multiple"
          :value="parseFqnList(formData.fieldValue)"
          data-testid="field-value-select"
          :disabled="isFormDisabled"
          :options="glossaryOptions"
          :placeholder="t('workflows.builder.selectGlossaryTerms')"
          style="width: 100%"
          @change="(values) => updateFormData('fieldValue', serializeFqnList(values as string[]))"
          @search="onGlossarySearch"
        />
      </template>
      <template v-else-if="formData.fieldName === FIELD_OPTIONS.CERTIFICATION">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.fieldValue') }}</label>
        <Select
          :value="formData.fieldValue || undefined"
          data-testid="field-value-select"
          :disabled="isFormDisabled"
          :options="certificationOptions"
          style="width: 100%"
          @change="(key) => updateFormData('fieldValue', String(key ?? ''))"
        />
      </template>
      <template v-else-if="isSelectField(formData.fieldName)">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.fieldValue') }}</label>
        <Select
          :value="formData.fieldValue || undefined"
          data-testid="field-value-select"
          :disabled="isFormDisabled || isLoadingOptions"
          :options="getSelectOptions(formData.fieldName).map((o) => ({ value: o, label: o }))"
          style="width: 100%"
          @change="(key) => updateFormData('fieldValue', String(key ?? ''))"
        />
      </template>
      <template v-else>
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.fieldValue') }}</label>
        <Input
          :value="formData.fieldValue"
          data-testid="field-value-input"
          :disabled="isFormDisabled"
          :placeholder="t('workflows.builder.enterFieldValue')"
          @update:value="(value) => updateFormData('fieldValue', value)"
        />
      </template>
    </div>
    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="
        !isValidString(formData.displayName) ||
        !formData.fieldName ||
        (formData.fieldName === FIELD_OPTIONS.STATUS &&
          !getSelectOptions('status').includes(formData.fieldValue))
      "
      :on-cancel="onClose"
      :on-delete="handleDeleteNode"
      :on-save="handleSave"
    />
  </div>
</template>
