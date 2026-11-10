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
import { useRouter } from 'vue-router';
import { Button, Card, Space, Typography } from 'ant-design-vue';
import type { GlossaryTerm } from '@/types/governance';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { ASSET_RELATION_TYPE } from '@/types/ontologyDataGraph';
import { getOntologyAssetPath } from './nativeDataGraph';
import type { OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';

/**
 * Entity panel (official components/OntologyExplorer/OntologyEntityPanel.tsx
 * + OntologyExplorer.tsx renderEntityPanel / renderOntologyRelationsSlot).
 * Shown for a data-asset node in any scope, and for any selected node in
 * a non-global scope in view mode. Content: the node's details plus the
 * relations slot — the graph edges touching the node, asset edges
 * excluded — with the other endpoint clickable.
 *
 * The product has no slideout entity-details component, so the details
 * render inline: term nodes show the full term (description, FQN,
 * glossary, owners, status) when the parent has loaded it; asset nodes
 * show the catalog reference (type, FQN, service, columns, lineage
 * notes) with an "Open asset" link to the asset route.
 */
const props = defineProps<{
  node: OntologyGraphNode;
  nodes: readonly OntologyGraphNode[];
  edges: readonly OntologyGraphEdge[];
  term?: GlossaryTerm | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'select-node', nodeId: string): void;
}>();

const { t } = useI18n();
const router = useRouter();

const isAsset = computed(() => props.node.type === 'dataAsset');
const assetPath = computed(() =>
  props.node.entityRef ? getOntologyAssetPath(props.node.entityRef) : undefined,
);
const relations = computed(() =>
  props.edges.filter(
    (edge) =>
      edge.relationType !== ASSET_RELATION_TYPE &&
      (edge.source === props.node.id || edge.target === props.node.id),
  ),
);

function otherEndpoint(edge: OntologyGraphEdge): OntologyGraphNode | undefined {
  const otherId = edge.source === props.node.id ? edge.target : edge.source;
  return props.nodes.find((node) => node.id === otherId);
}

function openAsset(): void {
  if (assetPath.value) {
    void router.push(assetPath.value);
  }
}

function openTermDetails(): void {
  void router.push({ name: 'governance-term', params: { id: props.node.id } });
}
</script>

<template>
  <Card data-testid="ontology-entity-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Space style="justify-content: space-between; width: 100%">
        <Typography.Text strong>{{ node.originalLabel ?? node.label }}</Typography.Text>
        <Button size="small" type="text" data-testid="ontology-entity-panel-close" @click="emit('close')">
          {{ t('crud.close') }}
        </Button>
      </Space>
      <template v-if="isAsset">
        <Typography.Text v-if="node.entityRef?.type" type="secondary">
          {{ node.entityRef.type }}
        </Typography.Text>
        <Typography.Text v-if="node.fullyQualifiedName" type="secondary">
          {{ node.fullyQualifiedName }}
        </Typography.Text>
        <Typography.Text v-if="node.serviceLabel" type="secondary">
          {{ node.serviceLabel }}
        </Typography.Text>
        <Typography.Text v-if="node.columnCount !== undefined" type="secondary">
          {{ node.columnCount }} {{ t('ontology.concepts.bindingColumns') }}
        </Typography.Text>
        <div v-if="node.lineageNotes?.length">
          <Typography.Text
            v-for="(note, index) in node.lineageNotes"
            :key="`${note.direction}:${note.label}:${index}`"
            type="secondary"
            style="display: block"
          >
            {{ note.direction === 'downstream' ? '↓' : '↑' }} {{ note.label }}
          </Typography.Text>
        </div>
        <Button v-if="assetPath" size="small" data-testid="ontology-entity-open-asset" @click="openAsset">
          {{ t('ontology.browser.openAsset') }}
        </Button>
      </template>
      <template v-else>
        <Typography.Text v-if="term?.description" type="secondary">{{ term.description }}</Typography.Text>
        <Typography.Text v-if="node.fullyQualifiedName" type="secondary">
          {{ node.fullyQualifiedName }}
        </Typography.Text>
        <Typography.Text v-if="term?.glossary" type="secondary">
          {{ t('terms.glossary') }}: {{ entityLabel(term.glossary) }}
        </Typography.Text>
        <Typography.Text v-if="term?.owners?.length" type="secondary">
          {{ t('ontology.owners') }}: {{ joinRefNames(term.owners) }}
        </Typography.Text>
        <Typography.Text v-if="term?.status" type="secondary">
          {{ t('ontology.browser.termStatus') }}: {{ term.status }}
        </Typography.Text>
        <Typography.Text v-if="node.description" type="secondary">{{ node.description }}</Typography.Text>
        <Button size="small" data-testid="ontology-entity-full-details" @click="openTermDetails">
          {{ t('ontology.browser.inspectorFullDetails') }}
        </Button>
      </template>
      <div data-testid="ontology-entity-relations">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorRelationships') }} ({{ relations.length }})
        </Typography.Title>
        <Typography.Paragraph v-if="relations.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="edge in relations" :key="edge.id" style="display: flex; gap: 8px">
          <Typography.Text>{{ edge.source === node.id ? '→' : '←' }}</Typography.Text>
          <Typography.Text>{{ edge.label ?? edge.relationType }}</Typography.Text>
          <a
            v-if="otherEndpoint(edge)"
            href="#"
            @click.prevent="emit('select-node', otherEndpoint(edge)?.id ?? '')"
          >
            {{ otherEndpoint(edge)?.originalLabel ?? otherEndpoint(edge)?.label }}
          </a>
        </div>
      </div>
    </Space>
  </Card>
</template>
