<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ResourcePlayerModal + ResourcePlayer + VideoPlayer +
  StorylaneTour + ArticleViewer + PdfViewer. The player refetches the
  resource by id and falls back to the list row; Link resources never
  reach it (they open in a new tab from the list actions).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CloseOutlined,
  ExpandOutlined,
  LinkOutlined,
  ShrinkOutlined,
} from '@ant-design/icons-vue';
import { Alert, Button, Modal, Skeleton, Tag, Typography, message } from 'ant-design-vue';
import {
  getLearningResourceById,
  type LearningResourceDetail,
} from '@/api/learningResources';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { getSanitizeContent } from '@/utils/sanitizeContent';
import {
  formatDuration,
  formatTableDate,
  getCategoryColor,
  getCategoryLabel,
  getContextLabel,
  getDurationUnitLabelKey,
  getEmbedUrl,
  getSafeHttpUrl,
} from './learningConstants';

const props = defineProps<{
  open: boolean;
  resource: LearningResourceDetail;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const FULLSCREEN_CONTAINER_ID = 'resource-player-fullscreen';

const fetchedResource = ref<LearningResourceDetail | null>(null);
const hasFetchFailed = ref(false);
const isFullScreen = ref(false);

const displayResource = computed(() => fetchedResource.value ?? props.resource);

watch(
  () => props.resource.id,
  async (resourceId) => {
    if (!props.open) {
      return;
    }
    fetchedResource.value = null;
    hasFetchFailed.value = false;
    const currentId = resourceId;
    try {
      const data = await getLearningResourceById(resourceId);
      if (props.resource.id === currentId) {
        fetchedResource.value = data;
      }
    } catch {
      if (props.resource.id === currentId) {
        hasFetchFailed.value = true;
        // No error toast: the list row is the fallback, and a failure
        // matters only when there is no row to fall back on.
      }
    }
  },
  { immediate: true },
);

function onFullscreenChange(): void {
  isFullScreen.value = Boolean(document.fullscreenElement);
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  }
});

