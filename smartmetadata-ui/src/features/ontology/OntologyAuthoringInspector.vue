<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Progress, Space, Typography, message } from 'ant-design-vue';
import { listGlossaryTermAssets } from '@/api/glossaryTerms';
import type { EntityRef } from '@/types/api';
import type { GlossaryTerm } from '@/types/governance';
import { entityLabel } from '@/features/crud/paging';
import { ASSET_RELATION_TYPE } from '@/types/ontologyDataGraph';
import type { OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';

/**
 * Authoring inspector, global glossary scope (official
 * components/OntologyExplorer/OntologyAuthoringInspector.tsx).
 * Stage 2 is view mode (isEditable is always false): sections in pin's
 * SECTION_ORDER — relationships, mappings, dataAssets — plus the
 * completeness bar over the three sections. Relationships come from the
 * GRAPH edges (asset edges excluded, as pin's OntologyNodeRelationsContent
 * does); mappings from the full term's conceptMappings; dataAssets from
 * the term-assets endpoint (total + read-only list with load-more).
 * No add-relation form (gated behind isEditable in pin), no delete
 * (gated by isRemovableRelation), no inline authoring. The full-details
 * link emits `show-full-details` (the parent routes to the term detail
 * page, which carries the term editor — so no separate Edit button is
 * rendered in stage 2).
 */
const props = defineProps<{
  node: OntologyGraphNode;
  nodes: readonly OntologyGraphNode[];
  edges: readonly OntologyGraphEdge[];
  term: GlossaryTerm | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'select-node', nodeId: string): void;
  (event: 'show-full-details', termId: string): void;
}>();

const { t } = useI18n();
const assets = ref<EntityRef[]>([]);
const assetTotal = ref(0);
const assetOffset = ref(0);
const assetsLoading = ref(false);

const relations = computed(() =>
  props.edges.filter(
    (edge) =>
      edge.relationType !== ASSET_RELATION_TYPE &&
      (edge.source === props.node.id || edge.target === props.node.id),
  ),
);
const mappings = computed(() => props.term?.conceptMappings ?? []);
const sectionCounts = computed(() => ({
  relationships: relations.value.length,
  mappings: mappings.value.length,
  dataAssets: assetTotal.value,
}));
const completedSectionCount = computed(
  () => Object.values(sectionCounts.value).filter((count) => count > 0).length,
);

function otherEndpoint(edge: OntologyGraphEdge): OntologyGraphNode | undefined {
  const otherId = edge.source === props.node.id ? edge.target : edge.source;
  return props.nodes.find((node) => node.id === otherId);
}

const hasMoreAssets = computed(() => assets.value.length < assetTotal.value);

async function loadAssets(offset = 0): Promise<void> {
  assetsLoading.value = true;
  try {
    // The assets endpoint paginates by numeric offset (GlossaryTermResource:
    // "Use limit and offset query params for pagination"), not by cursor.
    const page = await listGlossaryTermAssets(props.node.id, 25, offset);
    assets.value = offset > 0 ? [...assets.value, ...page.data] : page.data;
    assetTotal.value = page.total ?? page.data.length;
    assetOffset.value = offset + page.data.length;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    assetsLoading.value = false;
  }
}

onMounted(() => {
  assetTotal.value = props.node.assetCount ?? 0;
  void loadAssets();
});
watch(
  () => props.node.id,
  () => {
    assets.value = [];
    assetTotal.value = props.node.assetCount ?? 0;
    assetOffset.value = 0;
    void loadAssets();
  },
);
</script>

<template>
  <Card data-testid="ontology-authoring-inspector" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Space style="justify-content: space-between; width: 100%">
        <Typography.Text strong>{{ node.originalLabel ?? node.label }}</Typography.Text>
        <Button size="small" type="text" data-testid="ontology-authoring-inspector-close" @click="emit('close')">
          {{ t('crud.close') }}
        </Button>
      </Space>
      <Typography.Text v-if="term?.description" type="secondary">{{ term.description }}</Typography.Text>
      <div data-testid="ontology-authoring-completeness">
        <Typography.Text type="secondary">
          {{ t('ontology.browser.completeness') }}: {{ completedSectionCount }}/3
        </Typography.Text>
        <Progress :percent="Math.round((completedSectionCount / 3) * 100)" :show-info="false" />
      </div>
      <div data-testid="authoring-relationships">
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
      <div data-testid="authoring-mappings">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorMappings') }} ({{ mappings.length }})
        </Typography.Title>
        <Typography.Paragraph v-if="mappings.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="mapping in mappings" :key="mapping.id || mapping.name">
          <Typography.Text>{{ entityLabel(mapping) }}</Typography.Text>
        </div>
      </div>
      <div data-testid="authoring-data-assets">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorAssets') }} ({{ assetTotal }})
        </Typography.Title>
        <Typography.Paragraph v-if="assetsLoading && assets.length === 0" type="secondary">
          {{ t('crud.loading') }}
        </Typography.Paragraph>
        <Typography.Paragraph v-else-if="assets.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="asset in assets" :key="asset.id || asset.fullyQualifiedName">
          <Typography.Text>{{ entityLabel(asset) }}</Typography.Text>
        </div>
        <Button
          v-if="hasMoreAssets"
          size="small"
          style="margin-top: 8px"
          :loading="assetsLoading"
          data-testid="ontology-authoring-assets-load-more"
          @click="loadAssets(assetOffset)"
        >
          {{ t('ontology.loadMore') }}
        </Button>
      </div>
      <Button
        type="link"
        data-testid="ontology-authoring-full-details"
        @click="emit('show-full-details', node.id)"
      >
        {{ t('ontology.browser.inspectorFullDetails') }}
      </Button>
    </Space>
  </Card>
</template>
