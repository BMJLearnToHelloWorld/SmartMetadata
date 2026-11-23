<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Spin, Typography, message } from 'ant-design-vue';
import {
  addInputPortsToDataProduct,
  addOutputPortsToDataProduct,
  getDataProductInputPorts,
  getDataProductOutputPorts,
  getDataProductPortsView,
  removeInputPortsFromDataProduct,
  removeOutputPortsFromDataProduct,
} from '@/api/dataProducts';
import { isDetailWired } from '@/catalog/entityRoutes';
import SmTable from '@/components/shared/SmTable.vue';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel } from '@/features/crud/paging';
import PortsLineageView from '@/features/crud/PortsLineageView.vue';
import type { EntityListColumn } from '@/features/crud/types';
import type { EntityRef } from '@/types/api';
import type { DataProduct } from '@/types/governance';

const props = withDefaults(
  defineProps<{
    fqn: string;
    productName: string;
    canEdit: boolean;
    /** Full product (center node + empty-state context); falls back to fqn/name. */
    product?: DataProduct | null;
    /** Pin `assetCount`: the product's asset count (detail view loads the first 50). */
    assetCount?: number;
  }>(),
  { product: null, assetCount: 0 },
);

const { t } = useI18n();
const router = useRouter();

type PortKind = 'input' | 'output';

const inputPorts = ref<EntityRef[]>([]);
const outputPorts = ref<EntityRef[]>([]);
const inputTotal = ref(0);
const outputTotal = ref(0);
const loading = ref(true);
const loadError = ref('');
const adding = ref<PortKind | null>(null);
const removingFqn = ref<string | null>(null);

// Q-TAB-4 PortsLineageView (L3d): pin `LineageAccordionSection`
// (InputOutputPortsTab.component.tsx:59-145, a3012259ca) — the accordion
// sits above the lists, loads the ports view lazily on first expand, and
// owns the fullscreen state (Escape closes it). Counts for the collapsed
// summary come from the list totals below (pin reads the same numbers
// from portsView paging totals on mount); the graph itself is fed by
// `getDataProductPortsView`, as pin's `fetchLineageData` does.
const lineageExpanded = ref(false);
const lineageLoaded = ref(false);
const lineageLoading = ref(false);
const lineageError = ref('');
const lineageInputPorts = ref<EntityRef[]>([]);
const lineageOutputPorts = ref<EntityRef[]>([]);
const lineageFullscreen = ref(false);

/** Center-node product: the full product when the detail view passes it. */
const lineageProduct = computed<DataProduct>(
  () =>
    props.product ?? {
      id: props.fqn,
      name: props.productName,
      fullyQualifiedName: props.fqn,
      domains: [],
      owners: [],
      reviewers: [],
      experts: [],
      tags: [],
    },
);

async function fetchLineage(): Promise<void> {
  if (lineageLoaded.value || lineageLoading.value) {
    return;
  }
  lineageLoading.value = true;
  lineageError.value = '';
  try {
    const view = await getDataProductPortsView(props.fqn);
    lineageInputPorts.value = view.inputPorts.data;
    lineageOutputPorts.value = view.outputPorts.data;
    lineageLoaded.value = true;
  } catch (error) {
    lineageError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    lineageLoading.value = false;
  }
}

function toggleLineage(): void {
  lineageExpanded.value = !lineageExpanded.value;
  if (lineageExpanded.value && !lineageLoaded.value) {
    void fetchLineage();
  }
}

/** Pin `refreshPorts`: an add/remove resets the lineage data so the graph refetches. */
function refreshLineage(): void {
  lineageLoaded.value = false;
  lineageInputPorts.value = [];
  lineageOutputPorts.value = [];
  if (lineageExpanded.value) {
    void fetchLineage();
  }
}

function onLineageKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && lineageFullscreen.value) {
    lineageFullscreen.value = false;
  }
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: '', key: 'actions', width: 110 },
]);

