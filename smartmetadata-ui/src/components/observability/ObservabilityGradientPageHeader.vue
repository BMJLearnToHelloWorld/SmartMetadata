<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Pin AlertsPage.tsx PageLayout.PageHeader variant="gradient" (page-header.tsx
  fixed light-blue gradient; not deployment primary tint).
-->
<template>
  <div class="obs-gradient-header" data-testid="observability-gradient-page-header">
    <div v-if="$slots.breadcrumb" class="obs-gradient-header__crumb">
      <slot name="breadcrumb" />
    </div>
    <div class="obs-gradient-header__row">
      <div class="obs-gradient-header__main">
        <slot />
      </div>
      <div v-if="$slots.actions" class="obs-gradient-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.obs-gradient-header {
  padding: 16px 20px;
  border: 1px solid var(--sm-color-primary-bg);
  border-radius: var(--sm-radius-md, 8px);
  background: linear-gradient(
    89deg,
    rgba(239, 246, 255, 0.32) -2.31%,
    rgba(239, 248, 255, 0.8) 102.64%
  );
}

.obs-gradient-header__crumb {
  margin-bottom: 8px;
}

.obs-gradient-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.obs-gradient-header__main {
  min-width: 0;
  flex: 1;
}

.obs-gradient-header__actions {
  flex-shrink: 0;
}
</style>