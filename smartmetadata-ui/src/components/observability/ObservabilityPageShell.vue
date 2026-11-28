<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Pin ObservabilityPageShell.tsx: full-height column with a fixed header
  region and scrollable content (p-2 outer inset; no extra header px).
-->
<script setup lang="ts">
defineProps<{
  pageTitle?: string;
  shellTestId?: string;
}>();
</script>

<template>
  <div class="observability-page-shell" data-testid="observability-page-shell">
    <div
      class="observability-page-shell__frame"
      :data-testid="shellTestId ?? 'observability-page'"
    >
      <div class="observability-page-shell__header" data-testid="observability-page-header">
        <slot name="header" />
      </div>
      <div class="observability-page-shell__content" data-testid="observability-page-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.observability-page-shell {
  isolation: isolate;
  height: 100%;
  min-height: 0;
}

.observability-page-shell__frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px;
}

.observability-page-shell__header {
  flex-shrink: 0;
}

.observability-page-shell__content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 8px;
}
</style>