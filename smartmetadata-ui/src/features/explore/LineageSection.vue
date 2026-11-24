<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Spin, Typography } from 'ant-design-vue';
import { getLineagePagingData } from '@/api/lineage';
import { lineageLocation } from '@/catalog/entityRoutes';
import { countImpactDirectionTotals, parseLineagePaginationInfo } from '@/lineage/lineageTable';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const { t } = useI18n();
const router = useRouter();

const loading = ref(true);
const upstreamCount = ref(0);
const downstreamCount = ref(0);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const info = parseLineagePaginationInfo(
      await getLineagePagingData({ fqn: props.fqn, entityType: props.entityType }),
    );
    // Pin LineageSection.tsx (a3012259ca) counts entities at depth 1
    // (`getEntityCountAtDepth(..., 1)`); countImpactDirectionTotals with
    // nodeDepth 1 is the product's depth-1 counter.
    const counts = countImpactDirectionTotals(info, 1);
    upstreamCount.value = counts.upstreamCount;
    downstreamCount.value = counts.downstreamCount;
  } catch {
    // A failed fetch is indistinguishable from "no lineage" in the
    // summary panel: pin shows `message.no-lineage-available` whenever
    // the section has no lineage data.
    upstreamCount.value = 0;
    downstreamCount.value = 0;
  } finally {
    loading.value = false;
  }
}

function openLineage(): void {
  // Divergence (recorded): pin's section click navigates to the entity
  // detail page's lineage tab; the product opens the full-page lineage
  // graph (lineageLocation), the same destination the detail-page
  // "Open full-page lineage" button uses.
  void router.push(lineageLocation(props.entityType, props.fqn));
}

onMounted(() => {
  void load();
});
watch(
  () => [props.entityType, props.fqn],
  () => {
    void load();
  },
);
</script>

<template>
  <section class="preview__block" data-testid="explore-preview-lineage-section">
    <Typography.Text type="secondary">{{ t('lineage.title') }}</Typography.Text>
    <Spin v-if="loading" size="small" data-testid="lineage-section-loading" />
    <template v-else-if="upstreamCount === 0 && downstreamCount === 0">
      <Typography.Paragraph data-testid="lineage-section-empty" type="secondary">
        {{ t('lineage.noLineageAvailable') }}
      </Typography.Paragraph>
    </template>
    <div v-else class="lineage-section__links">
      <Button
        v-if="upstreamCount > 0"
        type="link"
        data-testid="upstream-lineage"
        @click="openLineage"
      >
        {{ t('lineage.upstream') }} <span data-testid="upstream-count">{{ upstreamCount }}</span>
      </Button>
      <Button
        v-if="downstreamCount > 0"
        type="link"
        data-testid="downstream-lineage"
        @click="openLineage"
      >
        {{ t('lineage.downstream') }} <span data-testid="downstream-count">{{ downstreamCount }}</span>
      </Button>
    </div>
  </section>
</template>

<style scoped>
.lineage-section__links {
  display: flex;
  gap: 4px;
}
</style>
