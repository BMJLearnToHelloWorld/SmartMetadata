<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { importAppLogo } from './appAssets';

const props = withDefaults(
  defineProps<{
    /** App name (FQN) the logo is resolved from. */
    appName: string;
    /** Explicit logo URL; overrides the app-name lookup when given. */
    logo?: string;
  }>(),
  { logo: undefined },
);

/**
 * Official AppLogo (components/Settings/Applications/AppLogo/
 * AppLogo.component.tsx, pin a3012259ca): a 100x100 circle holding the
 * app SVG, resolved from the app name unless a logo element is passed.
 * The effect is keyed on `appName` only, so a later `logo` change with
 * the same app name does not re-resolve; the watch below keeps that
 * quirk. A failed image load falls back to the default logo, matching
 * `importAppLogo`'s missing-file fallback.
 */
const src = ref('');
const fellBack = ref(false);

watch(
  () => props.appName,
  (appName) => {
    fellBack.value = false;
    src.value = props.logo ?? importAppLogo(appName);
  },
  { immediate: true },
);

function onError(): void {
  if (!fellBack.value) {
    fellBack.value = true;
    src.value = importAppLogo('__missing__');
  }
}
</script>

<template>
  <div
    style="
      align-items: center;
      background: #f5f5f5;
      border-radius: 50%;
      display: inline-flex;
      height: 100px;
      justify-content: center;
      width: 100px;
    "
  >
    <img
      v-if="src"
      :alt="appName"
      :src="src"
      style="height: 100px; width: 100px; border-radius: 50%; object-fit: contain"
      @error="onError"
    />
  </div>
</template>
