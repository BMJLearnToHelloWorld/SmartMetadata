<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Select, Skeleton } from 'ant-design-vue';
import { listCustomProperties } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';
import {
  applyPropertyLayout,
  toPropertyLayout,
  type CustomPropertyLayoutItem,
  type LaidOutCustomProperty,
} from './customPropertiesLayout';

/**
 * CustomPropertiesTabLayoutSection equivalent (official
 * `CustomPropertiesTabLayoutSection.tsx`): the section fetches the
 * entity's custom-property definitions and arranges them by the stored
 * layout — stored entries order, definitions missing from the layout
 * append with their default width. Loading shows a skeleton; an entity
 * type with no definitions shows the official empty message; otherwise
 * the hint plus the reorder/width editor. Edits emit the full derived
 * layout (official `onChange(toPropertyLayout(next))`).
 */
const props = defineProps<{
  entityType?: string;
  propertyLayout: CustomPropertyLayoutItem[];
}>();

const emit = defineEmits<{
  change: [layout: CustomPropertyLayoutItem[]];
}>();

const { t } = useI18n();

const properties = ref<CustomPropertyDef[]>([]);
const isLoading = ref(false);

async function load(): Promise<void> {
  if (!props.entityType) {
    properties.value = [];
    return;
  }
  isLoading.value = true;
  try {
    properties.value = await listCustomProperties(props.entityType);
  } catch (error) {
    // Official: a failed read leaves no definitions (the empty
    // message), never a stale list — logged, not toasted.
    console.error('Failed to load custom properties', error);
    properties.value = [];
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
watch(() => props.entityType, load);

const items = computed<LaidOutCustomProperty[]>(() =>
  applyPropertyLayout(properties.value, props.propertyLayout),
);

function emitChange(next: LaidOutCustomProperty[]): void {
  emit('change', toPropertyLayout(next));
}

function moveItem(index: number, direction: -1 | 1): void {
  const next = [...items.value];
  const target = index + direction;
  if (target < 0 || target >= next.length) {
    return;
  }
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  emitChange(next);
}

function setWidth(index: number, width: CustomPropertyLayoutItem['width']): void {
  emitChange(items.value.map((item, i) => (i === index ? { ...item, width } : item)));
}

function removeItem(index: number): void {
  emitChange(items.value.filter((_, i) => i !== index));
}
</script>

<template>
  <div data-testid="custom-properties-tab-layout">
    <Skeleton v-if="isLoading" active :paragraph="{ rows: 3 }" />
    <Empty
      v-else-if="items.length === 0"
      :description="t('message.no-custom-properties-defined')"
    />
    <div v-else class="custom-properties-tab-layout__list">
      <p class="custom-properties-tab-layout__hint">
        {{ t('message.custom-property-layout-hint') }}
      </p>
      <div
        v-for="(item, index) in items"
        :key="`${item.property.name}-${index}`"
        class="custom-properties-tab-layout__row"
        :data-testid="`custom-property-layout-item-${item.property.name}`"
      >
        <span class="custom-properties-tab-layout__name">{{ item.property.name }}</span>
        <Select
          :value="item.width"
          size="small"
          style="width: 96px"
          :data-testid="`custom-property-layout-width-${item.property.name}`"
          @change="(width) => setWidth(index, width as CustomPropertyLayoutItem['width'])"
        >
          <Select.Option value="half">half</Select.Option>
          <Select.Option value="full">full</Select.Option>
        </Select>
        <Button
          size="small"
          :disabled="index === 0"
          :data-testid="`custom-property-layout-up-${item.property.name}`"
          @click="moveItem(index, -1)"
        >
          ↑
        </Button>
        <Button
          size="small"
          :disabled="index === items.length - 1"
          :data-testid="`custom-property-layout-down-${item.property.name}`"
          @click="moveItem(index, 1)"
        >
          ↓
        </Button>
        <Button
          size="small"
          :data-testid="`custom-property-layout-remove-${item.property.name}`"
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

.custom-properties-tab-layout__hint {
  margin: 0;
  color: var(--sm-text-secondary);
  font-size: 13px;
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
