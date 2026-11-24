<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import LineageSettingsSection from '@/components/settings/LineageSettingsSection.vue';
import { PLATFORM_SETTINGS_SECTIONS } from '@/settings/platformSettings';
</script>

<template>
  <!-- D-CFG-3 (host lane): the personal-space platform-settings panel.
       Pin `PlatformSettingsPanel.tsx` (a3012259ca) renders one component
       per registered section id; the product registry is
       `settings/platformSettings.ts`. A later settings lane adds its
       section component here behind its own `v-else-if` on the section
       id — the panel never hard-codes a section list of its own. -->
  <div data-testid="platform-settings-panel">
    <template v-for="section in PLATFORM_SETTINGS_SECTIONS" :key="section.id">
      <LineageSettingsSection v-if="section.id === 'lineage'" />
    </template>
  </div>
</template>
