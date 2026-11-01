<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { navIcon } from '@/layouts/navIcons';

/**
 * Icon bridge over the single nav icon map. Ant icons are a transition
 * only: the official shell uses ui-core icons plus assets/svg, so this
 * mapping must not be cited as a 1:1 visual match. An unknown key
 * renders an explicit missing marker instead of a guessed icon.
 */
withDefaults(defineProps<{ iconKey: string; testId?: string }>(), { testId: 'sm-icon' });
</script>

<template>
  <component :is="navIcon(iconKey)" v-if="navIcon(iconKey)" :data-testid="testId" />
  <span v-else data-testid="sm-icon-missing" :aria-label="`missing icon: ${iconKey}`" />
</template>
