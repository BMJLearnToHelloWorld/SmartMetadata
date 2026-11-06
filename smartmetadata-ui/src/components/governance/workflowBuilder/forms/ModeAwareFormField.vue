<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official ModeAwareFormField (pin a3012259ca): in React it cloneElements
 * its child with `disabled`/`isDisabled` forced from the mode context.
 * Vue has no cloneElement — the equivalent is a slot prop: the child reads
 * `disabled` from the slot scope and binds it to its own control.
 */
withDefaults(defineProps<{ disableInViewMode?: boolean }>(), {
  disableInViewMode: true,
});

const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;
const disabled = computed(() => isFormDisabled.value);
</script>

<template>
  <slot :disabled="disableInViewMode ? disabled : false" />
</template>
