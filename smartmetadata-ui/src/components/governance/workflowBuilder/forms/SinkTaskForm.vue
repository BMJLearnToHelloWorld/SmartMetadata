<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Input, Select, Switch, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import { MASKED_PASSWORD_VALUE } from '@/constants/workflowBuilder';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official SinkTaskForm (pin a3012259ca): the git-sink configuration —
 * repository, branch, path, credentials, conflict handling, commit
 * template and author, signing key. Stored secrets are never shown: a
 * masked field keeps its value unless the user focuses it, in which case
 * the mask clears and typing replaces the secret; Backspace/Delete on a
 * pending-masked field clears it; replacing the signing key resets a
 * masked passphrase. A sink saved with another sink type keeps only its
 * stored git sinkConfig; any task fields the form does not render are
 * carried from the stored config. antd has no multiline password, so the
 * signing key renders as a plain textarea — documented, not worked around.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
}>();

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

interface SinkTaskFormData {
  displayName: string;
  description: string;
  repositoryUrl: string;
  branch: string;
  basePath: string;
  token: string;
  conflictResolution: string;
  commitMessageTemplate: string;
  authorName: string;
  authorEmail: string;
  signingPrivateKey: string;
  signingKeyPassphrase: string;
  allowUnsignedFastPush: boolean;
}

const CONFLICT_RESOLUTION_OPTIONS = [
  { value: 'overwriteExternal', label: 'workflows.builder.overwriteExternal' },
  { value: 'preserveExternal', label: 'workflows.builder.preserveExternal' },
  { value: 'fail', label: 'workflows.builder.fail' },
];

function buildSinkConnectionValues(config: Record<string, unknown>): SinkTaskFormData {
  return {
    displayName: '',
    description: '',
    repositoryUrl: (config.repositoryUrl as string) || '',
    branch: (config.branch as string) || 'main',
    basePath: (config.basePath as string) || 'metadata',
    token: (config.token as string) || '',
    conflictResolution: (config.conflictResolution as string) || 'overwriteExternal',
    commitMessageTemplate:
      (config.commitMessageTemplate as string) ||
      'Sync {entityType}: {entityName}',
    authorName: (config.authorName as string) || t('workflows.builder.brandNameBot'),
    // Official's literal default for the git commit author email; the
    // user supplies their own repository identity here.
    authorEmail: (config.authorEmail as string) || 'bot@openmetadata.org',
    signingPrivateKey: (config.signingPrivateKey as string) || '',
    signingKeyPassphrase: (config.signingKeyPassphrase as string) || '',
    allowUnsignedFastPush: (config.allowUnsignedFastPush as boolean) || false,
  };
}

const formData = ref<SinkTaskFormData>(buildSinkConnectionValues({}));
const storedSinkType = ref<string | undefined>(undefined);
const storedSinkConfig = ref<Record<string, unknown>>({});
const submittedData = ref<SinkTaskFormData>(buildSinkConnectionValues({}));
const pendingMasks = ref<Record<string, boolean>>({});

