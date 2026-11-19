<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official TermBoostList: one card per stored boost plus the
  blank new card while one is being added.
-->
<script setup lang="ts">
import type { SearchTermBoost } from '@/types/admin';
import TermBoostCard from './TermBoostCard.vue';

defineProps<{
  termBoosts: SearchTermBoost[];
  showNewTermBoost?: boolean;
}>();
const emit = defineEmits<{
  change: [termBoost: SearchTermBoost];
  delete: [value: string];
}>();
</script>

<template>
  <div class="term-boost-list">
    <TermBoostCard
      v-for="termBoost in termBoosts"
      :key="termBoost.value"
      :term-boost="termBoost"
      @change="emit('change', $event)"
      @delete="emit('delete', $event)"
    />
    <TermBoostCard
      v-if="showNewTermBoost"
      @change="emit('change', $event)"
      @delete="emit('delete', '')"
    />
  </div>
</template>

<style scoped>
.term-boost-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}
</style>
