<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { DownOutlined } from '@ant-design/icons-vue';
import type { LineageLayer } from '@/lineage/config';
import {
  getAssetLayerKeys,
  LINEAGE_PLATFORM_VIEWS,
  type LineageEntityContext,
  type LineageLayerKey,
  type LineagePlatformView,
} from '@/lineage/layers';

/**
 * Layers dropdown, mapped from the official `LineageLayers` (pin
 * a3012259ca, asset menu): a bottom-left panel offering multi-select
 * ColumnLevelLineage + DataObservability overlays and Service / Domain /
 * DataProduct platform views (one at a time), with the offered keys
 * computed by `getAssetLayerKeys`. The trigger names the current
 * selection, or the data-asset level when nothing is selected.
 *
 * The component is state-dumb: it emits the toggled selection and the
 * canvas (via the lineage store) applies pin's combination rules —
 * picking an overlay clears the platform view, picking a platform view
 * clears the overlays. Pin's scene-lens menu (platform map) is L4's.
 */
const props = defineProps<{
  entityType: string;
  entityContext?: LineageEntityContext;
  activeLayer: LineageLayer[];
  platformView: LineagePlatformView;
}>();

const emit = defineEmits<{
  'change-active-layer': [layers: LineageLayer[]];
  'change-platform-view': [view: LineagePlatformView];
}>();

const { t } = useI18n();

const offeredKeys = computed(() => getAssetLayerKeys(props.entityType, props.entityContext));

const selectedKeys = computed(() =>
  [...props.activeLayer, props.platformView].filter((key) => offeredKeys.value.includes(key)),
);

const OPTION_LABELS: Record<LineageLayerKey, string> = {
  // EntityLineage has no panel entry (it is the default layer, not an
  // offered key); the empty label keeps the record total, like None.
  EntityLineage: '',
  ColumnLevelLineage: 'lineage.layerColumn',
  DataObservability: 'lineage.layerObservability',
  Service: 'lineage.layerService',
  Domain: 'lineage.layerDomain',
  DataProduct: 'lineage.layerDataProduct',
  None: '',
};

const OPTION_TEST_IDS: Record<LineageLayerKey, string> = {
  EntityLineage: '',
  ColumnLevelLineage: 'lineage-layer-column-btn',
  DataObservability: 'lineage-layer-observability-btn',
  Service: 'lineage-layer-service-btn',
  Domain: 'lineage-layer-domain-btn',
  DataProduct: 'lineage-layer-data-product-btn',
  None: '',
};

const triggerLabel = computed(() => {
  const labels = selectedKeys.value.map((key) => t(OPTION_LABELS[key])).filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : t('lineage.assetLevel');
});

function isPlatformViewKey(key: LineageLayerKey): key is LineagePlatformView {
  return (LINEAGE_PLATFORM_VIEWS as readonly string[]).includes(key);
}

function onMenuClick(payload: { key: string | number }): void {
  const changed = payload.key as LineageLayerKey;
  if (isPlatformViewKey(changed)) {
    emit('change-platform-view', props.platformView === changed ? 'None' : changed);
    return;
  }
  const layer = changed as LineageLayer;
  emit(
    'change-active-layer',
    props.activeLayer.includes(layer)
      ? props.activeLayer.filter((item) => item !== layer)
      : [...props.activeLayer, layer],
  );
}
</script>

<template>
  <Dropdown :trigger="['click']" placement="topLeft">
    <Button
      data-testid="lineage-layer-btn"
      :aria-label="t('lineage.layers')"
      :title="t('lineage.layersHelp')"
    >
      {{ t('lineage.layers') }}: {{ triggerLabel }}
      <template #icon><DownOutlined /></template>
    </Button>
    <template #overlay>
      <Menu
        :selected-keys="selectedKeys"
        :multiple="true"
        :aria-label="t('lineage.layers')"
        @click="onMenuClick"
      >
        <Menu.Item
          v-for="key in offeredKeys"
          :key="key"
          :data-testid="OPTION_TEST_IDS[key]"
        >
          {{ t(OPTION_LABELS[key]) }}
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
