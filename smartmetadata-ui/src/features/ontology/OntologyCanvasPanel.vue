<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import { listOntologyConcepts } from '@/api/ontology';
import {
  listOntologyChangeSets,
  replaceOntologyChangeOperations,
} from '@/api/ontologyEdit';
import type { OntologyConcept } from '@/types/ontology';
import type {
  OntologyChangeOperation,
  OntologyChangeSet,
} from '@/types/ontologyEdit';
import OntologyGraphCanvas from './OntologyGraphCanvas.vue';
import { buildOntologyGraphData } from './ontologyGraph';

/**
 * Canvas panel for the ontology studio. The graph shows the ontology's
 * concepts (super-class edges) plus draft-preview nodes/edges from the
 * selected DRAFT change set, so a queued edit is visible before apply.
 * A confirmed canvas relation is appended to the selected draft as an
 * ADD_RELATIONSHIP operation through replaceOntologyChangeOperations
 * (the E2 draft mechanism, same cursor pattern as ChangeSetPanel); a
 * canvas-added concept is appended as an UPSERT_CONCEPT operation. No
 * canvas gesture writes directly to the ontology — without a selected
 * DRAFT change set and an authoring lease, editing is disabled.
 */
const props = defineProps<{
  ontologyId: string;
  ontologyFqn: string;
  lease: { sessionId: string; version: number } | null;
  canEdit: boolean;
}>();

const { t } = useI18n();
const concepts = ref<OntologyConcept[]>([]);
const drafts = ref<OntologyChangeSet[]>([]);
const selectedDraftId = ref<string | undefined>(undefined);
const draft = ref<OntologyChangeSet | null>(null);
const errorMessage = ref('');
const busy = ref(false);
const newConceptName = ref('');

const canUseLease = computed(() => props.canEdit && !!props.lease && draft.value?.state === 'DRAFT');
const cursor = computed(() => draft.value?.undoCursor ?? draft.value?.operations.length ?? 0);

const graph = computed(() => {
  const base = buildOntologyGraphData(concepts.value);
  const previewNodes = [...base.nodes];
  const previewEdges = [...base.edges];
  for (const op of draft.value?.operations ?? []) {
    if (op.operationType === 'UPSERT_CONCEPT' && op.concept?.name && !previewNodes.some((node) => node.label === op.concept?.name)) {
      previewNodes.push({ id: `draft:${op.id}`, label: String(op.concept.name) });
    }
    if (op.operationType === 'ADD_RELATIONSHIP' && op.relationship) {
      const rel = op.relationship as Record<string, unknown>;
      const from = (rel.fromTerm as Record<string, unknown> | undefined)?.id;
      const to = (rel.toTerm as Record<string, unknown> | undefined)?.id;
      const type = (rel.relationshipType as Record<string, unknown> | undefined)?.name;
      if (typeof from === 'string' && typeof to === 'string') {
        previewEdges.push({
          id: `draft:${op.id}`,
          source: from,
          target: to,
          relationType: typeof type === 'string' ? type : 'subClassOf',
        });
      }
    }
  }
  return { nodes: previewNodes, edges: previewEdges };
});

function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function load(): Promise<void> {
  errorMessage.value = '';
  try {
    const [conceptPage, draftPage] = await Promise.all([
      listOntologyConcepts({ ontology: props.ontologyFqn, limit: 100 }),
      listOntologyChangeSets({ state: 'DRAFT', limit: 50 }),
    ]);
    concepts.value = conceptPage.data;
    drafts.value = draftPage.data;
    if (drafts.value.length && !selectedDraftId.value) {
      selectedDraftId.value = drafts.value[0]?.id;
      draft.value = drafts.value[0] ?? null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.canvasFailed');
  }
}

async function onSelectDraft(id: string): Promise<void> {
  selectedDraftId.value = id;
  draft.value = drafts.value.find((item) => item.id === id) ?? null;
}

async function appendOperation(op: OntologyChangeOperation): Promise<void> {
  if (!canUseLease.value || !draft.value || !props.lease) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const base = draft.value.operations.slice(0, cursor.value);
    const next = [...base, op];
    draft.value = await replaceOntologyChangeOperations(draft.value.id, {
      lease: props.lease,
      operations: next,
      undoCursor: next.length,
    });
    message.success(t('ontology.edit.canvasOpQueued'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.draftFailed');
  } finally {
    busy.value = false;
  }
}

async function onCreateRelation(payload: { fromId: string; toId: string; relationType: string }): Promise<void> {
  await appendOperation({
    id: newOpId(),
    operationType: 'ADD_RELATIONSHIP',
    state: 'ACTIVE',
    targetId: payload.toId,
    relationship: {
      fromTerm: { id: payload.fromId, type: 'ontologyConcept' },
      toTerm: { id: payload.toId, type: 'ontologyConcept' },
      relationshipType: { name: payload.relationType, type: 'relationshipType' },
    },
  });
}

async function onAddConcept(): Promise<void> {
  const name = newConceptName.value.trim();
  if (!name) {
    return;
  }
  await appendOperation({
    id: newOpId(),
    operationType: 'UPSERT_CONCEPT',
    state: 'ACTIVE',
    concept: { name },
  });
  newConceptName.value = '';
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card data-testid="ontology-canvas-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.canvasPanelTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline">
        <Form.Item :label="t('ontology.edit.selectDraft')">
          <Select
            :value="selectedDraftId"
            style="width: 240px"
            :placeholder="t('ontology.edit.noDraftSelected')"
            data-testid="ontology-canvas-draft"
            @update:value="(value) => onSelectDraft(value as string)"
          >
            <Select.Option v-for="item in drafts" :key="item.id" :value="item.id">
              {{ item.displayName || item.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('ontology.edit.name')">
          <Input
            v-model:value="newConceptName"
            :disabled="!canUseLease"
            data-testid="ontology-canvas-new-concept"
            :placeholder="t('ontology.edit.canvasNewConceptHint')"
          />
        </Form.Item>
        <Form.Item>
          <Button
            :disabled="!canUseLease || !newConceptName.trim()"
            :loading="busy"
            data-testid="ontology-canvas-add-concept"
            @click="onAddConcept"
          >
            {{ t('ontology.edit.canvasAddConcept') }}
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text v-if="!canUseLease" type="secondary">
        {{ t('ontology.edit.canvasLeaseRequired') }}
      </Typography.Text>
      <OntologyGraphCanvas :graph="graph" :can-edit="canUseLease" @create-relation="onCreateRelation" />
    </Space>
  </Card>
</template>
