<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  One change value: entity segments joined with `, ` (16px avatars for
  user fields), a markdown preview for description fields, or plain
  text. The row's private renderer, split out so the template can
  import it (a second script block in the row file cannot expose
  template bindings).
-->
<script setup lang="ts">
import { RouterLink } from 'vue-router';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import type { AuditLogDetailValue as DetailValueModel } from './auditLogFeed';

defineProps<{ value: DetailValueModel }>();
</script>

<template>
  <SmMarkdown v-if="value.kind === 'markdown'" :markdown="value.markdown" />
  <span v-else class="audit-log-value">
    <template v-for="(segment, index) in value.segments" :key="segment.key">
      <span v-if="index > 0">, </span>
      <span class="audit-log-value-segment">
        <SmProfilePicture
          v-if="segment.avatar"
          :name="segment.avatar.name"
          :display-name="segment.avatar.displayName"
          size="xxs"
        />
        <RouterLink v-if="segment.to" :to="segment.to">{{ segment.text }}</RouterLink>
        <span v-else>{{ segment.text }}</span>
      </span>
    </template>
  </span>
</template>

<style scoped>
.audit-log-value-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
