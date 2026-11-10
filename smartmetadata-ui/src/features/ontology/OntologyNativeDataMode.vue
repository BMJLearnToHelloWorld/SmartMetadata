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
import { Alert, Button, Typography } from 'ant-design-vue';
import { useNativeOntologyDataGraph } from '@/composables/useNativeOntologyDataGraph';
import { NATIVE_CONTEXT_CONCEPT_LIMIT } from '@/types/ontologyDataGraph';
import { buildNativeDataGraph, getOntologyAssetPath } from '@/features/ontology/nativeDataGraph';
import OntologyDataGraph from './OntologyDataGraph.vue';

/**
 * Native data mode (official components/OntologyExplorer/OntologyNativeDataMode.tsx).
 * Drives useNativeOntologyDataGraph and renders the card renderer with the
 * native variant. Node selection: ontologyConcept -> onSelectConcept(id);
 * anything with an entityRef navigates to the asset path. The graph stays
 * mounted on reload (selection / expanded cards preserved). Pane clicks
 * are a NO-OP here — clicking empty canvas in native data mode does NOT
 * clear the selection, unlike model mode (asserted in tests).
 * Failure alert: 'stale' -> the stale message, anything else -> the
 * unavailable message; Retry follows the failure's retry kind.
 */
const props = defineProps<{
  ontologyId: string;
  selectedConceptId?: string | null;
  isActive?: boolean;
  revision?: number;
}>();

const emit = defineEmits<{
  (event: 'select-concept', conceptId: string): void;
}>();

const { t } = useI18n();
const router = useRouter();

const view = useNativeOntologyDataGraph(
  () => props.ontologyId,
  { isActive: () => props.isActive ?? true, revision: () => props.revision ?? 0 },
);

const dataGraph = computed(() =>
  buildNativeDataGraph(view.graph.value, view.loadingConceptIds.value, t('ontology.browser.lineage')),
);
const hasClusters = computed(() => view.graph.value.clusters.length > 0);
const hasMoreClusters = computed(
  () => view.graph.value.nextClusterOffset !== undefined && !view.graph.value.contextFull,
);
const showsGraph = computed(() => hasClusters.value || !(view.isLoading.value || view.failure.value));
const limitMessage = computed(() =>
  view.graph.value.contextFull
    ? t('ontology.browser.dataContextFull', { limit: NATIVE_CONTEXT_CONCEPT_LIMIT })
    : undefined,
);

function onSelectNode(nodeId: string): void {
  const node = dataGraph.value.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return;
  }
  if (node.type === 'ontologyConcept') {
    emit('select-concept', nodeId);
    return;
  }
  if (node.entityRef) {
    const path = getOntologyAssetPath(node.entityRef);
    if (path) {
      void router.push(path);
    }
  }
}
</script>

<template>
  <div data-testid="ontology-native-data-mode">
    <Alert
      v-if="view.failure.value"
      type="warning"
      show-icon
      :message="
        view.failure.value.reason === 'stale'
          ? t('ontology.browser.dataGraphStale')
          : t('ontology.browser.dataGraphUnavailable')
      "
      data-testid="ontology-native-data-failure"
      style="margin-bottom: 12px"
    >
      <template #description>
        <Button size="small" data-testid="ontology-native-data-retry" @click="view.retry()">
          {{ t('crud.retry') }}
        </Button>
      </template>
    </Alert>
    <Typography.Text
      v-if="view.isLoading.value && !hasClusters"
      type="secondary"
      data-testid="ontology-native-data-loading"
    >
      {{ t('crud.loading') }}
    </Typography.Text>
    <Typography.Text
      v-if="view.isLoading.value && hasClusters"
      type="secondary"
      data-testid="ontology-native-data-loading-overlay"
    >
      {{ t('crud.loading') }}
    </Typography.Text>
    <OntologyDataGraph
      v-if="showsGraph"
      :data="dataGraph"
      variant="native"
      :has-more-terms="hasMoreClusters"
      :is-loading-more-terms="view.isLoadingClusters.value"
      :limit-message="limitMessage"
      :selected-node-id="selectedConceptId"
      @load-more="view.loadMoreAssets"
      @load-more-terms="view.loadMoreClusters"
      @select-node="onSelectNode"
    />
  </div>
</template>
