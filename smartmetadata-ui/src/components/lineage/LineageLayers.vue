<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { CheckOutlined, DownOutlined } from '@ant-design/icons-vue';
import type { LineageLayer } from '@/lineage/config';
import { LINEAGE_PLATFORM_LENSES } from '@/lineage/config';
import {
  getAssetLayerKeys,
  LINEAGE_PLATFORM_VIEWS,
  type LineageEntityContext,
  type LineageLayerKey,
  type LineagePlatformView,
} from '@/lineage/layers';
import {
  getRailStopLabelKey,
  type LineageLens as SceneLens,
} from '@/lineage/scene';

/**
 * Layers dropdown, mapped from the official `LineageLayers` (pin
 * a3012259ca, `components/Lineage/LineageLayers/LineageLayers.tsx`),
 * which carries two modes in one component. Asset mode (entity canvas,
 * the original mode of this file): a multi-select ColumnLevelLineage +
 * DataObservability overlay menu and Service / Domain / DataProduct
 * platform views (one at a time), with the offered keys computed by
 * `getAssetLayerKeys`; the trigger names the current selection, or the
 * data-asset level when nothing is selected. Scene mode (platform
 * map, `scene-lens` provided): a single-select lens menu — section
 * header "Lineage Layer", items Service / Domain / Data Product each
 * with title, description and a checkmark on the active lens
 * (`lineage-layer-lens-${lens}`); the trigger names the scene level.
 * Scene menu items carry no icons, matching this file's icon-less
 * asset menu.
 *
 * The component is state-dumb: it emits the toggled selection and the
 * canvas (via the lineage store) applies pin's combination rules —
 * picking an overlay clears the platform view, picking a platform view
 * clears the overlays.
 */
const props = defineProps<{
  entityType?: string;
  entityContext?: LineageEntityContext;
  activeLayer?: LineageLayer[];
  platformView?: LineagePlatformView;
  /** Present only in scene mode (platform map): the current lens. */
  sceneLens?: SceneLens;
  /** Present only in scene mode: i18n key of the scene level label. */
  sceneLevelLabelKey?: string;
}>();

const emit = defineEmits<{
  'change-active-layer': [layers: LineageLayer[]];
  'change-platform-view': [view: LineagePlatformView];
  'change-scene-lens': [lens: SceneLens];
}>();

const { t } = useI18n();

const isSceneMode = computed(() => props.sceneLens !== undefined);

const offeredKeys = computed(() =>
  props.entityType ? getAssetLayerKeys(props.entityType, props.entityContext) : [],
);

const activeLayers = computed(() => props.activeLayer ?? []);
const currentPlatformView = computed(() => props.platformView ?? 'None');

const selectedKeys = computed(() =>
  [...activeLayers.value, currentPlatformView.value].filter((key) =>
    offeredKeys.value.includes(key),
  ),
);

const SCENE_LENS_DESCRIPTIONS: Record<SceneLens, string> = {
  service: 'lineage.mapServiceLensDescription',
  domain: 'lineage.mapDomainLensDescription',
  dataProduct: 'lineage.mapDataProductLensDescription',
};

const sceneOptions = computed(() =>
  LINEAGE_PLATFORM_LENSES.map((option) => ({
    lens: option.value as SceneLens,
    titleKey: getRailStopLabelKey('LAYER', option.value as SceneLens),
    descriptionKey: SCENE_LENS_DESCRIPTIONS[option.value as SceneLens],
  })),
);

const sceneTriggerLabel = computed(() =>
  props.sceneLevelLabelKey ? t(props.sceneLevelLabelKey) : t('lineage.assetLevel'),
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
  if (isSceneMode.value) {
    emit('change-scene-lens', changed as SceneLens);
    return;
  }
  if (isPlatformViewKey(changed)) {
    emit(
      'change-platform-view',
      currentPlatformView.value === changed ? 'None' : changed,
    );
    return;
  }
  const layer = changed as LineageLayer;
  emit(
    'change-active-layer',
    activeLayers.value.includes(layer)
      ? activeLayers.value.filter((item) => item !== layer)
      : [...activeLayers.value, layer],
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
      {{ t('lineage.layers') }}: {{ isSceneMode ? sceneTriggerLabel : triggerLabel }}
      <template #icon><DownOutlined /></template>
    </Button>
    <template #overlay>
      <Menu
        v-if="isSceneMode"
        :selected-keys="sceneLens ? [sceneLens] : []"
        :aria-label="t('lineage.layers')"
        @click="onMenuClick"
      >
        <Menu.Item key="lineage-layer-section" disabled class="lineage-layers__section">
          {{ t('lineage.lineageLayer') }}
        </Menu.Item>
        <Menu.Item
          v-for="option in sceneOptions"
          :key="option.lens"
          :data-testid="`lineage-layer-lens-${option.lens}`"
        >
          <span class="lineage-layers__item">
            <span class="lineage-layers__item-text">
              <span class="lineage-layers__item-title">{{ t(option.titleKey) }}</span>
              <span class="lineage-layers__item-description">{{ t(option.descriptionKey) }}</span>
            </span>
            <CheckOutlined v-if="sceneLens === option.lens" class="lineage-layers__check" />
          </span>
        </Menu.Item>
      </Menu>
      <Menu
        v-else
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

<style scoped>
.lineage-layers__section {
  color: var(--sm-text-quaternary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: default;
}
.lineage-layers__item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lineage-layers__item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lineage-layers__item-title {
  font-size: 13px;
}
.lineage-layers__item-description {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.lineage-layers__check {
  margin-left: auto;
  color: var(--sm-color-primary);
}
</style>
