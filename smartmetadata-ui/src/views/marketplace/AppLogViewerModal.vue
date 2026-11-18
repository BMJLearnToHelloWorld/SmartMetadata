<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Input, Modal, Spin, Tooltip } from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    logs: string;
    loading?: boolean;
    enableSearch?: boolean;
    enableCopy?: boolean;
    downloading?: boolean;
    onClose: () => void;
    onDownload?: () => void;
  }>(),
  {
    loading: false,
    enableSearch: true,
    enableCopy: true,
    downloading: false,
    onDownload: undefined,
  },
);

const { t } = useI18n();
const searchText = ref('');
const hasCopied = ref(false);
const logContainerRef = ref<HTMLElement | null>(null);

/**
 * Official LogViewerModal (components/common/LogViewerModal/
 * LogViewerModal.component.tsx, pin a3012259ca), static-mode subset
 * for one-shot log text (design §6.6): search with a match count,
 * copy with a Copied state, download when the caller supplies one,
 * jump-to-end, and close. Stream mode (live indicator, follow,
 * reconnecting, truncation) belongs to the streaming viewer and is
 * not built here; the failure-log and external-row callers in this
 * batch pass finished text only.
 */
const displayedLogs = computed(() => {
  if (!searchText.value) {
    return props.logs;
  }
  const needle = searchText.value.toLowerCase();
  return props.logs
    .split('\n')
    .filter((line) => line.toLowerCase().includes(needle))
    .join('\n');
});

const matchCount = computed(() => {
  if (!searchText.value) {
    return 0;
  }
  const needle = searchText.value.toLowerCase();
  return props.logs.split('\n').filter((line) => line.toLowerCase().includes(needle)).length;
});

watch(
  () => props.logs,
  () => {
    hasCopied.value = false;
  },
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      searchText.value = '';
      hasCopied.value = false;
    }
  },
);

async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.logs);
    hasCopied.value = true;
  } catch {
    hasCopied.value = false;
  }
}

function jumpToEnd(): void {
  const container = logContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}
</script>

<template>
  <Modal :footer="null" :open="open" :title="title" width="900" @cancel="onClose">
    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px">
      <Input
        v-if="enableSearch"
        v-model:value="searchText"
        :aria-label="t('label.search-entity', { entity: t('label.log-lowercase-plural') })"
        allow-clear
        data-testid="log-viewer-search"
        :placeholder="t('label.search-entity', { entity: t('label.log-lowercase-plural') })"
        style="width: 280px"
      />
      <span v-if="enableSearch && searchText" data-testid="log-viewer-match-count">
        {{ `${matchCount} ${t('label.matches')}` }}
      </span>
      <Tooltip :title="hasCopied ? t('label.copied') : t('label.copy')">
        <Button v-if="enableCopy" data-testid="log-viewer-copy" @click="onCopy">
          {{ hasCopied ? t('label.copied') : t('label.copy') }}
        </Button>
      </Tooltip>
      <Spin v-if="downloading" data-testid="log-viewer-download-loader" size="small" />
      <Tooltip v-else-if="onDownload" :title="t('label.download')">
        <Button :aria-label="t('label.download')" data-testid="log-viewer-download" @click="onDownload">
          {{ t('label.download') }}
        </Button>
      </Tooltip>
      <Tooltip :title="t('label.jump-to-end')">
        <Button :aria-label="t('label.jump-to-end')" data-testid="log-viewer-jump-to-end" @click="jumpToEnd">
          {{ t('label.jump-to-end') }}
        </Button>
      </Tooltip>
    </div>
    <Spin v-if="loading" style="display: flex; justify-content: center; padding: 48px" />
    <div
      v-else
      ref="logContainerRef"
      style="
        max-height: 60vh;
        overflow: auto;
        background: #1f1f1f;
        color: #f5f5f5;
        padding: 16px;
        border-radius: 8px;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: monospace;
        font-size: 12px;
      "
    >
      {{ displayedLogs }}
    </div>
    <div style="display: flex; justify-content: flex-end; margin-top: 16px">
      <Button @click="onClose">{{ t('label.close') }}</Button>
    </div>
  </Modal>
</template>
