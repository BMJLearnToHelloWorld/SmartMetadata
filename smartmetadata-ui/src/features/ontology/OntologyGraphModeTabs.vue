<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Space } from 'ant-design-vue';

/**
 * Model/data mode tabs (official AllOntologiesGraphView.tsx
 * OntologyGraphModeTabs: two small buttons, top-right of the graph area).
 * The data tab disables while the model graph is loading or loading more
 * (pin disables on loading || isLoadingMore).
 */
defineProps<{
  mode: 'model' | 'data';
  dataDisabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'change', mode: 'model' | 'data'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <Space data-testid="ontology-graph-mode-tabs">
    <Button
      size="small"
      :type="mode === 'model' ? 'primary' : 'default'"
      data-testid="ontology-graph-mode-model"
      :aria-pressed="mode === 'model'"
      @click="emit('change', 'model')"
    >
      {{ t('ontology.browser.modeModel') }}
    </Button>
    <Button
      size="small"
      :type="mode === 'data' ? 'primary' : 'default'"
      data-testid="ontology-graph-mode-data"
      :aria-pressed="mode === 'data'"
      :disabled="dataDisabled"
      @click="emit('change', 'data')"
    >
      {{ t('ontology.browser.modeData') }}
    </Button>
  </Space>
</template>
