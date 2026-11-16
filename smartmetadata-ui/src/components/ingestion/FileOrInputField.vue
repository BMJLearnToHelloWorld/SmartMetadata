<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Input } from 'ant-design-vue';
import { DeleteOutlined, FileOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import {
  CREDENTIAL_FILE_ERROR_KEYS,
  DEFAULT_CREDENTIAL_FILE_MAX_SIZE,
  getReadableFileSize,
  NonTextCredentialError,
  readCredentialText,
  validateCredentialFile,
  type CredentialFileErrorKind,
} from '@/ingestion/credentialFiles';

/**
 * Port of official CredentialFileInput + the fileOrInput branch of
 * CorePasswordWidget (pin a3012259ca): a `format: password` field
 * whose content comes from a local file — picker or drag-and-drop —
 * or, when manual input is allowed, from pasted text. The file is
 * read in the browser and its text becomes the value; nothing is
 * uploaded. A stored (masked) value shows a credential row instead
 * of an invented file chip; removing it clears the value exactly as
 * emptying the input did. The drop zone and the textarea offer one
 * value, so only one is shown at a time: once a file is attached,
 * its chip stands for the credential.
 *
 * The pasted-content control is a plain textarea: ant-design-vue has
 * no masked multiline input, and the fork's SSL leaves are textareas
 * today. Validation (extension allow-list, 1 MB limit, strict UTF-8)
 * follows pin exactly.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    /** True when the server returned a mask for a stored secret. */
    hasStoredValue?: boolean;
    /** Schema `accept` list, e.g. ['.pem', '.crt', '.cer']. */
    acceptedFileTypes?: string[];
    maxSizeBytes?: number;
    /** False renders the upload-only `file` variant. */
    allowManualInput?: boolean;
    label?: string;
    hint?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    testId?: string;
  }>(),
  {
    modelValue: undefined,
    hasStoredValue: false,
    acceptedFileTypes: undefined,
    maxSizeBytes: DEFAULT_CREDENTIAL_FILE_MAX_SIZE,
    allowManualInput: true,
    label: undefined,
    hint: undefined,
    placeholder: undefined,
    disabled: false,
    readonly: false,
    required: false,
    testId: 'file-or-input',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined];
  'validation-error': [message: string, kind: CredentialFileErrorKind];
  focus: [];
  blur: [];
}>();

const { t } = useI18n();

interface SelectedFile {
  name: string;
  size: number;
}

const fileMeta = ref<SelectedFile | null>(null);
const errorKind = ref<CredentialFileErrorKind | null>(null);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
// Ant forwards both the native input and change events for one edit,
// so one keystroke would emit the same value twice; the guard below
// drops the repeat. It tracks the prop so an external change
// re-arms emission for the value the parent now holds.
let lastManualEmitted: string | undefined =
  props.modelValue === '' ? undefined : props.modelValue;

watch(
  () => props.modelValue,
  (value) => {
    lastManualEmitted = value === '' ? undefined : value;
  },
);

const hasValue = computed(() => typeof props.modelValue === 'string' && props.modelValue.length > 0);
const isInteractionDisabled = computed(() => props.disabled || props.readonly);

watch(hasValue, (value) => {
  if (!value) {
    fileMeta.value = null;
  }
});

const standsForStoredCredential = computed(
  () => !fileMeta.value && (props.hasStoredValue || (hasValue.value && !props.allowManualInput)),
);
const hasCredential = computed(() => Boolean(fileMeta.value) || standsForStoredCredential.value);

function messageFor(kind: CredentialFileErrorKind): string {
  const key = CREDENTIAL_FILE_ERROR_KEYS[kind];
  if (kind === 'sizeLimit') {
    return t(key, { size: getReadableFileSize(props.maxSizeBytes) });
  }
  if (kind === 'unacceptedType') {
    return t(key, {
      formats: props.acceptedFileTypes?.join(', ') ?? t('forms.credentialFile.file'),
    });
  }
  return t(key);
}

const errorMessage = computed(() =>
  errorKind.value ? messageFor(errorKind.value) : undefined,
);

const formatHint = computed(() =>
  t('forms.credentialFile.formatSize', {
    formats: props.acceptedFileTypes?.join(', ') ?? t('forms.credentialFile.file'),
    size: getReadableFileSize(props.maxSizeBytes),
  }),
);

function reject(kind: CredentialFileErrorKind): void {
  errorKind.value = kind;
  emit('validation-error', messageFor(kind), kind);
}

async function handleFile(file: File | undefined): Promise<void> {
  if (!file || isInteractionDisabled.value) {
    return;
  }
  errorKind.value = null;
  const invalid = validateCredentialFile(file, props.acceptedFileTypes, props.maxSizeBytes);
  if (invalid) {
    reject(invalid);
    return;
  }
  try {
    const content = await readCredentialText(file);
    fileMeta.value = { name: file.name, size: file.size };
    emit('update:modelValue', content);
  } catch (error) {
    reject(error instanceof NonTextCredentialError ? 'binary' : 'unreadable');
  }
}

