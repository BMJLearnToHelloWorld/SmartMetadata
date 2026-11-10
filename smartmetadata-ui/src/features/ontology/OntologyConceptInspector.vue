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
import { getOntologyConceptBindings } from '@/api/ontology';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import type {
  OntologyConcept,
  OntologyConceptBinding,
} from '@/types/ontology';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import {
  getConceptAncestors,
  getConceptPropertyRows,
  getConceptRelationRows,
  relationRowLabel,
} from './ontologyInspector';
import type { OntologyModelRelation, OntologyStudioModel } from './ontologyGraph';

/**
 * Concept inspector (official
 * components/governance/ontology/OntologyConceptInspector/OntologyConceptInspector.tsx).
 * Read parts only in stage 2 — no inline authoring props (PropertyAuthoring
 * / RelationAuthoring are edit-mode-gated in pin and not stage 2):
 * bindings (useOntologyConceptBindings), ancestors breadcrumb, properties
 * (own then inherited), relationships, mappings, assets, bindings, and
 * the completeness bar over [relations, mappings, bindings assets].
 * Edit is gated on useEntityPermissions('ontologyConcept', {id},
 * {enabled, deleted}) — the button renders only when canEditAll, and
 * emits `edit` (the parent opens the studio on that ontology).
 * "Open data" emits `open-data` (the parent switches to data mode).
 */
const props = defineProps<{
  concept: OntologyConcept;
  model: OntologyStudioModel;
  relations: readonly OntologyModelRelation[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'edit', concept: OntologyConcept): void;
  (event: 'open-data', concept: OntologyConcept): void;
  (event: 'select-concept', conceptId: string): void;
}>();

const { t } = useI18n();

const { canEditAll } = useEntityPermissions(
  'ontologyConcept',
  () => ({ id: props.concept.id }),
  { enabled: () => props.concept.id.length > 0 },
);

const bindings = ref<OntologyConceptBinding[]>([]);
const bindingsLoading = ref(false);

async function loadBindings(): Promise<void> {
  bindingsLoading.value = true;
  try {
    const page = await getOntologyConceptBindings(props.concept.id);
    bindings.value = page.assets;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    bindings.value = [];
  } finally {
    bindingsLoading.value = false;
  }
}

onMounted(() => {
  void loadBindings();
});
watch(
  () => props.concept.id,
  () => {
    void loadBindings();
  },
);

const ancestors = computed(() => getConceptAncestors(props.relations, props.concept.id, props.model.concepts));
const properties = computed(() => getConceptPropertyRows(props.model, props.relations, props.concept));
const conceptRelations = computed(() => getConceptRelationRows(props.relations, props.concept.id));
const mappings = computed(() => props.concept.conceptMappings ?? []);
const unavailableProperties = computed(() => {
  const propertyIds = new Set(properties.value.map((row) => row.property.id));
  const unavailable = new Map<string, string>();
  bindings.value.forEach((binding) => {
    (binding.columns ?? []).forEach((column) => {
      if (column.propertyId && !propertyIds.has(column.propertyId)) {
        const property = column.property;
        unavailable.set(column.propertyId, property?.displayName || property?.name || column.propertyId);
      }
    });
  });
  return [...unavailable];
});

const sectionCounts = computed(() => [
  conceptRelations.value.length,
  mappings.value.length,
  bindings.value.length,
]);
const completedSectionCount = computed(() => sectionCounts.value.filter((count) => count > 0).length);
const ontologyName = computed(() => {
  const conceptOntology = props.concept.ontology;
  if (conceptOntology && conceptOntology.id !== props.model.ontology?.id) {
    return conceptOntology.displayName || conceptOntology.name;
  }
  return props.model.ontology.displayName || props.model.ontology.name;
});
</script>

