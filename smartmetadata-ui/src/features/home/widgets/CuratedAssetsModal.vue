<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SelectAssetTypeField from './SelectAssetTypeField.vue';
import AdvancedAssetsFilterField from './AdvancedAssetsFilterField.vue';
import { getSelectedResourceCount, isValidElasticsearchQuery } from '@/catalog/curatedAssets';

export interface CuratedAssetsConfig {
  resources?: string[];
  queryFilter?: string;
  title?: string;
}

export interface CuratedAssetsFormSelectedAssetsInfo {
  resourceCount: number;
  filteredResourceCount?: number;
  resourcesWithNonZeroCount: string[];
}

const props = defineProps<{
  curatedAssetsConfig?: CuratedAssetsConfig | null;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (event: 'cancel'): void;
  (event: 'save', config: CuratedAssetsConfig): void;
}>();

const { t } = useI18n();

const title = ref('');
const resources = ref<string[]>([]);
const queryFilter = ref<string | undefined>(undefined);
const selectedAssetsInfo = ref<CuratedAssetsFormSelectedAssetsInfo>({
  resourceCount: 0,
  resourcesWithNonZeroCount: [],
});

// Mounted while the modal is open, so each open starts from fresh defaults.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) {
      return;
    }
    title.value = props.curatedAssetsConfig?.title ?? '';
    resources.value = props.curatedAssetsConfig?.resources ?? [];
    // Undefined on create so the filter field resets the shared query tree.
    queryFilter.value = props.curatedAssetsConfig
      ? (props.curatedAssetsConfig.queryFilter ?? '{}')
      : undefined;
    selectedAssetsInfo.value = { resourceCount: 0, resourcesWithNonZeroCount: [] };
  },
  { immediate: true },
);

const modalTitle = computed(() =>
  props.curatedAssetsConfig && Object.keys(props.curatedAssetsConfig).length > 0
    ? t('home.editWidget')
    : t('home.createWidget'),
);

const disableSave = computed(
  () =>
    title.value.trim().length === 0 ||
    resources.value.length === 0 ||
    !isValidElasticsearchQuery(queryFilter.value ?? '{}'),
);

async function fetchEntityCount(args: {
  countKey: string;
  selectedResource: string[];
  queryFilter?: string;
  shouldUpdateResourceList?: boolean;
}): Promise<void> {
  try {
    const { entityCount, resourcesWithNonZeroCount } = await getSelectedResourceCount({
      selectedResource: args.selectedResource,
      queryFilter: args.queryFilter,
      shouldUpdateResourceList: args.shouldUpdateResourceList ?? true,
    });
    selectedAssetsInfo.value = {
      ...selectedAssetsInfo.value,
      ...(resourcesWithNonZeroCount !== undefined ? { resourcesWithNonZeroCount } : {}),
      [args.countKey]: entityCount,
    };
  } catch {
    return;
  }
}

function handleSave(): void {
  emit('save', {
    title: title.value,
    resources: resources.value,
    queryFilter: queryFilter.value,
  });
  emit('cancel');
}
</script>

<template>
  <FormModal
    :open="props.isOpen"
    :title="modalTitle"
    :ok-disabled="disableSave"
    test-id="curated-assets-modal-container"
    @ok="handleSave"
    @cancel="emit('cancel')"
    @update:open="emit('cancel')"
  >
    <form data-testid="curated-assets-form" class="curated-assets-form" @submit.prevent="handleSave">
      <label class="curated-assets-form__label" for="curated-assets-title">
        {{ t('home.widgetTitle') }}
      </label>
      <Input
        id="curated-assets-title"
        data-testid="title-input"
        :value="title"
        :placeholder="t('home.curatedAssetsWidgetTitlePlaceholder')"
        autofocus
        @update:value="title = $event"
      />
      <SelectAssetTypeField
        :resources="resources"
        :selected-assets-info="selectedAssetsInfo"
        :fetch-entity-count="fetchEntityCount"
        @update:resources="resources = $event"
      />
      <AdvancedAssetsFilterField
        :query-filter="queryFilter"
        :resources="resources"
        :selected-assets-info="selectedAssetsInfo"
        :fetch-entity-count="fetchEntityCount"
        @update:query-filter="queryFilter = $event"
      />
    </form>
  </FormModal>
</template>

<style scoped>
.curated-assets-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.curated-assets-form__label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: -8px;
}
</style>
