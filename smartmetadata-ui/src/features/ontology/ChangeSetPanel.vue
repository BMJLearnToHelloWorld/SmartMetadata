<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select, Space, Table, Typography, message } from 'ant-design-vue';
import {
  applyOntologyChangeSet,
  createOntologyChangeSet,
  deleteOntologyChangeSet,
  discardOntologyChangeSet,
  getOntologyChangeSet,
  listOntologyChangeSets,
  redoOntologyChangeSet,
  replaceOntologyChangeOperations,
  submitOntologyChangeSet,
  undoOntologyChangeSet,
} from '@/api/ontologyEdit';
import type {
  OntologyChangeOperation,
  OntologyChangeOperationType,
  OntologyChangeSet,
} from '@/types/ontologyEdit';

const props = defineProps<{
  ontologyId: string;
  ontologyFqn: string;
  lease: { sessionId: string; version: number } | null;
  canEdit: boolean;
  canApply: boolean;
}>();

const { t } = useI18n();

const OPERATION_TYPES: OntologyChangeOperationType[] = [
  'CREATE_GLOSSARY',
  'CREATE_TERM',
  'UPDATE_TERM',
  'DELETE_TERM',
  'ADD_RELATIONSHIP',
  'UPDATE_RELATIONSHIP',
  'DELETE_RELATIONSHIP',
  'UPSERT_MAPPING',
  'DELETE_MAPPING',
  'UPSERT_AXIOM',
  'DELETE_AXIOM',
  'UPSERT_CONCEPT',
  'DELETE_CONCEPT',
  'UPSERT_PROPERTY',
  'DELETE_PROPERTY',
];

const drafts = ref<OntologyChangeSet[]>([]);
const selectedId = ref<string | undefined>(undefined);
const draft = ref<OntologyChangeSet | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const busyAction = ref('');

const createForm = ref({ name: '', displayName: '', description: '' });
const opForm = ref({ type: 'UPSERT_CONCEPT' as OntologyChangeOperationType, targetId: '', rationale: '', confidence: '' });

const canUseLease = computed(() => props.canEdit && !!props.lease && draft.value?.state === 'DRAFT');
const cursor = computed(() => draft.value?.undoCursor ?? draft.value?.operations.length ?? 0);

const columns = computed(() => [
  { title: t('ontology.edit.opType'), dataIndex: 'operationType', key: 'operationType' },
  { title: t('ontology.edit.opTarget'), dataIndex: 'targetId', key: 'targetId' },
  { title: t('ontology.edit.opState'), dataIndex: 'state', key: 'state' },
  { title: t('ontology.edit.opRationale'), dataIndex: 'rationale', key: 'rationale' },
]);

function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function loadDrafts(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listOntologyChangeSets({ state: 'DRAFT,SUBMITTED', limit: 50 });
    drafts.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftsFailed');
  } finally {
    loading.value = false;
  }
}