async function toggleFullscreen(): Promise<void> {
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

const formattedDate = computed(() => formatTableDate(displayResource.value.updatedAt));
const formattedDuration = computed(() =>
  formatDuration(
    displayResource.value.estimatedDuration,
    t(getDurationUnitLabelKey(displayResource.value.resourceType)),
  ),
);

// --- Video / Storylane viewers (iframe + loader) ---

const videoLoading = ref(true);
const tourLoading = ref(true);
const embedUrl = computed(() => {
  const safeUrl = getSafeHttpUrl(displayResource.value.source.url);
  return safeUrl ? getEmbedUrl(safeUrl) : undefined;
});
const tourUrl = computed(() => getSafeHttpUrl(displayResource.value.source.url));

// --- Article viewer ---

const articleContent = ref('');
const articleLoading = ref(true);
const articleError = ref<string | null>(null);

async function fetchArticle(): Promise<void> {
  articleLoading.value = true;
  articleError.value = null;
  try {
    const source = displayResource.value.source;
    const embedded = source.embedConfig?.content;
    if (typeof embedded === 'string' && embedded) {
      articleContent.value = getSanitizeContent(embedded);
    } else if (source.url.startsWith('http')) {
      const response = await fetch(source.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.statusText}`);
      }
      articleContent.value = getSanitizeContent(await response.text());
    } else {
      articleContent.value = getSanitizeContent(source.url);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load article';
    articleError.value = errorMessage;
    message.error(t('settings.learning.articleFetchError'));
  } finally {
    articleLoading.value = false;
  }
}

watch(
  () => [displayResource.value.source.url, displayResource.value.source.embedConfig],
  () => {
    if (displayResource.value.resourceType === 'Article') {
      void fetchArticle();
    }
  },
  { immediate: true },
);

// --- PDF viewer ---

const pdfUrl = computed(() => getSafeHttpUrl(displayResource.value.source.url));

function close(): void {
  emit('close');
}
</script>

<template>
  <Modal
    :open="open"
    :width="1143"
    :footer="null"
    :closable="false"
    :mask-closable="true"
    @cancel="close"
  >
    <div
      :id="FULLSCREEN_CONTAINER_ID"
      data-testid="resource-player-dialog"
      class="resource-player"
    >
      <template v-if="displayResource">
        <div class="resource-player__header">
          <div class="resource-player__title-row">
            <div class="resource-player__title-block">
              <div class="resource-player__title-line">
                <Typography.Text strong class="resource-player__title">
                  {{ displayResource.displayName || displayResource.name }}
                </Typography.Text>
                <Tag
                  v-for="category in displayResource.categories ?? []"
                  :key="category"
                  :color="getCategoryColor(category)"
                >
                  {{ getCategoryLabel(category) }}
                </Tag>
              </div>
              <Typography.Text
                v-if="displayResource.description"
                :aria-label="displayResource.description"
                type="secondary"
              >
                {{ displayResource.description }}
              </Typography.Text>
            </div>
            <div class="resource-player__header-actions">
              <span
                v-if="formattedDate || formattedDuration"
                data-testid="resource-date-duration"
                class="resource-player__date-duration"
              >
                <Typography.Text v-if="formattedDate" type="secondary">
                  {{ formattedDate }}
                </Typography.Text>
                <Typography.Text v-if="formattedDate && formattedDuration" type="secondary">
                  |
                </Typography.Text>
                <Typography.Text v-if="formattedDuration" type="secondary">
                  {{ formattedDuration }}
                </Typography.Text>
              </span>
              <Button
                type="text"
                size="small"
                :aria-label="isFullScreen ? t('settings.learning.exitFullScreen') : t('settings.learning.fullscreen')"
                :data-testid="isFullScreen ? 'minimize-button' : 'maximize-button'"
                @click="toggleFullscreen"
              >
                <ShrinkOutlined v-if="isFullScreen" />
                <ExpandOutlined v-else />
              </Button>
              <Button
                type="text"
                size="small"
                :aria-label="t('settings.learning.close')"
                data-testid="close-resource-player"
                @click="close"
              >
                <CloseOutlined />
              </Button>
            </div>
          </div>
          <div
            v-if="(displayResource.contexts ?? []).length > 0"
            class="resource-player__contexts"
          >
            <Tag
              v-for="ctx in displayResource.contexts ?? []"
              :key="ctx.pageId"
              color="default"
            >
              {{ getContextLabel(ctx.pageId) }}
            </Tag>
          </div>
        </div>

        <div class="resource-player__body">
          <template v-if="displayResource.resourceType === 'Video'">
            <div v-if="!embedUrl" class="resource-player__pad">
              <Typography.Text>{{ t('settings.learning.invalidUrl') }}</Typography.Text>
            </div>
            <div v-else class="resource-player__frame-wrap">
              <Skeleton v-if="videoLoading" active />
              <iframe
                :src="embedUrl"
                :title="displayResource.displayName || displayResource.name"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowfullscreen
                frameborder="0"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                class="resource-player__frame"
                @load="videoLoading = false"
              />
            </div>
          </template>
          <template v-else-if="displayResource.resourceType === 'Storylane'">
            <div v-if="!tourUrl" class="resource-player__pad">
              <Typography.Text>{{ t('settings.learning.invalidUrl') }}</Typography.Text>
            </div>
            <div v-else class="resource-player__frame-wrap">
              <Skeleton v-if="tourLoading" active />
              <iframe
                :src="tourUrl"
                :title="displayResource.displayName || displayResource.name"
                frameborder="0"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
                class="resource-player__frame"
                @load="tourLoading = false"
              />
            </div>
          </template>
          <template v-else-if="displayResource.resourceType === 'Article'">
            <div v-if="articleLoading" class="resource-player__pad resource-player__center">
              <Skeleton active />
              <Typography.Text>{{ t('settings.learning.loadingArticle') }}</Typography.Text>
            </div>
            <div v-else-if="articleError" class="resource-player__pad">
              <Alert
                type="error"
                :message="t('settings.learning.failedToLoadArticle')"
                :description="articleError"
                show-icon
              >
                <template #action>
                  <a
                    v-if="getSafeHttpUrl(displayResource.source.url)"
                    :href="getSafeHttpUrl(displayResource.source.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkOutlined />
                    {{ t('settings.learning.openOriginal') }}
                  </a>
                </template>
              </Alert>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -- sanitized via getSanitizeContent -->
            <div v-else class="resource-player__pad" v-html="articleContent" />
          </template>
          <template v-else-if="displayResource.resourceType === 'PDF'">
            <div v-if="!pdfUrl" class="resource-player__pad">
              <Typography.Text>{{ t('settings.learning.invalidUrl') }}</Typography.Text>
            </div>
            <div v-else class="resource-player__pdf">
              <div class="resource-player__pdf-actions">
                <a :href="pdfUrl" target="_blank" rel="noopener noreferrer">
                  {{ t('settings.learning.openInNewTab') }}
                  <LinkOutlined />
                </a>
              </div>
              <!-- Not sandboxed: browsers disable their built-in PDF viewer inside sandboxed frames. -->
              <iframe
                :src="pdfUrl"
                :title="displayResource.displayName || displayResource.name"
                class="resource-player__pdf-frame"
              />
            </div>
          </template>
          <div v-else class="resource-player__pad">
            <Typography.Text>{{ t('settings.learning.unsupportedResourceType') }}</Typography.Text>
          </div>
        </div>
      </template>
      <template v-else-if="hasFetchFailed">
        <NoDataPlaceholder test-id="resource-not-found" />
      </template>
      <Skeleton v-else :paragraph="{ rows: 8 }" active />
    </div>
  </Modal>
</template>

<style scoped>
.resource-player {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: auto;
}

.resource-player__header {
  padding: 12px 24px;
  border-bottom: 1px solid var(--sm-border-color);
}

.resource-player__title-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  justify-content: space-between;
}

.resource-player__title-block {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.resource-player__title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.resource-player__title {
  overflow-wrap: break-word;
}

.resource-player__header-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}

.resource-player__date-duration {
  display: flex;
  gap: 4px;
  margin-right: 8px;
}

.resource-player__contexts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
}

.resource-player__body {
  width: 100%;
}

.resource-player__pad {
  padding: 16px;
}

.resource-player__center {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.resource-player__frame-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
}

.resource-player__frame {
  width: 100%;
  height: 100%;
  border: 0;
}

.resource-player__pdf {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 16px;
}

.resource-player__pdf-actions {
  display: flex;
  justify-content: flex-end;
}

.resource-player__pdf-frame {
  width: 100%;
  min-height: 60vh;
  flex: 1;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
}
</style>
