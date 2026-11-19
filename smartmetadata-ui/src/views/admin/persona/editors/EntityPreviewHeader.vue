<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Breadcrumb } from 'ant-design-vue';
import type { DummyEntityData } from './customizeTypes';

/**
 * Edit-view preview header: DataAssetsHeader (isCustomizedView) /
 * EntityHeader / GlossaryHeaderWidget equivalents, display-only.
 * Official renders the real headers with dummy data and no-op update
 * callbacks; this preview shows the same dummy fields (name, FQN,
 * description, breadcrumbs) with no interactive controls, so no
 * no-op affordance is faked. Domain breadcrumbs split the dummy FQN
 * (official Fqn.split semantics incl. quoted segments); DataProduct
 * shows the single marketplace crumb (official reads the base path
 * from the marketplace store, which has no product equivalent here —
 * the crumb carries no link).
 */
const props = defineProps<{
  dummy: DummyEntityData;
  variant: 'dataAssets' | 'domain' | 'dataProduct' | 'glossary';
  isGlossary?: boolean;
}>();

const { t } = useI18n();

const displayName = computed(
  () => props.dummy.displayName || props.dummy.name || props.dummy.fullyQualifiedName || '',
);

/** Quote-aware FQN split (official Fqn.split equivalent for breadcrumbs). */
function splitFqn(fqn: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of fqn) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === '.' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current !== '') {
    parts.push(current);
  }
  return parts;
}

const breadcrumbs = computed(() => {
  if (props.variant === 'domain') {
    if (!props.dummy.fullyQualifiedName) {
      return [];
    }
    const segments = splitFqn(props.dummy.fullyQualifiedName);
    return [t('nav.domains'), ...segments.slice(0, -1)];
  }
  if (props.variant === 'dataProduct') {
    return [t('marketplace.dataProducts')];
  }
  return [];
});

const testId = computed(() => {
  if (props.variant === 'glossary') {
    return 'preview-glossary-header';
  }
  if (props.variant === 'domain' || props.variant === 'dataProduct') {
    return 'preview-entity-header';
  }
  return 'preview-data-assets-header';
});
</script>

<template>
  <div
    class="entity-preview-header"
    :data-testid="testId"
    :data-is-glossary="variant === 'glossary' ? String(Boolean(isGlossary)) : undefined"
  >
    <Breadcrumb v-if="breadcrumbs.length > 0" class="entity-preview-header__crumbs">
      <Breadcrumb.Item v-for="crumb in breadcrumbs" :key="crumb">{{ crumb }}</Breadcrumb.Item>
    </Breadcrumb>
    <h2 class="entity-preview-header__name" data-testid="preview-entity-name">
      {{ displayName }}
    </h2>
    <p v-if="dummy.fullyQualifiedName" class="entity-preview-header__fqn">
      {{ dummy.fullyQualifiedName }}
    </p>
    <p v-if="dummy.description" class="entity-preview-header__description">
      {{ dummy.description }}
    </p>
  </div>
</template>

<style scoped>
.entity-preview-header {
  margin-bottom: 16px;
}
.entity-preview-header__crumbs {
  margin-bottom: 8px;
}
.entity-preview-header__name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.entity-preview-header__fqn,
.entity-preview-header__description {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
</style>
