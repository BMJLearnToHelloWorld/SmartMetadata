<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningDrawer: context resources, card list, Link opens a
  new tab, other types open ResourcePlayerModal and close the drawer.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Drawer, Spin } from 'ant-design-vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import {
  getLearningResourcesByContext,
  type LearningResourceDetail,
} from '@/api/learningResources';
import { openUrlInNewTab, opensInNewTab } from '@/utils/learning';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import LearningResourceCard from './LearningResourceCard.vue';
import ResourcePlayerModal from './ResourcePlayerModal.vue';

const props = defineProps<{
  open: boolean;
  pageId: string;
  title?: string;
  onClose: () => void;
}>();

const { t } = useI18n();

const resources = ref<LearningResourceDetail[]>([]);
const isLoading = ref(true);
const hasError = ref(false);
const selectedResource = ref<LearningResourceDetail | null>(null);
const playerOpen = ref(false);

const pageTitle = computed(() => {
  if (props.title) {
    return props.title;
  }
  const titleMap: Record<string, string> = {
    glossary: t('label.glossary'),
    glossaryTerm: t('label.glossary-term'),
    domain: t('label.domain'),
    dataProduct: t('label.data-product'),
    dataQuality: t('label.data-quality'),
  };
  return titleMap[props.pageId] || props.pageId;
});

const drawerTitle = computed(() => t('label.entity-resource', { entity: pageTitle.value }));

async function fetchResources(): Promise<void> {
  if (!props.open || !props.pageId) {
    return;
  }
  isLoading.value = true;
  hasError.value = false;
  try {
    const response = await getLearningResourcesByContext(props.pageId, {
      limit: 50,
      fields: 'categories,contexts,difficulty,estimatedDuration',
    });
    resources.value = response.data ?? [];
  } catch {
    hasError.value = true;
    resources.value = [];
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.open, props.pageId],
  () => {
    if (props.open) {
      void fetchResources();
    }
  },
  { immediate: true },
);

function handleResourceClick(resource: LearningResourceDetail): void {
  if (opensInNewTab(resource.resourceType)) {
    openUrlInNewTab(resource.source.url);
    return;
  }
  selectedResource.value = resource;
  playerOpen.value = true;
  props.onClose();
}

function handlePlayerClose(): void {
  playerOpen.value = false;
  selectedResource.value = null;
}
</script>

<template>
  <Drawer
    :open="open"
    :width="576"
    :closable="false"
    destroy-on-close
    class="learning-drawer"
    @close="onClose"
  >
    <template #title>
      <div class="learning-drawer__header">
        <span class="learning-drawer__title">{{ drawerTitle }}</span>
        <Button
          type="text"
          size="small"
          data-testid="close-drawer"
          :aria-label="t('label.close')"
          @click="onClose"
        >
          <CloseOutlined />
        </Button>
      </div>
    </template>
    <div data-testid="learning-drawer" class="learning-drawer__body">
    <div v-if="isLoading" class="learning-drawer__loading">
      <Spin data-testid="loader" />
    </div>
    <div v-else-if="hasError" class="learning-drawer__placeholder">
      <SomethingWentWrongPlaceholder :description="t('message.failed-to-load-learning-resources')" />
    </div>
    <div v-else-if="resources.length === 0" class="learning-drawer__placeholder">
      <NoDataPlaceholder :description="t('message.no-learning-resources-available')" />
    </div>
    <div v-else class="learning-drawer__list">
      <LearningResourceCard
        v-for="resource in resources"
        :key="resource.id"
        :resource="resource"
        @click="handleResourceClick"
      />
    </div>
    </div>
  </Drawer>
  <ResourcePlayerModal
    v-if="selectedResource"
    :open="playerOpen"
    :resource="selectedResource"
    :on-close="handlePlayerClose"
  />
</template>

<style scoped>
.learning-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-spacing-sm, 12px);
  width: 100%;
}

.learning-drawer__title {
  font-weight: 600;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}

.learning-drawer__loading,
.learning-drawer__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.learning-drawer__list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-spacing-sm, 12px);
}
</style>
