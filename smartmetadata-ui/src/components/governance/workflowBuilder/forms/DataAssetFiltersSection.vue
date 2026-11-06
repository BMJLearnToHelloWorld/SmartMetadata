<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Card, Dropdown, Menu, Typography } from 'ant-design-vue';
import { CloseOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowDataAssetFilter } from '@/types/governance';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import WorkflowFormField from './WorkflowFormField.vue';
import QueryBuilderSection from './QueryBuilderSection.vue';

/**
 * Official DataAssetFiltersSection (pin a3012259ca): one filter card per
 * data asset (periodic triggers only), each with a QueryBuilderSection,
 * plus an add-asset-filter button opening a menu of the still-unfiltered
 * assets. Null when no data assets are selected.
 */
const props = withDefaults(
  defineProps<{
    dataAssetFilters: WorkflowDataAssetFilter[];
    dataAssets: string[];
    lockFields?: boolean;
    onAddDataAssetFilter: (dataAsset?: string) => void;
    onRemoveDataAssetFilter: (filterId: number) => void;
    onUpdateDataAssetFilter: (dataAssetId: number, value: string) => void;
  }>(),
  { lockFields: false },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

const menuOpen = ref(false);

const selectedDataAssets = computed(() =>
  props.dataAssetFilters.map((df) => df.dataAsset),
);
const hasAvailableAssets = computed(() =>
  props.dataAssets.some((asset) => !selectedDataAssets.value.includes(asset)),
);
const isDisabled = computed(
  () =>
    isFormDisabled.value ||
    props.lockFields ||
    (!hasAvailableAssets.value && props.dataAssetFilters.length > 0),
);

function upperFirst(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
</script>

<template>
  <div v-if="dataAssets && dataAssets.length > 0" style="margin-bottom: 24px">
    <WorkflowFormField
      :label="t('workflows.builder.dataAssetFilter')"
      :description="t('workflows.builder.chooseWhichAssetsWorkflowCanActOn')"
    >
      <div
        v-for="dataAssetFilter in dataAssetFilters"
        :key="dataAssetFilter.id"
        style="margin-top: 24px"
      >
        <Card style="padding: 16px">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px">
            <Typography.Text strong style="font-size: 12px; color: var(--sm-text-secondary)">
              {{ upperFirst(dataAssetFilter.dataAsset) }}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              :disabled="isDisabled"
              :aria-label="t('workflows.builder.remove')"
              @click="onRemoveDataAssetFilter(dataAssetFilter.id)"
            >
              <CloseOutlined />
            </Button>
          </div>
          <QueryBuilderSection
            v-if="dataAssetFilter.dataAsset"
            :label="t('workflows.builder.filterForAsset', { asset: dataAssetFilter.dataAsset })"
            :force-read-only="lockFields"
            :value="dataAssetFilter.filters || ''"
            :on-change="(value: string) => onUpdateDataAssetFilter(dataAssetFilter.id || 0, value || '')"
          />
        </Card>
      </div>

      <div style="position: relative; margin-top: 24px">
        <Dropdown v-model:open="menuOpen" trigger="click">
          <Button
            block
            data-testid="add-data-asset-filter-button"
            :disabled="isDisabled"
            @click="() => { if (!isDisabled) menuOpen = !menuOpen; }"
          >
            <PlusOutlined /> {{ t('workflows.builder.addAssetFilter') }} <DownOutlined />
          </Button>
          <template #overlay>
            <Menu>
              <Menu.Item
                v-for="dataAsset in dataAssets"
                :key="dataAsset"
                :data-testid="`data-asset-option-${dataAsset}`"
                :disabled="selectedDataAssets.includes(dataAsset)"
                @click="() => { if (!selectedDataAssets.includes(dataAsset)) { onAddDataAssetFilter(dataAsset); menuOpen = false; } }"
              >
                {{ dataAsset }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </WorkflowFormField>
  </div>
</template>
