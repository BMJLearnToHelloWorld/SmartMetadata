<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/NoFilteredResultsPlaceholder.tsx.
  The funnel icon is FilterOutlined, the closest @ant-design/icons-vue
  equivalent of the official NoFilterFunnel glyph.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { FilterOutlined } from '@ant-design/icons-vue';
import {
  resolveSingleAction,
  type EmptyPlaceholderContentPropsInput,
} from '@/utils/emptyPlaceholder';
import EmptyPlaceholder from './EmptyPlaceholder.vue';

const props = defineProps<EmptyPlaceholderContentPropsInput & { onClearFilters?: () => void }>();
const slots = useSlots();
const { t } = useI18n();

const hasTitle = computed(() => !!props.title || !!slots.title);
const resolvedActions = computed(() =>
  resolveSingleAction(props.actions, props.onClearFilters, 'clear-filters', t('label.clear-filter-plural'))
);
const resolvedDescription = computed(
  () => props.description ?? (hasTitle.value ? undefined : t('message.nothing-matches-current-filter'))
);
</script>

<template>
  <EmptyPlaceholder
    variant="blank"
    :actions="resolvedActions"
    :width="width"
    :gap="gap"
    :class-name="className"
    :test-id="testId"
    :icon="icon ?? FilterOutlined"
    :title="title ?? t('label.no-result-for-these-filter-plural')"
    :description="resolvedDescription"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </EmptyPlaceholder>
</template>
