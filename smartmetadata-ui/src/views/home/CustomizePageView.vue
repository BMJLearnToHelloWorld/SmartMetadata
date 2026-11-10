<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Empty, Spin, message } from 'ant-design-vue';
import CustomizeMyData from '@/features/home/CustomizeMyData.vue';
import { DEFAULT_HEADER_BG_COLOR, resolveLandingPageHeaderColor } from '@/features/home/landingHeaderColor';
import { emptyPersonaDocument, savePersonaDocument } from '@/api/docStore';
import { getPersonaByName } from '@/api/persona';
import { usePersonaStore } from '@/stores/persona';
import {
  getPersonaPage,
  normalizePersonaDocument,
  updatePersonPreferences,
  updatePersonaDocumentPage,
} from '@/views/admin/personaPage';
import type { Persona, PersonaDocument, PersonaPage } from '@/types/persona';

/**
 * The customize-page route shell, ported from the official framework
 * (openmetadata-ui `pages/CustomizablePage/CustomizablePage.tsx`).
 *
 * Stage D serves the LandingPage editor only, plus the `homepage`
 * alias for it. Other page types have no editor in this batch and
 * render the unsupported state instead of a wrong editor.
 *
 * Save follows pin exactly, including its asymmetry: the page save
 * swallows errors (error toast, no throw — the editor stays on the
 * page), and the colour update toasts success/error the same way.
 * A save with no document id creates; with one it patches the
 * changed subtrees. `syncSavedDocument` normalizes the response and
 * writes it back to the persona store, so the home page picks the
 * saved layout up without a reload.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const personaStore = usePersonaStore();

const fqn = computed(() => String(route.params.fqn ?? ''));
const pageFqn = computed(() => String(route.params.pageFqn ?? ''));
const pageType = computed(() => (pageFqn.value === 'homepage' ? 'LandingPage' : pageFqn.value));

const loading = ref(true);
const loadError = ref('');
const persona = ref<Persona | null>(null);
const documentRef = ref<PersonaDocument | null>(null);

const initialPageData = computed(() =>
  getPersonaPage(documentRef.value, 'LandingPage'),
);

const initialColor = computed(
  () =>
    resolveLandingPageHeaderColor(
      persona.value?.id,
      documentRef.value?.data.personPreferences,
      documentRef.value?.data.personaPreferences,
    ) ?? DEFAULT_HEADER_BG_COLOR,
);

function syncSavedDocument(saved: PersonaDocument): void {
  const normalized = normalizePersonaDocument(saved);
  documentRef.value = normalized;
  personaStore.document = normalized;
}

async function handlePageCustomizeSave(newPage?: PersonaPage): Promise<void> {
  const doc = documentRef.value;
  if (!doc) {
    return;
  }
  const wasCreate = !doc.id;
  const operation = wasCreate ? t('home.created') : t('home.updated');
  const operating = wasCreate ? t('home.creating') : t('home.updating');
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      const updated = updatePersonaDocumentPage(draft, 'LandingPage', newPage);
      draft.data.pages = updated.data.pages;
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch {
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
  }
}

async function handleBackgroundColorUpdate(nextColor?: string): Promise<void> {
  const doc = documentRef.value;
  const currentPersona = persona.value;
  if (!doc || !currentPersona) {
    return;
  }
  const wasCreate = !doc.id;
  const operation = wasCreate ? t('home.created') : t('home.updated');
  const operating = wasCreate ? t('home.creating') : t('home.updating');
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      draft.data.personPreferences = updatePersonPreferences(
        draft.data.personPreferences ?? [],
        { id: currentPersona.id, name: currentPersona.name },
        nextColor,
      );
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch {
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
  }
}

onMounted(async () => {
  try {
    const found = await getPersonaByName(fqn.value);
    persona.value = found;
    await personaStore.ensureLoaded();
    if (personaStore.selectedPersona?.id !== found.id) {
      await personaStore.selectPersona(found.id);
    } else {
      await personaStore.loadDocument();
    }
    documentRef.value =
      personaStore.document ?? emptyPersonaDocument(found.name, found.fullyQualifiedName);
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : t('home.customizePageLoadFailed');
  } finally {
    loading.value = false;
  }
});

function goHome(): void {
  void router.push({ name: 'home' });
}
</script>

<template>
  <div class="customize-page" data-testid="customize-page">
    <Spin v-if="loading" :spinning="true" data-testid="customize-page-loading">
      <div class="customize-page__loading" />
    </Spin>
    <Empty
      v-else-if="loadError || !persona"
      :description="loadError || t('home.customizePagePersonaMissing')"
      data-testid="customize-page-error"
    >
      <Button type="primary" @click="goHome">{{ t('errors.backHome') }}</Button>
    </Empty>
    <Empty
      v-else-if="pageType !== 'LandingPage'"
      :description="t('home.customizePageUnsupported', { page: pageFqn })"
      data-testid="customize-page-unsupported"
    >
      <Button type="primary" @click="goHome">{{ t('errors.backHome') }}</Button>
    </Empty>
    <CustomizeMyData
      v-else
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :persona-fqn="persona.fullyQualifiedName"
      :initial-page-data="initialPageData"
      :background-color="initialColor"
      :on-save-layout="handlePageCustomizeSave"
      :on-background-color-update="handleBackgroundColorUpdate"
    />
  </div>
</template>

<style scoped>
.customize-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--sm-home-canvas);
}
.customize-page__loading {
  height: 320px;
}
</style>
