<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

/**
 * Official PageLayoutV1 bridge: variant default (16px horizontal padding)
 * or compact (8px all round); optional left (230px) and right (284px)
 * panels; a centered main column of 18/24 with a 3/24 left margin;
 * fullHeight growth; a fullscreen query parameter; and a document
 * title. Pages must use this instead of a bare Layout.Content.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'compact';
    center?: boolean;
    fullHeight?: boolean;
    documentTitle?: string;
    testId?: string;
  }>(),
  { variant: 'default', center: false, fullHeight: false, documentTitle: undefined, testId: 'page-layout' },
);

const route = useRoute();
const fullscreen = computed(() => route.query.fullscreen === 'true');

function applyTitle(): void {
  if (props.documentTitle) {
    document.title = props.documentTitle;
  }
}

onMounted(applyTitle);
watch(() => props.documentTitle, applyTitle);
</script>

<template>
  <div
    class="sm-page-layout"
    :class="[
      `sm-page-layout--${variant}`,
      { 'sm-page-layout--center': center, 'sm-page-layout--full-height': fullHeight, 'sm-page-layout--fullscreen': fullscreen },
    ]"
    :data-testid="testId"
  >
    <aside v-if="$slots.left" class="sm-page-layout__left"><slot name="left" /></aside>
    <main class="sm-page-layout__main"><slot /></main>
    <aside v-if="$slots.right" class="sm-page-layout__right"><slot name="right" /></aside>
  </div>
</template>

<style scoped>
.sm-page-layout {
  display: flex;
  gap: 16px;
  width: 100%;
}
.sm-page-layout--default {
  padding-inline: 16px;
}
.sm-page-layout--compact {
  padding: 8px;
}
.sm-page-layout--full-height {
  flex: 1 1 auto;
  min-height: 0;
}
.sm-page-layout--fullscreen {
  position: fixed;
  inset: 0;
  /* Same fullscreen decision as LineageGraph: modal tier (1500), now that
   * --sm-z-modal is actually defined in theme.css (previously
   * --sm-z-overlay was undefined here and fell back to auto). */
  z-index: var(--sm-z-modal);
  background: var(--sm-bg-container);
  overflow: auto;
}
.sm-page-layout__left {
  flex: 0 0 230px;
  width: 230px;
  min-width: 0;
}
.sm-page-layout__right {
  flex: 0 0 284px;
  width: 284px;
  min-width: 0;
}
.sm-page-layout__main {
  flex: 1 1 auto;
  min-width: 0;
}
.sm-page-layout--center .sm-page-layout__main {
  flex: 0 0 75%;
  width: 75%;
  margin-left: 12.5%;
}
</style>
