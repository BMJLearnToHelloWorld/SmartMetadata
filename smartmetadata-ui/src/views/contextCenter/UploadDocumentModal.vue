<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Select } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import type { DriveFolder } from '@/types/contextCenter';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  folders: DriveFolder[];
  initialFolderFqn?: string;
}>();

const emit = defineEmits<{
  ok: [value: { file: File; folderFqn?: string }];
  cancel: [];
  'update:open': [open: boolean];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const folderFqn = ref<string | undefined>(undefined);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedFile.value = null;
      folderFqn.value = props.initialFolderFqn;
      if (fileInput.value) {
        fileInput.value.value = '';
      }
    }
  },
);

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

function onOk(): void {
  if (selectedFile.value) {
    emit('ok', { file: selectedFile.value, folderFqn: folderFqn.value });
  }
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('contextCenter.uploadDocument')"
    :ok-disabled="!selectedFile"
    test-id="upload-document-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('update:open', $event)"
  >
    <Form layout="vertical">
      <Form.Item :label="t('contextCenter.file')" required>
        <input
          ref="fileInput"
          type="file"
          data-testid="upload-document-input"
          @change="onFileChange"
        />
        <div v-if="selectedFile" data-testid="upload-document-name">
          {{ selectedFile.name }}
        </div>
      </Form.Item>
      <Form.Item :label="t('contextCenter.folder')">
        <Select
          v-model:value="folderFqn"
          allow-clear
          data-testid="upload-document-folder"
          :placeholder="t('contextCenter.noFolder')"
          :options="
            folders.map((folder) => ({
              value: folder.fullyQualifiedName ?? folder.name,
              label: folder.displayName || folder.name,
            }))
          "
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>
