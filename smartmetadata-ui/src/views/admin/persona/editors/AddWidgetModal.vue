<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select } from 'ant-design-vue';
import { WidgetWidths } from './customizePageData';
import type { CommonWidgetType, WidgetConfig } from './customizeTypes';

/**
 * AddDetailsPageWidgetModal equivalent: one row per customizable
 * widget with a size selector (gridSizes → WidgetWidths: small 1 /
 * medium 2 / large 3) and an Add action. The Custom Properties widget
 * is added without a propertyLayout: picking properties needs the
 * entity's custom-property definitions (a fetch), which editors never
 * perform — arrangement happens in the Custom Properties tab section.
 * Widget labels resolve via the caller's label resolver (product i18n
 * key mapping with FQN-suffix fallback; see CustomizeTabWidget).
 */
const props = defineProps<{
  open: boolean;
  widgetsList: CommonWidgetType[];
  placeholderWidgetKey: string;
  widgetLabel: (widget: CommonWidgetType) => string;
}>();

const emit = defineEmits<{
  addWidget: [
    widget: CommonWidgetType,
    placeholderWidgetKey: string,
    widgetSize: number,
    extraConfig?: WidgetConfig['config'],
  ];
  close: [];
}>();

const { t } = useI18n();

const selectedSizes = ref<Record<string, number>>({});

const rows = computed(() =>
  props.widgetsList.map((widget) => ({
    widget,
    sizes: widget.gridSizes.map((size) => ({ size, width: WidgetWidths[size] ?? 1 })),
  })),
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedSizes.value = Object.fromEntries(
        rows.value.map(({ widget, sizes }) => [
          widget.fullyQualifiedName,
          sizes[0]?.width ?? 1,
        ]),
      );
    }
  },
);

function sizeOf(widget: CommonWidgetType): number {
  const row = rows.value.find((r) => r.widget.fullyQualifiedName === widget.fullyQualifiedName);
  return selectedSizes.value[widget.fullyQualifiedName] ?? row?.sizes[0]?.width ?? 1;
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('home.addWidget')"
    data-testid="add-widget-modal"
    @cancel="emit('close')"
  >
    <div class="add-widget-modal__list">
      <div
        v-for="{ widget, sizes } in rows"
        :key="widget.fullyQualifiedName"
        class="add-widget-modal__row"
      >
        <span class="add-widget-modal__label">{{ widgetLabel(widget) }}</span>
        <Select
          :value="sizeOf(widget)"
          size="small"
          style="width: 96px"
          :data-testid="`add-widget-size-${widget.fullyQualifiedName}`"
          @change="(width) => { selectedSizes[widget.fullyQualifiedName] = width as number; }"
        >
          <Select.Option v-for="{ size, width } in sizes" :key="size" :value="width">
            {{ size }}
          </Select.Option>
        </Select>
        <Button
          type="primary"
          size="small"
          :data-testid="`add-widget-${widget.fullyQualifiedName}`"
          @click="emit('addWidget', widget, placeholderWidgetKey, sizeOf(widget))"
        >
          {{ t('crud.add') }}
        </Button>
      </div>
      <p v-if="rows.length === 0">{{ t('crud.empty') }}</p>
    </div>
    <template #footer>
      <Button data-testid="add-widget-close" @click="emit('close')">
        {{ t('crud.cancel') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.add-widget-modal__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.add-widget-modal__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-widget-modal__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
