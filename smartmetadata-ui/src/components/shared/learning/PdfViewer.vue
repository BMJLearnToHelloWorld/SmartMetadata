<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official PdfViewer: safe http(s) URL in an unsandboxed iframe, plus
  open-in-new-tab. Browsers disable the built-in PDF viewer in sandboxes.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Typography } from 'ant-design-vue';
import { LinkOutlined } from '@ant-design/icons-vue';
import type { LearningResourceDetail } from '@/api/learningResources';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';

const props = defineProps<{ resource: LearningResourceDetail }>();
const { t } = useI18n();
const pdfUrl = computed(() => getSafeHttpUrl(props.resource.source.url));
</script>

<template>
  <Typography.Text v-if="!pdfUrl" class="pdf-viewer__fallback">
    {{ t('label.invalid-url') }}
  </Typography.Text>
  <div v-else class="pdf-viewer">
    <div class="pdf-viewer__actions">
      <Button type="link" size="small" :href="pdfUrl" target="_blank" rel="noopener noreferrer">
        <template #icon><LinkOutlined /></template>
        {{ t('label.open-in-new-tab') }}
      </Button>
    </div>
    <iframe
      class="pdf-viewer__frame"
      :src="pdfUrl"
      :title="resource.displayName || resource.name"
    />
  </div>
</template>

<style scoped>
.pdf-viewer__fallback {
  display: block;
  padding: var(--sm-spacing-md, 16px);
}

.pdf-viewer {
  display: flex;
  flex-direction: column;
  gap: var(--sm-spacing-sm, 12px);
  width: 100%;
  padding: var(--sm-spacing-md, 16px);
}

.pdf-viewer__actions {
  display: flex;
  justify-content: flex-end;
}

.pdf-viewer__frame {
  width: 100%;
  min-height: 60vh;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-sm, 8px);
}
</style>
