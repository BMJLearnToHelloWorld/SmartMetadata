<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin UserTag.component.tsx (small size as used by
  AddEditPersona): a 16px profile picture keyed by id plus the display
  name. No close button: the create form never passes `closable`.
-->
<script setup lang="ts">
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';

withDefaults(
  defineProps<{
    id?: string;
    name?: string;
  }>(),
  { id: undefined, name: undefined },
);
</script>

<template>
  <div v-if="id !== undefined || name !== undefined" data-testid="user-tag" class="persona-user-tag">
    <SmProfilePicture :name="id" width="16" />
    <span class="persona-user-tag__name">{{ name }}</span>
  </div>
</template>

<style scoped>
.persona-user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.persona-user-tag__name {
  font-size: 12px;
  line-height: 16px;
}
</style>
