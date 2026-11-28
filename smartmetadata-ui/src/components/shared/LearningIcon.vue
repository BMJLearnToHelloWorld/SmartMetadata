<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningIcon: fetch by pageId, hide when the resource count
  is 0 or the fetch fails, and mount official LearningDrawer on click.
  Official popover is controlled (mouseenter open, 120ms mouseleave close).
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Popover } from 'ant-design-vue';
import { getLearningResourcesByContext } from '@/api/learningResources';
import SmIcon from '@/components/shared/SmIcon.vue';
import LearningDrawer from '@/components/shared/learning/LearningDrawer.vue';

const props = defineProps<{
  pageId: string;
  title?: string;
}>();

const { t } = useI18n();

const resourceCount = ref(0);
const isLoading = ref(true);
const hasError = ref(false);
const drawerOpen = ref(false);

const hidden = computed(
  () => hasError.value || (resourceCount.value === 0 && !isLoading.value),
);

const resourceLabel = computed(
  () => `${resourceCount.value} ${t('label.resource-plural').toLowerCase()}`,
);

async function fetchResourceCount(): Promise<void> {
  isLoading.value = true;
  try {
    const response = await getLearningResourcesByContext(props.pageId, { limit: 1 });
    resourceCount.value = response.total ?? 0;
  } catch {
    hasError.value = true;
    resourceCount.value = 0;
  } finally {
    isLoading.value = false;
  }
}

function openDrawer(): void {
  drawerOpen.value = true;
}

function closeDrawer(): void {
  drawerOpen.value = false;
}

onMounted(() => {
  void fetchResourceCount();
});

</script>

<template>
  <template v-if="!hidden">
    <Popover trigger="hover" :mouse-enter-delay="0" :mouse-leave-delay="0.12" placement="bottomLeft">
      <template #content>
        <div class="learning-icon__popover">
          <span>{{ t('label.learn-how-this-feature-works') }}</span>
          <Button
            type="text"
            size="small"
            data-testid="learning-resources-button"
            @click="openDrawer"
          >
            {{ resourceLabel }}
          </Button>
        </div>
      </template>
      <Button
        type="text"
        size="small"
        :aria-label="t('label.learn-how-this-feature-works')"
        data-testid="learning-icon"
        @click="openDrawer"
      >
        <SmIcon icon-key="learning" />
      </Button>
    </Popover>
    <LearningDrawer
      :open="drawerOpen"
      :page-id="pageId"
      :title="title"
      :on-close="closeDrawer"
    />
  </template>
</template>

<style scoped>
.learning-icon__popover {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs);
  font-size: 12px;
  color: var(--sm-text-secondary);
}
</style>
