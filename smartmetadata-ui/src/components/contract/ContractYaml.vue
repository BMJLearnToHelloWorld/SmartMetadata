<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { dump } from 'js-yaml';
import type { DataContract } from '@/api/dataContracts';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import { CSMode } from '@/utils/codeMirrorUtils';
import { getUpdatedContractDetails } from '@/utils/dataContract';

const props = defineProps<{
  contract: DataContract;
}>();

const schemaEditorValue = computed(() => dump(getUpdatedContractDetails(props.contract, props.contract)));
</script>

<template>
  <div class="contract-yaml-container">
    <SmCodeEditor
      class-name="contract-yaml-schema-editor"
      editor-class="custom-entity-schema"
      :mode="{ name: CSMode.YAML }"
      :value="schemaEditorValue"
      read-only
    />
  </div>
</template>

<style scoped>
.contract-yaml-container {
  min-height: 240px;
}
</style>
