<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ArticleViewer: embedConfig.content, else fetch http URL, else
  treat the URL field as content. Official server.article-fetch-error.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Spin, Typography, message } from 'ant-design-vue';
import { LinkOutlined } from '@ant-design/icons-vue';
import type { LearningResourceDetail } from '@/api/learningResources';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{ resource: LearningResourceDetail }>();
const { t } = useI18n();

const content = ref('');
const isLoading = ref(true);
const error = ref<string | null>(null);
const originalUrl = ref<string | undefined>();

async function fetchContent(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  originalUrl.value = getSafeHttpUrl(props.resource.source.url);
  try {
    const embedContent = props.resource.source.embedConfig?.content;
    if (typeof embedContent === 'string' && embedContent) {
      content.value = embedContent;
    } else if (props.resource.source.url.startsWith('http')) {
      const response = await fetch(props.resource.source.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.statusText}`);
      }
      content.value = await response.text();
    } else {
      content.value = props.resource.source.url;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load article';
    message.error(getErrorText(err, t('server.article-fetch-error')));
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void fetchContent();
});

watch(
  () => [props.resource.source.url, props.resource.source.embedConfig],
  () => {
    void fetchContent();
  },
);
</script>

<template>
  <div class="article-viewer">
    <div v-if="isLoading" class="article-viewer__loading">
      <Spin data-testid="loader" />
      <Typography.Text>{{ t('label.loading-article') }}</Typography.Text>
    </div>
    <div v-else-if="error" class="article-viewer__error">
      <Alert type="error" show-icon :message="t('message.failed-to-load-article')" :description="error">
        <template v-if="originalUrl" #action>
          <Button type="link" size="small" :href="originalUrl" target="_blank" rel="noopener noreferrer">
            <template #icon><LinkOutlined /></template>
            {{ t('label.open-original') }}
          </Button>
        </template>
      </Alert>
    </div>
    <div v-else class="article-viewer__content">
      <SmMarkdown :markdown="content" test-id="article-viewer-content" />
    </div>
  </div>
</template>

<style scoped>
.article-viewer {
  width: 100%;
  padding: var(--sm-spacing-md, 16px);
}

.article-viewer__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-spacing-xs, 8px);
  min-height: 200px;
}

.article-viewer__content {
  max-width: 100%;
}
</style>
