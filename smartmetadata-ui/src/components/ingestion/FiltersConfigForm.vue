<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert } from 'ant-design-vue';
import SchemaField, { type FilterPatternFieldOptions } from '@/components/ingestion/SchemaField.vue';
import {
  addSnowflakeSystemExcludes,
  getOrderedFilterEntries,
  isFilterPatternConfig,
  type FilterPatternConfig,
} from '@/ingestion/filterPatterns';
import { escapeBackwardSlashChar } from '@/ingestion/formDataFormat';
import {
  loadConnectionSchemaJson,
  type FetchConnectionSchema,
} from '@/ingestion/connectionSchemaLoader';
import type { RjsfSchema } from '@/ingestion/ingestionSchemas';
import type { ServiceKind } from '@/types/ingestion';

/**
 * Port of official FiltersConfigForm (pin a3012259ca,
 * components/Settings/Services/ServiceConfig/FiltersConfigForm.tsx:
 * 102-278): the ingest-scope step shared by the wizard (§5.5) and
 * the edit page (§6). The field set comes from the loaded connection
 * schema via getOrderedFilterEntries — the schema is the verdict
 * basis (U-1), never the static filter table. A failed load resolves
 * to an empty schema, so the no-fields message renders, as the pin
 * does. Each field renders the shared FilterPatternCard composer
 * through SchemaField; the first two cards default open, system
 * excludes come from the schema property defaults plus the Snowflake
 * rule, and submit drops undefined values before emitting.
 *
 * The pin's InlineAlert has no product equivalent in this form (its
 * details come from RJSF validation state the static form does not
 * produce) and is not rendered. The sticky footer is not rendered
 * either — both callers hide it and drive submit imperatively.
 */
const props = withDefaults(
  defineProps<{
    kind: ServiceKind;
    serviceType: string;
    initialConfig?: Record<string, unknown>;
    showConnectedMessage?: boolean;
    connectedHost?: string;
    fetchSchema?: FetchConnectionSchema;
  }>(),
  {
    initialConfig: undefined,
    showConnectedMessage: false,
    connectedHost: '',
    fetchSchema: undefined,
  },
);

const emit = defineEmits<{
  save: [values: Record<string, FilterPatternConfig>];
}>();

const { t } = useI18n();

const schemaProperties = ref<Record<string, unknown>>({});
let disposed = false;
let loadToken = 0;

async function loadSchema(): Promise<void> {
  const token = ++loadToken;
  try {
    const result = await loadConnectionSchemaJson(props.kind, props.serviceType, props.fetchSchema);
    if (disposed || token !== loadToken) {
      return;
    }
    schemaProperties.value =
      result.state === 'present'
        ? ((result.schema.properties ?? {}) as Record<string, unknown>)
        : {};
  } catch {
    if (!disposed && token === loadToken) {
      schemaProperties.value = {};
    }
  }
}

watch(
  () => [props.kind, props.serviceType],
  () => {
    void loadSchema();
  },
  { immediate: true },
);

onUnmounted(() => {
  disposed = true;
});

const filterEntries = computed(() => getOrderedFilterEntries(schemaProperties.value));

const values = reactive<Record<string, FilterPatternConfig | undefined>>({});
const seededFields = ref<ReadonlySet<string>>(new Set());
let seededKey = '';

watch(
  () => [filterEntries.value, props.initialConfig] as const,
  ([entries, initialConfig]) => {
    // Reseed only when the field set or the seed content actually
    // changes: the edit page's config arrives after mount (late seed
    // must apply), but a parent re-render with equal content must
    // never wipe the user's edits.
    const key = `${entries.map(([name]) => name).join(',')}:${JSON.stringify(initialConfig ?? {})}`;
    if (key === seededKey) {
      return;
    }
    seededKey = key;
    for (const field of Object.keys(values)) {
      delete values[field];
    }
    const seeded = new Set<string>();
    const config = initialConfig ?? {};
    for (const [fieldName] of entries) {
      const existing = (config as Record<string, unknown>)[fieldName];
      if (isFilterPatternConfig(existing)) {
        values[fieldName] = existing;
        seeded.add(fieldName);
      }
    }
    seededFields.value = seeded;
  },
  { immediate: true },
);

const filterSchemas = computed(() =>
  filterEntries.value.map(([fieldName, property], index) => ({
    fieldName,
    schema: {
      type: 'object',
      title: property.title ?? fieldName,
      properties: {
        includes: { type: 'array', items: { type: 'string' } },
        excludes: { type: 'array', items: { type: 'string' } },
      },
    } satisfies RjsfSchema,
    options: {
      defaultOpen: index < 2,
      hasExistingData: seededFields.value.has(fieldName),
      systemExcludes: addSnowflakeSystemExcludes(
        props.serviceType,
        fieldName,
        property.default?.excludes ?? [],
      ),
    } satisfies FilterPatternFieldOptions,
  })),
);

const filterErrors = new Map<string, string>();

function setFilterValue(fieldName: string, value: unknown): void {
  if (value === undefined) {
    delete values[fieldName];
  } else {
    values[fieldName] = value as FilterPatternConfig;
  }
}

function submit(): boolean {
  const filtered = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Record<string, FilterPatternConfig>;
  emit('save', escapeBackwardSlashChar(filtered));
  return true;
}

defineExpose({ submit });
</script>

<template>
  <div data-testid="filters-config-form" style="display: grid; gap: 16px">
    <div>
      <h2 style="margin: 0; font-size: 18px; font-weight: 500">
        {{ t('settings.services.filters.whatShouldWeIngest') }}
      </h2>
      <p style="margin: 4px 0 0; color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45))">
        {{ t('settings.services.filters.whatToIngestDescription') }}
      </p>
    </div>

    <Alert
      v-if="props.showConnectedMessage"
      type="success"
      show-icon
      data-testid="filters-connected-message"
      :message="
        t('settings.services.filters.connectedToHost', { host: props.connectedHost })
      "
      :description="t('settings.services.filters.connectionVerifiedScope')"
    />

    <div
      v-if="!filterEntries.length"
      data-testid="no-config-available"
      style="padding: 24px; text-align: center"
    >
      {{ t('settings.services.filters.noFilterPatternsAvailable') }}
    </div>
    <div v-else>
      <SchemaField
        v-for="entry in filterSchemas"
        :key="entry.fieldName"
        :schema="entry.schema"
        :value="values[entry.fieldName]"
        :path="[entry.fieldName]"
        :root-schema="entry.schema"
        :errors="filterErrors"
        :show-errors="false"
        test-id-prefix="filters-config"
        :filter-pattern-options="entry.options"
        @update:value="(value) => setFilterValue(entry.fieldName, value)"
      />
    </div>
  </div>
</template>
