<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Empty, Select } from 'ant-design-vue';
import type { CustomPropertyLayoutItem } from './customPropertiesLayout';

/**
 * CustomPropertiesTabLayoutSection equivalent, scoped to the stored
 * layout: official fetches the entity's custom-property definitions
 * and appends properties missing from the layout; editors never fetch,
 * so this section arranges ONLY the stored propertyLayout items
 * (reorder, width, remove). An absent/empty stored layout renders an
 * honest empty state — initial derivation from entity definitions is
 * a recorded residual, not silently invented here.
 */
const props = defineProps<{
  propertyLayout: CustomPropertyLayoutItem[];
}>();

const emit = defineEmits<{
  change: [layout: CustomPropertyLayoutItem[]];
}>();

const { t } = useI18n();

function moveItem(index: number, direction: -1 | 1): void {
  const next = [...props.propertyLayout];
  const target = index + direction;
  if (target < 0 || target >= next.length) {
    return;
  }
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  emit('change', next);
}

function setWidth(index: number, width: CustomPropertyLayoutItem['width']): void {
  const next = props.propertyLayout.map((item, i) =>
    i === index ? { ...item, width } : item,
  );
  emit('change', next);
}

function removeItem(index: number): void {
  emit(
    'change',
    props.propertyLayout.filter((_, i) => i !== index),
  );
}
</script>

<template>
  <div data-testid="custom-properties-tab-layout">
    <Empty v-if="propertyLayout.length === 0" :description="t('crud.empty')" />
    <div v-else class="custom-properties-tab-layout__list">
      <div
        v-for="(item, index) in propertyLayout"
        :key="`${item.name}-${index}`"
        class="custom-properties-tab-layout__row"
        :data-testid="`custom-property-layout-item-${item.name}`"
      >
        <span class="custom-properties-tab-layout__name">{{ item.name }}</span>
        <Select
          :value="item.width"
          size="small"
          style="width: 96px"
          :data-testid="`custom-property-layout-width-${item.name}`"
          @change="(width) => setWidth(index, width as CustomPropertyLayoutItem['width'])"
        >
          <Select.Option value="half">half</Select.Option>
          <Select.Option value="full">full</Select.Option>
        </Select>
        <Button
          size="small"
          :disabled="index === 0"
          :data-testid="`custom-property-layout-up-${item.name}`"
          @click="moveItem(index, -1)"
        >
          ↑
        </Button>
        <Button
          size="small"
          :disabled="index === propertyLayout.length - 1"
          :data-testid="`custom-property-layout-down-${item.name}`"
          @click="moveItem(index, 1)"
        >
          ↓
        </Button>
        <Button
          size="small"
          :data-testid="`custom-property-layout-remove-${item.name}`"
          @click="removeItem(index)"
        >
          {{ t('crud.remove') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-properties-tab-layout__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}
.custom-properties-tab-layout__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.custom-properties-tab-layout__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
