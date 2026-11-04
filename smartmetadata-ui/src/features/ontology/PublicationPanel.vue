<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import {
  activateOntologyRelease,
  captureOntologyRelease,
  getOntologyReleaseValidation,
  getOntologyState,
} from '@/api/ontologyEdit';
import type { OntologyReleaseValidation, OntologyState } from '@/types/ontologyEdit';

const props = defineProps<{
  ontologyId: string;
  ontologyName: string;
  canApply: boolean;
}>();

const { t } = useI18n();

const state = ref<OntologyState | null>(null);
const versionBump = ref('minor');
const releaseNotes = ref('');
const activateReleaseId = ref('');
const validation = ref<OntologyReleaseValidation | null>(null);
const errorMessage = ref('');
const busy = ref('');

async function loadState(): Promise<void> {
  if (!props.ontologyId) {
    return;
  }
  try {
    state.value = await getOntologyState(props.ontologyId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.publicationFailed');
  }
}

async function onCapture(): Promise<void> {
  if (!props.canApply || !state.value || state.value.workingRevision === undefined) {
    return;
  }
  busy.value = 'capture';
  errorMessage.value = '';
  try {
    // Capture needs the CURRENT working revision: the server rejects a
    // stale revision, so the state is re-read immediately before capture
    // rather than trusting a revision loaded minutes earlier.
    const fresh = await getOntologyState(props.ontologyId);
    state.value = fresh;
    if (fresh.workingRevision === undefined) {
      throw new Error(t('ontology.edit.noWorkingRevision'));
    }
    const release = await captureOntologyRelease(props.ontologyId, {
      expectedWorkingRevision: fresh.workingRevision,
      versionBump: versionBump.value,
      releaseNotes: releaseNotes.value || undefined,
    });
    const releaseId = typeof release.id === 'string' ? release.id : '';
    if (releaseId) {
      activateReleaseId.value = releaseId;
    }
    message.success(t('ontology.edit.releaseCaptured'));
    await loadState();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.publicationFailed');
  } finally {
    busy.value = '';
  }
}

async function onValidate(): Promise<void> {
  if (!activateReleaseId.value) {
    return;
  }
  busy.value = 'validate';
  errorMessage.value = '';
  try {
    validation.value = await getOntologyReleaseValidation(activateReleaseId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.publicationFailed');
  } finally {
    busy.value = '';
  }
}

async function onActivate(): Promise<void> {
  if (!props.canApply || !activateReleaseId.value || !state.value || state.value.activationRevision === undefined) {
    return;
  }
  busy.value = 'activate';
  errorMessage.value = '';
  try {
    const fresh = await getOntologyState(props.ontologyId);
    state.value = fresh;
    if (fresh.activationRevision === undefined) {
      throw new Error(t('ontology.edit.noActivationRevision'));
    }
    await activateOntologyRelease(props.ontologyId, {
      releaseId: activateReleaseId.value,
      expectedActivationRevision: fresh.activationRevision,
    });
    message.success(t('ontology.edit.releaseActivated'));
    await loadState();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.publicationFailed');
  } finally {
    busy.value = '';
  }
}

watch(() => props.ontologyId, () => {
  state.value = null;
  validation.value = null;
  void loadState();
});

onMounted(() => {
  void loadState();
});
</script>

<template>
  <Card data-testid="ontology-publication-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.publicationTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Typography.Text v-if="state" data-testid="ontology-publication-state">
        {{ t('ontology.edit.stateSummary', { working: state.workingRevision ?? '', last: state.lastReleaseRevision ?? '', active: state.activeReleaseId ?? '', activation: state.activationRevision ?? '' }) }}
      </Typography.Text>
      <Form layout="inline" data-testid="ontology-publication-form">
        <Form.Item :label="t('ontology.edit.versionBump')">
          <Select v-model:value="versionBump" style="width: 120px" data-testid="ontology-publication-bump">
            <Select.Option value="major">major</Select.Option>
            <Select.Option value="minor">minor</Select.Option>
            <Select.Option value="patch">patch</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('ontology.edit.releaseNotes')"><Input v-model:value="releaseNotes" data-testid="ontology-publication-notes" /></Form.Item>
        <Form.Item>
          <Button
            type="primary"
            :disabled="!canApply || !state || state.workingRevision === undefined"
            :loading="busy === 'capture'"
            data-testid="ontology-publication-capture"
            @click="onCapture"
          >
            {{ t('ontology.edit.captureRelease') }}
          </Button>
        </Form.Item>
      </Form>
      <Form layout="inline" data-testid="ontology-activation-form">
        <Form.Item :label="t('ontology.edit.releaseId')"><Input v-model:value="activateReleaseId" data-testid="ontology-activation-release-id" /></Form.Item>
        <Form.Item>
          <Button :disabled="!activateReleaseId" :loading="busy === 'validate'" data-testid="ontology-release-validate" @click="onValidate">
            {{ t('ontology.edit.validateRelease') }}
          </Button>
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            :disabled="!canApply || !activateReleaseId || !state || state.activationRevision === undefined"
            :loading="busy === 'activate'"
            data-testid="ontology-release-activate"
            @click="onActivate"
          >
            {{ t('ontology.edit.activateRelease') }}
          </Button>
        </Form.Item>
      </Form>
      <div v-if="validation" data-testid="ontology-release-validation">
        <Typography.Text :type="validation.valid ? 'success' : 'danger'">
          {{ t('ontology.edit.validationSummary', { valid: validation.valid ? t('ontology.edit.validYes') : t('ontology.edit.validNo'), errors: validation.errors?.length ?? 0, warnings: validation.warnings?.length ?? 0 }) }}
        </Typography.Text>
        <ul>
          <li v-for="(issue, index) in [...(validation.errors ?? []), ...(validation.warnings ?? [])]" :key="index">
            {{ issue.message ?? '' }} ({{ issue.path ?? '' }})
          </li>
        </ul>
      </div>
    </Space>
  </Card>
</template>
