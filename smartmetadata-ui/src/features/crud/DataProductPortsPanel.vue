<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Spin, Typography, message } from 'ant-design-vue';
import {
  addInputPortsToDataProduct,
  addOutputPortsToDataProduct,
  getDataProductInputPorts,
  getDataProductOutputPorts,
  removeInputPortsFromDataProduct,
  removeOutputPortsFromDataProduct,
} from '@/api/dataProducts';
import { isDetailWired } from '@/catalog/entityRoutes';
import SmTable from '@/components/shared/SmTable.vue';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel } from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { EntityRef } from '@/types/api';

const props = defineProps<{
  fqn: string;
  productName: string;
  canEdit: boolean;
}>();

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
});
</script>

<template>
  <div data-testid="data-product-ports-panel">
    <!-- Q-TAB-4 item 3 (host lane): the PortsLineageView accordion mounts
         HERE, above the lists — pin InputOutputPortsTab.component.tsx
         renders the `LineageAccordionSection` (test id
         `toggle-lineage-collapse`, title "Ports Lineage") before
         PortsListView, fed by getDataProductPortsView. The graph itself
         is a later lane's work; this panel is its host. -->
    <Spin v-if="loading" data-testid="data-product-ports-loading" />
    <template v-else>
      <Typography.Paragraph v-if="loadError" type="danger" data-testid="data-product-ports-error">
        {{ loadError }}
      </Typography.Paragraph>
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
