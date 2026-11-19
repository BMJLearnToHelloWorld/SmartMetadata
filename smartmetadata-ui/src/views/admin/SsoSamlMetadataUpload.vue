<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { CheckOutlined, CloseOutlined } from '@ant-design/icons-vue';
import { Button } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  status: 'success' | 'error' | null;
  fileName: string;
}>();

const emit = defineEmits<{
  'file-upload': [files: FileList | File[]];
  'change-file': [];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

function handleFiles(files: FileList | File[] | null): void {
  if (files && files.length > 0) {
    emit('file-upload', files);
  }
}

function handleInputChange(event: Event): void {
  handleFiles((event.target as HTMLInputElement).files);
  // Reset so choosing the same file again still fires a change.
  (event.target as HTMLInputElement).value = '';
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  isDragging.value = false;
  // Accepted and unaccepted drops call the same handler (pin passes one
  // handler to both `onDropFiles` and `onDropUnacceptedFiles`).
  handleFiles(event.dataTransfer?.files ?? null);
}
</script>

<template>
  <div
    v-if="status === null"
    data-testid="file-uploader"
    :class="['sso-saml-dropzone', { 'sso-saml-dropzone-dragging': isDragging }]"
    @click="fileInput?.click()"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop="handleDrop"
  >
    <input
      ref="fileInput"
      accept=".xml,application/xml,text/xml"
      data-testid="file-upload-input"
      style="display: none"
      type="file"
      @change="handleInputChange"
      @click.stop
    />
    <span>{{ t('sso.uploadLowercase') }}</span>
    <span>{{ t('sso.uploadSamlMetadataXmlDescription') }}</span>
    <span>{{ t('sso.orDragAndDropAnXmlFileHere') }}</span>
  </div>

  <div v-else class="metadata-upload-status-container">
    <div>
      <span v-if="status === 'success'">
        <CheckOutlined :style="{ fontSize: '16px' }" />
      </span>
      <span v-else>
        <CloseOutlined :style="{ fontSize: '16px' }" />
      </span>
      <span v-if="status === 'success'">
        {{ t('sso.metadataXmlFileParsedSuccess', { fileName }) }}
      </span>
      <span v-else>
        {{ t('sso.metadataXmlFileParsedError', { fileName }) }}
      </span>
    </div>
    <Button
      data-testid="change-metadata-xml-btn"
      type="link"
      @click="emit('change-file')"
    >
      {{ t('sso.changeEntity', { entity: t('sso.file') }) }}
    </Button>
  </div>
</template>

<style scoped>
.metadata-upload-status-container {
  display: flex;
  justify-content: space-between;
}
</style>
