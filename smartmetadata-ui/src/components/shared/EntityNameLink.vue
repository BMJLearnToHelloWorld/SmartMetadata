<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';
import { getEntityName } from '@/components/shared/profilePictureUtils';

/**
 * Name link cell (PAT-COLUMNS COL-2). The link target comes from the
 * caller through a `PAT-FQN` path constructor (each entity's
 * constructor decides the no-FQN form — empty string, name fallback —
 * so this cell hardcodes none of it); the label is the official
 * `getEntityName` rule (`displayName || name || ''`).
 */
defineProps<{
  record: { displayName?: string; name?: string };
  to: RouteLocationRaw;
  testId?: string;
}>();
</script>

<template>
  <RouterLink :to="to" :data-testid="testId ?? undefined">
    {{ getEntityName(record) }}
  </RouterLink>
</template>
