<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningIcon: fetch by pageId, hide when the resource count
  is 0 or the fetch fails. Vue + ant-design-vue; no invented LearningDrawer.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Popover } from 'ant-design-vue';
import { listLearningResources } from '@/api/learningResources';
import SmIcon from '@/components/shared/SmIcon.vue';

const props = defineProps<{
  pageId: string;
}>();

const { t } = useI18n();

const resourceCount = ref(0);
const isLoading = ref(true);
const hasError = ref(false);

const hidden = computed(
  () => hasError.value || (resourceCount.value === 0 && !isLoading.value),
);

const resourceLabel = computed(
  () => `${resourceCount.value} ${t('label.resource-plural').toLowerCase()}`,
);

async function fetchResourceCount(): Promise<void> {
  isLoading.value = true;
  try {
    const response = await listLearningResources({ pageId: [props.pageId], limit: 1 });
    resourceCount.value = response.total ?? 0;
  } catch {
    hasError.value = true;
    resourceCount.value = 0;
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void fetchResourceCount();
});
</script>

<template>
  <Popover v-if="!hidden" trigger="hover" placement="bottomLeft">
    <template #content>
      <div class="learning-icon__popover">
        <span>{{ t('label.learn-how-this-feature-works') }}</span>
        <Button type="text" size="small" data-testid="learning-resources-button">
          {{ resourceLabel }}
        </Button>
      </div>
    </template>
    <Button
      type="text"
      size="small"
      :aria-label="t('label.learn-how-this-feature-works')"
      data-testid="learning-icon"
    >
      <SmIcon icon-key="learning" />
    </Button>
  </Popover>
</template>

<style scoped>
.learning-icon__popover {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 8px);
  font-size: 12px;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}
</style>
