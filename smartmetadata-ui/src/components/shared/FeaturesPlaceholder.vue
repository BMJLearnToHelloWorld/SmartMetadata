<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/FeaturesPlaceholder.tsx.
  A feature with an `action` renders its title as the small button that
  starts it (rendered by the base; see EmptyPlaceholderFeature).
-->
<script setup lang="ts">
import type {
  EmptyPlaceholderContentPropsInput,
  EmptyPlaceholderFeature,
} from '@/utils/emptyPlaceholder';
import EmptyPlaceholder from './EmptyPlaceholder.vue';

defineProps<
  EmptyPlaceholderContentPropsInput & { features?: EmptyPlaceholderFeature[] }
>();
</script>

<template>
  <EmptyPlaceholder
    variant="features"
    :actions="actions"
    :width="width"
    :gap="gap"
    :class-name="className"
    :test-id="testId"
    :title="title"
    :description="description"
    :features="features"
  >
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </EmptyPlaceholder>
</template>
