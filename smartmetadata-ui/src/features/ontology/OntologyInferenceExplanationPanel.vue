<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Space, Typography, message } from 'ant-design-vue';
import { fetchRdfConfig } from '@/api/sparql';
import { explainOntologyInference } from '@/api/ontology';
import type { OntologyInferenceExplanation } from '@/types/ontologyDataGraph';
import type { OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';

/**
 * Inference explanation panel (official
 * components/OntologyExplorer/OntologyInferenceExplanationPanel.tsx).
 * Mounted always by the relation details panel; renders only for
 * inferred edges. "Inference details" loads the RDF status first —
 * when RDF or inference is disabled it shows the disabled alert instead
 * of calling explain — then POSTs the explanation request with the
 * statement built from the RDF base URI + the edge's endpoints.
 * A failed load toasts and leaves the panel empty; it never fails the
 * whole details panel.
 */
const props = defineProps<{
  edge: OntologyGraphEdge;
  nodes: readonly OntologyGraphNode[];
  relationshipTypes: Array<{ name: string; rdfPredicate?: string }>;
}>();

const { t } = useI18n();
const isLoading = ref(false);
const isDisabled = ref(false);
const explanation = ref<OntologyInferenceExplanation | null>(null);

const isInferred = computed(() => props.edge.provenance === 'Inferred');

const context = computed(() => {
  const source = props.nodes.find((node) => node.id === props.edge.source);
  const target = props.nodes.find((node) => node.id === props.edge.target);
  const relationshipType = props.relationshipTypes.find(
    (candidate) => candidate.name === props.edge.relationType,
  );
  if (!source?.glossaryId || !target || !relationshipType?.rdfPredicate) {
    return undefined;
  }
  return {
    glossaryId: source.glossaryId,
    predicateIri: relationshipType.rdfPredicate,
    sourceId: source.id,
    targetId: target.id,
  };
});

function entityIri(baseUri: string, entityId: string): string {
  const normalized = baseUri.endsWith('/') ? baseUri : `${baseUri}/`;
  return `${normalized}entity/glossaryTerm/${entityId}`;
}

async function loadExplanation(): Promise<void> {
  if (!context.value) {
    return;
  }
  isLoading.value = true;
  try {
    const rdfStatus = await fetchRdfConfig();
    isDisabled.value = !rdfStatus.enabled || !rdfStatus.inference.enabled;
    if (rdfStatus.enabled && rdfStatus.inference.enabled) {
      explanation.value = await explainOntologyInference({
        glossaryId: context.value.glossaryId,
        statement: {
          objectIri: entityIri(rdfStatus.baseUri, context.value.targetId),
          objectKind: 'IRI',
          predicateIri: context.value.predicateIri,
          subjectIri: entityIri(rdfStatus.baseUri, context.value.sourceId),
        },
      });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div v-if="isInferred" data-testid="ontology-inference-explanation">
    <Space direction="vertical" style="width: 100%">
      <Button
        data-testid="load-inference-explanation"
        :disabled="!context"
        :loading="isLoading"
        @click="loadExplanation"
      >
        {{ t('ontology.browser.inferenceDetails') }}
      </Button>
      <Alert
        v-if="isDisabled"
        type="warning"
        show-icon
        :message="t('ontology.browser.inferenceDisabled')"
        data-testid="ontology-inference-disabled"
      />
      <Card v-if="explanation" data-testid="ontology-inference-result">
        <Space direction="vertical" style="width: 100%">
          <Typography.Text strong>
            {{ t('ontology.browser.inferenceRules', { count: explanation.explanations.length }) }}
          </Typography.Text>
          <Typography.Text>
            {{ t('ontology.browser.inferenceVerdict') }}:
            {{ explanation.inferred ? t('crud.yes') : t('crud.no') }}
          </Typography.Text>
          <Card
            v-for="item in explanation.explanations"
            :key="item.graphUri"
            size="small"
            data-testid="ontology-inference-rule"
          >
            <Space direction="vertical" :size="2" style="width: 100%">
              <Typography.Text strong>{{ item.rule.displayName ?? item.rule.name }}</Typography.Text>
              <Typography.Text v-if="item.rule.description" type="secondary">
                {{ item.rule.description }}
              </Typography.Text>
              <Typography.Text type="secondary">
                {{ t('ontology.browser.inferenceTriples', { count: item.tripleCount }) }}
              </Typography.Text>
              <Typography.Text v-if="item.lastMaterializedAt" type="secondary">
                {{ t('ontology.browser.inferenceLastUpdated') }}:
                {{ new Date(item.lastMaterializedAt).toLocaleString() }}
              </Typography.Text>
            </Space>
          </Card>
        </Space>
      </Card>
    </Space>
  </div>
</template>
