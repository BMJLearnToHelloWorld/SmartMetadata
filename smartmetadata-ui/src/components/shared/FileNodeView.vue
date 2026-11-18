<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Render-only FileNode view (ported from official FileNodeView.tsx +
  AttachmentComponents/* at pin a3012259ca, upload/media parts held).

  Branches, verbatim: no valid source -> AttachmentPlaceholder; image ->
  ImageAttachment; otherwise FileAttachment; playable media replaces the
  whole button wrapper with a media player. The upload popover, the
  viewport-gated authenticated blob fetch and the authenticated
  download belong to the upload/media line (see fileNode.ts).
-->
<script setup lang="ts">
import {
  AudioOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { Button, Spin, Tooltip } from 'ant-design-vue';
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileType, UPLOADED_ASSETS_URL } from './blockEditorConstants';
import { bytesToSize, fileAttachmentDownloadKey } from './fileNode';

const props = defineProps<NodeViewProps>();
const { t } = useI18n();

const downloadFile = inject(fileAttachmentDownloadKey, () => {});

const attrs = computed(() => props.node.attrs as unknown as Record<string, unknown>);
const url = computed(() => (attrs.value.url as string | undefined) ?? '');
const fileName = computed(
  () =>
    ((attrs.value.fileName as string | undefined) ??
      (attrs.value.tempFile as File | undefined)?.name ??
      '') as string,
);
const fileSize = computed(() => {
  const size =
    (attrs.value.fileSize as number | null | undefined) ??
    (attrs.value.tempFile as File | undefined)?.size;
  return size;
});
const fileSizeLabel = computed(() => fileSize.value?.toString());
const mimeType = computed(
  () =>
    ((attrs.value.mimeType as string | undefined) ??
      (attrs.value.tempFile as File | undefined)?.type ??
      '') as string,
);
const isUploading = computed(() => Boolean(attrs.value.isUploading));
const uploadProgress = computed(() => (attrs.value.uploadProgress as number | undefined) ?? 0);
const isImage = computed(() => Boolean(attrs.value.isImage));
const alt = computed(() => (attrs.value.alt as string | null | undefined) ?? null);
const diffState = computed(() => attrs.value.diffState as string | null | undefined);

const isValidSource = computed(() => Boolean(url.value) || isUploading.value);
const isVideo = computed(() => mimeType.value.startsWith(FileType.VIDEO));
const isAudio = computed(() => mimeType.value.startsWith(FileType.AUDIO));
const isMedia = computed(() => isVideo.value || isAudio.value);
const fileType = computed(() => {
  if (isVideo.value) return FileType.VIDEO;
  if (isAudio.value) return FileType.AUDIO;
  return isImage.value ? FileType.IMAGE : FileType.FILE;
});

// RESIDUAL (media line): official fetches an authenticated blob URL,
// viewport-gated (200px, triggerOnce). This batch uses the URL directly.
const mediaSrc = computed(() => url.value);
const isMediaLoading = ref(false);
const isFileLoading = ref(false);
const isMediaSrcReady = computed(() => !isMediaLoading.value && Boolean(mediaSrc.value));
const isPlayableMedia = computed(
  () => isMedia.value && isValidSource.value && !isUploading.value && isMediaSrcReady.value,
);

const isUploadedAsset = computed(() => url.value.includes(UPLOADED_ASSETS_URL));

const placeholderIcon = computed(() => {
  switch (fileType.value) {
    case FileType.IMAGE:
      return FileImageOutlined;
    case FileType.VIDEO:
      return VideoCameraOutlined;
    case FileType.AUDIO:
      return AudioOutlined;
    default:
      return PaperClipOutlined;
  }
});

const fileIcon = computed(() => {
  const mime = mimeType.value;
  if (mime.startsWith('image/')) return FileImageOutlined;
  if (mime.startsWith('video/')) return VideoCameraOutlined;
  if (mime.startsWith('audio/')) return AudioOutlined;
  if (mime === 'application/pdf') return FilePdfOutlined;
  if (mime.startsWith('text/')) return FileTextOutlined;
  return FileOutlined;
});

const showUploadOverlay = computed(() => !isImage.value && (isMediaLoading.value || isUploading.value));
const uploadingLabel = computed(() =>
  isUploading.value ? t('label.uploading') : t('label.loading'),
);

const imageError = ref(false);
const imageLoaded = ref(false);
watch(
  () => [url.value, mediaSrc.value],
  () => {
    imageError.value = false;
    imageLoaded.value = false;
  },
);
const needsAuthentication = computed(() => url.value.includes(UPLOADED_ASSETS_URL));
const showImageLoadingOverlay = computed(
  () => isUploading.value || (needsAuthentication.value && (!imageLoaded.value || isMediaLoading.value)),
);
const displaySrc = computed(() =>
  needsAuthentication.value && !mediaSrc.value ? undefined : mediaSrc.value,
);

function handleFileClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (!isUploading.value) {
    downloadFile(fileName.value);
  }
}

function handleDelete(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  props.deleteNode();
}
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="file-attachment"
    :class="{
      'file-type-video': isVideo,
      'file-type-audio': isAudio,
      uploading: isUploading,
      'diff-added': diffState === 'added',
      'diff-removed': diffState === 'removed',
    }"
    :data-filename="fileName"
    :data-filesize="fileSizeLabel"
    :data-mimetype="mimeType"
    data-type="file-attachment"
    :data-url="url"
  >
    <div :class="isMedia ? 'media-content' : 'file-content'">
      <video
        v-if="isPlayableMedia && isVideo"
        controls
        :aria-label="fileName || t('label.media')"
        class="video-player"
        :src="mediaSrc"
      />
      <audio
        v-else-if="isPlayableMedia && isAudio"
        controls
        :aria-label="fileName || t('label.media')"
        class="audio-player"
        :src="mediaSrc"
      />
      <div v-else data-testid="add-image-container" class="attachment-button">
        <div v-if="showUploadOverlay" class="upload-overlay">
          <div class="upload-spinner">
            <Spin size="small" />
            <span class="upload-text">{{ uploadingLabel }}</span>
          </div>
        </div>
        <div
          v-if="!isValidSource"
          class="image-placeholder"
          contenteditable="false"
          data-testid="image-placeholder"
        >
          <component
            :is="placeholderIcon"
            aria-hidden="true"
            class="attachment-placeholder-icon"
          />
          <p class="placeholder-text">
            {{ t('label.add-an-file-type', { fileType: t(`label.${fileType}`) }) }}
          </p>
        </div>
        <div v-else-if="isImage" class="image-wrapper">
          <div
            class="image-container"
            :class="{ 'loading-state': showImageLoadingOverlay || imageError }"
            data-testid="image-container"
          >
            <img
              v-if="displaySrc"
              :alt="alt ?? ''"
              data-testid="uploaded-image-node"
              :src="displaySrc"
              @error="
                imageError = true;
                imageLoaded = false;
              "
              @load="
                imageLoaded = true;
                imageError = false;
              "
            />
            <div v-else class="loading-overlay">
              <FileImageOutlined :style="{ fontSize: '40px' }" />
            </div>
          </div>
        </div>
        <div v-else class="file-link-container">
          <div class="file-link-main">
            <component :is="fileIcon" class="file-type-icon" />
            <div class="file-details">
              <button
                class="file-link"
                type="button"
                :data-filename="fileName"
                :data-filesize="fileSizeLabel"
                :data-mimetype="mimeType"
                data-type="file-attachment"
                :data-url="url"
                @click="handleFileClick"
              >
                <p class="file-name">{{ fileName || url }}</p>
              </button>
              <div class="file-meta">
                <p v-if="fileSize" class="file-size">{{ bytesToSize(fileSize) }}</p>
                <div
                  v-if="isUploading"
                  class="upload-progress"
                  data-testid="upload-progress"
                  :style="{ width: `${uploadProgress || 0}%` }"
                />
                <template v-else-if="isUploadedAsset">
                  <span class="separator">|</span>
                  <Tooltip :title="t('label.download')">
                    <Button
                      data-testid="download-file-attachment"
                      type="text"
                      size="small"
                      :disabled="isFileLoading"
                      @click="handleFileClick"
                    >
                      <template #icon><DownloadOutlined /></template>
                    </Button>
                  </Tooltip>
                </template>
              </div>
            </div>
          </div>
          <Tooltip v-if="!isUploading" :title="t('label.delete')">
            <Button data-testid="delete-icon" type="text" size="small" @click="handleDelete">
              <template #icon><DeleteOutlined /></template>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<style>
/* Ported structure from official file-node.less; colors from product tokens. */
.file-attachment {
  margin: 0.75em 0;
  position: relative;
  border-radius: var(--sm-radius-base, 8px);
  overflow: hidden;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  user-select: none;
  transition: all 0.3s ease;
}
.file-attachment:hover {
  border-color: var(--sm-border-secondary);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.05);
}
.file-attachment.ProseMirror-selectednode {
  outline: none;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-brand);
  box-shadow: 0 0 0 2px rgb(0 85 135 / 0.1);
}
.file-attachment.uploading {
  opacity: 0.8;
  pointer-events: none;
}
.file-attachment.diff-added {
  outline: 2px solid var(--sm-color-success);
  outline-offset: 2px;
}
.file-attachment.diff-removed {
  outline: 2px solid var(--sm-color-error);
  outline-offset: 2px;
  opacity: 0.6;
}
.file-attachment .file-content,
.file-attachment .media-content {
  padding: 12px;
  transition: all 0.3s;
  background: var(--sm-bg-container);
  position: relative;
}
.file-attachment .attachment-button {
  position: relative;
  display: block;
  width: 100%;
}
.file-attachment .upload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
  z-index: 1;
}
.file-attachment .upload-spinner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-attachment .image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--sm-text-secondary);
}
.file-attachment .attachment-placeholder-icon {
  font-size: 24px;
}
.file-attachment .placeholder-text {
  margin: 0;
  text-align: center;
}
.file-attachment .image-container img {
  max-width: 100%;
  display: block;
  border-radius: var(--sm-radius-base, 8px);
}
.file-attachment .file-link-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}
.file-attachment .file-link-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  position: relative;
  width: 90%;
}
.file-attachment .file-type-icon {
  width: 32px;
  height: 32px;
  font-size: 28px;
  flex-shrink: 0;
}
.file-attachment .file-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.file-attachment .file-link {
  background: none;
  border: none;
  padding: 0;
  text-decoration: none;
  cursor: pointer;
  max-width: 100%;
  display: block;
  text-align: left;
}
.file-attachment .file-name {
  margin: 0;
  font-weight: 500;
  color: var(--sm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-attachment .file-name:hover {
  color: var(--sm-brand);
}
.file-attachment .file-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sm-text-tertiary);
  font-size: 13px;
}
.file-attachment .file-meta .upload-progress {
  flex: 1;
  height: 2px;
  background-color: var(--sm-text-quaternary);
  border-radius: 1px;
  overflow: hidden;
}
.file-attachment .file-meta .upload-progress::after {
  content: '';
  display: block;
  height: 100%;
  background-color: var(--sm-brand);
  transition: width 0.3s ease;
}
.file-attachment .separator {
  color: var(--sm-border-color);
}
.file-attachment .file-size {
  margin: 0;
  color: var(--sm-text-tertiary);
}
.file-attachment .video-player,
.file-attachment .audio-player {
  width: 100%;
}
</style>
