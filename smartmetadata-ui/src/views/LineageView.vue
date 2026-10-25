<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Card } from 'ant-design-vue';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import LineageEntitySearch from '@/components/lineage/LineageEntitySearch.vue';
import { lineageLocation } from '@/catalog/entityRoutes';

defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();

function openTarget(target: { entityType: string; fqn: string }): void {
  void router.push(lineageLocation(target.entityType, target.fqn));
}
</script>

<template>
  <Card>
    <LineageCanvas :entity-type="entityType" :fqn="fqn" variant="page">
      <template #search>
        <LineageEntitySearch @select="openTarget" />
      </template>
    </LineageCanvas>
  </Card>
</template>
