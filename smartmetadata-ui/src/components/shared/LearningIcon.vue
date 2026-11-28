<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningIcon: fetch by pageId, hide when the resource count
  is 0 or the fetch fails, and mount official LearningDrawer on click.
  Official popover is controlled (mouseenter open, 120ms mouseleave close).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
const popoverOpen = ref(false);
let closeTimeout: ReturnType<typeof setTimeout> | null = null;

const hidden = computed(
  () => hasError.value || (resourceCount.value === 0 && !isLoading.value),
);

const resourceLabel = computed(
  () => `${resourceCount.value} ${t('label.resource-plural').toLowerCase()}`,
);

function clearCloseTimeout(): void {
  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }
}

function openPopover(): void {
  clearCloseTimeout();
  popoverOpen.value = true;
}

function scheduleClosePopover(): void {
  clearCloseTimeout();
  closeTimeout = setTimeout(() => {
    popoverOpen.value = false;
    closeTimeout = null;
  }, 120);
}

function onPopoverOpenChange(open: boolean): void {
  if (!open) {
    clearCloseTimeout();
    popoverOpen.value = false;
  }
}

async function fetchResourceCount(): Promise<void> {
  if (resourceCount.value > 0 || hasError.value) {
    return;
  }
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
  clearCloseTimeout();
  popoverOpen.value = false;
  drawerOpen.value = true;
}

function closeDrawer(): void {
  drawerOpen.value = false;
}

onMounted(() => {
  void fetchResourceCount();
});

onBeforeUnmount(() => {
  clearCloseTimeout();
});
</script>

<template>
  <template v-if="!hidden">
    <Popover
      :open="popoverOpen"
      placement="bottomLeft"
      :destroy-tooltip-on-hide="false"
      @openChange="onPopoverOpenChange"
    >
      <template #content>
        <div
          class="learning-icon__popover"
          @mouseenter="openPopover"
          @mouseleave="scheduleClosePopover"
        >
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
        @mouseenter="openPopover"
        @mouseleave="scheduleClosePopover"
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