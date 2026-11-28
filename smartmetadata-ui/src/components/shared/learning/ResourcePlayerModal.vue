<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ResourcePlayerModal + ResourcePlayer: fetch by id with list
  fallback, type-specific player, fullscreen toggle. Vue + ant-design-vue.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Skeleton, Tag, Typography, message } from 'ant-design-vue';
import { CloseOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue';
import { getLearningResourceById, type LearningResourceDetail } from '@/api/learningResources';
import {
  formatDuration,
  formatTableDate,
  getCategoryColor,
  getCategoryLabel,
  getContextLabel,
} from '@/views/admin/learningConstants';
import { getDurationUnitLabelKey } from '@/utils/learning';
import { getErrorText } from '@/views/admin/accessApiErrors';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import ArticleViewer from './ArticleViewer.vue';
import PdfViewer from './PdfViewer.vue';
import StorylaneTour from './StorylaneTour.vue';
import VideoPlayer from './VideoPlayer.vue';

const FULLSCREEN_CONTAINER_ID = 'resource-player-fullscreen';

const props = defineProps<{
  open: boolean;
  resource: LearningResourceDetail;
  onClose: () => void;
}>();

const { t } = useI18n();

const isFullScreen = ref(false);
const fetchedResource = ref<LearningResourceDetail | null>(null);
const hasFetchFailed = ref(false);

const hasFallback = computed(() => Boolean(props.resource));
const displayResource = computed(() => fetchedResource.value ?? props.resource);

const formattedDate = computed(() =>
  displayResource.value ? formatTableDate(displayResource.value.updatedAt) : null,
);
const formattedDuration = computed(() =>
  displayResource.value
    ? formatDuration(
        displayResource.value.estimatedDuration,
        t(getDurationUnitLabelKey(displayResource.value.resourceType)),
      )
    : null,
);

function handleFullscreenChange(): void {
  isFullScreen.value = Boolean(document.fullscreenElement);
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  }
});

watch(
  () => [props.open, props.resource.id],
  () => {
    if (!props.open) {
      return;
    }
    fetchedResource.value = null;
    hasFetchFailed.value = false;
    void getLearningResourceById(props.resource.id)
      .then((data) => {
        fetchedResource.value = data;
      })
      .catch((error) => {
        hasFetchFailed.value = true;
        if (!hasFallback.value) {
          message.error(getErrorText(error, t('server.unexpected-error')));
        }
      });
  },
  { immediate: true },
);

async function handleFullScreenToggle(): Promise<void> {
  const element = document.getElementById(FULLSCREEN_CONTAINER_ID);
  if (!element) {
    return;
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      isFullScreen.value = false;
    } else {
      await element.requestFullscreen();
      isFullScreen.value = true;
    }
  } catch {
    isFullScreen.value = !isFullScreen.value;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :footer="null"
    :width="1143"
    :closable="false"
    destroy-on-close
    data-testid="resource-player-dialog"
    wrap-class-name="resource-player-modal-wrap"
    @cancel="onClose"
  >
    <div
      v-if="displayResource"
      :id="FULLSCREEN_CONTAINER_ID"
      class="resource-player"
      :class="{ 'resource-player--fullscreen': isFullScreen }"
      data-testid="resource-player-modal"
    >
      <div class="resource-player__header">
        <div class="resource-player__title-row">
          <div class="resource-player__title-block">
            <div class="resource-player__title-line">
              <Typography.Title :level="5" class="resource-player__name">
                {{ displayResource.displayName || displayResource.name }}
              </Typography.Title>
              <Tag
                v-for="category in displayResource.categories ?? []"
                :key="category"
                :color="getCategoryColor(category)"
              >
                {{ getCategoryLabel(category) }}
              </Tag>
            </div>
            <Typography.Paragraph
              v-if="displayResource.description"
              :aria-label="displayResource.description"
              type="secondary"
              class="resource-player__description"
            >
              {{ displayResource.description }}
            </Typography.Paragraph>
          </div>
          <div class="resource-player__actions">
            <span
              v-if="formattedDate || formattedDuration"
              data-testid="resource-date-duration"
              class="resource-player__meta"
            >
              <Typography.Text v-if="formattedDate" type="secondary">{{ formattedDate }}</Typography.Text>
              <Typography.Text v-if="formattedDate && formattedDuration" type="secondary">|</Typography.Text>
              <Typography.Text v-if="formattedDuration" type="secondary">{{ formattedDuration }}</Typography.Text>
            </span>
            <Button
              type="text"
              size="small"
              :aria-label="isFullScreen ? t('label.exit-full-screen') : t('label.fullscreen')"
              :title="isFullScreen ? t('label.exit-full-screen') : t('label.fullscreen')"
              :data-testid="isFullScreen ? 'minimize-button' : 'maximize-button'"
              @click="handleFullScreenToggle"
            >
              <FullscreenExitOutlined v-if="isFullScreen" />
              <FullscreenOutlined v-else />
            </Button>
            <Button
              type="text"
              size="small"
              :aria-label="t('label.close')"
              data-testid="close-resource-player"
              @click="onClose"
            >
              <CloseOutlined />
            </Button>
          </div>
        </div>
        <div v-if="(displayResource.contexts ?? []).length > 0" class="resource-player__contexts">
          <Tag v-for="ctx in displayResource.contexts ?? []" :key="ctx.pageId">
            {{ getContextLabel(ctx.pageId) }}
          </Tag>
        </div>
      </div>
      <div class="resource-player__body">
        <VideoPlayer v-if="displayResource.resourceType === 'Video'" :resource="displayResource" />
        <StorylaneTour v-else-if="displayResource.resourceType === 'Storylane'" :resource="displayResource" />
        <ArticleViewer v-else-if="displayResource.resourceType === 'Article'" :resource="displayResource" />
        <PdfViewer v-else-if="displayResource.resourceType === 'PDF'" :resource="displayResource" />
        <Typography.Text v-else class="resource-player__unsupported">
          {{ t('message.unsupported-resource-type') }}
        </Typography.Text>
      </div>
    </div>
    <div v-else-if="hasFetchFailed">
      <NoDataPlaceholder
        test-id="resource-not-found"
        :title="t('label.no-entity-found', { entity: t('label.learning-resource') })"
      />
    </div>
    <Skeleton v-else :active="true" :paragraph="{ rows: 8 }" />
  </Modal>
</template>

<style scoped>
.resource-player {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 90vh;
  overflow: auto;
  background: var(--sm-bg-container, #fff);
}

.resource-player--fullscreen {
  height: 100vh;
  width: 100vw;
  max-height: none;
  overflow: hidden;
  background: var(--sm-color-fill-secondary, #fafafa);
}

.resource-player__header {
  padding: var(--sm-spacing-sm, 12px) var(--sm-spacing-md, 24px);
  border-bottom: 1px solid var(--sm-border-color, #f0f0f0);
}

.resource-player__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-spacing-xs, 8px);
}

.resource-player__title-block {
  flex: 1;
  min-width: 0;
}

.resource-player__title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sm-spacing-xs, 6px);
}

.resource-player__name {
  margin: 0 !important;
}

.resource-player__description {
  margin: var(--sm-spacing-xs, 4px) 0 0 !important;
}

.resource-player__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--sm-spacing-xs, 4px);
}

.resource-player__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 4px);
  margin-right: var(--sm-spacing-xs, 8px);
}

.resource-player__contexts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-spacing-xs, 8px);
  padding-top: var(--sm-spacing-sm, 12px);
}

.resource-player__unsupported {
  display: block;
  padding: var(--sm-spacing-md, 16px);
}
</style>