<template>
  <Card data-testid="ontology-concept-inspector" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Space style="justify-content: space-between; width: 100%">
        <Typography.Text strong>{{ entityLabel(concept) }}</Typography.Text>
        <Button size="small" type="text" data-testid="ontology-concept-inspector-close" @click="emit('close')">
          {{ t('crud.close') }}
        </Button>
      </Space>
      <Typography.Text v-if="concept.description" type="secondary">{{ concept.description }}</Typography.Text>
      <Typography.Text v-if="ontologyName" type="secondary">{{ ontologyName }}</Typography.Text>
      <Space v-if="ancestors.length > 0" data-testid="ontology-concept-ancestors">
        <Typography.Text type="secondary">{{ t('ontology.browser.inheritedFrom') }}</Typography.Text>
        <Button
          v-for="ancestor in ancestors"
          :key="ancestor.id"
          type="link"
          size="small"
          :data-testid="`ontology-concept-ancestor-${ancestor.id}`"
          @click="emit('select-concept', ancestor.id)"
        >
          {{ entityLabel(ancestor) }}
        </Button>
      </Space>
      <div data-testid="ontology-concept-completeness">
        <Typography.Text type="secondary">
          {{ t('ontology.browser.completeness') }}: {{ completedSectionCount }}/{{ sectionCounts.length }}
        </Typography.Text>
        <Progress
          :percent="Math.round((completedSectionCount / sectionCounts.length) * 100)"
          :show-info="false"
        />
      </div>
      <Space>
        <Button
          v-if="canEditAll"
          type="primary"
          size="small"
          data-testid="ontology-concept-edit"
          @click="emit('edit', concept)"
        >
          {{ t('crud.edit') }}
        </Button>
        <Button size="small" data-testid="ontology-concept-open-data" @click="emit('open-data', concept)">
          {{ t('ontology.browser.openData') }}
        </Button>
      </Space>
      <div data-testid="ontology-concept-properties">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorProperties') }} ({{ properties.length }})
        </Typography.Title>
        <Typography.Paragraph v-if="properties.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="row in properties" :key="row.property.id" style="display: flex; gap: 8px">
          <Typography.Text strong>{{ row.property.displayName || row.property.name }}</Typography.Text>
          <Typography.Text type="secondary">{{ row.datatype }}</Typography.Text>
          <Typography.Text v-if="row.inheritedFrom" type="secondary">
            {{ t('ontology.browser.inheritedFrom') }} {{ entityLabel(row.inheritedFrom) }}
          </Typography.Text>
        </div>
        <Typography.Paragraph v-if="unavailableProperties.length > 0" type="secondary">
          {{ t('ontology.browser.inspectorUnavailableProperties') }}:
          {{ unavailableProperties.map(([, label]) => label).join(', ') }}
        </Typography.Paragraph>
      </div>
      <div data-testid="ontology-concept-relationships">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorRelationships') }} ({{ conceptRelations.length }})
        </Typography.Title>
        <Typography.Paragraph v-if="conceptRelations.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="row in conceptRelations" :key="`${row.relation.key}:${row.direction}`" style="display: flex; gap: 8px">
          <Typography.Text>{{ row.direction === 'outgoing' ? '→' : '←' }}</Typography.Text>
          <Typography.Text>{{ row.relation.label }}</Typography.Text>
          <a href="#" @click.prevent="emit('select-concept', row.other.id)">
            {{ relationRowLabel(row, model.concepts) }}
          </a>
        </div>
      </div>
      <div data-testid="ontology-concept-mappings">
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
      <div data-testid="ontology-concept-assets">
        <Typography.Title :level="5">
          {{ t('ontology.browser.inspectorAssets') }} ({{ bindings.length }})
        </Typography.Title>
        <Typography.Paragraph v-if="bindingsLoading" type="secondary">
          {{ t('crud.loading') }}
        </Typography.Paragraph>
        <Typography.Paragraph v-else-if="bindings.length === 0" type="secondary">
          {{ t('ontology.browser.inspectorEmpty') }}
        </Typography.Paragraph>
        <div v-for="binding in bindings" :key="binding.assetId || binding.asset?.id">
          <Typography.Text>
            {{ entityLabel(binding.asset) }}
          </Typography.Text>
          <Typography.Text v-if="binding.assetType" type="secondary">
            · {{ binding.assetType }}
          </Typography.Text>
          <Typography.Text v-if="binding.columnCount !== undefined" type="secondary">
            · {{ binding.columnCount }} {{ t('ontology.concepts.bindingColumns') }}
          </Typography.Text>
        </div>
        <Typography.Text v-if="concept.owners.length">
          {{ t('ontology.owners') }}: {{ joinRefNames(concept.owners) }}
        </Typography.Text>
      </div>
    </Space>
  </Card>
</template>
