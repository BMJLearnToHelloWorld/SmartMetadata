<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import { emptyPersonaDocument, getDocumentByFqn, personaDocFqn } from '@/api/docStore';
import { getPersonaByName } from '@/api/persona';
import { Button } from 'ant-design-vue';
import type { Persona, PersonaDocument } from '@/types/persona';
import AppLayoutEditor from './AppLayoutEditor.vue';
import EntityCustomizeOverlay from './EntityCustomizeOverlay.vue';
import PersonaPageJsonEditor from './PersonaPageJsonEditor.vue';

/**
 * Persona customize view, mirroring the official PersonaCustomizeView:
 * loads the persona and its UICustomization document (a 404 becomes
 * the official empty-document template), then dispatches the category
 * to its editor. Unknown categories render an error, never a fake
 * editor. Saving refreshes the local document, as official does.
 */
const props = defineProps<{
  fqn: string;
  category: string;
  entity?: string;
}>();

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const persona = ref<Persona | null>(null);
const document = ref<PersonaDocument | null>(null);

const editorKind = computed(() => {
  if (props.category === 'app-layout') {
    return 'app-layout';
  }
  if (props.category === 'LandingPage') {
    return 'LandingPage';
  }
  if (props.category === 'DataMarketplace') {
    return 'DataMarketplace';
  }
  if (props.category === 'governance') {
    return 'governance';
  }
  return 'unknown';
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const found = await getPersonaByName(props.fqn);
    persona.value = found;
    const fqn = personaDocFqn(found.fullyQualifiedName);
    if (!fqn) {
      document.value = emptyPersonaDocument(found.name, found.fullyQualifiedName);
      return;
    }
    try {
      document.value = await getDocumentByFqn(fqn);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        document.value = emptyPersonaDocument(found.name, found.fullyQualifiedName);
      } else {
        throw error;
      }
    }
  } catch (error) {
    persona.value = null;
    document.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('persona.docLoadFailed');
  } finally {
    loading.value = false;
  }
}

function onSaved(saved: PersonaDocument): void {
  document.value = saved;
}

function backToDetail(): void {
  void router.push({ name: 'admin-settings-persona-detail', params: { fqn: props.fqn } });
}

watch(
  () => [props.fqn, props.category],
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="persona-customize">
    <Button data-testid="persona-customize-back" @click="backToDetail">
      {{ t('persona.backToPersona') }}
    </Button>
    <p v-if="errorMessage" class="persona-customize__error">{{ errorMessage }}</p>
    <div v-if="persona && document">
      <h2>{{ persona.displayName || persona.name }}</h2>
      <AppLayoutEditor
        v-if="editorKind === 'app-layout'"
        :persona="persona"
        :document="document"
        @saved="onSaved"
      />
      <PersonaPageJsonEditor
        v-else-if="editorKind === 'LandingPage'"
        :persona="persona"
        :document="document"
        page-type="LandingPage"
        @saved="onSaved"
      />
      <PersonaPageJsonEditor
        v-else-if="editorKind === 'DataMarketplace'"
        :persona="persona"
        :document="document"
        page-type="DataMarketplace"
        @saved="onSaved"
      />
      <EntityCustomizeOverlay
        v-else-if="editorKind === 'governance'"
        :persona="persona"
        :document="document"
        :initial-entity="entity"
        @saved="onSaved"
      />
      <p v-else data-testid="persona-customize-unknown">{{ t('persona.docLoadFailed') }}</p>
    </div>
  </div>
</template>

<style scoped>
.persona-customize__error {
  color: var(--sm-color-error-text);
}
</style>
