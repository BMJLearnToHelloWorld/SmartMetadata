<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official StorylaneTour: only a getSafeHttpUrl-accepted http(s) URL
  may become the iframe src.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Spin, Typography } from 'ant-design-vue';
import type { LearningResourceDetail } from '@/api/learningResources';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';

const props = defineProps<{ resource: LearningResourceDetail }>();
const { t } = useI18n();
const isLoading = ref(true);
const tourUrl = computed(() => getSafeHttpUrl(props.resource.source.url));
</script>

<template>
  <div v-if="!tourUrl" class="learning-player-fallback">
    <Typography.Text>{{ t('label.invalid-url') }}</Typography.Text>
  </div>
  <div v-else class="storylane-tour">
    <div v-if="isLoading" class="storylane-tour__loading">
      <Spin data-testid="loader" />
    </div>
    <iframe
      class="storylane-tour__frame"
      :src="tourUrl"
      :title="resource.displayName || resource.name"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
      @load="isLoading = false"
    />
  </div>
</template>

<style scoped>
.learning-player-fallback,
.storylane-tour {
  width: 100%;
  padding: var(--sm-spacing-md, 16px);
}

.storylane-tour {
  position: relative;
  min-height: 360px;
}

.storylane-tour__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.storylane-tour__frame {
  width: 100%;
  min-height: 360px;
  border: 0;
  border-radius: var(--sm-radius-sm, 8px);
}
</style>
