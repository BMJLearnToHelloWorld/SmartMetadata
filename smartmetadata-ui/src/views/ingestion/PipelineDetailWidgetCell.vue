<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Typography } from 'ant-design-vue';
import type { IngestionPipeline } from '@/types/ingestion';

/**
 * One widget-cell fragment on the ingestion-pipeline surface
 * (PipelineDetailView). This surface is not the official catalog
 * Pipeline page: it has no task graph, no executions widget, and no
 * custom-properties surface, so only the two fragments below have
 * content here — each renders the same datum the overview
 * Descriptions block shows, with the same i18n label. Every other
 * content key maps to no fragment (the view passes `null`), and the
 * cell stays empty while keeping its grid space.
 */
export type PipelineDetailWidgetFragment = 'description' | 'owners';

defineProps<{
  fragment: PipelineDetailWidgetFragment | null;
  pipeline: IngestionPipeline | null;
  ownersLabel: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div v-if="fragment === 'description' && pipeline" data-testid="pipeline-widget-description">
    <Typography.Text type="secondary">{{ t('crud.description') }}</Typography.Text>
    <Typography.Paragraph>{{ pipeline.description || '—' }}</Typography.Paragraph>
  </div>
  <div v-else-if="fragment === 'owners' && pipeline" data-testid="pipeline-widget-owners">
    <Typography.Text type="secondary">{{ t('ingestion.pipelines.owners') }}</Typography.Text>
    <Typography.Paragraph>{{ ownersLabel }}</Typography.Paragraph>
  </div>
</template>
