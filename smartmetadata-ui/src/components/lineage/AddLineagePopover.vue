<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select, Space, Typography, message } from 'ant-design-vue';
import { apiRequest } from '@/api/client';
import { asRecord, asString } from '@/api/json';
import { resolveDetailEndpoint } from '@/catalog/entityRoutes';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import type { LineageGraphNode } from '@/lineage/graphModel';
import { getCanvasColumnAssets } from '@/lineage/edgeMutations';
import LineageEntitySearch from './LineageEntitySearch.vue';

/**
 * Add-lineage popover, mapped from the official `AddLineagePopover` (pin
 * a3012259ca): a slideout panel (`SlideoutMenu`, width 440) with an edge
 * preview (current → new), an entity pick, and — for a column edit — a
 * canvas-asset pick plus one of its columns. The product renders it
 * through the shared `SmDrawer` slideout at the pin width; the submit
 * contract is pin's: the caller saves via `saveLineageEdge` and closes
 * the popover on success, so a failed save keeps the pick.
 *
 * Pin fetches the picked asset's columns by FQN; the product does the
 * same through the entity detail endpoint (`fields=columns`, tables and
 * data models only — pin's `COLUMN_CAPABLE_ENTITY_TYPES`). The picked
 * entity's id is resolved through the same detail fetch so the caller
 * can probe the existing edge details before merging.
 */
export interface AddLineageEntity {
  id?: string;
  entityType: string;
  fqn: string;
  displayName?: string;
}

export interface AddLineageSubmission {
  entity: AddLineageEntity;
  columnFqn?: string;
}