const existingFqns = computed(() => [
  ...inputPorts.value.map((port) => port.fullyQualifiedName || port.name),
  ...outputPorts.value.map((port) => port.fullyQualifiedName || port.name),
]);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const [input, output] = await Promise.all([
      getDataProductInputPorts(props.fqn),
      getDataProductOutputPorts(props.fqn),
    ]);
    inputPorts.value = input.data;
    inputTotal.value = input.total ?? input.data.length;
    outputPorts.value = output.data;
    outputTotal.value = output.total ?? output.data.length;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onAddConfirm(assets: EntityRef[]): Promise<void> {
  const kind = adding.value;
  if (!kind) {
    return;
  }
  adding.value = null;
  try {
    if (kind === 'input') {
      await addInputPortsToDataProduct(props.fqn, assets);
    } else {
      await addOutputPortsToDataProduct(props.fqn, assets);
    }
    message.success(t('governance.dataProducts.portsUpdated'));
    await load();
    refreshLineage();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function onRemove(kind: PortKind, port: EntityRef): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('governance.dataProducts.removeAssetConfirm', {
      name: port.displayName || port.name,
    }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  const key = port.fullyQualifiedName || port.name;
  removingFqn.value = key;
  try {
    if (kind === 'input') {
      await removeInputPortsFromDataProduct(props.fqn, [port]);
    } else {
      await removeOutputPortsFromDataProduct(props.fqn, [port]);
    }
    message.success(t('governance.dataProducts.portsUpdated'));
    await load();
    refreshLineage();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    removingFqn.value = null;
  }
}

function openAsset(port: EntityRef): void {
  const entityType = port.type || '';
  const fqn = port.fullyQualifiedName || port.name;
  if (!isDetailWired(entityType) || !fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

onMounted(() => {
  void load();
  window.addEventListener('keydown', onLineageKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onLineageKeydown);
});
</script>

<template>
  <div data-testid="data-product-ports-panel">
    <Spin v-if="loading" data-testid="data-product-ports-loading" />
    <template v-else>
      <Typography.Paragraph v-if="loadError" type="danger" data-testid="data-product-ports-error">
        {{ loadError }}
      </Typography.Paragraph>
      <!-- Q-TAB-4 PortsLineageView (L3d): pin `LineageAccordionSection`
           (InputOutputPortsTab.component.tsx:59-145, a3012259ca) — above
           the lists, title "Ports Lineage", collapsed summary
           "(N input, M output)", graph fed by getDataProductPortsView. -->
      <div class="data-product-ports-lineage">
        <button
          type="button"
          class="data-product-ports-lineage__header"
          data-testid="toggle-lineage-collapse"
          :aria-expanded="lineageExpanded"
          @click="toggleLineage"
        >
          <span class="data-product-ports-lineage__title">
            {{ t('governance.dataProducts.portsLineage') }}
          </span>
          <span v-if="!lineageExpanded" class="data-product-ports-lineage__summary">
            {{ t('governance.dataProducts.portsLineageSummary', { input: inputTotal, output: outputTotal }) }}
          </span>
        </button>
        <div v-if="lineageExpanded" class="data-product-ports-lineage__body">
          <Spin v-if="lineageLoading" data-testid="ports-lineage-loading" />
          <Typography.Paragraph v-else-if="lineageError" type="danger" data-testid="ports-lineage-error">
            {{ lineageError }}
          </Typography.Paragraph>
          <PortsLineageView
            v-else
            :data-product="lineageProduct"
            :input-ports="lineageInputPorts"
            :output-ports="lineageOutputPorts"
            :asset-count="assetCount"
            :height="250"
            :is-full-screen="lineageFullscreen"
            @toggle-fullscreen="lineageFullscreen = !lineageFullscreen"
            @port-click="openAsset"
          />
        </div>
      </div>
      <div style="margin-bottom: 12px">
        <Button
          type="primary"
          data-testid="add-input-ports"
          :disabled="!canEdit"
          @click="adding = 'input'"
        >
          {{ t('governance.dataProducts.addInputPorts') }}
        </Button>
      </div>
      <Typography.Title :level="5" data-testid="input-ports-heading">
        {{ t('governance.dataProducts.inputPorts') }} ({{ inputTotal }})
      </Typography.Title>
      <SmTable row-key="id" :columns="columns" :data-source="inputPorts" :pagination="false" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
              href="#"
              @click.prevent="openAsset(record as EntityRef)"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              danger
              size="small"
              :data-testid="`remove-input-port-${(record as EntityRef).id}`"
              :disabled="!canEdit || removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              :loading="removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              @click="onRemove('input', record as EntityRef)"
            >
              {{ t('crud.delete') }}
            </Button>
          </template>
        </template>
      </SmTable>
      <p v-if="!inputPorts.length" class="entity-detail__tab-lead">{{ t('governance.dataProducts.noInputPorts') }}</p>

      <div style="margin: 16px 0 12px">
        <Button
          type="primary"
          data-testid="add-output-ports"
          :disabled="!canEdit"
          @click="adding = 'output'"
        >
          {{ t('governance.dataProducts.addOutputPorts') }}
        </Button>
      </div>
      <Typography.Title :level="5" data-testid="output-ports-heading">
        {{ t('governance.dataProducts.outputPorts') }} ({{ outputTotal }})
      </Typography.Title>
      <SmTable row-key="id" :columns="columns" :data-source="outputPorts" :pagination="false" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
              href="#"
              @click.prevent="openAsset(record as EntityRef)"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              danger
              size="small"
              :data-testid="`remove-output-port-${(record as EntityRef).id}`"
              :disabled="!canEdit || removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              :loading="removingFqn === ((record as EntityRef).fullyQualifiedName || (record as EntityRef).name)"
              @click="onRemove('output', record as EntityRef)"
            >
              {{ t('crud.delete') }}
            </Button>
          </template>
        </template>
      </SmTable>
      <p v-if="!outputPorts.length" class="entity-detail__tab-lead">{{ t('governance.dataProducts.noOutputPorts') }}</p>
    </template>
    <AddAssetsModal
      v-if="adding"
      :open="adding !== null"
      :owner-name="productName"
      :existing-fqns="existingFqns"
      @confirm="onAddConfirm"
      @cancel="adding = null"
    />
  </div>
</template>

<style scoped>
.data-product-ports-lineage {
  margin-bottom: 16px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
}
.data-product-ports-lineage__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  background: var(--sm-bg-container);
  border: none;
  border-radius: var(--sm-radius-card);
}
.data-product-ports-lineage__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-primary);
}
.data-product-ports-lineage__summary {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
.data-product-ports-lineage__body {
  padding: 0 12px 12px;
}
</style>
