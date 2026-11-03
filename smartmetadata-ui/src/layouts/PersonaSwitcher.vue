<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import { usePersonaStore } from '@/stores/persona';

/**
 * Header persona switcher, mirroring the official PersonaSelect: the
 * selectable list comes from the persona store, the selection persists
 * there, and nothing renders until personas exist — no fake switcher
 * on a console without personas.
 */
const { t } = useI18n();
const store = usePersonaStore();

const options = computed(() =>
  store.personas.map((persona) => ({
    value: persona.id,
    label: persona.displayName || persona.name,
  })),
);

const visible = computed(() => store.loaded && store.personas.length > 0);

onMounted(() => {
  void store.ensureLoaded();
});
</script>

<template>
  <Select
    v-if="visible"
    data-testid="persona-switcher"
    class="persona-switcher"
    :value="store.selectedPersonaId ?? undefined"
    :options="options"
    :placeholder="t('persona.switcherPlaceholder')"
    :aria-label="t('persona.switcherLabel')"
    allow-clear
    @change="(id) => store.selectPersona((id as string) || null)"
  />
</template>

<style scoped>
.persona-switcher {
  min-width: 160px;
}
</style>