async function selectDraft(id: string): Promise<void> {
  selectedId.value = id;
  errorMessage.value = '';
  try {
    draft.value = await getOntologyChangeSet(id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  }
}

async function onCreate(): Promise<void> {
  if (!props.canEdit || !createForm.value.name || !createForm.value.displayName || !createForm.value.description) {
    return;
  }
  busyAction.value = 'create';
  errorMessage.value = '';
  try {
    const created = await createOntologyChangeSet({
      name: createForm.value.name,
      displayName: createForm.value.displayName,
      description: createForm.value.description,
      ontology: props.ontologyFqn || undefined,
    });
    message.success(t('ontology.edit.draftCreated', { name: created.name }));
    createForm.value = { name: '', displayName: '', description: '' };
    await loadDrafts();
    await selectDraft(created.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busyAction.value = '';
  }
}

async function replaceOps(operations: OntologyChangeOperation[], nextCursor: number): Promise<void> {
  if (!draft.value || !props.lease) {
    return;
  }
  draft.value = await replaceOntologyChangeOperations(draft.value.id, {
    lease: props.lease,
    operations,
    undoCursor: nextCursor,
  });
}

async function onAddOperation(): Promise<void> {
  if (!canUseLease.value || !draft.value) {
    return;
  }
  busyAction.value = 'op';
  errorMessage.value = '';
  try {
    const base = draft.value.operations.slice(0, cursor.value);
    const op: OntologyChangeOperation = {
      id: newOpId(),
      operationType: opForm.value.type,
      state: 'ACTIVE',
      targetId: opForm.value.targetId || undefined,
      rationale: opForm.value.rationale || undefined,
      confidence: opForm.value.confidence ? Number(opForm.value.confidence) : undefined,
    };
    const next = [...base, op];
    await replaceOps(next, next.length);
    opForm.value = { type: 'UPSERT_CONCEPT', targetId: '', rationale: '', confidence: '' };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busyAction.value = '';
  }
}

async function onRemoveOperation(id: string): Promise<void> {
  if (!canUseLease.value || !draft.value) {
    return;
  }
  busyAction.value = 'op';
  errorMessage.value = '';
  try {
    const next = draft.value.operations.filter((op) => op.id !== id);
    await replaceOps(next, Math.min(cursor.value, next.length));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busyAction.value = '';
  }
}

async function runCommand(action: 'undo' | 'redo' | 'submit' | 'discard' | 'apply'): Promise<void> {
  if (!draft.value || !props.lease) {
    return;
  }
  busyAction.value = action;
  errorMessage.value = '';
  try {
    const runner = { undo: undoOntologyChangeSet, redo: redoOntologyChangeSet, submit: submitOntologyChangeSet, discard: discardOntologyChangeSet, apply: applyOntologyChangeSet }[action];
    draft.value = await runner(draft.value.id, props.lease);
    message.success(t('ontology.edit.draftCommandOk', { action }));
    await loadDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busyAction.value = '';
  }
}

async function onDelete(): Promise<void> {
  if (!draft.value) {
    return;
  }
  busyAction.value = 'delete';
  errorMessage.value = '';
  try {
    await deleteOntologyChangeSet(draft.value.id);
    draft.value = null;
    selectedId.value = undefined;
    await loadDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busyAction.value = '';
  }
}

watch(() => props.ontologyId, () => {
  draft.value = null;
  selectedId.value = undefined;
  void loadDrafts();
});

// Selection loads the draft whether it came from a click or a
// programmatic v-model update (both paths must fetch the same draft).
watch(selectedId, (id) => {
  if (id) {
    void selectDraft(id);
  }
});

onMounted(() => {
  void loadDrafts();
});
</script>

<template>
  <Card data-testid="ontology-changeset-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.draftsTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline" data-testid="ontology-draft-create-form">
        <Form.Item :label="t('ontology.edit.draftName')">
          <Input v-model:value="createForm.name" data-testid="ontology-draft-name" />
        </Form.Item>
        <Form.Item :label="t('ontology.edit.draftDisplayName')">
          <Input v-model:value="createForm.displayName" data-testid="ontology-draft-display-name" />
        </Form.Item>
        <Form.Item :label="t('ontology.edit.draftDescription')">
          <Input v-model:value="createForm.description" data-testid="ontology-draft-description" />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            :disabled="!canEdit || !createForm.name || !createForm.displayName || !createForm.description"
            :loading="busyAction === 'create'"
            data-testid="ontology-draft-create"
            @click="onCreate"
          >
            {{ t('ontology.edit.createDraft') }}
          </Button>
        </Form.Item>
      </Form>
      <Select
        v-model:value="selectedId"
        style="width: 100%"
        :placeholder="t('ontology.edit.selectDraft')"
        data-testid="ontology-draft-select"
      >
        <Select.Option v-for="item in drafts" :key="item.id" :value="item.id">
          {{ item.displayName || item.name }} ({{ item.state }})
        </Select.Option>
      </Select>
      <div v-if="draft" data-testid="ontology-draft-detail">
        <Typography.Text>
          {{ t('ontology.edit.draftState', { state: draft.state ?? '', cursor: cursor, total: draft.operations.length }) }}
        </Typography.Text>
        <Table
          :columns="columns"
          :data-source="draft.operations.map((op) => ({ ...op, key: op.id }))"
          :pagination="false"
          data-testid="ontology-draft-operations"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'operationType'">
              <span :style="{ textDecoration: (record as OntologyChangeOperation).state === 'UNDONE' ? 'line-through' : 'none' }">
                {{ (record as OntologyChangeOperation).operationType }}
              </span>
              <Button
                v-if="canUseLease"
                type="link"
                danger
                size="small"
                :data-testid="`ontology-op-remove-${(record as OntologyChangeOperation).id}`"
                @click="onRemoveOperation((record as OntologyChangeOperation).id)"
              >
                {{ t('ontology.edit.removeOp') }}
              </Button>
            </template>
          </template>
        </Table>
        <Form v-if="canUseLease" layout="inline" style="margin-top: 12px" data-testid="ontology-op-add-form">
          <Form.Item :label="t('ontology.edit.opType')">
            <Select v-model:value="opForm.type" style="width: 180px" data-testid="ontology-op-type">
              <Select.Option v-for="type in OPERATION_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item :label="t('ontology.edit.opTarget')">
            <Input v-model:value="opForm.targetId" data-testid="ontology-op-target" />
          </Form.Item>
          <Form.Item :label="t('ontology.edit.opRationale')">
            <Input v-model:value="opForm.rationale" data-testid="ontology-op-rationale" />
          </Form.Item>
          <Form.Item :label="t('ontology.edit.opConfidence')">
            <Input v-model:value="opForm.confidence" data-testid="ontology-op-confidence" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" :loading="busyAction === 'op'" data-testid="ontology-op-add" @click="onAddOperation">
              {{ t('ontology.edit.addOp') }}
            </Button>
          </Form.Item>
        </Form>
        <Typography.Text v-else-if="!lease" type="warning" data-testid="ontology-draft-lock-required">
          {{ t('ontology.edit.draftLockRequired') }}
        </Typography.Text>
        <Space style="margin-top: 12px">
          <Button :disabled="!canUseLease" :loading="busyAction === 'undo'" data-testid="ontology-draft-undo" @click="runCommand('undo')">
            {{ t('ontology.edit.undo') }}
          </Button>
          <Button :disabled="!canUseLease" :loading="busyAction === 'redo'" data-testid="ontology-draft-redo" @click="runCommand('redo')">
            {{ t('ontology.edit.redo') }}
          </Button>
          <Button :disabled="!canUseLease" :loading="busyAction === 'submit'" data-testid="ontology-draft-submit" @click="runCommand('submit')">
            {{ t('ontology.edit.submit') }}
          </Button>
          <Button
            type="primary"
            :disabled="!canApply || !props.lease || (draft.state !== 'DRAFT' && draft.state !== 'SUBMITTED')"
            :loading="busyAction === 'apply'"
            data-testid="ontology-draft-apply"
            @click="runCommand('apply')"
          >
            {{ t('ontology.edit.apply') }}
          </Button>
          <Button :disabled="!canUseLease" danger :loading="busyAction === 'discard'" data-testid="ontology-draft-discard" @click="runCommand('discard')">
            {{ t('ontology.edit.discard') }}
          </Button>
          <Button :disabled="!canEdit" danger :loading="busyAction === 'delete'" data-testid="ontology-draft-delete" @click="onDelete">
            {{ t('ontology.edit.deleteDraft') }}
          </Button>
        </Space>
      </div>
      <Typography.Text v-else-if="!loading">{{ t('ontology.edit.noDraftSelected') }}</Typography.Text>
    </Space>
  </Card>
</template>
