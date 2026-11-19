<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/NoSearchResultsPlaceholder.tsx.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { SearchOutlined } from '@ant-design/icons-vue';
import type { EmptyPlaceholderContentPropsInput } from '@/utils/emptyPlaceholder';
import EmptyPlaceholder from './EmptyPlaceholder.vue';

const props = defineProps<EmptyPlaceholderContentPropsInput>();
const slots = useSlots();
const { t } = useI18n();

const hasTitle = computed(() => !!props.title || !!slots.title);
const resolvedDescription = computed(
  () => props.description ?? (hasTitle.value ? undefined : t('message.check-spelling-or-try-shorter-term'))
);
</script>

<template>
  <EmptyPlaceholder
    variant="blank"
    :actions="actions"
    :width="width"
    :gap="gap"
    :class-name="className"
    :test-id="testId"
    :icon="icon ?? SearchOutlined"
    :title="title ?? t('label.no-matching-result-plural')"
    :description="resolvedDescription"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </EmptyPlaceholder>
</template>
