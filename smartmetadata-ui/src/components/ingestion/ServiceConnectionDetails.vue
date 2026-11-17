<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { InfoCircleOutlined } from '@ant-design/icons-vue';
import { Card, Input, Tag, Tooltip } from 'ant-design-vue';
import SmState from '@/components/shared/SmState.vue';
import {
  connectionFieldsForType,
  type ConnectionFieldDef,
} from '@/ingestion/connectionFields';
import type { ServiceConnectionConfig, ServiceKind } from '@/types/ingestion';

/**
 * Structured connection details, ported from official
 * utils/ServiceConnectionDetailsUtils.tsx `getKeyValues` (pin a3012259ca)
 * as rendered by ServiceConnectionDetails.component.tsx. Stored keys
 * render in object order; null values and DEF_UI_SCHEMA keys are skipped
 * at every depth; scalars render as read-only inputs, arrays as badges,
 * filter-pattern fields as generic entry lists, and nested objects
 * recurse flat (no group header).
 *
 * The product has no bundled connection JSON Schema, so field metadata
 * (description, password signal) comes from the hand-written registry
 * (`ingestion/connectionFields.ts`): an exact (group, key) match first,
 * then a global key fallback. Registry `groupSchema` fragments carry no
 * `properties`, so the design's drill-down is unimplementable as written
 * and nested leaves resolve through the flat registry instead; leaves
 * with no registry entry render with the key as label and text type,
 * matching the pin's schema-missing semantics. The pin's special
 * oneOf branches (Airflow connection, JWT security config, GitHub
 * credentials, database configSource) degrade to plain recursion: the
 * values still render, without branch-resolved metadata.
 *
 * Password masking is strict (B5): a registry signal
 * (`control === 'password'` or `schemaFormat === 'password'`) renders a
 * fixed mask placeholder and the real value never enters the DOM,
 * recursively, with the signal propagating into nested objects. The
 * sslConfig triplet (caCertificate/sslCertificate/sslKey) is masked by
 * the pin schema itself: validateSSLClientConfig.json marks all three
 * `format: password`, while the registry knows them only under form
 * keys (sslCaCertificate, ...). This never depends on
 * redactConnectionForDisplay.
 */

const props = defineProps<{
  /** Stored connection config (`connection.config`); absent renders the placeholder. */
  config?: ServiceConnectionConfig;
  kind: ServiceKind;
  /** Connector type key, e.g. 'Mysql', selecting the registry field set. */
  serviceType: string;
}>();

/** Pin constants/ServiceUISchema.constant.ts DEF_UI_SCHEMA, verbatim key set. */
const DEF_UI_SCHEMA_KEYS = new Set([
  'supportsIncrementalMetadataExtraction',
  'supportsMetadataExtraction',
  'supportsSystemProfile',
  'supportsDataDiff',
  'supportsUsageExtraction',
  'supportsLineageExtraction',
  'supportsViewLineageExtraction',
  'supportsProfiler',
  'supportsAutoPartitionDetection',
  'supportsDatabase',
  'supportsQueryComment',
  'supportsDBTExtraction',
  'type',
  'policyAgentConfig',
]);

/**
 * Pin constants/ServiceConnection.constants.ts
 * FILTER_PATTERN_BY_SERVICE_TYPE, keyed by product kind. Security, LLM
 * and MCP services have no entries in the pin table.
 */
const FILTER_PATTERN_FIELDS_BY_KIND: Record<string, readonly string[]> = {
  api: ['apiCollectionFilterPattern'],
  dashboard: [
    'dashboardFilterPattern',
    'chartFilterPattern',
    'dataModelFilterPattern',
    'projectFilterPattern',
  ],
  database: [
    'databaseFilterPattern',
    'schemaFilterPattern',
    'tableFilterPattern',
    'storedProcedureFilterPattern',
    'classificationFilterPattern',
  ],
  messaging: ['topicFilterPattern'],
  metadata: ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  mlmodel: ['mlModelFilterPattern'],
  pipeline: ['pipelineFilterPattern'],
  search: ['searchIndexFilterPattern'],
  storage: ['containerFilterPattern'],
  drive: [
    'directoryFilterPattern',
    'fileFilterPattern',
    'spreadsheetFilterPattern',
    'worksheetFilterPattern',
  ],
};

/**
 * Pin schema security/ssl/validateSSLClientConfig.json: all three leaves
 * are `format: password`. The registry carries them under form keys, so
 * the stored names are matched directly when the parent key is exactly
 * `sslConfig`, at any depth. The stored->form spelling is the builder's
 * own triplet (`ingestion/connections.ts` sslConfigFromForm).
 */
const SSL_SECRET_LEAVES = new Set(['caCertificate', 'sslCertificate', 'sslKey']);
const SSL_FORM_KEY_BY_STORED_KEY: Record<string, string> = {
  caCertificate: 'sslCaCertificate',
  sslCertificate: 'sslCertificate',
  sslKey: 'sslKey',
};

/** Fixed mask placeholder; no real value is ever rendered for secrets. */
const MASK = '••••••••';

interface FieldRow {
  type: 'field';
  key: string;
  description?: string;
  masked: boolean;
  badges: readonly string[] | null;
  text: string | null;
}

