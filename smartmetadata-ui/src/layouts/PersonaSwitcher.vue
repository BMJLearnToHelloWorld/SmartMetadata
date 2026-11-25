<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Menu } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';
import { usePersonaStore } from '@/stores/persona';
import type { Persona } from '@/types/persona';

/**
 * "Switch persona" section of the user menu (pin
 * `components/Settings/Users/UserProfileIcon/UserProfileIcon
 * .component.tsx:324` `renderListSection` id `personas`): a radio
 * list of the user's personas — the default persona first (with a
 * "Default" badge), then the selected one, the rest alphabetical —
 * showing 2 by default with a "N more" row to expand. Clicking a
 * persona switches the selection through the persona store (no page
 * reload); the shell closes the menu. This is a view switcher, not
 * pin's `PersonaSelect` — that one is a form TreeSelect for
 * *assigning* personas to users/teams, and is not cited here.
 *
 * The section renders only once personas exist; with no personas the
 * user menu shows no persona content — no fake switcher on a console
 * without personas.
 */
const { t } = useI18n();
const store = usePersonaStore();
const auth = useAuthStore();

const showAll = ref(false);

const defaultPersonaId = computed(() => auth.user?.defaultPersona?.id ?? null);

function personaName(persona: Persona): string {
  return persona.displayName || persona.name;
}

/**
 * Pin `sortedPersonas` (`UserProfileIcon.component.tsx:236-262`):
 * default first, then the selected one, the rest alphabetical. A
 * persona that is both default and selected appears once, in the
 * default slot.
 */
const sortedPersonas = computed<Persona[]>(() => {
  const defaultId = defaultPersonaId.value;
  const selectedId = store.selectedPersonaId;
  let defaultMatch: Persona | undefined;
  let selectedMatch: Persona | undefined;
  const others: Persona[] = [];
  for (const persona of store.personas) {
    if (persona.id === defaultId) {
      defaultMatch = persona;
    } else if (persona.id === selectedId) {
      selectedMatch = persona;
    } else {
      others.push(persona);
    }
  }
  others.sort((a, b) => personaName(a).localeCompare(personaName(b)));
  return [
    ...(defaultMatch ? [defaultMatch] : []),
    ...(selectedMatch ? [selectedMatch] : []),
    ...others,
  ];
});

const visiblePersonas = computed(() =>
  showAll.value ? sortedPersonas.value : sortedPersonas.value.slice(0, 2),
);
const remainingCount = computed(
  () => sortedPersonas.value.length - visiblePersonas.value.length,
);

function onSelectPersona(id: string): void {
  void store.selectPersona(id);
}

function onShowMore(): void {
  showAll.value = true;
}

onMounted(() => {
  void store.ensureLoaded();
});
</script>

<template>
  <Menu.ItemGroup v-if="store.personas.length > 0" :title="t('persona.switchPersona')">
    <Menu.Item
      v-for="persona in visiblePersonas"
      :key="`persona:${persona.id}`"
      :data-testid="`user-menu-persona-${persona.id}`"
      @click="onSelectPersona(persona.id)"
    >
      <span class="persona-menu__row">
        <span
          class="persona-menu__radio"
          :class="{ 'persona-menu__radio--checked': persona.id === store.selectedPersonaId }"
        />
        <span class="persona-menu__name">{{ personaName(persona) }}</span>
        <span
          v-if="persona.id === defaultPersonaId"
          class="persona-menu__default-badge"
        >
          {{ t('chrome.defaultPersona') }}
        </span>
      </span>
    </Menu.Item>
    <Menu.Item
      v-if="remainingCount > 0"
      key="persona-more"
      data-testid="user-menu-persona-more"
      @click="onShowMore"
    >
      {{ remainingCount }} {{ t('label.more') }}
    </Menu.Item>
  </Menu.ItemGroup>
</template>

<style scoped>
.persona-menu__row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.persona-menu__radio {
  flex: none;
  width: 12px;
  height: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 50%;
}
.persona-menu__radio--checked {
  background: var(--sm-color-primary);
  border-color: var(--sm-color-primary);
}
.persona-menu__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-menu__default-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}
</style>
