<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

/**
 * Two-line description cell — pin `LineageTableDescription.tsx`: a full
 * description would widen the auto-layout table and push the remaining
 * columns off screen, so the overflow links to the asset page instead
 * of expanding in place. The link renders only when the text is
 * actually clamped (measured, like pin's `useIsTextClamped`); without
 * an asset path there is nowhere to link to, so no link renders.
 */
const props = defineProps<{
  description: string;
  entityPath?: RouteLocationRaw;
}>();

const { t } = useI18n();
const textRef = ref<HTMLElement | null>(null);
const clamped = ref(false);

async function checkClamp(): Promise<void> {
  await nextTick();
  const el = textRef.value;
  clamped.value = Boolean(el && el.scrollHeight > el.clientHeight);
}

onMounted(checkClamp);
onUpdated(checkClamp);
</script>

<template>
  <div class="lineage-table-description">
    <span ref="textRef" class="lineage-table-description__text" data-testid="impact-description">
      {{ props.description }}
    </span>
    <RouterLink
      v-if="clamped && props.entityPath"
      data-testid="impact-description-view-more"
      :to="props.entityPath"
    >
      {{ t('lineage.impactViewMore') }}
    </RouterLink>
  </div>
</template>

<style scoped>
.lineage-table-description__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
</style>