interface PatternRow {
  type: 'pattern';
  key: string;
  description?: string;
  entries: ReadonlyArray<{ heading: string; text: string }>;
}

type DetailRow = FieldRow | PatternRow;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lodash `isEmpty` semantics, as the pin's filter-pattern checks use it. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return true;
}

/** Lodash `startCase` for pattern keys (`includes` -> `Includes`). */
function startCasePatternKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function findFieldDef(
  defs: readonly ConnectionFieldDef[],
  parentKey: string,
  key: string,
): ConnectionFieldDef | undefined {
  if (parentKey === 'sslConfig') {
    const formKey = SSL_FORM_KEY_BY_STORED_KEY[key];
    if (formKey) {
      const aliased =
        defs.find((def) => def.group === 'sslConfig' && def.key === formKey) ??
        defs.find((def) => def.key === formKey);
      if (aliased) {
        return aliased;
      }
    }
  }
  return (
    defs.find((def) => def.group === parentKey && def.key === key) ??
    defs.find((def) => def.key === key)
  );
}

function isPasswordField(
  def: ConnectionFieldDef | undefined,
  parentKey: string,
  key: string,
  inherited: boolean,
): boolean {
  return (
    inherited ||
    def?.control === 'password' ||
    def?.schemaFormat === 'password' ||
    (parentKey === 'sslConfig' && SSL_SECRET_LEAVES.has(key))
  );
}

function buildRows(
  obj: Record<string, unknown>,
  defs: readonly ConnectionFieldDef[],
  parentKey: string,
  inheritedMask: boolean,
): DetailRow[] {
  const rows: DetailRow[] = [];
  const filterPatternFields = FILTER_PATTERN_FIELDS_BY_KIND[props.kind] ?? [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || DEF_UI_SCHEMA_KEYS.has(key)) {
      continue;
    }
    const def = findFieldDef(defs, parentKey, key);
    const description = def?.description;
    const masked = isPasswordField(def, parentKey, key, inheritedMask);
    if (!isRecord(value)) {
      if (masked) {
        rows.push({ type: 'field', key, description, masked: true, badges: null, text: null });
      } else if (Array.isArray(value)) {
        rows.push({
          type: 'field',
          key,
          description,
          masked: false,
          badges: value.map((item) => String(item)),
          text: null,
        });
      } else {
        rows.push({
          type: 'field',
          key,
          description,
          masked: false,
          badges: null,
          text: String(value ?? ''),
        });
      }
      continue;
    }
    if (filterPatternFields.includes(key)) {
      if (isEmptyValue(value.includes) && isEmptyValue(value.excludes)) {
        continue;
      }
      const entries = Object.entries(value)
        .filter(([, patternValue]) => !isEmptyValue(patternValue))
        .map(([patternKey, patternValue]) => ({
          heading: `${startCasePatternKey(patternKey)}:`,
          text: Array.isArray(patternValue) ? patternValue.join(', ') : String(patternValue),
        }));
      rows.push({ type: 'pattern', key, description, entries });
      continue;
    }
    rows.push(...buildRows(value, defs, key, masked));
  }
  return rows;
}

const rows = computed<DetailRow[] | null>(() => {
  try {
    if (!isRecord(props.config)) {
      return null;
    }
    return buildRows(
      props.config as Record<string, unknown>,
      connectionFieldsForType(props.serviceType),
      '',
      false,
    );
  } catch {
    return null;
  }
});
</script>

<template>
  <Card data-testid="service-connection-details">
    <SmState v-if="rows === null" state="empty" test-id="no-data-placeholder" />
    <div v-else class="connection-details">
      <div
        v-for="(row, index) in rows"
        :key="`${row.key}-${index}`"
        class="connection-detail-row"
      >
        <div class="connection-detail-label">
          <span class="connection-detail-label-text">{{ row.key }}:</span>
          <Tooltip v-if="row.description" :title="row.description" placement="bottom">
            <InfoCircleOutlined class="connection-detail-info" />
          </Tooltip>
        </div>
        <div class="connection-detail-value">
          <template v-if="row.type === 'field'">
            <div v-if="row.badges !== null" data-testid="input-field" class="connection-badges">
              <Tag v-for="(badge, badgeIndex) in row.badges" :key="`${badge}-${badgeIndex}`">{{
                badge
              }}</Tag>
            </div>
            <Input
              v-else
              data-testid="input-field"
              :value="row.masked ? MASK : (row.text ?? '')"
              :type="row.masked ? 'password' : 'text'"
              readonly
            />
          </template>
          <div v-else class="connection-pattern-entries">
            <div v-for="entry in row.entries" :key="entry.heading" class="connection-pattern-entry">
              <div class="connection-pattern-heading">{{ entry.heading }}</div>
              <div class="connection-pattern-text">{{ entry.text }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.connection-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.connection-detail-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.connection-detail-label {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  width: 33%;
}

.connection-detail-label-text {
  color: var(--sm-text-secondary);
  overflow-wrap: anywhere;
}

.connection-detail-info {
  color: var(--sm-text-quaternary);
  font-size: 14px;
}

.connection-detail-value {
  flex: 1;
  min-width: 0;
}

.connection-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.connection-pattern-entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connection-pattern-heading {
  color: var(--sm-text-secondary);
}

.connection-pattern-text {
  font-weight: 600;
}
</style>
