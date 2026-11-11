<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Modal, Spin, message } from 'ant-design-vue';
import { entityLabel } from '@/features/crud/paging';
import { isPipelineRunActive } from '@/ingestion/pipelineDisplay';
import { useIngestionLogs } from '@/ingestion/useIngestionLogs';
import type { IngestionPipeline } from '@/types/ingestion';

const props = defineProps<{
  open: boolean;
  pipeline: IngestionPipeline | null;
  /**
   * Official logEntityType branch (PipelineActions.tsx:112-122):
   * TestSuite -> 'testSuite', otherwise the loaded service's category.
   * Both branches serve the same ingestion-pipeline log endpoint here;
   * the value is kept so the caller's branch stays visible and the
   * application-log branch has a place to land.
   */
  logEntityType: string;
}>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const searchText = ref('');

const title = computed(() => {
  const name = props.pipeline ? entityLabel(props.pipeline) : '';
  return name ? `${name} · ${t('ingestion.pipelines.logs')}` : t('ingestion.pipelines.logs');
});

const latestStatus = computed(() => props.pipeline?.pipelineStatuses?.[0]);

/**
 * Official LogsViewerModalContainer + useEntityLogs (openmetadata-ui,
 * pin a3012259ca): SSE live tail while the latest run is active,
 * paginated loadMore otherwise, and a download of the last run's logs.
 * Error states (no run 404, empty log 400, client disabled 200-string)
 * render as errors, never as empty pages.
 */
const {
  logs,
  loading,
  loadingMore,
  hasMore,
  totalLines,
  downloading,
  isLive,
  isStreaming,
  streamHealth,
  streamTruncated,
  streamError,
  error,
  loadMore,
  download,
} = useIngestionLogs({
  enabled: () => props.open,
  fqn: () => props.pipeline?.fullyQualifiedName ?? props.pipeline?.id ?? '',
  pipelineType: () => props.pipeline?.pipelineType,
  runId: () => latestStatus.value?.runId,
  runActive: () => isPipelineRunActive(latestStatus.value?.pipelineState),
  title: () => (props.pipeline ? entityLabel(props.pipeline) : ''),
});

const displayedLogs = computed(() => {
  if (!searchText.value) {
    return logs.value;
  }
  const needle = searchText.value.toLowerCase();
  return logs.value
    .split('\n')
    .filter((line) => line.toLowerCase().includes(needle))
    .join('\n');
});

async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(logs.value);
    message.success(t('ingestion.pipelines.copied'));
  } catch {
    message.error(t('ingestion.pipelines.copyFailed'));
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :footer="null"
    width="900"
    data-testid="ingestion-logs-modal"
    @cancel="emit('close')"
  >
    <div class="ing-logs__toolbar">
      <Input
        v-model:value="searchText"
        :placeholder="t('ingestion.pipelines.searchLogs')"
        allow-clear
        data-testid="log-viewer-search"
        style="width: 280px"
      />
      <Button data-testid="log-viewer-copy" @click="onCopy">
        {{ t('ingestion.pipelines.copy') }}
      </Button>
      <Button data-testid="log-viewer-download" :loading="downloading" @click="download">
        {{ t('ingestion.pipelines.download') }}
      </Button>
      <span v-if="isLive" data-testid="log-viewer-live-indicator" class="ing-logs__live">
        {{ isStreaming ? t('ingestion.pipelines.liveStreaming') : t('ingestion.pipelines.live') }}
      </span>
      <span
        v-if="streamHealth === 'degraded'"
        data-testid="log-viewer-reconnecting-indicator"
        class="ing-logs__reconnecting"
      >
        {{ t('ingestion.pipelines.reconnecting') }}
      </span>
    </div>
    <Alert
      v-if="error"
      type="error"
      show-icon
      data-testid="ingestion-logs-error"
      :message="error"
      style="margin-top: 12px"
    />
    <Alert
      v-if="streamError"
      type="warning"
      show-icon
      data-testid="ingestion-logs-stream-error"
      :message="streamError"
      style="margin-top: 12px"
    />
    <Alert
      v-if="streamTruncated"
      type="warning"
      show-icon
      data-testid="ingestion-logs-truncated"
      :message="t('ingestion.pipelines.streamTruncated')"
      style="margin-top: 12px"
    />
    <Spin :spinning="loading && !logs" style="width: 100%; margin-top: 12px">
      <pre
        v-if="logs"
        class="ing-logs__body"
        data-testid="ingestion-logs-body"
      >{{ displayedLogs }}</pre>
      <p v-else-if="!loading && !error" data-testid="ingestion-logs-empty">
        {{ t('ingestion.pipelines.noLogs') }}
      </p>
    </Spin>
    <div class="ing-logs__footer">
      <span data-testid="ingestion-logs-lines">
        {{ t('ingestion.pipelines.logLines', { count: totalLines }) }}
      </span>
      <span style="flex: 1" />
      <Button
        v-if="hasMore"
        data-testid="ingestion-logs-load-more"
        :loading="loadingMore"
        @click="loadMore"
      >
        {{ t('crud.loadMore') }}
      </Button>
      <Button data-testid="ingestion-logs-close" @click="emit('close')">
        {{ t('crud.close') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.ing-logs__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ing-logs__live {
  color: var(--sm-color-success);
  font-weight: 600;
}
.ing-logs__reconnecting {
  color: var(--sm-text-secondary);
}
.ing-logs__body {
  background: var(--sm-bg-elevated);
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
  max-height: 55vh;
  white-space: pre-wrap;
  margin-top: 12px;
}
.ing-logs__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>
