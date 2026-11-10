<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Space, Typography } from 'ant-design-vue';
import type { OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';
import OntologyInferenceExplanationPanel from './OntologyInferenceExplanationPanel.vue';

/**
 * Relation details panel (official
 * components/OntologyExplorer/OntologyRelationDetailsPanel.tsx): the
 * read-only fields are always shown — Source, Target (originalLabel ??
 * label), Provenance, Status, Created by, Created at — plus the
 * inference explanation sub-panel (mounted always, renders only for
 * inferred edges).
 *
 * Stage 2 is view mode: isEditable is always false, so the editable
 * branch (relation-type / provenance / status selects, Save, Delete)
 * does not render; onUpdate/onDelete are not emitted. Editing stays in
 * the studio (stage 3 may wire the editable branch).
 */
const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { t } = useI18n();

const props = defineProps<{
  edge: OntologyGraphEdge;
  nodes: readonly OntologyGraphNode[];
  relationshipTypes?: Array<{ name: string; rdfPredicate?: string }>;
}>();

const sourceLabel = computed(
  () =>
    props.nodes.find((node) => node.id === props.edge.source)?.originalLabel ??
    props.nodes.find((node) => node.id === props.edge.source)?.label ??
    props.edge.source,
);
const targetLabel = computed(
  () =>
    props.nodes.find((node) => node.id === props.edge.target)?.originalLabel ??
    props.nodes.find((node) => node.id === props.edge.target)?.label ??
    props.edge.target,
);

function formatCreatedAt(value?: number): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}
</script>

<template>
  <Card data-testid="ontology-relation-details-panel" style="width: 300px; margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Space style="justify-content: space-between; width: 100%">
        <Typography.Text strong>{{ edge.label ?? edge.relationType }}</Typography.Text>
        <Button size="small" type="text" data-testid="ontology-relation-details-close" @click="emit('close')">
          {{ t('crud.close') }}
        </Button>
      </Space>
      <Space direction="vertical" :size="2" style="width: 100%">
        <Typography.Text>
          {{ t('ontology.browser.relationSource') }}: {{ sourceLabel }}
        </Typography.Text>
        <Typography.Text>
          {{ t('ontology.browser.relationTarget') }}: {{ targetLabel }}
        </Typography.Text>
        <Typography.Text>
          {{ t('ontology.browser.relationProvenance') }}: {{ edge.provenance ?? '—' }}
        </Typography.Text>
        <Typography.Text>
          {{ t('ontology.browser.relationStatus') }}: {{ edge.status ?? '—' }}
        </Typography.Text>
        <Typography.Text>
          {{ t('ontology.browser.relationCreatedBy') }}: {{ edge.createdBy ?? '—' }}
        </Typography.Text>
        <Typography.Text>
          {{ t('ontology.browser.relationCreatedAt') }}: {{ formatCreatedAt(edge.createdAt) }}
        </Typography.Text>
      </Space>
      <OntologyInferenceExplanationPanel
        :edge="edge"
        :nodes="nodes"
        :relationship-types="relationshipTypes ?? []"
      />
    </Space>
  </Card>
</template>
