<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getDataProductByName } from '@/api/dataProducts';
import { getDecodedFqn } from '@/utils/fqnPaths';
import DataProductDetailView from '@/views/governance/DataProductDetailView.vue';

const props = defineProps<{ fqn: string }>();
const id = ref('');
const errorMessage = ref('');

onMounted(async () => {
  try {
    const product = await getDataProductByName(getDecodedFqn(props.fqn));
    id.value = product.id;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <DataProductDetailView v-if="id" :id="id" />
  <p v-else-if="errorMessage">{{ errorMessage }}</p>
</template>
