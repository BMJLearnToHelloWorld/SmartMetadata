<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official VideoPlayer: only a getSafeHttpUrl-accepted http(s) URL may
  become the iframe src.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Spin, Typography } from 'ant-design-vue';
import type { LearningResourceDetail } from '@/api/learningResources';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import { getEmbedUrl } from '@/utils/learning';

const props = defineProps<{ resource: LearningResourceDetail }>();
const { t } = useI18n();
const isLoading = ref(true);

const embedUrl = computed(() => {
  const safeUrl = getSafeHttpUrl(props.resource.source.url);
  return safeUrl ? getEmbedUrl(safeUrl) : undefined;
});
</script>

<template>
  <div v-if="!embedUrl" class="learning-player-fallback">
    <Typography.Text>{{ t('label.invalid-url') }}</Typography.Text>
  </div>
  <div v-else class="video-player">
    <div v-if="isLoading" class="video-player__loading">
      <Spin data-testid="loader" />
    </div>
    <iframe
      class="video-player__frame"
      :src="embedUrl"
      :title="resource.displayName || resource.name"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      @load="isLoading = false"
    />
  </div>
</template>

<style scoped>
.learning-player-fallback,
.video-player {
  width: 100%;
  padding: var(--sm-spacing-md, 16px);
}

.video-player {
  position: relative;
  min-height: 360px;
}

.video-player__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-player__frame {
  width: 100%;
  min-height: 360px;
  border: 0;
  border-radius: var(--sm-radius-sm, 8px);
}
</style>
