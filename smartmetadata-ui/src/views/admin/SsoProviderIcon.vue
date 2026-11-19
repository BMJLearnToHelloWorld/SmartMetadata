<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import type { Component } from 'vue';

/**
 * Provider logos are a mix of raster/legacy image URLs and icon
 * components (pin `SsoProviderIcon`): a component definition renders
 * with `size`, a string renders as an `<img>`, null renders nothing.
 * Pin distinguishes by `typeof Icon === 'function'`; Vue component
 * definitions are objects, so the port distinguishes by string-ness.
 */
defineProps<{
  icon: string | Component | null | undefined;
  alt?: string;
  size?: number;
}>();
</script>

<template>
  <component :is="icon" v-if="icon && typeof icon !== 'string'" :size="size ?? 24" />
  <img
    v-else-if="typeof icon === 'string'"
    :alt="alt ?? ''"
    :height="size ?? 24"
    :src="icon"
    :width="size ?? 24"
  />
</template>
