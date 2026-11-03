<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { savePersonaDocument } from '@/api/docStore';
import { Button, Input } from 'ant-design-vue';
import type { Persona, PersonaDocument, PersonaPage } from '@/types/persona';
import { getPersonaPage, updatePersonaDocumentPage } from '../personaPage';

/**
 * Page-layout editor for the LandingPage, DataMarketplace and entity
 * pages. The official editors are drag-grid widget editors; this
 * console has no widget-grid infrastructure, so the page object
 * (layout, knowledgePanels, tabs) is edited as JSON and stored
 * verbatim — the same document shape the official editors write, so a
 * later grid editor can take over without a migration. Saving writes
 * the page into the persona document; resetting removes the page,
 * which is the official reset signal (fall back to the default page).
 */
const props = defineProps<{
  persona: Persona;
  document: PersonaDocument;
  pageType: string;
}>();

const emit = defineEmits<{ saved: [document: PersonaDocument] }>();

const { t } = useI18n();

function emptyPage(): PersonaPage {
  return { pageType: props.pageType, layout: {} };
}

const text = ref(JSON.stringify(getPersonaPage(props.document, props.pageType) ?? emptyPage(), null, 2));
const saving = ref(false);
const errorMessage = ref('');

function parse(): PersonaPage | null {
  try {
    const parsed = JSON.parse(text.value) as PersonaPage;
    if (!parsed || typeof parsed !== 'object' || parsed.pageType !== props.pageType) {
      errorMessage.value = t('persona.pageJsonHint');
      return null;
    }
    return parsed;
  } catch {
    errorMessage.value = t('persona.saveFailed');
    return null;
  }
}

async function onSave(): Promise<void> {
  const page = parse();
  if (!page) {
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    const saved = await savePersonaDocument(props.document, (draft) => {
      draft.data = updatePersonaDocumentPage(draft, props.pageType, page).data;
    });
    emit('saved', saved);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('persona.saveFailed');
  } finally {
    saving.value = false;
  }
}

async function onReset(): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  try {
    const saved = await savePersonaDocument(props.document, (draft) => {
      draft.data = updatePersonaDocumentPage(draft, props.pageType, undefined).data;
    });
    text.value = JSON.stringify(emptyPage(), null, 2);
    emit('saved', saved);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('persona.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div data-testid="page-json-editor">
    <p>{{ t('persona.pageJsonHint') }}</p>
    <Input.TextArea
      v-model:value="text"
      data-testid="page-json-textarea"
      :rows="16"
      :placeholder="t('persona.pageJson')"
    />
    <p v-if="errorMessage" data-testid="page-json-error" class="page-json-editor__error">
      {{ errorMessage }}
    </p>
    <div class="page-json-editor__actions">
      <Button type="primary" data-testid="page-json-save" :loading="saving" @click="void onSave()">
        {{ t('persona.save') }}
      </Button>
      <Button data-testid="page-json-reset" :loading="saving" @click="void onReset()">
        {{ t('persona.reset') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.page-json-editor__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.page-json-editor__error {
  color: var(--sm-color-error-text);
}
</style>
