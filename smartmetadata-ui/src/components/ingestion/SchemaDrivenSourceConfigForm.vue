<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Typography } from 'ant-design-vue';
import {
  getFilterSectionLabels,
  isFilterSchemaProperty,
  type FilterPatternConfig,
  type FilterSchemaProperty,
} from '@/ingestion/filterPatterns';
import {
  groupIngestionSections,
  orderIngestionWorkflowFields,
  type FormSection,
} from '@/ingestion/formSections';
import type { FieldFocusMeta } from '@/ingestion/fieldFocus';
import {
  applySchemaDefaults,
  deref,
  neutralizeUnresolvableRefs,
  startCase,
  validateOwnerConfigMaps,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { fieldLabelPrefix, schemaSlugFor } from '@/ingestion/schemaFieldLabels';
import type { PipelineType } from '@/types/ingestion';
import ToggleField from '@/components/shared/ToggleField.vue';
import FilterPatternCard from './FilterPatternCard.vue';
import FormSectionCard from './FormSectionCard.vue';
import ProfileSampleConfigField, {
  type ProfileSampleConfigValue,
} from './ProfileSampleConfigField.vue';
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
 * Validation is AJV over the FULL schema: the `oneOf`/`anyOf` branches
 * stay intact and AJV resolves the `$ref`s, so a value matching zero or
 * several branches keeps its object-level error (Q-3 layered fix:
 * branch selection is presentation/defaults only and never feeds
 * validity). `strict: false` because the schemas use
 * `format: password` / `format: uri`, which stock AJV does not know —
 * official's `@rjsf/validator-ajv8` tolerates them the same way. Errors
 * are shown inline once `validate()` has been called (the RJSF
 * submit-attempt behaviour); validity is emitted live on every change.
 *
 * Rendering follows pin's `IngestionObjectFieldTemplate`: fields are
 * ordered by the ingestion `ui:order`, grouped into the four titled
 * sections (Agent Setup, Filter Patterns, Scope & Behaviour, Advanced
 * Config), filter patterns render as composer cards, booleans as
 * toggles, and the profiler's `profileSampleConfig` through the
 * dedicated `ProfileSampleConfigField`. Only boolean descriptions
 * render inline, under their toggles (pin `BooleanFieldTemplate`);
 * other descriptions reach the doc panel via focus events. Filter
 * cards take no step-2 options (pin's workflow uiSchema sets only
 * `'ui:field'`, no `ui:options`): all cards start closed, with no
 * system excludes.
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
const props = withDefaults(
  defineProps<{
    schema: RjsfSchema;
    modelValue: Record<string, unknown>;
    supportsIncremental?: boolean;
    supportsAutoPartition?: boolean;
    /** Pipeline type; gates the dedicated profile-sample field (profiler only, pin). */
    pipelineType?: PipelineType;
    /**
     * Debug-log flag, owned by the parent. When defined, `enableDebugLog`
     * renders inside the Scope & Behaviour section (pin injects it via
     * `getWorkflowCustomProperties`); when undefined the form renders no
     * debug field at all.
     */
    debugLog?: boolean;
    /** Doc-panel focus handlers, drilled from the view. */
    onFieldFocus?: (fieldName: string, meta?: FieldFocusMeta) => void;
    onFieldBlur?: () => void;
  }>(),
  // The explicit `undefined` default is load-bearing: without it, Vue's
  // boolean-prop casting turns an absent `debugLog` into `false`, and
  // the form could no longer tell "parent owns the flag" from "no flag".
  { debugLog: undefined },
);
const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, unknown>): void;
  (event: 'validity-change', valid: boolean): void;
  (event: 'update:debugLog', value: boolean): void;
  /** The form has seeded and mounted; the parent may enable its footer. */
  (event: 'ready'): void;
}>();
const { t, te } = useI18n();

const HIDDEN_FIELDS = ['type', 'name', 'displayName', 'processingEngine'];

/** Pin `getWorkflowCustomProperties`: the injected debug-log property. */
const DEBUG_LOG_SCHEMA: RjsfSchema = { title: 'Enable Debug Log', type: 'boolean', default: false };

const localData = reactive<Record<string, unknown>>({});
const errors = ref(new Map<string, string>());
const showErrors = ref(false);

/** Metadata-schema slug from the root title; undefined for other schemas. */
const schemaSlug = computed(() => schemaSlugFor(props.schema));

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

/** Schema properties plus the injected debug-log field (when owned). */
const effectiveProperties = computed(() => {
  const properties = { ...(props.schema.properties ?? {}) };
  if (props.debugLog !== undefined && !('enableDebugLog' in properties)) {
    properties.enableDebugLog = DEBUG_LOG_SCHEMA;
  }
  return properties;
});

const sections = computed<FormSection[]>(() => {
  const ordered = orderIngestionWorkflowFields(Object.keys(effectiveProperties.value));
  const fields = ordered.map((name) => ({
    name,
    schema: effectiveProperties.value[name]!,
    hidden: hiddenKeys.value.has(name),
  }));
  return groupIngestionSections(fields, {
    compactAdvanced: props.pipelineType === 'autoClassification',
  }).sections;
});