function syncFromNode(): void {
  const nodeConfig = (props.node.data?.config ?? {}) as Record<string, unknown>;
  const sinkConfig = (nodeConfig.sinkConfig ?? {}) as Record<string, unknown>;
  const data: SinkTaskFormData = buildSinkConnectionValues(sinkConfig);
  data.displayName = props.node.data?.displayName || props.node.data?.label || '';
  data.description = props.node.data?.description || '';
  // The stored secrets are masked until the user focuses a field.
  if (sinkConfig.token) {
    data.token = MASKED_PASSWORD_VALUE;
  }
  if (sinkConfig.signingPrivateKey) {
    data.signingPrivateKey = MASKED_PASSWORD_VALUE;
  }
  if (sinkConfig.signingKeyPassphrase) {
    data.signingKeyPassphrase = MASKED_PASSWORD_VALUE;
  }
  formData.value = data;
  storedSinkType.value = sinkConfig.sinkType as string | undefined;
  storedSinkConfig.value = sinkConfig;
  submittedData.value = data;
  pendingMasks.value = {};
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function maskField(field: keyof SinkTaskFormData): void {
  // Official only clears the field when it still shows the stored mask;
  // a value the user already typed must survive a refocus.
  if (formData.value[field] === MASKED_PASSWORD_VALUE) {
    pendingMasks.value = { ...pendingMasks.value, [field]: true };
    formData.value = { ...formData.value, [field]: '' };
  }
}

function unmaskField(field: keyof SinkTaskFormData): void {
  // Official restores the mask whenever the field is pending on blur
  // (the caller already guards on the field being empty); the previous
  // `if (secret)` guard could never fire at that point, so focus + blur
  // without typing left the secret empty and a save wiped it.
  pendingMasks.value = { ...pendingMasks.value, [field]: false };
  formData.value = { ...formData.value, [field]: MASKED_PASSWORD_VALUE };
}

function onSecretChange(field: keyof SinkTaskFormData, value: string): void {
  if (pendingMasks.value[field] && value === '') {
    // Backspace/Delete on a pending-masked field clears the secret.
    pendingMasks.value = { ...pendingMasks.value, [field]: false };
    formData.value = { ...formData.value, [field]: '' };
    return;
  }
  if (pendingMasks.value[field]) {
    pendingMasks.value = { ...pendingMasks.value, [field]: false };
    // Replacing the signing key resets a masked passphrase — but only
    // one that still stands for the stored passphrase; a passphrase the
    // user already re-typed is theirs to keep (official applySecretChange).
    if (
      field === 'signingPrivateKey' &&
      formData.value.signingKeyPassphrase === MASKED_PASSWORD_VALUE
    ) {
      formData.value = {
        ...formData.value,
        signingPrivateKey: value,
        signingKeyPassphrase: '',
      };
    } else {
      formData.value = { ...formData.value, [field]: value };
    }
    return;
  }
  formData.value = { ...formData.value, [field]: value };
}

function handleSecretFocus(field: keyof SinkTaskFormData): void {
  maskField(field);
}

function handleSecretBlur(field: keyof SinkTaskFormData): void {
  const secret = formData.value[field] as string;
  if (!secret && pendingMasks.value[field]) {
    unmaskField(field);
  }
}

function handleSecretKeyDown(field: keyof SinkTaskFormData, event: KeyboardEvent): void {
  if (
    (event.key === 'Backspace' || event.key === 'Delete') &&
    pendingMasks.value[field]
  ) {
    pendingMasks.value = { ...pendingMasks.value, [field]: false };
    formData.value = { ...formData.value, [field]: '' };
  }
}

function buildSinkConfig(data: SinkTaskFormData): Record<string, unknown> {
  return {
    sinkType: 'git',
    outputFormat: storedSinkConfig.value.outputFormat ?? 'yaml',
    repositoryUrl: data.repositoryUrl,
    branch: data.branch,
    basePath: data.basePath,
    token: data.token,
    conflictResolution: data.conflictResolution,
    commitMessageTemplate: data.commitMessageTemplate,
    authorName: data.authorName,
    authorEmail: data.authorEmail,
    ...(data.signingPrivateKey
      ? { signingPrivateKey: data.signingPrivateKey }
      : {}),
    ...(data.signingKeyPassphrase
      ? { signingKeyPassphrase: data.signingKeyPassphrase }
      : {}),
    ...(data.allowUnsignedFastPush ? { allowUnsignedFastPush: true } : {}),
  };
}

function handleSave(): void {
  const storedSinkConfigRecord = storedSinkConfig.value;
  const data: SinkTaskFormData = {
    ...formData.value,
    token:
      formData.value.token === MASKED_PASSWORD_VALUE
        ? (storedSinkConfigRecord.token as string) || ''
        : formData.value.token,
    signingPrivateKey:
      formData.value.signingPrivateKey === MASKED_PASSWORD_VALUE
        ? (storedSinkConfigRecord.signingPrivateKey as string) || ''
        : formData.value.signingPrivateKey,
    signingKeyPassphrase:
      formData.value.signingKeyPassphrase === MASKED_PASSWORD_VALUE
        ? (storedSinkConfigRecord.signingKeyPassphrase as string) || ''
        : formData.value.signingKeyPassphrase,
  };
  props.onSave(
    props.node.id,
    createNodeConfig({
      displayName: formData.value.displayName,
      description: formData.value.description,
      type: 'automatedTask',
      subType: 'sinkTask',
      config: {
        ...(storedSinkType.value === 'git' ? storedSinkConfigRecord : {}),
        sinkConfig: buildSinkConfig(data),
      },
    }),
  );
  // The passphrase field gates on the last submitted key.
  submittedData.value = data;
  props.onClose();
}

function handleDeleteNode(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="formData.displayName"
      :description="formData.description"
      :on-name-change="(value) => { formData.displayName = value; }"
      :on-description-change="(value) => { formData.description = value; }"
    />

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ t('workflows.builder.repositoryUrl') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Input
        data-testid="sink-repository-url-input"
        :value="formData.repositoryUrl"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterRepositoryUrl')"
        @update:value="(value) => { formData.repositoryUrl = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.branch') }}</label>
      <Input
        data-testid="sink-branch-input"
        :value="formData.branch"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterBranch')"
        @update:value="(value) => { formData.branch = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.basePath') }}</label>
      <Input
        data-testid="sink-base-path-input"
        :value="formData.basePath"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterBasePath')"
        @update:value="(value) => { formData.basePath = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ t('workflows.builder.token') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Input.Password
        data-testid="sink-token-input"
        :value="formData.token"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterToken')"
        @update:value="(value) => onSecretChange('token', value)"
        @focus="handleSecretFocus('token')"
        @blur="handleSecretBlur('token')"
        @keydown="(event) => handleSecretKeyDown('token', event as KeyboardEvent)"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.conflictResolution') }}</label>
      <Select
        data-testid="sink-conflict-resolution-select"
        :value="formData.conflictResolution || undefined"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.selectConflictResolution')"
        :options="CONFLICT_RESOLUTION_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.label) }))"
        style="width: 100%"
        @change="(value) => { formData.conflictResolution = String(value ?? ''); }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.commitMessageTemplate') }}</label>
      <Input
        data-testid="sink-commit-message-template-input"
        :value="formData.commitMessageTemplate"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterCommitMessageTemplate')"
        @update:value="(value) => { formData.commitMessageTemplate = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.authorName') }}</label>
      <Input
        data-testid="sink-author-name-input"
        :value="formData.authorName"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterAuthorName')"
        @update:value="(value) => { formData.authorName = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.authorEmail') }}</label>
      <Input
        data-testid="sink-author-email-input"
        :value="formData.authorEmail"
        :disabled="isFormDisabled"
        :placeholder="t('workflows.builder.enterAuthorEmail')"
        @update:value="(value) => { formData.authorEmail = value; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.signingPrivateKey') }}</label>
      <Input.TextArea
        data-testid="sink-signing-private-key-textarea"
        :value="formData.signingPrivateKey"
        :disabled="isFormDisabled"
        :rows="4"
        :placeholder="t('workflows.builder.enterSigningPrivateKey')"
        @update:value="(value) => onSecretChange('signingPrivateKey', value)"
        @focus="handleSecretFocus('signingPrivateKey')"
        @blur="handleSecretBlur('signingPrivateKey')"
        @keydown="(event) => handleSecretKeyDown('signingPrivateKey', event as KeyboardEvent)"
      />
      <Typography.Text type="secondary" style="font-size: 14px">
        {{ t('workflows.builder.signingPrivateKeyHint') }}
      </Typography.Text>
      <Typography.Text v-if="formData.signingPrivateKey === MASKED_PASSWORD_VALUE" type="secondary" style="font-size: 14px">
        {{ t('workflows.builder.signingPrivateKeyConfigured') }}
      </Typography.Text>
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.signingKeyPassphrase') }}</label>
      <Input.Password
        data-testid="sink-signing-key-passphrase-input"
        :value="formData.signingKeyPassphrase"
        :disabled="isFormDisabled || !submittedData.signingPrivateKey"
        :placeholder="t('workflows.builder.enterSigningKeyPassphrase')"
        @update:value="(value) => onSecretChange('signingKeyPassphrase', value)"
        @focus="handleSecretFocus('signingKeyPassphrase')"
        @blur="handleSecretBlur('signingKeyPassphrase')"
        @keydown="(event) => handleSecretKeyDown('signingKeyPassphrase', event as KeyboardEvent)"
      />
    </div>

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.allowUnsignedFastPush') }}</label>
      <Switch
        :checked="formData.allowUnsignedFastPush"
        :disabled="isFormDisabled"
        @change="(value) => { formData.allowUnsignedFastPush = Boolean(value); }"
      />
    </div>

    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="
        !isValidString(formData.displayName) ||
        !isValidString(formData.repositoryUrl) ||
        !isValidString(formData.token)
      "
      :on-cancel="onClose"
      :on-delete="handleDeleteNode"
      :on-save="handleSave"
    />
  </div>
</template>
