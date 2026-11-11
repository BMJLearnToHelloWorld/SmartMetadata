<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  SERVICE_FILTER_PATTERN_FIELDS,
  applySchemaDefaults,
  branchSignature,
  deref,
  resolveBranches,
  startCase,
  validateOwnerConfigMaps,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import SchemaField from './SchemaField.vue';

/**
 * The schema-driven sourceConfig form (P-08(d)) — the Vue equivalent of
 * official's `IngestionWorkflowForm`, which renders the resolved
 * ingestion schema with `@rjsf/core`.
 *
 * The form owns its data after mount: it seeds the schema defaults under
 * the incoming `modelValue` once per schema (RJSF seeds defaults the same
 * way) and emits every change. The parent remounts the form (via `:key`)
 * to reseed after a schema change.
 *
 * Validation is AJV over the branch-resolved schema (see
 * `resolveBranches`): `strict: false` because the schemas use
 * `format: password` / `format: uri`, which stock AJV does not know —
 * official's `@rjsf/validator-ajv8` tolerates them the same way. Errors
 * are shown inline once `validate()` has been called (the RJSF
 * submit-attempt behaviour); validity is emitted live on every change.
 *
 * Hidden fields follow official's `ServiceUISchema` + the ingestion
 * workflow `uiSchema`: `type` (computed by `sourceConfigTypeForPipeline`),
 * `name` / `displayName` (owned by the wizard), `processingEngine`
 * (the schema-level profiler field — the wizard owns the request-level
 * `processingEngine` via `rootProcessingEngine`), `incremental` unless the
 * service reports incremental support, and `enableAutoPartitionDetection`
 * unless the service reports auto-partition support. Hidden fields are
 * still seeded and submitted — RJSF seeds them too.
 */
const props = defineProps<{
  schema: RjsfSchema;
  modelValue: Record<string, unknown>;
  supportsIncremental?: boolean;
  supportsAutoPartition?: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, unknown>): void;
  (event: 'validity-change', valid: boolean): void;
}>();
const { t } = useI18n();

const HIDDEN_FIELDS = ['type', 'name', 'displayName', 'processingEngine'];

const localData = reactive<Record<string, unknown>>({});
const errors = ref(new Map<string, string>());
const showErrors = ref(false);

const hiddenKeys = computed(() => {
  const keys = new Set(HIDDEN_FIELDS);
  if (!props.supportsIncremental) {
    keys.add('incremental');
  }
  if (!props.supportsAutoPartition) {
    keys.add('enableAutoPartitionDetection');
  }
  return keys;
});

const orderedKeys = computed(() => {
  const properties = Object.keys(props.schema.properties ?? {});
  const visible = properties.filter((key) => !hiddenKeys.value.has(key));
  const filterPatternFirst = SERVICE_FILTER_PATTERN_FIELDS.filter((key) =>
    visible.includes(key),
  );
  const rest = visible.filter(
    (key) => !(SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).includes(key),
  );
  return [...filterPatternFirst, ...rest];
});

// --- validation -----------------------------------------------------------
// One AJV instance; compiled validators are cached per branch signature so
// a keystroke re-validates without recompiling. The cache is bounded
// (32 entries, cleared when full) — the branch-choice space per form is
// small, and a fresh compile is cheap enough to redo after a clear.
const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, { validate: ValidateFunction; effective: RjsfSchema }>();
const VALIDATOR_CACHE_LIMIT = 32;

function getValidator(
  data: Record<string, unknown>,
): { validate: ValidateFunction; effective: RjsfSchema } {
  const signature = branchSignature(props.schema, data, props.schema);
  const cached = validatorCache.get(signature);
  if (cached) {
    return cached;
  }
  const effective = resolveBranches(props.schema, data, props.schema);
  const entry = { validate: ajv.compile(effective), effective };
  if (validatorCache.size >= VALIDATOR_CACHE_LIMIT) {
    validatorCache.clear();
  }
  validatorCache.set(signature, entry);
  return entry;
}