/** Deref'd schema per filter-pattern field name (the card needs its title). */
const filterSchemas = computed(() => {
  const schemas = new Map<string, FilterSchemaProperty>();
  for (const fieldName of Object.keys(effectiveProperties.value)) {
    const property = effectiveProperties.value[fieldName]!;
    const resolved = deref(property, props.schema);
    if (!isFilterSchemaProperty(fieldName, resolved)) {
      continue;
    }
    schemas.set(fieldName, resolved);
  }
  return schemas;
});

function isProfileSampleField(fieldName: string): boolean {
  // Pin registers ProfileSampleConfigField only for profiler pipelines.
  return fieldName === 'profileSampleConfig' && props.pipelineType === 'profiler';
}

function fieldMeta(fieldName: string): FieldFocusMeta {
  const schema = effectiveProperties.value[fieldName];
  const resolved = schema ? deref(schema, props.schema) : undefined;
  // The panel title reuses the filter label key, the same source as the
  // card title; the description resolves against this batch's keys.
  const title = getFilterSectionLabels(fieldName, resolved?.title, t).label;
  let description = resolved?.description;
  if (schemaSlug.value !== undefined) {
    const descriptionKey = `${fieldLabelPrefix(schemaSlug.value, fieldName)}.description`;
    if (te(descriptionKey)) {
      description = t(descriptionKey);
    }
  }
  return { title, description };
}

function onFilterCardFocus(fieldName: string, emitted: string): void {
  // The card re-emits its composers' blur as focus('').
  if (emitted) {
    props.onFieldFocus?.(emitted, fieldMeta(fieldName));
  } else {
    props.onFieldBlur?.();
  }
}

// --- validation -----------------------------------------------------------
// One AJV instance; the validator is compiled from the FULL schema and
// cached per schema object, so a keystroke re-validates without
// recompiling. Validity never consults branch selection: the
// `oneOf`/`anyOf` branches stay intact and AJV resolves the `$ref`s
// (including the cross-branch threshold refs), so a value matching zero
// or several branches keeps its object-level error instead of being
// judged against one branch's fields. `neutralizeUnresolvableRefs`
// only drops `$ref`s that cannot resolve at all (a pin
// schema-generator bug in `testSuitePipeline.json`); every resolvable
// `$ref` is left for AJV.
const ajv = new Ajv({ allErrors: true, strict: false });
let cachedSchema: RjsfSchema | undefined;
let cachedValidate: ValidateFunction | undefined;

function getValidator(schema: RjsfSchema): ValidateFunction {
  if (cachedValidate === undefined || cachedSchema !== schema) {
    cachedSchema = schema;
    cachedValidate = ajv.compile(neutralizeUnresolvableRefs(schema));
  }
  return cachedValidate;
}

/** The branch holding `key` as a property, for title lookup through a
 * `oneOf`/`anyOf` node (first branch wins for shared names). */
function branchHolding(
  node: RjsfSchema,
  key: string,
  rootSchema: RjsfSchema,
): RjsfSchema | undefined {
  const branches = node.oneOf ?? node.anyOf;
  if (!branches) {
    return undefined;
  }
  for (const branch of branches) {
    const resolved = deref(branch, rootSchema);
    if (resolved.properties && key in resolved.properties) {
      return resolved.properties[key]!;
    }
  }
  return undefined;
}

/** Walk the full schema to the node a JSON pointer names. Title lookup
 * only: when a node carries `oneOf`/`anyOf`, the walk descends into the
 * first branch holding the next segment, so required-field titles keep
 * resolving to the branch's schema title instead of a `startCase`
 * guess. This never feeds the validity verdict. */
function schemaAtPointer(schema: RjsfSchema, pointer: string): RjsfSchema {
  const segments = pointer.split('/').filter(Boolean);
  let current: RjsfSchema = schema;
  for (const segment of segments) {
    const resolved = deref(current, schema);
    if (resolved.properties && segment in resolved.properties) {
      current = resolved.properties[segment]!;
      continue;
    }
    const branchProperty = branchHolding(resolved, segment, schema);
    if (branchProperty !== undefined) {
      current = branchProperty;
      continue;
    }
    if (resolved.items && typeof resolved.items === 'object' && /^\d+$/.test(segment)) {
      current = resolved.items;
      continue;
    }
    return schema;
  }
  return deref(current, schema);
}

/** A property's schema title, looking through `oneOf`/`anyOf` branches
 * when the parent node itself carries none (the branches hold the
 * titles for branch-owned fields such as the dbt cloud fields). */
