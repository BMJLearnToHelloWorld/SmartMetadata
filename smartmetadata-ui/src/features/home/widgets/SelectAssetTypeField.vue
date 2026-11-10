<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TreeSelect } from 'ant-design-vue';
import { CURATED_ASSETS_LIST } from '@/catalog/curatedAssets';
import type { CuratedAssetsFormSelectedAssetsInfo } from './CuratedAssetsModal.vue';

const props = defineProps<{
  resources: string[];
  selectedAssetsInfo: CuratedAssetsFormSelectedAssetsInfo;
  fetchEntityCount: (args: {
    countKey: string;
    selectedResource: string[];
    shouldUpdateResourceList: boolean;
  }) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: 'update:resources', resources: string[]): void;
}>();

const { t, te } = useI18n();

function entityLabel(resource: string): string {
  const key = `explore.entity.${resource}`;
  return te(key) ? t(key) : resource;
}

interface TreeNode {
  value: string;
  title: string;
  children?: TreeNode[];
}

const childNodes = computed<TreeNode[]>(() =>
  CURATED_ASSETS_LIST.filter((resource) => resource !== 'all').map((resource) => ({
    value: resource,
    title: entityLabel(resource),
  })),
);

const treeData = computed<TreeNode[]>(() => [
  {
    value: 'all',
    title: entityLabel('all'),
    children: childNodes.value,
  },
]);

// `all` stands for every type, so it checks every child in the tree.
const treeValue = computed<string[]>(() =>
  props.resources.includes('all')
    ? ['all', ...childNodes.value.map((node) => node.value)]
    : childNodes.value
        .filter((node) => props.resources.includes(node.value))
        .map((node) => node.value),
);

// Collapse a fully checked tree back to `all`, as the stored config expects.
function fromTreeValue(value: string[]): string[] {
  const allChildrenSelected = childNodes.value.every((node) => value.includes(node.value));
  return allChildrenSelected ? ['all'] : value.filter((id) => id !== 'all');
}

async function handleEntityCountChange(): Promise<void> {
  if (props.resources.length === 0) {
    return;
  }
  await props.fetchEntityCount({
    countKey: 'resourceCount',
    selectedResource: props.resources,
    shouldUpdateResourceList: false,
  });
}

watch(
  () => props.resources,
  () => void handleEntityCountChange(),
  { immediate: true },
);

function onChange(value: string[]): void {
  emit('update:resources', fromTreeValue(value));
}
</script>

<template>
  <div class="select-asset-type">
    <label class="select-asset-type__label" for="curated-asset-type">
      {{ t('home.selectAssetType') }}
    </label>
    <TreeSelect
      id="curated-asset-type"
      data-testid="asset-type-select"
      :value="treeValue"
      :tree-data="treeData"
      :tree-checkable="true"
      :show-checked-strategy="'SHOW_PARENT'"
      :placeholder="t('home.selectAssetType')"
      :multiple="true"
      :tree-default-expand-all="true"
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.select-asset-type {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.select-asset-type__label {
  font-size: 13px;
  font-weight: 500;
}
</style>