function handleRemove(): void {
  fileMeta.value = null;
  errorKind.value = null;
  emit('update:modelValue', undefined);
}

function handleManualChange(text: string): void {
  errorKind.value = null;
  const next = text === '' ? undefined : text;
  if (next === lastManualEmitted) {
    return;
  }
  lastManualEmitted = next;
  emit('update:modelValue', next);
}

function onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  void handleFile(input.files?.[0]);
  input.value = '';
}
</script>

<template>
  <div :data-testid="testId" class="file-or-input">
    <label v-if="label" class="file-or-input-label">
      {{ label }}<span v-if="required" class="file-or-input-required">*</span>
    </label>

    <div v-if="fileMeta" class="file-or-input-row" data-testid="credential-file-chip">
      <FileOutlined class="file-or-input-row-icon" />
      <div class="file-or-input-row-text">
        <p data-testid="credential-file-name">{{ fileMeta.name }}</p>
        <p>{{ getReadableFileSize(fileMeta.size) }}</p>
      </div>
      <Button
        type="text"
        danger
        :disabled="isInteractionDisabled"
        data-testid="credential-file-remove"
        :aria-label="t('crud.remove')"
        @click="handleRemove"
      >
        <template #icon><DeleteOutlined /></template>
      </Button>
    </div>

    <div
      v-else-if="standsForStoredCredential"
      class="file-or-input-row"
      data-testid="credential-stored-value"
    >
      <div class="file-or-input-row-text">
        <p>{{ t('forms.credentialFile.savedCredential') }}</p>
        <p>{{ t('forms.credentialFile.savedHint') }}</p>
      </div>
      <Button
        type="text"
        danger
        :disabled="isInteractionDisabled"
        data-testid="credential-file-remove"
        :aria-label="t('crud.remove')"
        @click="handleRemove"
      >
        <template #icon><DeleteOutlined /></template>
      </Button>
    </div>

    <div v-if="!hasCredential" class="file-or-input-dropzone-wrap">
      <div
        :class="['file-or-input-dropzone', { dragover: dragOver, invalid: errorKind !== null }]"
        data-testid="credential-file-dropzone"
        @click="fileInput?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="
          dragOver = false;
          void handleFile($event.dataTransfer?.files?.[0]);
        "
      >
        <UploadOutlined />
        <span>{{ t('forms.credentialFile.clickToUpload') }}</span>
        <span>{{ t('forms.credentialFile.orDragAndDrop') }}</span>
        <span class="file-or-input-format-hint">{{ formatHint }}</span>
      </div>
      <input
        ref="fileInput"
        type="file"
        hidden
        :accept="acceptedFileTypes?.join(',')"
        :disabled="isInteractionDisabled"
        data-testid="credential-file-input"
        @change="onFileInputChange"
      />
    </div>

    <template v-if="allowManualInput && !hasCredential">
      <div class="file-or-input-divider">
        <span>{{ t('forms.credentialFile.or') }}</span>
      </div>
      <Input.TextArea
        :value="modelValue ?? ''"
        :rows="6"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :aria-label="t('forms.credentialFile.enterContent')"
        :data-testid="`${testId}-textarea`"
        @change="handleManualChange(($event.target as HTMLTextAreaElement).value)"
        @focus="emit('focus')"
        @blur="emit('blur')"
      />
    </template>

    <p
      v-if="errorMessage || hint"
      :class="['file-or-input-hint', { invalid: errorKind !== null }]"
      :role="errorMessage ? 'alert' : undefined"
    >
      {{ errorMessage ?? hint }}
    </p>
  </div>
</template>

<style scoped>
.file-or-input {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
}

.file-or-input-label {
  font-weight: 500;
}

.file-or-input-required {
  margin-left: 4px;
  color: var(--sm-color-error);
}

.file-or-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
}

.file-or-input-row-icon {
  font-size: 20px;
  color: var(--sm-text-tertiary);
}

.file-or-input-row-text {
  min-width: 0;
  flex: 1;
}

.file-or-input-row-text p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-or-input-row-text p + p {
  color: var(--sm-text-tertiary);
}

.file-or-input-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  border: 1px dashed var(--sm-border-color);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
}

.file-or-input-dropzone.dragover {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
}

.file-or-input-dropzone.invalid {
  border-color: var(--sm-color-error);
}

.file-or-input-format-hint {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.file-or-input-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sm-text-tertiary);
}

.file-or-input-divider::before,
.file-or-input-divider::after {
  flex: 1;
  height: 1px;
  background: var(--sm-border-secondary);
  content: '';
}

.file-or-input-hint {
  margin: 0;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.file-or-input-hint.invalid {
  color: var(--sm-color-error);
}
</style>