function propertyTitle(parent: RjsfSchema, key: string, rootSchema: RjsfSchema): string {
  const direct = parent.properties?.[key]?.title;
  if (direct !== undefined) {
    return direct;
  }
  const branches = parent.oneOf ?? parent.anyOf;
  if (branches) {
    for (const branch of branches) {
      const title = deref(branch, rootSchema).properties?.[key]?.title;
      if (title !== undefined) {
        return title;
      }
    }
  }
  return startCase(key);
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

function ajvErrorMessage(error: ErrorObject, schema: RjsfSchema): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    const parent = schemaAtPointer(schema, error.instancePath);
    const missing = error.params.missingProperty;
    // Branch-less key prefix: the branch context in a validation path is
    // unreliable for shared names, so branch-internal required fields
    // keep the English schema title (documented limitation).
    if (schemaSlug.value !== undefined) {
      const segments = [...error.instancePath.split('/').filter(Boolean), missing];
      const labelKey = `${fieldLabelPrefix(schemaSlug.value, segments.join('.'))}.label`;
      if (te(labelKey)) {
        return t('crud.fieldRequired', { field: t(labelKey) });
      }
    }
    return t('crud.fieldRequired', { field: propertyTitle(parent, missing, schema) });
  }
  return error.message ?? '';
}

function validate(): boolean {
  // validate() is the submit-attempt gate (RJSF shows errors after submit):
  // from here on, errors display inline.
  showErrors.value = true;
  const validateFn = getValidator(props.schema);
  const valid = validateFn(localData);
  const next = new Map<string, string>();
  if (!valid) {
    for (const error of validateFn.errors ?? []) {
      const path = ajvErrorPath(error);
      if (!next.has(path)) {
        next.set(path, ajvErrorMessage(error, props.schema));
      }
    }
  }
  for (const ownerPath of validateOwnerConfigMaps(localData)) {
    const path = ownerPath.join('.');
    // The owner check overwrites: under full-schema validation AJV also
    // reports generic type/anyOf errors at these paths, which would
    // otherwise shadow the specific pin-ported message for an empty
    // owner row. The verdict is unchanged (both are errors); only the
    // message is the specific one.
    next.set(
      path,
      t('crud.fieldRequired', { field: t('ingestion.pipelines.owners') }),
    );
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

onMounted(() => {
  emit('ready');
});

defineExpose({ validate });
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <FormSectionCard
      v-for="section in sections"
      :key="section.key"
      :title="t(section.titleKey)"
      :description="t(section.descriptionKey)"
      :collapsible="section.collapsible"
      :default-open="section.defaultOpen"
      :index="section.index"
      :test-id="`ingestion-section-${section.key}`"
    >
      <div style="display: flex; flex-direction: column; gap: 12px">
        <template v-for="fieldName in section.fields" :key="fieldName">
          <!-- Pin's workflow uiSchema sets only 'ui:field' for filter
               fields: no defaultOpen, no systemExcludes, no
               hasExistingData — the card's defaults apply. -->
          <FilterPatternCard
            v-if="filterSchemas.get(fieldName)"
            :field-name="fieldName"
            :model-value="localData[fieldName] as FilterPatternConfig | undefined"
            :schema-title="filterSchemas.get(fieldName)?.title"
            @update:model-value="(next) => onFieldUpdate(fieldName, next)"
            @focus="(emitted) => onFilterCardFocus(fieldName, emitted)"
          />
          <div
            v-else-if="isProfileSampleField(fieldName)"
            data-testid="schema-field-profileSampleConfig"
          >
            <Typography.Text strong>
              {{ effectiveProperties[fieldName]!.title ?? startCase(fieldName) }}
            </Typography.Text>
            <Typography.Text
              v-if="showErrors && errors.get(fieldName)"
              type="danger"
              style="display: block"
            >
              {{ errors.get(fieldName) }}
            </Typography.Text>
            <ProfileSampleConfigField
              :model-value="localData[fieldName] as ProfileSampleConfigValue | undefined"
              @update:model-value="(next) => onFieldUpdate(fieldName, next)"
            />
          </div>
          <ToggleField
            v-else-if="fieldName === 'enableDebugLog' && debugLog !== undefined"
            :model-value="debugLog ?? false"
            :label="t('forms.schemaFields.shared.enableDebugLog.label')"
            field-id="root/enableDebugLog"
            test-id="schema-field-enableDebugLog"
            @update:model-value="(next) => emit('update:debugLog', next)"
            @focus="
              onFieldFocus?.('root/enableDebugLog', {
                title: t('forms.schemaFields.shared.enableDebugLog.label'),
              })
            "
          />
          <SchemaField
            v-else
            :schema="effectiveProperties[fieldName]!"
            :value="localData[fieldName]"
            :path="[fieldName]"
            :root-schema="schema"
            :errors="errors"
            :show-errors="showErrors"
            :required="(schema.required ?? []).includes(fieldName)"
            test-id-prefix="schema-field"
            :label-key-prefix="
              schemaSlug ? fieldLabelPrefix(schemaSlug, fieldName) : undefined
            "
            :on-field-focus="onFieldFocus"
            :on-field-blur="onFieldBlur"
            @update:value="(next) => onFieldUpdate(fieldName, next)"
          />
        </template>
      </div>
    </FormSectionCard>
  </div>
</template>