/** Walk the (branch-resolved) schema to the node a JSON pointer names. */
function schemaAtPointer(effective: RjsfSchema, pointer: string): RjsfSchema {
  const segments = pointer.split('/').filter(Boolean);
  let current: RjsfSchema = effective;
  for (const segment of segments) {
    const resolved = deref(current, effective);
    if (resolved.properties && segment in resolved.properties) {
      current = resolved.properties[segment]!;
      continue;
    }
    if (resolved.items && typeof resolved.items === 'object' && /^\d+$/.test(segment)) {
      current = resolved.items;
      continue;
    }
    return effective;
  }
  return deref(current, effective);
}

function ajvErrorPath(error: ErrorObject): string {
  let pointer = error.instancePath;
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    pointer = `${pointer}/${error.params.missingProperty}`;
  } else if (
    error.keyword === 'additionalProperties' &&
    typeof error.params.additionalProperty === 'string'
  ) {
    pointer = `${pointer}/${error.params.additionalProperty}`;
  }
  return pointer
    .split('/')
    .filter(Boolean)
    .join('.');
}

function ajvErrorMessage(error: ErrorObject, effective: RjsfSchema): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    const parent = schemaAtPointer(effective, error.instancePath);
    const missing = error.params.missingProperty;
    const title = parent.properties?.[missing]?.title ?? startCase(missing);
    return t('crud.fieldRequired', { field: title });
  }
  return error.message ?? '';
}

function validate(): boolean {
  // validate() is the submit-attempt gate (RJSF shows errors after submit):
  // from here on, errors display inline.
  showErrors.value = true;
  const { validate: validateFn, effective } = getValidator(localData);
  const valid = validateFn(localData);
  const next = new Map<string, string>();
  if (!valid) {
    for (const error of validateFn.errors ?? []) {
      const path = ajvErrorPath(error);
      if (!next.has(path)) {
        next.set(path, ajvErrorMessage(error, effective));
      }
    }
  }
  for (const ownerPath of validateOwnerConfigMaps(localData)) {
    const path = ownerPath.join('.');
    if (!next.has(path)) {
      next.set(
        path,
        t('crud.fieldRequired', { field: t('ingestion.pipelines.owners') }),
      );
    }
  }
  errors.value = next;
  emit('validity-change', next.size === 0);
  return next.size === 0;
}

function seed(): void {
  // An `undefined` value is an absent key (RJSF treats it the same
  // way): strip undefined-valued keys before seeding, so a mapper
  // shaped object can never fail `additionalProperties` validation.
  const input = Object.fromEntries(
    Object.entries({ ...props.modelValue }).filter(([, value]) => value !== undefined),
  );
  const seeded = applySchemaDefaults(props.schema, input, props.schema);
  for (const key of Object.keys(localData)) {
    delete localData[key];
  }
  Object.assign(localData, seeded);
  emit('update:modelValue', { ...localData });
  validate();
}

watch(
  () => props.schema,
  () => {
    seed();
  },
  { immediate: true },
);

watch(
  () => ({ ...localData }),
  () => {
    validate();
  },
  { deep: true },
);

function onFieldUpdate(key: string, value: unknown): void {
  if (value === undefined) {
    delete localData[key];
  } else {
    localData[key] = value;
  }
  emit('update:modelValue', { ...localData });
}

defineExpose({ validate });
</script>

<template>
  <div>
    <SchemaField
      v-for="key in orderedKeys"
      :key="key"
      :schema="schema.properties![key]!"
      :value="localData[key]"
      :path="[key]"
      :root-schema="schema"
      :errors="errors"
      :show-errors="showErrors"
      :required="(schema.required ?? []).includes(key)"
      test-id-prefix="schema-field"
      @update:value="(next) => onFieldUpdate(key, next)"
    />
  </div>
</template>
