<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Form, Input, InputNumber, Select, Typography } from 'ant-design-vue';
import {
  applySchemaDefaults,
  deref,
  selectBranch,
  startCase,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { splitCsv } from '@/ingestion/sourceConfig';

/**
 * One field of the schema-driven sourceConfig form. Recurses for
 * objects, oneOf/anyOf branches, arrays of objects, and
 * additionalProperties maps — the Vue equivalent of the RJSF field
 * rendering official's `IngestionWorkflowForm` gets from
 * `@rjsf/core` (custom `FilterPatternField`, `CoreOneOfField`,
 * `WorkflowArrayFieldTemplate`, `CoreWrapIfAdditionalTemplate`).
 *
 * A filter-pattern object (an object whose properties are exactly
 * `includes` + `excludes` string arrays) renders as two text inputs,
 * one pattern per line or comma-separated — the product's existing
 * `splitCsv` convention (P-08(b)).
 */
const props = defineProps<{
  schema: RjsfSchema;
  value: unknown;
  path: string[];
  rootSchema: RjsfSchema;
  errors: Map<string, string>;
  showErrors: boolean;
  required?: boolean;
  /** Suppress this field's own label — used when a oneOf/anyOf branch is
   * rendered under its parent's branch-selector label. */
  hideLabel?: boolean;
  testIdPrefix: string;
}>();
const emit = defineEmits<{ (event: 'update:value', value: unknown): void }>();
const { t } = useI18n();

const key = computed(() => props.path[props.path.length - 1] ?? '');
const pathKey = computed(() => props.path.join('.'));
const testId = computed(() => `${props.testIdPrefix}-${props.path.join('-')}`);
const resolved = computed(() => deref(props.schema, props.rootSchema));
const error = computed(() => (props.showErrors ? props.errors.get(pathKey.value) : undefined));

const label = computed(() => resolved.value.title ?? startCase(key.value));
const shownLabel = computed(() => (props.hideLabel ? undefined : label.value));
const help = computed(() => resolved.value.description);

function joinCsv(values: string[]): string {
  return values.join(', ');
}

/** The non-null member of a `type` union such as `["integer", "null"]`. */
function effectiveType(schema: RjsfSchema): string | undefined {
  const type = schema.type;
  if (Array.isArray(type)) {
    return type.find((member) => member !== 'null');
  }
  return type;
}

const kind = computed((): string => {
  const schema = resolved.value;
  if (schema.oneOf || schema.anyOf) {
    return 'oneOf';
  }
  const type = effectiveType(schema);
  if (type === 'object') {
    const props = schema.properties ?? {};
    const keys = Object.keys(props);
    if (
      keys.length === 2 &&
      keys.includes('includes') &&
      keys.includes('excludes')
    ) {
      return 'filterPattern';
    }
    if (Object.keys(props).length > 0) {
      return 'object';
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return 'map';
    }
    return 'none';
  }
  if (type === 'array') {
    const items = schema.items ? deref(schema.items, props.rootSchema) : undefined;
    if (items && Array.isArray(items.enum)) {
      return 'enumArray';
    }
    if (items && effectiveType(items) === 'object') {
      return 'objectArray';
    }
    return 'stringArray';
  }
  if (type === 'string' && Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'integer' || type === 'number') {
    return 'number';
  }
  if (type === 'string') {
    return 'string';
  }
  return 'none';
});

function updateValue(value: unknown): void {
  emit('update:value', value);
}

function updateField(fieldKey: string, value: unknown): void {
  const current = (props.value ?? {}) as Record<string, unknown>;
  const next = { ...current };
  if (value === undefined) {
    delete next[fieldKey];
  } else {
    next[fieldKey] = value;
  }
  emit('update:value', next);
}

// --- oneOf / anyOf -------------------------------------------------------
const branches = computed(() => resolved.value.oneOf ?? resolved.value.anyOf ?? []);
const branchTitles = computed(() =>
  branches.value.map((branch, index) => {
    const resolvedBranch = deref(branch, props.rootSchema);
    return resolvedBranch.title ?? `Option ${index + 1}`;
  }),
);
const selectedBranchIndex = computed(() => {
  const branch = selectBranch(branches.value, props.value, props.rootSchema);
  const index = branches.value.findIndex(
    (candidate) => deref(candidate, props.rootSchema) === branch,
  );
  return index === -1 ? 0 : index;
});
const selectedBranch = computed(
  () => deref(branches.value[selectedBranchIndex.value] ?? {}, props.rootSchema),
);

function onBranchChange(index: number): void {
  const branch = deref(branches.value[index] ?? {}, props.rootSchema);
  // RJSF resets the value to the new branch's defaults on switch.
  const seeded = applySchemaDefaults(branch, {}, props.rootSchema);
  emit('update:value', seeded);
}

function isScalarBranch(schema: RjsfSchema): boolean {
  return effectiveType(schema) === 'string' && !schema.properties;
}

// --- filter pattern ------------------------------------------------------
const patternIncludes = computed(() => {
  const value = props.value as { includes?: string[] } | undefined;
  return joinCsv(value?.includes ?? []);
});
const patternExcludes = computed(() => {
  const value = props.value as { excludes?: string[] } | undefined;
  return joinCsv(value?.excludes ?? []);
});

function onPatternChange(which: 'includes' | 'excludes', text: string): void {
  const current = (props.value ?? {}) as { includes?: string[]; excludes?: string[] };
  emit('update:value', { ...current, [which]: splitCsv(text) });
}

// --- string arrays -------------------------------------------------------
const stringArrayText = computed(() =>
  joinCsv(Array.isArray(props.value) ? (props.value as string[]) : []),
);

function onStringArrayChange(text: string): void {
  emit('update:value', splitCsv(text));
}

// --- enum arrays ---------------------------------------------------------
const enumItems = computed(() => {
  const items = resolved.value.items ? deref(resolved.value.items, props.rootSchema) : undefined;
  return (items?.enum ?? []) as string[];
});
const enumLabels = computed(() =>
  key.value === 'classificationLanguage'
    ? enumItems.value.map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    : enumItems.value,
);

// --- object arrays -------------------------------------------------------
const objectArrayRows = computed(() =>
  Array.isArray(props.value) ? (props.value as Array<Record<string, unknown>>) : [],
);
const objectArrayItemSchema = computed(() => {
  const items = resolved.value.items;
  return items ? deref(items, props.rootSchema) : {};
});

function addObjectArrayRow(): void {
  const seeded = applySchemaDefaults(objectArrayItemSchema.value, {}, props.rootSchema);
  emit('update:value', [...objectArrayRows.value, seeded]);
}

function removeObjectArrayRow(index: number): void {
  emit(
    'update:value',
    objectArrayRows.value.filter((_, i) => i !== index),
  );
}

function updateObjectArrayRow(index: number, value: Record<string, unknown>): void {
  const rows = [...objectArrayRows.value];
  rows[index] = value;
  emit('update:value', rows);
}

// --- maps (additionalProperties) -----------------------------------------
const mapValueSchema = computed(() => {
  const additional = resolved.value.additionalProperties;
  return additional && typeof additional === 'object'
    ? deref(additional, props.rootSchema)
    : {};
});
const mapRows = computed(() =>
  props.value && typeof props.value === 'object' && !Array.isArray(props.value)
    ? Object.entries(props.value as Record<string, unknown>)
    : [],
);
const newKeyCounter = ref(0);

function mapValueText(entry: [string, unknown]): string {
  const value = entry[1];
  if (Array.isArray(value)) {
    return joinCsv(value as string[]);
  }
  return typeof value === 'string' ? value : '';
}

function addMapRow(): void {
  newKeyCounter.value += 1;
  const keyName = `newKey${newKeyCounter.value}`;
  // RJSF seeds a new string-valued map row with 'New Value'; a row whose
  // value schema is a type-less anyOf (the ownerConfig maps) coerces to
  // `{}` — both are dropped by `formatAdditionalProperties` on submit
  // when left unfilled.
  const seed = mapValueSchema.value.anyOf || mapValueSchema.value.oneOf ? {} : 'New Value';
  const current = (props.value ?? {}) as Record<string, unknown>;
  emit('update:value', { ...current, [keyName]: seed });
}

function removeMapRow(rowKey: string): void {
  const current = { ...(props.value as Record<string, unknown>) };
  delete current[rowKey];
  emit('update:value', current);
}

function updateMapRowValue(rowKey: string, text: string): void {
  const current = { ...(props.value as Record<string, unknown>) };
  const valueSchema = mapValueSchema.value;
  if (valueSchema.anyOf || valueSchema.oneOf) {
    // ownerValue: a single owner stays a string, several become an array.
    const parts = splitCsv(text);
    current[rowKey] = parts.length <= 1 ? (parts[0] ?? '') : parts;
  } else {
    current[rowKey] = text;
  }
  emit('update:value', current);
}

function updateMapRowKey(oldKey: string, newKey: string): void {
  if (!newKey.trim() || newKey === oldKey) {
    return;
  }
  const current = { ...(props.value as Record<string, unknown>) };
  const value = current[oldKey];
  delete current[oldKey];
  current[newKey.trim()] = value;
  emit('update:value', current);
}

// --- defaultManifest (JSON textarea) --------------------------------------
const manifestText = ref('');
const manifestError = ref('');

watch(
  () => props.value,
  (value) => {
    if (key.value === 'defaultManifest') {
      const next = value === undefined ? '' : JSON.stringify(value, null, 2);
      // Do not reformat while the user is typing: only replace the text
      // when the external value no longer matches what is shown.
      try {
        if (manifestText.value.trim() && JSON.stringify(JSON.parse(manifestText.value), null, 2) === next) {
          return;
        }
      } catch {
        // Unparseable text stays as-is until it becomes valid JSON.
        if (manifestText.value !== '') {
          return;
        }
      }
      manifestText.value = next;
    }
  },
  { immediate: true },
);

function onManifestChange(text: string): void {
  manifestText.value = text;
  if (!text.trim()) {
    manifestError.value = '';
    emit('update:value', undefined);
    return;
  }
  try {
    emit('update:value', JSON.parse(text) as unknown);
    manifestError.value = '';
  } catch {
    manifestError.value = 'Invalid JSON';
  }
}

// --- object fields --------------------------------------------------------
const objectFields = computed(() => Object.keys(resolved.value.properties ?? {}));
</script>

<template>
  <template v-if="kind === 'none'"><!-- no renderable field --></template>

  <template v-else-if="kind === 'oneOf'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <Select
        :value="selectedBranchIndex"
        :data-testid="`${testId}-branch`"
        @update:value="(index) => onBranchChange(Number(index))"
      >
        <Select.Option v-for="(title, index) in branchTitles" :key="index" :value="index">
          {{ title }}
        </Select.Option>
      </Select>
    </Form.Item>
    <SchemaField
      v-if="!isScalarBranch(selectedBranch)"
      :schema="selectedBranch"
      :value="value"
      :path="path"
      :root-schema="rootSchema"
      :errors="errors"
      :show-errors="showErrors"
      hide-label
      :test-id-prefix="testIdPrefix"
    />
    <SchemaField
      v-else
      :schema="selectedBranch"
      :value="value"
      :path="path"
      :root-schema="rootSchema"
      :errors="errors"
      :show-errors="showErrors"
      hide-label
      :test-id-prefix="testIdPrefix"
    />
  </template>

  <template v-else-if="kind === 'filterPattern'">
    <div :data-testid="testId">
      <Typography.Text v-if="!hideLabel" strong>{{ label }}</Typography.Text>
      <Typography.Paragraph v-if="help" type="secondary">{{ help }}</Typography.Paragraph>
      <Form.Item
        :label="t('ingestion.pipelines.filterIncludes')"
        :validate-status="error ? 'error' : undefined"
        :help="error"
      >
        <Input.TextArea
          :value="patternIncludes"
          :data-testid="`${testId}-includes`"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          @update:value="(text) => onPatternChange('includes', String(text))"
        />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.filterExcludes')">
        <Input.TextArea
          :value="patternExcludes"
          :data-testid="`${testId}-excludes`"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          @update:value="(text) => onPatternChange('excludes', String(text))"
        />
      </Form.Item>
    </div>
  </template>

  <template v-else-if="kind === 'object'">
    <div :data-testid="testId">
      <Typography.Text v-if="!hideLabel" strong>{{ label }}</Typography.Text>
      <Typography.Paragraph v-if="help" type="secondary">{{ help }}</Typography.Paragraph>
      <SchemaField
        v-for="fieldKey in objectFields"
        :key="fieldKey"
        :schema="resolved.properties![fieldKey]!"
        :value="(value as Record<string, unknown> | undefined)?.[fieldKey]"
        :path="[...path, fieldKey]"
        :root-schema="rootSchema"
        :errors="errors"
        :show-errors="showErrors"
        :required="(resolved.required ?? []).includes(fieldKey)"
        :test-id-prefix="testIdPrefix"
        @update:value="(next) => updateField(fieldKey, next)"
      />
    </div>
  </template>

  <template v-else-if="kind === 'map'">
    <div :data-testid="testId">
      <Typography.Text v-if="!hideLabel" strong>{{ label }}</Typography.Text>
      <Typography.Paragraph v-if="help" type="secondary">{{ help }}</Typography.Paragraph>
      <Typography.Text v-if="error" type="danger">{{ error }}</Typography.Text>
      <div v-for="[rowKey, rowValue] in mapRows" :key="rowKey" style="margin-bottom: 8px">
        <div style="display: flex; gap: 8px">
          <Input
            :value="rowKey"
            :data-testid="`${testId}-key-${rowKey}`"
            @update:value="(next) => updateMapRowKey(rowKey, String(next))"
          />
          <Input
            :value="mapValueText([rowKey, rowValue])"
            :data-testid="`${testId}-value-${rowKey}`"
            :validate-status="
              showErrors && errors.get(`${pathKey}.${rowKey}`) ? 'error' : undefined
            "
            @update:value="(next) => updateMapRowValue(rowKey, String(next))"
          />
          <Button :data-testid="`${testId}-remove-${rowKey}`" @click="removeMapRow(rowKey)">
            {{ t('crud.remove') }}
          </Button>
        </div>
        <Typography.Text
          v-if="showErrors && errors.get(`${pathKey}.${rowKey}`)"
          type="danger"
        >
          {{ errors.get(`${pathKey}.${rowKey}`) }}
        </Typography.Text>
      </div>
      <Button :data-testid="`${testId}-add`" @click="addMapRow">
        {{ t('crud.add') }}
      </Button>
    </div>
  </template>

  <template v-else-if="kind === 'enumArray'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <Select
        mode="multiple"
        :value="Array.isArray(value) ? (value as string[]) : []"
        :data-testid="testId"
        @update:value="(next) => updateValue(next)"
      >
        <Select.Option v-for="(item, index) in enumItems" :key="item" :value="item">
          {{ enumLabels[index] }}
        </Select.Option>
      </Select>
    </Form.Item>
  </template>

  <template v-else-if="kind === 'objectArray'">
    <div :data-testid="testId">
      <Typography.Text v-if="!hideLabel" strong>{{ label }}</Typography.Text>
      <Typography.Paragraph v-if="help" type="secondary">{{ help }}</Typography.Paragraph>
      <div
        v-for="(row, index) in objectArrayRows"
        :key="index"
        style="border: 1px solid #d9d9d9; padding: 12px; margin-bottom: 8px"
      >
        <SchemaField
          :schema="objectArrayItemSchema"
          :value="row"
          :path="[...path, String(index)]"
          :root-schema="rootSchema"
          :errors="errors"
          :show-errors="showErrors"
          :test-id-prefix="testIdPrefix"
          @update:value="(next) => updateObjectArrayRow(index, next as Record<string, unknown>)"
        />
        <Button :data-testid="`${testId}-remove-${index}`" @click="removeObjectArrayRow(index)">
          {{ t('crud.remove') }}
        </Button>
      </div>
      <Button :data-testid="`${testId}-add`" @click="addObjectArrayRow">
        {{ t('crud.add') }}
      </Button>
    </div>
  </template>

  <template v-else-if="kind === 'stringArray'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <Input.TextArea
        :value="stringArrayText"
        :data-testid="testId"
        :auto-size="{ minRows: 1, maxRows: 4 }"
        @update:value="(text) => onStringArrayChange(String(text))"
      />
    </Form.Item>
  </template>

  <template v-else-if="kind === 'enum'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <Select
        :value="value as string | undefined"
        :data-testid="testId"
        @update:value="(next) => updateValue(next)"
      >
        <Select.Option
          v-for="item in (resolved.enum ?? []) as string[]"
          :key="String(item)"
          :value="item"
        >
          {{
            key === 'classificationLanguage'
              ? String(item).charAt(0).toUpperCase() + String(item).slice(1)
              : item
          }}
        </Select.Option>
      </Select>
    </Form.Item>
  </template>

  <template v-else-if="kind === 'boolean'">
    <Form.Item :validate-status="error ? 'error' : undefined" :help="error">
      <Checkbox
        :checked="value === true"
        :data-testid="testId"
        @update:checked="(checked) => updateValue(checked)"
      >
        {{ label }}
      </Checkbox>
      <Typography.Paragraph v-if="help" type="secondary">{{ help }}</Typography.Paragraph>
    </Form.Item>
  </template>

  <template v-else-if="kind === 'number'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <InputNumber
        :value="typeof value === 'number' ? value : undefined"
        :min="resolved.minimum"
        :max="resolved.maximum"
        :data-testid="testId"
        @update:value="(next) => updateValue(next === null ? undefined : next)"
      />
    </Form.Item>
  </template>

  <template v-else-if="key === 'defaultManifest'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error || manifestError ? 'error' : undefined"
      :help="error || manifestError || undefined"
    >
      <Input.TextArea
        :value="manifestText"
        :data-testid="testId"
        :auto-size="{ minRows: 3, maxRows: 10 }"
        @update:value="(text) => onManifestChange(String(text))"
      />
    </Form.Item>
  </template>

  <template v-else-if="kind === 'string'">
    <Form.Item
      :label="shownLabel"
      :extra="help"
      :required="required"
      :validate-status="error ? 'error' : undefined"
      :help="error"
    >
      <Input.Password
        v-if="resolved.format === 'password'"
        :value="typeof value === 'string' ? value : ''"
        :data-testid="testId"
        @update:value="(next) => updateValue(next === '' ? undefined : next)"
      />
      <Input
        v-else
        :value="typeof value === 'string' ? value : ''"
        :data-testid="testId"
        @update:value="(next) => updateValue(next === '' ? undefined : next)"
      />
    </Form.Item>
  </template>
</template>
