<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Space, Typography, message } from 'ant-design-vue';
import {
  acquireOntologyEditLock,
  getOntologyEditLock,
  releaseOntologyEditLock,
  renewOntologyEditLock,
} from '@/api/ontologyEdit';
import type { OntologyEditLock } from '@/types/ontologyEdit';

const props = defineProps<{
  ontologyId: string;
  ontologyName: string;
  canEdit: boolean;
  lock: OntologyEditLock | null;
  sessionId: string;
}>();

const emit = defineEmits<{
  'update:lock': [lock: OntologyEditLock | null];
  'update:sessionId': [sessionId: string];
}>();

const { t } = useI18n();
const busy = ref(false);
const errorMessage = ref('');

const holderIsOther = computed(() => {
  if (!props.lock || !props.lock.sessionId) {
    return false;
  }
  return props.lock.sessionId !== props.sessionId;
});

const mine = computed(() => !!props.lock && !holderIsOther.value && !!props.sessionId);

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function refresh(): Promise<void> {
  if (!props.ontologyId) {
    return;
  }
  try {
    const current = await getOntologyEditLock('ontology', props.ontologyId);
    emit('update:lock', current.sessionId ? current : null);
  } catch {
    // No active lock (or no view right): the bar shows unlocked rather
    // than failing the whole studio — editing stays gated off below.
    emit('update:lock', null);
  }
}

async function onAcquire(): Promise<void> {
  if (!props.canEdit || busy.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const sessionId = newSessionId();
    const lock = await acquireOntologyEditLock({
      resourceType: 'ontology',
      resourceId: props.ontologyId,
      sessionId,
    });
    emit('update:sessionId', sessionId);
    emit('update:lock', lock);
    message.success(t('ontology.edit.lockAcquired'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.lockFailed');
    // A failed acquire usually means someone else holds the lock — refresh
    // so the banner shows the real holder instead of a stale state.
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function onRenew(): Promise<void> {
  if (!mine.value || busy.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const lock = await renewOntologyEditLock({
      resourceType: 'ontology',
      resourceId: props.ontologyId,
      sessionId: props.sessionId,
    });
    emit('update:lock', lock);
    message.success(t('ontology.edit.lockRenewed'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.lockFailed');
  } finally {
    busy.value = false;
  }
}

async function onRelease(): Promise<void> {
  if (!mine.value || busy.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    await releaseOntologyEditLock('ontology', props.ontologyId, props.sessionId);
    emit('update:lock', null);
    message.success(t('ontology.edit.lockReleased'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.lockFailed');
  } finally {
    busy.value = false;
  }
}

watch(
  () => props.ontologyId,
  () => {
    errorMessage.value = '';
    void refresh();
  },
  { immediate: true },
);

defineExpose({ refresh });
</script>

<template>
  <Card data-testid="ontology-edit-lock">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.lockTitle') }}</Typography.Text>
      <Typography.Text v-if="!canEdit" type="warning" data-testid="ontology-edit-lock-denied">
        {{ t('ontology.edit.lockDenied') }}
      </Typography.Text>
      <Typography.Text v-else-if="holderIsOther" type="danger" data-testid="ontology-edit-lock-held">
        {{ t('ontology.edit.lockHeld', { holder: lock?.holder ?? '', expires: lock?.expiresAt ? new Date(lock.expiresAt).toLocaleString() : '' }) }}
      </Typography.Text>
      <Typography.Text v-else-if="mine" type="success" data-testid="ontology-edit-lock-mine">
        {{ t('ontology.edit.lockMine', { expires: lock?.expiresAt ? new Date(lock.expiresAt).toLocaleString() : '' }) }}
      </Typography.Text>
      <Typography.Text v-else data-testid="ontology-edit-lock-free">
        {{ t('ontology.edit.lockFree', { name: ontologyName }) }}
      </Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Space>
        <Button
          v-if="canEdit && !lock"
          type="primary"
          :loading="busy"
          data-testid="ontology-edit-lock-acquire"
          @click="onAcquire"
        >
          {{ t('ontology.edit.acquireLock') }}
        </Button>
        <Button
          v-if="canEdit && mine"
          :loading="busy"
          data-testid="ontology-edit-lock-renew"
          @click="onRenew"
        >
          {{ t('ontology.edit.renewLock') }}
        </Button>
        <Button
          v-if="canEdit && mine"
          danger
          :loading="busy"
          data-testid="ontology-edit-lock-release"
          @click="onRelease"
        >
          {{ t('ontology.edit.releaseLock') }}
        </Button>
        <Button data-testid="ontology-edit-lock-refresh" @click="refresh">
          {{ t('ontology.edit.refreshLock') }}
        </Button>
      </Space>
    </Space>
  </Card>
</template>