const props = defineProps<{
  open: boolean;
  /** The node being edited (its name shows in the preview). */
  nodeName: string;
  nodeId?: string;
  direction: 'upstream' | 'downstream';
  /** Column edit target: the column on the edited node. */
  columnFqn?: string;
  canvasNodes: LineageGraphNode[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  submit: [submission: AddLineageSubmission];
  close: [];
}>();

const { t } = useI18n();
const picked = ref<AddLineageEntity | undefined>();
const pickedColumnFqn = ref<string | undefined>();
const resolvingId = ref(false);
const columnsLoading = ref(false);
const pickedColumns = ref<{ value: string; label: string }[]>([]);

const isColumnTarget = computed(() => Boolean(props.columnFqn));
const isUpstream = computed(() => props.direction === 'upstream');

const canvasAssets = computed(() => getCanvasColumnAssets(props.canvasNodes, props.nodeId));

const canvasAssetOptions = computed(() =>
  canvasAssets.value.map((asset) => {
    const node = props.canvasNodes.find((item) => item.id === asset.id);
    return {
      value: asset.id,
      label: node?.displayName || node?.name || node?.fullyQualifiedName || asset.id,
      supporting: node?.fullyQualifiedName || '',
    };
  }),
);

const pickedName = computed(() => {
  if (!picked.value) {
    return undefined;
  }
  const name = picked.value.displayName || picked.value.fqn;
  return pickedColumnFqn.value
    ? `${name}.${pickedColumnFqn.value.split('.').at(-1) ?? ''}`
    : name;
});

/** Pin header description entity: the node name, plus the edited column. */
const currentName = computed(() =>
  props.columnFqn ? `${props.nodeName}.${props.columnFqn.split('.').at(-1) ?? ''}` : props.nodeName,
);

const canSubmit = computed(
  () => Boolean(picked.value) && (!isColumnTarget.value || Boolean(pickedColumnFqn.value)),
);

function reset(): void {
  picked.value = undefined;
  pickedColumnFqn.value = undefined;
  pickedColumns.value = [];
}

/** Reset the pick whenever a new edit request opens. */
watch(
  () => [props.open, props.nodeId, props.direction, props.columnFqn],
  () => reset(),
);

function detailPath(entityType: string, fqn: string): string | undefined {
  return resolveDetailEndpoint(entityType, fqn)?.path;
}

function parseColumns(payload: unknown): { value: string; label: string }[] {
  const columns = asRecord(payload)?.columns;
  if (!Array.isArray(columns)) {
    return [];
  }
  return columns.flatMap((item): { value: string; label: string }[] => {
    const rec = asRecord(item);
    const fqn = asString(rec?.fullyQualifiedName);
    const name = asString(rec?.name);
    return fqn && name ? [{ value: fqn, label: name }] : [];
  });
}

/**
 * Resolve the picked entity's id (for the edge-details probe) and, for a
 * column target, its columns. A failed detail fetch never blocks the
 * pick: the entity saves without an id (no merge probe) and, for a
 * column target, the submit stays disabled until columns load.
 */
async function onPickEntity(target: { entityType: string; fqn: string }): Promise<void> {
  picked.value = { entityType: target.entityType, fqn: target.fqn };
  pickedColumnFqn.value = undefined;
  pickedColumns.value = [];
  const path = detailPath(target.entityType, target.fqn);
  if (!path) {
    return;
  }
  resolvingId.value = true;
  columnsLoading.value = isColumnTarget.value;
  try {
    const payload = await apiRequest<unknown>(path, {
      query: isColumnTarget.value ? { fields: 'columns' } : {},
    });
    const id = asString(asRecord(payload)?.id);
    picked.value = {
      entityType: target.entityType,
      fqn: target.fqn,
      ...(id ? { id } : {}),
      displayName: asString(asRecord(payload)?.displayName) || undefined,
    };
    if (isColumnTarget.value) {
      pickedColumns.value = parseColumns(payload);
    }
  } catch {
    if (isColumnTarget.value) {
      message.error(t('lineage.loadFailed'));
    }
  } finally {
    resolvingId.value = false;
    columnsLoading.value = false;
  }
}

async function onPickCanvasAsset(assetId: string): Promise<void> {
  const node = props.canvasNodes.find((item) => item.id === assetId);
  if (!node) {
    picked.value = undefined;
    return;
  }
  picked.value = {
    id: node.id,
    entityType: node.entityType,
    fqn: node.fullyQualifiedName,
    displayName: node.displayName || node.name,
  };
  pickedColumnFqn.value = undefined;
  pickedColumns.value = [];
  const path = detailPath(node.entityType, node.fullyQualifiedName);
  if (!path) {
    return;
  }
  columnsLoading.value = true;
  try {
    const payload = await apiRequest<unknown>(path, { query: { fields: 'columns' } });
    pickedColumns.value = parseColumns(payload);
  } catch {
    message.error(t('lineage.loadFailed'));
  } finally {
    columnsLoading.value = false;
  }
}

function onSubmit(): void {
  if (!canSubmit.value || !picked.value) {
    message.warning(
      t(isColumnTarget.value && !pickedColumnFqn.value ? 'lineage.addLineageNoColumn' : 'lineage.addLineageNoEntity'),
    );
    return;
  }
  emit('submit', {
    entity: picked.value,
    ...(pickedColumnFqn.value ? { columnFqn: pickedColumnFqn.value } : {}),
  });
}
</script>

<template>
  <SmDrawer
    :open="open"
    :title="t(isUpstream ? 'lineage.addLineageUpstream' : 'lineage.addLineageDownstream')"
    :ok-text="t('lineage.addLineageSubmit')"
    :confirm-loading="submitting || resolvingId"
    :ok-disabled="!canSubmit"
    width-key="addLineage"
    test-id="add-lineage-popover"
    @ok="onSubmit"
    @cancel="emit('close')"
  >
    <Space direction="vertical" class="add-lineage-popover">
      <Typography.Text type="secondary">
        {{
          t(
            isUpstream ? 'lineage.addLineageUpstreamDescription' : 'lineage.addLineageDownstreamDescription',
            { entity: currentName },
          )
        }}
      </Typography.Text>
      <div class="add-lineage-popover__preview" data-testid="add-lineage-preview" aria-hidden="true">
        <div class="add-lineage-popover__card">
          <Typography.Text type="secondary">
            {{ t(isUpstream ? 'lineage.addLineageNewUpstream' : 'lineage.addLineageCurrent') }}
          </Typography.Text>
          <Typography.Text strong>{{ isUpstream ? (pickedName ?? t('lineage.addLineageSelectEntity')) : nodeName }}</Typography.Text>
        </div>
        <span aria-hidden="true">→</span>
        <div class="add-lineage-popover__card">
          <Typography.Text type="secondary">
            {{ t(isUpstream ? 'lineage.addLineageCurrent' : 'lineage.addLineageNewDownstream') }}
          </Typography.Text>
          <Typography.Text strong>{{ isUpstream ? nodeName : (pickedName ?? t('lineage.addLineageSelectEntity')) }}</Typography.Text>
        </div>
      </div>
      <template v-if="isColumnTarget">
        <Typography.Text type="secondary">{{ t('lineage.addLineagePickFromCanvas') }}</Typography.Text>
        <Select
          :value="picked?.id"
          :options="canvasAssetOptions"
          :placeholder="t('lineage.addLineageSelectEntity')"
          :loading="resolvingId"
          class="add-lineage-popover__select"
          data-testid="add-lineage-canvas-asset-select"
          @change="(value: unknown) => onPickCanvasAsset(String(value))"
        />
        <Select
          v-if="picked"
          :value="pickedColumnFqn"
          :options="pickedColumns"
          :placeholder="t('lineage.addLineageSelectColumn')"
          :loading="columnsLoading"
          class="add-lineage-popover__select"
          data-testid="add-lineage-column-select"
          @change="(value: unknown) => { pickedColumnFqn = String(value); }"
        />
      </template>
      <LineageEntitySearch v-else @select="onPickEntity" />
      <Typography.Text v-if="picked && !isColumnTarget" type="secondary">
        {{ picked.displayName || picked.fqn }}
      </Typography.Text>
    </Space>
  </SmDrawer>
</template>

<style scoped>
.add-lineage-popover {
  width: 100%;
}
.add-lineage-popover__preview {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-lineage-popover__card {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
.add-lineage-popover__select {
  width: 100%;
}
</style>
